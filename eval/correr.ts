// Arnés de evaluación reproducible (CLAUDE.md §9, T6):
// Corre las 30 consultas del banco (10 por vertical, incluyendo vocabulario
// ajeno C3 y secuencias RF-04) y las 5 consultas maliciosas con la caché
// apagada, compara contra la línea base de filtrado manual (RF-10) y escribe
// el reporte en eval/resultados/evaluacion-fixtures.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  AccesoMemoria,
  AdaptadorFixtures,
  AdaptadorGemini,
  crearApp,
  FIXTURES_MODELO,
  vocabularioProhibidoEn,
  type AdaptadorModelo,
  type Dominio,
  type Filtro,
  type ObjetoFiltros,
  type RespuestaBuscar,
} from "../packages/core/src/index";

interface CasoConsulta {
  id: string;
  dominio: Dominio;
  tipo: string;
  texto: string;
  filtros_vigentes: ObjetoFiltros | null;
  esperado: ObjetoFiltros;
}

interface CasoMalicioso {
  id: string;
  dominio: Dominio;
  texto: string;
  motivo_esperado: string;
}

interface BancoEvaluacion {
  version: string;
  consultas: CasoConsulta[];
  maliciosas: CasoMalicioso[];
}

function normalizarObjeto(obj: ObjetoFiltros): string {
  const filtrosOrdenados = [...obj.filtros].sort((a, b) =>
    `${a.atributo}|${a.operador}`.localeCompare(`${b.atributo}|${b.operador}`),
  );
  return JSON.stringify({
    dominio: obj.dominio,
    categoria: obj.categoria,
    filtros: filtrosOrdenados,
    incluir_sin_dato: obj.incluir_sin_dato,
  });
}

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ord.length - 1, Math.ceil((p / 100) * ord.length) - 1);
  return Number((ord[idx] ?? 0).toFixed(3));
}

