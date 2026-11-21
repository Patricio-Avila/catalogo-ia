// Mediciones de las funciones de búsqueda antes y después de la migración 0007
// (RNF-05, G4; revisión del 2026-11-20).
//
//   pnpm medir                        20 repeticiones por caso
//   pnpm medir --repeticiones=50
//
// Mismos cinco casos de T8 (docs/mediciones/t8_resultados.md §3): belleza /
// cuidado_facial con 1 a 5 filtros, con y sin incluir_sin_dato.
//   - Funciones públicas (0007), con el usuario del agente (URL_BASE_AGENTE), es
//     decir, con su statement_timeout de 2 s: buscar_productos, contar_productos y
//     calcular_facetas, las tres consultas que hace POST /buscar.
//   - Referencia de 0005, con el administrador (URL_BASE_ADMIN), sin tope de
//     tiempo: los cuerpos anteriores de buscar_productos y contar_productos sobre
//     evaluar_filtros, que arma los arreglos por GROUP BY.
// El tiempo es el de reloj visto por el cliente (incluye el viaje a la base local).
// Las URL salen del entorno o de .env (ignorado); nunca se escriben en el repo.
// Resultado: docs/mediciones/resultados/funciones-<fecha>.json y una tabla en consola.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import postgres from "postgres";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
if (existsSync(`${raiz}.env`)) process.loadEnvFile(`${raiz}.env`);

function argumento(nombre: string, porOmision: string): string {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length) ?? porOmision;
}

