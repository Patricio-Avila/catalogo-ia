// Orquestación de una petición en texto libre (CLAUDE.md §6, pasos 1 a 5):
//   1. normalizar el texto;
//   2. caché exacta: acierto → reutilizar las propuestas;
//   3. extractor numérico + adaptador del modelo → propuestas con confianza;
//   4. G1: lo inválido se descarta y se informa;
//   5. confianza: alta → aplicar; media → aplicar y marcar sugerida;
//      baja → aclaración, sin aplicar.
// Después fusiona con los filtros vigentes (RF-04): un mensaje nuevo modifica el
// objeto, no lo reemplaza, salvo "reiniciar". No toca la base: devuelve el objeto
// listo para buscar_productos().

import { reemplazar } from "./acciones";
import { claveCache, type CacheInterpretaciones } from "./cache/clave";
import { entradasDe, type Diccionario } from "./contrato/diccionario";
import { OBJETO_VACIO, type Filtro, type FiltroPropuesto, type ObjetoFiltros } from "./contrato/filtros";
import { extraerNumeros } from "./extractor/numerico";
import { validarObjetoFiltros, type Descartado } from "./g1/validar";
import type { AdaptadorModelo, RespuestaModelo } from "./modelo/interfaz";

/** Umbrales iniciales, a calibrar con el banco de evaluación (CLAUDE.md §6). */
export const UMBRALES = { alta: 0.85, media: 0.6 } as const;

export type Nivel = "alta" | "media" | "baja";
export type OrigenEtiqueta = "modelo" | "usuario" | "cache";

export function nivelDe(confianza: number): Nivel {
  if (confianza >= UMBRALES.alta) return "alta";
  if (confianza >= UMBRALES.media) return "media";
  return "baja";
}

export interface Etiqueta extends Filtro {
  confianza: number;
  origen: OrigenEtiqueta;
  nivel: Nivel;
  /** true en nivel medio: aplicada, pero el usuario debe confirmarla o quitarla. */
  sugerida: boolean;
  fragmento?: string;
}

export interface Aclaracion {
  pregunta: string;
  opciones: string[];
  /** Propuestas de confianza baja que no se aplicaron; el cliente puede ofrecerlas. */
  filtros_dudosos: FiltroPropuesto[];
}

export interface Interpretacion {
  objeto: ObjetoFiltros;
  etiquetas: Etiqueta[];
  descartados: Descartado[];
  aclaracion: Aclaracion | null;
  /** true si las propuestas vinieron de la caché exacta. */
  desde_cache: boolean;
  /** true si se llamó al adaptador del modelo. */
  llamo_modelo: boolean;
}

export interface ParametrosInterpretar {
  texto: string;
  diccionario: Diccionario;
  filtrosVigentes: ObjetoFiltros | null;
  adaptador: AdaptadorModelo;
  /** null o ausente: caché apagada (así corre la evaluación). */
  cache?: CacheInterpretaciones | null;
}