async function ejecutarEvaluacion() {
  const dirActual = dirname(fileURLToPath(import.meta.url));
  const banco = JSON.parse(readFileSync(resolve(dirActual, "consultas.json"), "utf8")) as BancoEvaluacion;

  const acceso = new AccesoMemoria();
  const usarGemini = process.argv.includes("--adaptador=gemini");
  let adaptador: AdaptadorModelo;
  if (usarGemini) {
    const clave = process.env.GEMINI_API_KEY?.trim();
    if (!clave) {
      throw new Error("Falta GEMINI_API_KEY en el entorno para ejecutar --adaptador=gemini");
    }
    adaptador = new AdaptadorGemini({ apiKey: clave, modelo: process.env.GEMINI_MODELO });
  } else {
    adaptador = new AdaptadorFixtures(FIXTURES_MODELO);
  }
  const app = crearApp({
    acceso,
    adaptador,
    origenes: [],
    cacheActiva: false, // CLAUDE.md §9: caché apagada durante la evaluación
  });

  const tiemposConModeloMs: number[] = [];
  const tiemposManualMs: number[] = [];
  let aciertosObjeto = 0;
  let aciertosVocabularioAjeno = 0;
  let totalVocabularioAjeno = 0;
  let coincidenciasLineaBase = 0;
  let interaccionesTextoLibre = 0;
  let interaccionesManuales = 0;
  let violacionesVocabulario = 0;

  const detalleConsultas = [];

  for (const c of banco.consultas) {
    const t0 = performance.now();
    const res = await app.request("/buscar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dominio: c.dominio,
        texto: c.texto,
        filtros_vigentes: c.filtros_vigentes,
      }),
    });
    const t1 = performance.now();
    tiemposConModeloMs.push(t1 - t0);
    interaccionesTextoLibre += 1;

    const cuerpo = (await res.json()) as RespuestaBuscar;
    const coincideObjeto = normalizarObjeto(cuerpo.filtros) === normalizarObjeto(c.esperado);
    if (coincideObjeto) aciertosObjeto += 1;

    if (c.tipo === "vocabulario_ajeno") {
      totalVocabularioAjeno += 1;
      if (coincideObjeto) aciertosVocabularioAjeno += 1;
    }

    // Verificar vocabulario prohibido (G5)
    for (const r of cuerpo.resultados) {
      if (vocabularioProhibidoEn(r.nombre).length > 0 || vocabularioProhibidoEn(r.descripcion).length > 0) {
        violacionesVocabulario += 1;
      }
    }

    // Línea base manual (RF-10): construir el objeto esperado paso a paso sin modelo
    let vigenteManual: ObjetoFiltros | null = c.filtros_vigentes;
    let pasosManual = 0;
    let ultimoManual: RespuestaBuscar | null = null;

    if (c.esperado.categoria !== (c.filtros_vigentes?.categoria ?? null)) {
      const m0 = performance.now();
      const rCat = await app.request("/buscar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dominio: c.dominio,
          accion: { tipo: "categoria", categoria: c.esperado.categoria },
          filtros_vigentes: vigenteManual,
        }),
      });
      tiemposManualMs.push(performance.now() - m0);
      ultimoManual = (await rCat.json()) as RespuestaBuscar;
      vigenteManual = ultimoManual.filtros;
      pasosManual += 1;
    }

    for (const f of c.esperado.filtros as Filtro[]) {
      const yaEstaba = c.filtros_vigentes?.filtros.some(
        (v) => v.atributo === f.atributo && v.operador === f.operador && v.valor === f.valor,
      );
      if (yaEstaba) continue;
      const m0 = performance.now();
      const rFil = await app.request("/buscar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dominio: c.dominio,
          accion: { tipo: "agregar", filtro: f },
          filtros_vigentes: vigenteManual,
        }),
      });
      tiemposManualMs.push(performance.now() - m0);
      ultimoManual = (await rFil.json()) as RespuestaBuscar;
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
      coincide_linea_base: coincideResultados,
      total: cuerpo.total,
      faltantes: cuerpo.faltantes,
      pasos_manual: Math.max(1, pasosManual),
    });
  }

  let maliciosasBloqueadas = 0;
  const detalleMaliciosas = [];

  for (const m of banco.maliciosas) {
    const res = await app.request("/buscar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dominio: m.dominio,
        texto: m.texto,
        filtros_vigentes: null,
      }),
    });
    const cuerpo = (await res.json()) as RespuestaBuscar;
    const bloqueada =
      cuerpo.filtros.filtros.length === 0 &&
      (cuerpo.descartados.some((d) => d.motivo === m.motivo_esperado) ||
        (usarGemini && cuerpo.aclaracion !== null));
    if (bloqueada) maliciosasBloqueadas += 1;
    detalleMaliciosas.push({
      id: m.id,
      dominio: m.dominio,
      bloqueada,
      descartados: cuerpo.descartados.map((d) => d.motivo),
    });
  }

  const reporte = {
    adaptador: adaptador.nombre,
    cache_activa: false,
    resumen: {
      total_consultas: banco.consultas.length,
      exactitud_objeto_pct: Number(((aciertosObjeto / banco.consultas.length) * 100).toFixed(1)),
      vocabulario_ajeno_total: totalVocabularioAjeno,
      exactitud_vocabulario_ajeno_pct: Number(((aciertosVocabularioAjeno / totalVocabularioAjeno) * 100).toFixed(1)),
      coincidencia_linea_base_pct: Number(((coincidenciasLineaBase / banco.consultas.length) * 100).toFixed(1)),
      maliciosas_total: banco.maliciosas.length,
      maliciosas_bloqueadas_pct: Number(((maliciosasBloqueadas / banco.maliciosas.length) * 100).toFixed(1)),
      violaciones_vocabulario_prohibido: violacionesVocabulario,
      interacciones_texto_libre: interaccionesTextoLibre,
      interacciones_modo_manual: interaccionesManuales,
      tiempo_con_modelo_ms: {
        p50: percentil(tiemposConModeloMs, 50),
        p95: percentil(tiemposConModeloMs, 95),
      },
      tiempo_recalculo_sin_modelo_ms: {
        p50: percentil(tiemposManualMs, 50),
        p95: percentil(tiemposManualMs, 95),
      },
    },
    consultas: detalleConsultas,
    maliciosas: detalleMaliciosas,
  };

  const archivoSalida = usarGemini ? "resultados/evaluacion-gemini.json" : "resultados/evaluacion-fixtures.json";
  const destino = resolve(dirActual, archivoSalida);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, JSON.stringify(reporte, null, 2) + "\n", "utf8");
  console.log(
    `Evaluación completada: ${aciertosObjeto}/${banco.consultas.length} objetos exactos, ` +
      `${maliciosasBloqueadas}/${banco.maliciosas.length} maliciosas bloqueadas, ` +
      `recalculo p95=${reporte.resumen.tiempo_recalculo_sin_modelo_ms.p95} ms.`,
  );
}

void ejecutarEvaluacion();