function requerida(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta ${nombre} en el entorno o en .env`);
  return valor;
}

const REPETICIONES = Number(argumento("repeticiones", "20"));
const CALENTAMIENTO = 2;
const DOMINIO = "belleza";
const CATEGORIA = "cuidado_facial";
const FILTROS = [
  { atributo: "tipo_piel", operador: "=", valor: "sensible" },
  { atributo: "fragancia", operador: "=", valor: "sin perfume" },
  { atributo: "precio", operador: "<", valor: 300 },
  { atributo: "vegano", operador: "=", valor: true },
  { atributo: "sin_parabenos", operador: "=", valor: true },
];

// Los filtros van con sql.json(), como en AccesoPostgres: un texto con ::jsonb se
// codificaría dos veces y llegaría como escalar.
type FiltrosJson = ReturnType<postgres.Sql["json"]>;
type Consulta = (sql: postgres.Sql, filtros: FiltrosJson, incluir: boolean) => Promise<unknown>;

const NUEVAS: Record<string, Consulta> = {
  buscar: (sql, f, inc) =>
    sql`select id from catalogo.buscar_productos(${DOMINIO}, ${CATEGORIA}, ${f}, ${inc}, 20)`,
  contar: (sql, f, inc) =>
    sql`select total, faltantes from catalogo.contar_productos(${DOMINIO}, ${CATEGORIA}, ${f}, ${inc})`,
  facetas: (sql, f, inc) =>
    sql`select atributo from catalogo.calcular_facetas(${DOMINIO}, ${CATEGORIA}, ${f}, ${inc}, null)`,
};

// Cuerpos de 0005: los mismos que la prueba 07_busqueda_equivalencia usa como referencia.
const REFERENCIA: Record<string, Consulta> = {
  buscar: (sql, f, inc) => sql`
    select e.id from catalogo.evaluar_filtros(${DOMINIO}, ${CATEGORIA}, ${f}, ${!inc}) e
    where e.valido and (${inc} or e.sin_dato = '{}'::text[])
    order by cardinality(e.sin_dato), e.precio, e.id
    limit 20`,
  contar: (sql, f, inc) => sql`
    select count(*) filter (where ${inc} or e.sin_dato = '{}'::text[]) as total,
           count(*) filter (where e.sin_dato <> '{}'::text[]) as faltantes
    from catalogo.evaluar_filtros(${DOMINIO}, ${CATEGORIA}, ${f}, false) e
    where e.valido`,
};

function percentil(valores: number[], p: number): number {
  const orden = [...valores].sort((a, b) => a - b);
  const i = Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1);
  return Math.round((orden[Math.max(0, i)] ?? 0) * 100) / 100;
}

interface Medicion {
  implementacion: "0007" | "0005";
  funcion: string;
  filtros: number;
  incluir_sin_dato: boolean;
  p50_ms: number;
  p95_ms: number;
  errores: string[];
}

async function medir(
  sql: postgres.Sql, implementacion: Medicion["implementacion"], funcion: string,
  consulta: Consulta, n: number, incluir: boolean,
): Promise<Medicion> {
  const filtros = sql.json(FILTROS.slice(0, n));
  const tiempos: number[] = [];
  const errores: string[] = [];
  for (let i = 0; i < CALENTAMIENTO + REPETICIONES; i++) {
    const inicio = performance.now();
    try {
      await consulta(sql, filtros, incluir);
      if (i >= CALENTAMIENTO) tiempos.push(performance.now() - inicio);
    } catch (e) {
      // Un statement_timeout (57014) del agente se registra, no detiene la medición.
      const codigo = (e as { code?: string }).code ?? "desconocido";
      if (!errores.includes(codigo)) errores.push(codigo);
    }
  }
  return {
    implementacion, funcion, filtros: n, incluir_sin_dato: incluir,
    p50_ms: tiempos.length ? percentil(tiempos, 50) : Number.NaN,
    p95_ms: tiempos.length ? percentil(tiempos, 95) : Number.NaN,
    errores,
  };
}

async function main(): Promise<void> {
  const agente = postgres(requerida("URL_BASE_AGENTE"), { max: 1, prepare: false, onnotice: () => {} });
  const admin = postgres(requerida("URL_BASE_ADMIN"), { max: 1, prepare: false, onnotice: () => {} });
  const mediciones: Medicion[] = [];
  try {
    const [conteo] = await admin<{ productos: number }[]>`
      select count(*)::int as productos from catalogo.producto where dominio = ${DOMINIO} and categoria = ${CATEGORIA}`;
    const productos = conteo?.productos ?? 0;
    for (const incluir of [false, true]) {
      for (let n = 1; n <= FILTROS.length; n++) {
        for (const [funcion, consulta] of Object.entries(NUEVAS)) {
          mediciones.push(await medir(agente, "0007", funcion, consulta, n, incluir));
        }
        for (const [funcion, consulta] of Object.entries(REFERENCIA)) {
          mediciones.push(await medir(admin, "0005", funcion, consulta, n, incluir));
        }
      }
    }
    const [servidor] = await admin<{ version: string }[]>`select version()`;
    const fecha = new Date().toLocaleDateString("sv-SE");
    const salida = {
      fecha,
      servidor: servidor?.version ?? "desconocido",
      entorno: process.env.GITHUB_ACTIONS ? "GitHub Actions (ubuntu-latest), Supabase local" : "Supabase local",
      categoria: `${DOMINIO}/${CATEGORIA}`,
      productos_en_categoria: productos,
      repeticiones: REPETICIONES,
      calentamiento: CALENTAMIENTO,
      filtros: FILTROS,
      mediciones,
    };
    const carpeta = `${raiz}docs/mediciones/resultados`;
    mkdirSync(carpeta, { recursive: true });
    const archivo = `${carpeta}/funciones-${fecha}.json`;
    writeFileSync(archivo, `${JSON.stringify(salida, null, 2)}\n`);

    console.log(`${productos} productos en ${DOMINIO}/${CATEGORIA}; ${REPETICIONES} repeticiones por caso`);
    console.log("| incluir_sin_dato | filtros | función | 0005 p50 / p95 (ms) | 0007 p50 / p95 (ms) |");
    console.log("|---|---:|---|---:|---:|");
    for (const m of mediciones.filter((x) => x.implementacion === "0007")) {
      const ref = mediciones.find((x) => x.implementacion === "0005" && x.funcion === m.funcion
        && x.filtros === m.filtros && x.incluir_sin_dato === m.incluir_sin_dato);
      const antes = ref ? `${ref.p50_ms} / ${ref.p95_ms}` : "—";
      const errores = m.errores.length ? ` (errores: ${m.errores.join(", ")})` : "";
      console.log(`| ${m.incluir_sin_dato} | ${m.filtros} | ${m.funcion} | ${antes} | ${m.p50_ms} / ${m.p95_ms}${errores} |`);
    }
    console.log(`Guardado en ${archivo}`);
    if (mediciones.some((m) => m.implementacion === "0007" && m.errores.length > 0)) process.exitCode = 1;
  } finally {
    await agente.end();
    await admin.end();
  }
}

await main();
