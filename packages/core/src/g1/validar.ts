// G1: salida validada contra el diccionario (CLAUDE.md §6.1 y §8.2; RF-02, RF-11).
//
// Reglas:
// - `dominio` lo fija el usuario; si el objeto trae otro, se descarta y se usa el del diccionario.
// - `categoria` pertenece al dominio o es null; si no, se descarta y queda null.
// - cada atributo existe en el diccionario para la vertical (y categoría, si viene);
// - el operador es compatible con el tipo (texto y booleano solo = y <>);
// - el valor pertenece al dominio de valores (texto, booleano) o es coherente con el rango (numérico);
// - un atributo con `inferible = false` (todo atributo de riesgo) se descarta si lo propone el modelo;
//   el usuario sí puede fijarlo con una etiqueta manual (RF-10, RF-11);
// - filtros repetidos se descartan como duplicados.
// Los filtros que no pasan se devuelven en `descartados` con el motivo. Nunca se lanza.
//
// Rango numérico: para `=` y `<>` el valor debe caer en [minimo, maximo]; para `<` y `<=`
// debe ser mayor que el mínimo y para `>` y `>=` menor que el máximo. Así "precio < 2000"
// sobre un catálogo que llega a 1000 se acepta (devuelve todo) y "precio < 10" con mínimo 50
// se descarta porque el resultado vacío es seguro de antemano.

import type { Diccionario, EntradaDiccionario } from "../contrato/diccionario";
import { entradasDe } from "../contrato/diccionario";
import {
  Dominio,
  OPERADORES_POR_TIPO,
  Operador,
  type Filtro,
  type ObjetoFiltros,
  type ValorFiltro,
} from "../contrato/filtros";
import { aBooleano, aNumero, normalizarValor } from "../texto";

export type Origen = "modelo" | "usuario";

export const MOTIVOS_DESCARTE = [
  "dominio_no_coincide",
  "categoria_no_pertenece",
  "atributo_desconocido",
  "atributo_no_inferible",
  "operador_desconocido",
  "operador_incompatible",
  "valor_no_convertible",
  "valor_fuera_de_dominio",
  "valor_fuera_de_rango",
  "duplicado",
] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];

export interface Descartado {
  atributo: string;
  operador?: string;
  valor?: unknown;
  motivo: MotivoDescarte;
  detalle: string;
}

/** Entrada tolerante: es lo que sale del modelo o del extractor antes de G1. */
export interface FiltroCrudo {
  atributo: string;
  operador: string;
  valor: unknown;
}

export interface EntradaValidacion<F extends FiltroCrudo> {
  dominio?: string | null | undefined;
  categoria?: string | null | undefined;
  filtros: F[];
  incluir_sin_dato?: boolean | undefined;
}

/** El filtro validado conserva las propiedades extra de la entrada (confianza, fragmento). */
export type FiltroValidado<F extends FiltroCrudo> = Omit<F, keyof Filtro> & Filtro;

export interface ResultadoValidacion<F extends FiltroCrudo> {
  objeto: Omit<ObjetoFiltros, "filtros"> & { filtros: FiltroValidado<F>[] };
  descartados: Descartado[];
}

export function validarObjetoFiltros<F extends FiltroCrudo>(
  entrada: EntradaValidacion<F>,
  diccionario: Diccionario,
  origen: Origen,
): ResultadoValidacion<F> {
  const descartados: Descartado[] = [];

  // dominio: lo fija el usuario; el modelo no puede cambiarlo
  const dominio: Dominio = diccionario.dominio;
  if (entrada.dominio != null && entrada.dominio !== dominio) {
    descartados.push({
      atributo: "dominio",
      valor: entrada.dominio,
      motivo: "dominio_no_coincide",
      detalle: `la vertical es ${dominio}; se ignora ${entrada.dominio}`,
    });
  }

  // categoría: del dominio o null
  let categoria: string | null = null;
  if (entrada.categoria != null) {
    const buscada = normalizarValor(entrada.categoria);
    const hallada = diccionario.categorias.find((c) => normalizarValor(c) === buscada);
    if (hallada === undefined) {
      descartados.push({
        atributo: "categoria",
        valor: entrada.categoria,
        motivo: "categoria_no_pertenece",
        detalle: `categorías de ${dominio}: ${diccionario.categorias.join(", ")}`,
      });
    } else {
      categoria = hallada;
    }
  }

  const filtros: FiltroValidado<F>[] = [];
  const vistos = new Set<string>();

  for (const crudo of entrada.filtros) {
    const resultado = validarFiltro(crudo, diccionario, categoria, origen);
    if ("motivo" in resultado) {
      descartados.push(resultado);
      continue;
    }
    const clave = `${resultado.atributo}|${resultado.operador}|${String(resultado.valor)}`;
    if (vistos.has(clave)) {
      descartados.push({
        atributo: resultado.atributo,
        operador: resultado.operador,
        valor: resultado.valor,
        motivo: "duplicado",
        detalle: "el mismo filtro ya estaba en el objeto",
      });
      continue;
    }
    vistos.add(clave);
    filtros.push({ ...crudo, ...resultado } as FiltroValidado<F>);
  }

  return {
    objeto: { dominio, categoria, filtros, incluir_sin_dato: entrada.incluir_sin_dato === true },
    descartados,
  };
}

