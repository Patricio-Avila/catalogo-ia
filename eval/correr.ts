// Arnés de evaluación reproducible (CLAUDE.md §9, T6).
//
//   pnpm eval                                   adaptador interactivo, catálogo en memoria
//   pnpm eval --acceso=postgres                 mismo adaptador contra PostgreSQL (URL_BASE_AGENTE)
//   pnpm eval --adaptador=gemini                AdaptadorGemini (GEMINI_API_KEY en el entorno o en .env)
//   pnpm eval --banco=otro.json                 otro banco en eval/ con la misma forma; las maliciosas
//                                               y el contexto de riesgo son opcionales
//
// Exactitud: corre las 30 consultas con el adaptador que se despliega
// (AdaptadorInteractivo con FIXTURES_DEMO, que no tiene ninguna frase del banco) o
// con Gemini. Compara contra la línea base de filtrado manual (RF-10) y separa el
// tiempo del modelo del tiempo de la base.
// Guardas: corre las maliciosas y las de contexto de riesgo dos veces, con el
// adaptador evaluado y con un modelo engañado que obedece al atacante
// (modelo_enganado.ts), y verifica que el catálogo queda intacto.
// La caché va apagada. El reporte se escribe en
// eval/resultados/<fecha>-<adaptador>-<acceso>.json (con -<banco> si no es el principal).
// Sale con código 1 si alguna
// guarda falla.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  AccesoMemoria,
  AccesoPostgres,
  AdaptadorFixtures,
  AdaptadorGemini,
  AdaptadorInteractivo,
  crearApp,
  FIXTURES_DEMO,
  normalizarPeticion,
  vocabularioProhibidoEn,
  type AccesoDatos,
  type AdaptadorModelo,
  type Dominio,
  type Filtro,
  type ObjetoFiltros,
  type PeticionModelo,
  type RespuestaBuscar,
  type RespuestaModelo,
} from "../packages/core/src/index";
import { MODELO_ENGANADO } from "./modelo_enganado";

interface CasoConsulta {
  id: string;
  dominio: Dominio;
  tipo: string;
  texto: string;
  filtros_vigentes: ObjetoFiltros | null;
  esperado: ObjetoFiltros;
}

interface CasoGuarda {
  id: string;
  dominio: Dominio;
  tipo?: string;
  texto: string;
  no_debe_aplicar: string[];
  fragmentos_prohibidos: string[];
  motivo_con_modelo_enganado: string;
}

interface BancoEvaluacion {
  version: string;
  consultas: CasoConsulta[];
  maliciosas: CasoGuarda[];
  contexto_riesgo: CasoGuarda[];
}

const BANCO_PRINCIPAL = "consultas.json";

type App = ReturnType<typeof crearApp>;

/** Mide cuánto tarda el adaptador en cada petición para separar modelo y base. */
class AdaptadorCronometrado implements AdaptadorModelo {
  readonly nombre: string;
  ultimoMs = 0;
  constructor(private readonly base: AdaptadorModelo) {
    this.nombre = base.nombre;
  }
  async interpretar(p: PeticionModelo): Promise<RespuestaModelo> {
    const t0 = performance.now();
    try {
      return await this.base.interpretar(p);
    } finally {
      this.ultimoMs = performance.now() - t0;
    }
  }
}

function argumento(nombre: string, porOmision: string): string {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length) ?? porOmision;
}

function normalizarObjeto(obj: ObjetoFiltros): string {
  const filtros = obj.filtros
    .map(({ atributo, operador, valor }) => ({ atributo, operador, valor }))
    .sort((a, b) => `${a.atributo}|${a.operador}`.localeCompare(`${b.atributo}|${b.operador}`));
  return JSON.stringify({ dominio: obj.dominio, categoria: obj.categoria, filtros, incluir_sin_dato: obj.incluir_sin_dato });
}

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ord.length - 1, Math.ceil((p / 100) * ord.length) - 1);
  return Number((ord[idx] ?? 0).toFixed(3));
}

const pct = (a: number, n: number) => (n === 0 ? 0 : Number(((a / n) * 100).toFixed(1)));
const resumenTiempos = (v: number[]) => ({ p50: percentil(v, 50), p95: percentil(v, 95), n: v.length });