export async function interpretarPeticion(p: ParametrosInterpretar): Promise<Interpretacion> {
  const { diccionario, adaptador } = p;
  const vigente = p.filtrosVigentes ?? OBJETO_VACIO(diccionario.dominio);
  const texto = p.texto.trim();

  if (texto === "") {
    return { objeto: vigente, etiquetas: etiquetasDe(vigente.filtros, []), descartados: [], aclaracion: null, desde_cache: false, llamo_modelo: false };
  }

  // 2. caché exacta
  const clave = p.cache
    ? await claveCache({ dominio: diccionario.dominio, texto, filtrosVigentes: p.filtrosVigentes, versionDiccionario: diccionario.version })
    : null;
  const cacheada = clave && p.cache ? await p.cache.obtener(clave) : null;

  let respuesta: RespuestaModelo;
  let origen: OrigenEtiqueta;
  let llamoModelo = false;
  if (cacheada && cacheada.version_diccionario === diccionario.version) {
    respuesta = { categoria: cacheada.categoria, filtros: cacheada.filtros };
    origen = "cache";
  } else {
    // 3. extractor + modelo; en números manda el extractor
    const delExtractor = extraerNumeros(texto, diccionario.dominio);
    const delModelo = await adaptador.interpretar({ texto, diccionario, filtrosVigentes: p.filtrosVigentes });
    llamoModelo = true;
    const cubiertos = new Set(delExtractor.map((f) => `${f.atributo}|${f.operador}`));
    const filtros = [...delExtractor, ...delModelo.filtros.filter((f) => !cubiertos.has(`${f.atributo}|${f.operador}`))];
    respuesta = { ...delModelo, filtros };
    origen = "modelo";
  }

  // 4. G1
  const reiniciar = respuesta.reiniciar === true;
  const categoriaPropuesta = respuesta.categoria === undefined ? (reiniciar ? null : vigente.categoria) : respuesta.categoria;
  const validado = validarObjetoFiltros(
    { categoria: categoriaPropuesta, filtros: respuesta.filtros, incluir_sin_dato: vigente.incluir_sin_dato },
    diccionario,
    "modelo",
  );

  // 5. niveles de confianza
  const aplicables = validado.objeto.filtros.filter((f) => nivelDe(f.confianza) !== "baja");
  const dudosos = validado.objeto.filtros.filter((f) => nivelDe(f.confianza) === "baja");

  // guardar en caché solo lo que pasó G1 y no venía de ahí
  if (clave && p.cache && origen !== "cache" && validado.objeto.filtros.length > 0) {
    await p.cache.guardar(clave, {
      categoria: validado.objeto.categoria,
      filtros: validado.objeto.filtros.map(({ atributo, operador, valor, confianza, fragmento }) =>
        fragmento === undefined ? { atributo, operador, valor, confianza } : { atributo, operador, valor, confianza, fragmento },
      ),
      version_diccionario: diccionario.version,
    });
  }

  // fusión con lo vigente (RF-04)
  const base: Filtro[] = reiniciar ? [] : vigente.filtros;
  let filtros: Filtro[] = base;
  for (const f of aplicables) filtros = reemplazar(filtros, { atributo: f.atributo, operador: f.operador, valor: f.valor });

  const objeto: ObjetoFiltros = {
    dominio: diccionario.dominio,
    categoria: validado.objeto.categoria,
    filtros,
    incluir_sin_dato: reiniciar ? false : vigente.incluir_sin_dato,
  };

  const nuevas: Etiqueta[] = aplicables.map((f) => ({
    atributo: f.atributo,
    operador: f.operador,
    valor: f.valor,
    confianza: f.confianza,
    origen,
    nivel: nivelDe(f.confianza),
    sugerida: nivelDe(f.confianza) === "media",
    ...(f.fragmento === undefined ? {} : { fragmento: f.fragmento }),
  }));

  const aclaracion = construirAclaracion(respuesta, dudosos, aplicables.length, validado.descartados, diccionario);

  return {
    objeto,
    etiquetas: etiquetasDe(objeto.filtros, nuevas),
    descartados: validado.descartados,
    aclaracion,
    desde_cache: origen === "cache",
    llamo_modelo: llamoModelo,
  };
}

/**
 * Etiquetas del objeto final. Las que vienen de esta petición conservan su
 * confianza y origen; las que ya estaban y el usuario conservó son suyas:
 * confianza 1 y origen "usuario".
 */
function etiquetasDe(filtros: Filtro[], nuevas: Etiqueta[]): Etiqueta[] {
  return filtros.map((f) => {
    const nueva = nuevas.find((n) => n.atributo === f.atributo && n.operador === f.operador && n.valor === f.valor);
    return nueva ?? { ...f, confianza: 1, origen: "usuario", nivel: "alta", sugerida: false };
  });
}

function construirAclaracion(
  respuesta: RespuestaModelo,
  dudosos: FiltroPropuesto[],
  aplicados: number,
  descartados: Descartado[],
  diccionario: Diccionario,
): Aclaracion | null {
  if (respuesta.aclaracion) {
    return { ...respuesta.aclaracion, filtros_dudosos: dudosos };
  }
  const primero = dudosos[0];
  if (primero !== undefined) {
    const entradas = entradasDe(diccionario, null, primero.atributo);
    const valores = [...new Set(entradas.flatMap((e) => e.valores ?? []))];
    return {
      pregunta: `No estoy seguro de "${primero.fragmento ?? primero.atributo}". ¿Te refieres a ${primero.atributo} ${primero.operador} ${String(primero.valor)}?`,
      opciones: valores.length > 0 ? valores : [String(primero.valor)],
      filtros_dudosos: dudosos,
    };
  }
  if (aplicados === 0 && respuesta.reiniciar !== true) {
    const motivo = descartados.length > 0 ? "No pude usar lo que entendí de tu petición" : "No encontré filtros en tu petición";
    return {
      pregunta: `${motivo}. ¿Qué tipo de producto buscas?`,
      opciones: diccionario.categorias,
      filtros_dudosos: [],
    };
  }
  return null;
}