function validarFiltro(
  crudo: FiltroCrudo,
  diccionario: Diccionario,
  categoria: string | null,
  origen: Origen,
): Filtro | Descartado {
  const base = { atributo: crudo.atributo, operador: crudo.operador, valor: crudo.valor };

  const entradas = entradasDe(diccionario, categoria, crudo.atributo);
  if (entradas.length === 0) {
    return {
      ...base,
      motivo: "atributo_desconocido",
      detalle: categoria
        ? `no existe en ${diccionario.dominio}/${categoria}`
        : `no existe en ${diccionario.dominio}`,
    };
  }

  if (origen === "modelo" && entradas.some((e) => !e.inferible || e.define_riesgo)) {
    return {
      ...base,
      motivo: "atributo_no_inferible",
      detalle: "el modelo no puede proponer este atributo; el usuario puede fijarlo a mano",
    };
  }

  const operador = Operador.safeParse(crudo.operador);
  if (!operador.success) {
    return { ...base, motivo: "operador_desconocido", detalle: `operadores: ${Operador.options.join(" ")}` };
  }

  // Todas las entradas del atributo comparten tipo por construcción del diccionario;
  // si no, se toma la primera y se deja constancia en el detalle.
  const tipo = entradas[0]!.tipo;
  if (!OPERADORES_POR_TIPO[tipo].includes(operador.data)) {
    return {
      ...base,
      motivo: "operador_incompatible",
      detalle: `${tipo} admite ${OPERADORES_POR_TIPO[tipo].join(" ")}`,
    };
  }

  const valor = validarValor(crudo.valor, operador.data, tipo, entradas);
  if (typeof valor === "object") return { ...base, ...valor };

  return { atributo: crudo.atributo, operador: operador.data, valor };
}

type FalloValor = Pick<Descartado, "motivo" | "detalle">;

function validarValor(
  crudo: unknown,
  operador: Operador,
  tipo: EntradaDiccionario["tipo"],
  entradas: EntradaDiccionario[],
): ValorFiltro | FalloValor {
  if (tipo === "numero") {
    const n = aNumero(crudo);
    if (n === null) return { motivo: "valor_no_convertible", detalle: "se esperaba un número" };
    const minimos = entradas.map((e) => e.minimo).filter((m): m is number => m !== undefined);
    const maximos = entradas.map((e) => e.maximo).filter((m): m is number => m !== undefined);
    const minimo = minimos.length ? Math.min(...minimos) : -Infinity;
    const maximo = maximos.length ? Math.max(...maximos) : Infinity;
    const dentro =
      operador === "<" || operador === "<="
        ? n > minimo
        : operador === ">" || operador === ">="
          ? n < maximo
          : n >= minimo && n <= maximo;
    if (!dentro) {
      return { motivo: "valor_fuera_de_rango", detalle: `el catálogo va de ${minimo} a ${maximo}` };
    }
    return n;
  }

  if (tipo === "booleano") {
    const b = aBooleano(crudo);
    if (b === null) return { motivo: "valor_no_convertible", detalle: "se esperaba sí o no" };
    return b;
  }

  // texto: el valor debe estar en el dominio de valores; se devuelve la forma canónica
  if (typeof crudo !== "string" && typeof crudo !== "number") {
    return { motivo: "valor_no_convertible", detalle: "se esperaba texto" };
  }
  const buscado = normalizarValor(String(crudo));
  for (const e of entradas) {
    const hallado = (e.valores ?? []).find((v) => normalizarValor(v) === buscado);
    if (hallado !== undefined) return hallado;
  }
  const admitidos = [...new Set(entradas.flatMap((e) => e.valores ?? []))];
  return {
    motivo: "valor_fuera_de_dominio",
    detalle: admitidos.length ? `valores: ${admitidos.join(", ")}` : "sin dominio de valores",
  };
}