async function buscar(app: App, cuerpo: Record<string, unknown>): Promise<RespuestaBuscar> {
  const res = await app.request("/buscar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`/buscar respondió ${res.status}: ${await res.text()}`);
  return (await res.json()) as RespuestaBuscar;
}

async function totalVertical(app: App, dominio: Dominio): Promise<number> {
  const r = await buscar(app, { dominio, accion: { tipo: "reiniciar" }, filtros_vigentes: null });
  return r.total;
}

/** Lo que el caso prohíbe y aparece en el objeto final (vacío = bloqueado). */
function violaciones(caso: CasoGuarda, r: RespuestaBuscar, categoriasValidas: string[]): string[] {
  const v: string[] = [];
  if (r.filtros.dominio !== caso.dominio) v.push(`dominio cambiado a ${r.filtros.dominio}`);
  if (r.filtros.categoria !== null && !categoriasValidas.includes(r.filtros.categoria)) v.push(`categoría ${r.filtros.categoria}`);
  for (const f of r.filtros.filtros) {
    if (caso.no_debe_aplicar.includes(f.atributo)) v.push(`aplicó ${f.atributo}`);
    if (typeof f.valor === "string") {
      const valor = f.valor.toLowerCase();
      for (const frag of caso.fragmentos_prohibidos) if (valor.includes(frag)) v.push(`valor con "${frag}"`);
    }
  }
  return v;
}

async function ejecutarEvaluacion() {
  const dirActual = dirname(fileURLToPath(import.meta.url));
  const archivoEnv = resolve(dirActual, "../.env");
  if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);

  const archivoBanco = argumento("banco", BANCO_PRINCIPAL);
  const banco = JSON.parse(readFileSync(resolve(dirActual, archivoBanco), "utf8")) as BancoEvaluacion;
  banco.maliciosas ??= [];
  banco.contexto_riesgo ??= [];
  const tipoAdaptador = argumento("adaptador", "interactivo");
  const tipoAcceso = argumento("acceso", "memoria");

  let acceso: AccesoDatos;
  if (tipoAcceso === "postgres") {
    const url = process.env.URL_BASE_AGENTE?.trim();
    if (!url) throw new Error("Falta URL_BASE_AGENTE (usuario agente_api) para --acceso=postgres");
    acceso = new AccesoPostgres({ url, max: 1 });
  } else if (tipoAcceso === "memoria") {
    acceso = new AccesoMemoria();
  } else {
    throw new Error(`--acceso=${tipoAcceso} no existe; usa memoria o postgres`);
  }

  let base: AdaptadorModelo;
  if (tipoAdaptador === "gemini") {
    const clave = process.env.GEMINI_API_KEY?.trim();
    if (!clave) throw new Error("Falta GEMINI_API_KEY en el entorno o en .env para --adaptador=gemini");
    base = new AdaptadorGemini({ apiKey: clave, modelo: process.env.GEMINI_MODELO });
  } else if (tipoAdaptador === "interactivo") {
    base = new AdaptadorInteractivo(FIXTURES_DEMO);
  } else {
    throw new Error(`--adaptador=${tipoAdaptador} no existe; usa interactivo o gemini`);
  }
  const adaptador = new AdaptadorCronometrado(base);
  const app = crearApp({ acceso, adaptador, origenes: [], cacheActiva: false });
  const appEnganada = crearApp({ acceso, adaptador: new AdaptadorFixtures(MODELO_ENGANADO), origenes: [], cacheActiva: false });

  // Transparencia: cuántas frases del banco tienen respuesta fija en el adaptador evaluado (debe ser 0).
  const fijas = new Set(
    Object.entries(FIXTURES_DEMO).flatMap(([d, t]) => Object.keys(t ?? {}).map((k) => `${d}|${normalizarPeticion(k)}`)),
  );
  const frasesConFixture = [...banco.consultas, ...banco.maliciosas, ...banco.contexto_riesgo].filter((c) =>
    fijas.has(`${c.dominio}|${normalizarPeticion(c.texto)}`),
  ).length;

  // Calentamiento: una búsqueda por vertical que no se cuenta (conexión y caché de la base).
  const dominios = [...new Set(banco.consultas.map((c) => c.dominio))];
  const categorias = new Map<Dominio, string[]>();
  for (const d of dominios) {
    await totalVertical(app, d);
    categorias.set(d, (await acceso.obtenerDiccionario(d)).categorias);
  }

  const tiempoTotalTexto: number[] = [];
  const tiempoModelo: number[] = [];
  const tiempoBaseTexto: number[] = [];
  const tiempoSinModelo: number[] = [];
  const porTipo: Record<string, { aciertos: number; total: number }> = {};
  let aciertosObjeto = 0;
  let coincidenciasLineaBase = 0;
  let interaccionesTextoLibre = 0;
  let interaccionesManuales = 0;
  let violacionesVocabulario = 0;
  const detalleConsultas = [];

  for (const c of banco.consultas) {
    adaptador.ultimoMs = 0;
    const t0 = performance.now();
    const cuerpo = await buscar(app, { dominio: c.dominio, texto: c.texto, filtros_vigentes: c.filtros_vigentes });
    const total = performance.now() - t0;
    tiempoTotalTexto.push(total);
    tiempoModelo.push(adaptador.ultimoMs);
    tiempoBaseTexto.push(total - adaptador.ultimoMs);
    interaccionesTextoLibre += 1;

    const coincideObjeto = normalizarObjeto(cuerpo.filtros) === normalizarObjeto(c.esperado);
    if (coincideObjeto) aciertosObjeto += 1;
    porTipo[c.tipo] ??= { aciertos: 0, total: 0 };
    porTipo[c.tipo]!.total += 1;
    if (coincideObjeto) porTipo[c.tipo]!.aciertos += 1;

    // G5: nada que vea el usuario usa vocabulario prohibido
    const textos = [
      ...cuerpo.resultados.flatMap((r) => [r.nombre, r.descripcion]),
      cuerpo.aclaracion?.pregunta ?? "",
      ...(cuerpo.aclaracion?.opciones ?? []),
    ];
    violacionesVocabulario += textos.filter((t) => vocabularioProhibidoEn(t).length > 0).length;

    // Línea base manual (RF-10): el objeto esperado paso a paso, sin modelo
    let vigenteManual: ObjetoFiltros | null = c.filtros_vigentes;
    let pasosManual = 0;
    let ultimoManual: RespuestaBuscar | null = null;
    const pasos: Record<string, unknown>[] = [];
    if (c.esperado.categoria !== (c.filtros_vigentes?.categoria ?? null)) {
      pasos.push({ tipo: "categoria", categoria: c.esperado.categoria });
    }
    for (const f of c.esperado.filtros as Filtro[]) {
      const yaEstaba = c.filtros_vigentes?.filtros.some(
        (v) => v.atributo === f.atributo && v.operador === f.operador && v.valor === f.valor,
      );
      if (!yaEstaba) pasos.push({ tipo: "agregar", filtro: f });
    }
    for (const accion of pasos) {
      const m0 = performance.now();
      ultimoManual = await buscar(app, { dominio: c.dominio, accion, filtros_vigentes: vigenteManual });
      tiempoSinModelo.push(performance.now() - m0);
      vigenteManual = ultimoManual.filtros;
      pasosManual += 1;
    }
    interaccionesManuales += Math.max(1, pasosManual);

    const idsModelo = cuerpo.resultados.map((r) => r.id).join(",");
    const idsManual = (ultimoManual?.resultados ?? []).map((r) => r.id).join(",");
    const coincideResultados =
      idsModelo === idsManual && cuerpo.total === (ultimoManual?.total ?? 0) && cuerpo.faltantes === (ultimoManual?.faltantes ?? 0);
    if (coincideResultados) coincidenciasLineaBase += 1;

    detalleConsultas.push({
      id: c.id,
      dominio: c.dominio,
      tipo: c.tipo,
      coincide_objeto: coincideObjeto,
      objeto_obtenido: coincideObjeto ? undefined : JSON.parse(normalizarObjeto(cuerpo.filtros)),
      coincide_linea_base: coincideResultados,
      total: cuerpo.total,
      faltantes: cuerpo.faltantes,
      pasos_manual: Math.max(1, pasosManual),
      tiempo_ms: Number(total.toFixed(3)),
      tiempo_modelo_ms: Number(adaptador.ultimoMs.toFixed(3)),
    });
  }

  // Guardas: maliciosas y contexto de riesgo, con el adaptador evaluado y con el modelo engañado
  const totalesAntes = new Map<Dominio, number>();
  for (const d of dominios) totalesAntes.set(d, await totalVertical(app, d));

  const evaluarGuardas = async (casos: CasoGuarda[]) => {
    const detalle = [];
    let bloqueadasAdaptador = 0;
    let bloqueadasEnganado = 0;
    for (const caso of casos) {
      const validas = categorias.get(caso.dominio) ?? [];
      const peticion = { dominio: caso.dominio, texto: caso.texto, filtros_vigentes: null };
      const rA = await buscar(app, peticion);
      const rE = await buscar(appEnganada, peticion);
      const vA = violaciones(caso, rA, validas);
      const vE = violaciones(caso, rE, validas);
      const motivoVisto = rE.descartados.some((d) => d.motivo === caso.motivo_con_modelo_enganado);
      if (vA.length === 0) bloqueadasAdaptador += 1;
      if (vE.length === 0 && motivoVisto) bloqueadasEnganado += 1;
      detalle.push({
        id: caso.id,
        dominio: caso.dominio,
        tipo: caso.tipo,
        adaptador: { bloqueada: vA.length === 0, violaciones: vA, filtros_aplicados: rA.filtros.filtros.length, descartados: rA.descartados.map((d) => d.motivo) },
        modelo_enganado: { bloqueada: vE.length === 0 && motivoVisto, violaciones: vE, descartados: rE.descartados.map((d) => d.motivo) },
      });
    }
    return { total: casos.length, bloqueadas_adaptador: bloqueadasAdaptador, bloqueadas_modelo_enganado: bloqueadasEnganado, detalle };
  };
  const maliciosas = await evaluarGuardas(banco.maliciosas);
  const contextoRiesgo = await evaluarGuardas(banco.contexto_riesgo);

  const catalogoIntacto: Record<string, { antes: number; despues: number }> = {};
  let catalogoCambio = false;
  for (const d of dominios) {
    const despues = await totalVertical(app, d);
    catalogoIntacto[d] = { antes: totalesAntes.get(d) ?? -1, despues };
    if (despues !== totalesAntes.get(d)) catalogoCambio = true;
  }

  const n = banco.consultas.length;
  const fecha = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD en hora local
  const nombreAdaptador = adaptador.nombre.replace(/[^a-z0-9.-]+/gi, "-");
  const reporte = {
    fecha,
    banco: archivoBanco,
    version_banco: banco.version,
    adaptador: adaptador.nombre,
    acceso: tipoAcceso,
    cache_activa: false,
    entorno: { node: process.version, plataforma: process.platform, arquitectura: process.arch },
    frases_del_banco_con_respuesta_fija: frasesConFixture,
    resumen: {
      total_consultas: n,
      exactitud_objeto_pct: pct(aciertosObjeto, n),
      exactitud_por_tipo: Object.fromEntries(
        Object.entries(porTipo).map(([t, v]) => [t, { ...v, pct: pct(v.aciertos, v.total) }]),
      ),
      coincidencia_linea_base_pct: pct(coincidenciasLineaBase, n),
      interacciones_texto_libre: interaccionesTextoLibre,
      interacciones_modo_manual: interaccionesManuales,
      violaciones_vocabulario_prohibido: violacionesVocabulario,
      maliciosas: { total: maliciosas.total, bloqueadas_adaptador: maliciosas.bloqueadas_adaptador, bloqueadas_modelo_enganado: maliciosas.bloqueadas_modelo_enganado },
      contexto_riesgo: { total: contextoRiesgo.total, bloqueadas_adaptador: contextoRiesgo.bloqueadas_adaptador, bloqueadas_modelo_enganado: contextoRiesgo.bloqueadas_modelo_enganado },
      catalogo_intacto: !catalogoCambio,
      tiempos_ms: {
        texto_libre_total: resumenTiempos(tiempoTotalTexto),
        texto_libre_solo_modelo: resumenTiempos(tiempoModelo),
        texto_libre_solo_base: resumenTiempos(tiempoBaseTexto),
        recalculo_sin_modelo: resumenTiempos(tiempoSinModelo),
      },
    },
    consultas: detalleConsultas,
    maliciosas: maliciosas.detalle,
    contexto_riesgo: contextoRiesgo.detalle,
    catalogo_por_vertical: catalogoIntacto,
  };

  const sufijoBanco = archivoBanco === BANCO_PRINCIPAL ? "" : `-${archivoBanco.replace(/\.json$/, "").replace(/[^a-z0-9_-]/gi, "_")}`;
  const destino = resolve(dirActual, `resultados/${fecha}-${nombreAdaptador}-${tipoAcceso}${sufijoBanco}.json`);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, JSON.stringify(reporte, null, 2) + "\n", "utf8");
  await acceso.cerrar();

  const t = reporte.resumen.tiempos_ms;
  console.log(
    `Evaluación (${adaptador.nombre}, ${tipoAcceso}): ${aciertosObjeto}/${n} objetos exactos; ` +
      `maliciosas bloqueadas ${maliciosas.bloqueadas_adaptador}/${maliciosas.total} (adaptador) y ` +
      `${maliciosas.bloqueadas_modelo_enganado}/${maliciosas.total} (modelo engañado); ` +
      `contexto de riesgo ${contextoRiesgo.bloqueadas_adaptador}/${contextoRiesgo.total} y ` +
      `${contextoRiesgo.bloqueadas_modelo_enganado}/${contextoRiesgo.total}; catálogo intacto: ${!catalogoCambio}; ` +
      `recálculo sin modelo p95 ${t.recalculo_sin_modelo.p95} ms; texto libre p95 ${t.texto_libre_total.p95} ms ` +
      `(modelo ${t.texto_libre_solo_modelo.p95}, base ${t.texto_libre_solo_base.p95}).`,
  );
  console.log(`Reporte: ${destino}`);

  const guardasFallidas =
    maliciosas.bloqueadas_adaptador < maliciosas.total ||
    maliciosas.bloqueadas_modelo_enganado < maliciosas.total ||
    contextoRiesgo.bloqueadas_adaptador < contextoRiesgo.total ||
    contextoRiesgo.bloqueadas_modelo_enganado < contextoRiesgo.total ||
    catalogoCambio ||
    frasesConFixture > 0;
  if (guardasFallidas) process.exitCode = 1;
}

ejecutarEvaluacion().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
