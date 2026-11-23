// Acceso a datos (ADR-0002, punto 3): driver postgres.js con SQL plano y
// parámetros (G2), por el pooler de Supabase con `prepare: false`, con
// un usuario que hereda `agente_lectura` (G3). Nunca supabase-js, nunca
// service_role. Toda consulta es una llamada a función con parámetros; ningún
// valor del modelo se concatena al SQL (RNF-03).
//
// Contrato con las migraciones de T2 (firmas que la base expone):
//   catalogo.obtener_verticales() returns jsonb
//       → [{ dominio, nombre, texto_ayuda, aviso, atributos_destacados, version_diccionario, categorias[] }]
//   catalogo.obtener_diccionario(p_dominio text) returns jsonb
//       → { dominio, version, categorias[], entradas[] } con la forma de contrato/diccionario
//   catalogo.buscar_productos(p_dominio text, p_categoria text, p_filtros jsonb,
//       p_incluir_sin_dato boolean, p_limite int)
//       returns table (id, nombre, marca, precio, descripcion, cumple text[], sin_dato text[])
//   catalogo.contar_productos(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato)
//       returns table (total bigint, faltantes bigint)
//   catalogo.calcular_facetas(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato, p_atributos text[])
//       returns table (atributo text, valor text, productos bigint)
//   catalogo.comparar_productos(p_dominio, p_categoria, p_atributos_ref jsonb, p_limite, p_candidatos bigint[])
//       returns table (id, nombre, marca, precio, descripcion, nivel, diferencias jsonb, uso_distinto, riesgo_distinto)
//       (fase B; todavía sin método aquí)
//   servicio.cache_obtener(p_clave text) returns jsonb            (SECURITY DEFINER)
//   servicio.cache_guardar(p_clave text, p_entrada jsonb) returns void (SECURITY DEFINER)
// El rol del agente tiene EXECUTE en estas funciones y nada más.

import postgres from "postgres";
import type { CacheInterpretaciones, EntradaCache } from "../cache/clave";
import { Diccionario, Vertical } from "../contrato/diccionario";
import type { Dominio, ObjetoFiltros } from "../contrato/filtros";
import { Faceta, Resultado, type ResultadoBusqueda } from "../contrato/respuestas";
import { z } from "zod";

/** Tope duro de filas por respuesta; la función SQL aplica el mismo LEAST (RNF-04). */
export const LIMITE_MAXIMO = 200;
export const LIMITE_POR_OMISION = 20;

export interface AccesoDatos {
  /** Dónde lee: la base real, el catálogo de prueba en memoria o nada (pruebas). Lo reporta GET /salud. */
  readonly nombre: "postgres" | "memoria" | "nulo";
  obtenerVerticales(): Promise<Vertical[]>;
  obtenerDiccionario(dominio: Dominio): Promise<Diccionario>;
  buscar(objeto: ObjetoFiltros, limite?: number): Promise<ResultadoBusqueda>;
  facetas(objeto: ObjetoFiltros, atributos?: string[]): Promise<Faceta[]>;
  readonly cache: CacheInterpretaciones;
  cerrar(): Promise<void>;
}

export interface OpcionesPostgres {
  /** Cadena de conexión del usuario del agente; viene de un secreto, nunca del repo. */
  url: string;
  /** Conexiones simultáneas; en una Edge Function basta 1. */
  max?: number;
  /** Tope de reloj por operación en milisegundos; por omisión TOPE_OPERACION_MS. */
  topeMs?: number;
}

/**
 * Tope de reloj por operación (enmienda de ADR-0002). En la Edge Function, el
 * driver a veces pierde el hilo del protocolo ("invalid length") y espera bytes
 * que nunca llegan; sin tope, la petición se cuelga hasta que Supabase corta la
 * función (150 s). Una operación legítima cabe de sobra: a lo más tres consultas
 * en fila con statement_timeout de 5 s (G4, migración 0009), y en la nube suelen
 * tardar de 1 a 2 s cada una. Al vencer, la conexión se descarta y la siguiente
 * operación abre una limpia.
 */
export const TOPE_OPERACION_MS = 12_000;

/** La base no respondió a tiempo o la conexión se rompió. La API responde 503 y el cliente puede reintentar. */
export class BaseNoDisponible extends Error {
  constructor(
    readonly motivo: string,
    opciones?: { cause?: unknown },
  ) {
    super(`base no disponible: ${motivo}`, opciones);
    this.name = "BaseNoDisponible";
  }
}

/** Códigos de postgres.js que indican una conexión rota o atascada, no una consulta inválida. */
const FALLAS_DE_CONEXION = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "CONNECT_TIMEOUT",
  "QUEUE_TIMEOUT",
  "PROTOCOL_ERROR",
]);

export function esFallaDeConexion(error: unknown): boolean {
  const codigo = (error as { code?: unknown } | null)?.code;
  return typeof codigo === "string" && FALLAS_DE_CONEXION.has(codigo);
}

/**
 * Corre la operación con tope de reloj. Si vence, llama a `alVencer` (descartar la
 * conexión) y rechaza con BaseNoDisponible; una falla de conexión del driver
 * también sale como BaseNoDisponible. Los errores de la consulta, como el
 * statement_timeout (57014), pasan tal cual.
 */
export async function conTope<T>(operacion: () => Promise<T>, ms: number, alVencer: () => void): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencida = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => {
      alVencer();
      rechazar(new BaseNoDisponible("tope de tiempo"));
    }, ms);
  });
  try {
    return await Promise.race([operacion(), vencida]);
  } catch (error) {
    if (error instanceof BaseNoDisponible || !esFallaDeConexion(error)) throw error;
    throw new BaseNoDisponible(String((error as { code: string }).code), { cause: error });
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Opciones del driver. Medido el 2026-11-21 contra el pooler de Supabase en modo
 * transacción: con dos o más consultas encadenadas en la misma conexión (lo que
 * postgres.js hace por omisión, hasta 100), el pooler no devolvía las siguientes y
 * la conexión quedaba colgada; las rutas de una sola consulta respondían bien.
 * `max_pipeline: 1` deja una consulta en vuelo por conexión, y `queue_timeout`
 * corta la espera en fila en lugar de agotar el tiempo de la Edge Function. Las
 * opciones sirven igual en modo transacción y en modo sesión del pooler. La
 * consulta en vuelo que se atasca la cubre el tope de TOPE_OPERACION_MS.
 */
export function opcionesConexion(opciones: OpcionesPostgres): postgres.Options<Record<string, never>> {
  const esLocal = opciones.url.includes("localhost") || opciones.url.includes("127.0.0.1");
  return {
    prepare: false, // obligatorio en modo transacción; inofensivo en modo sesión
    max: opciones.max ?? 1,
    max_pipeline: 1,
    queue_timeout: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(esLocal ? {} : { ssl: "require" as const }),
  };
}

/**
 * Parámetros con tipo declarado (oid de pg_type). postgres.js no infiere el tipo de
 * textos, números ni null; con un parámetro sin tipo, la consulta se describe en un
 * viaje a la base y se ejecuta en otro. Con todos los tipos declarados va completa
 * en uno solo, lo que ahorra una ida y vuelta por consulta a través del pooler.
 * jsonb (sql.json) y booleanos ya llevan tipo.
 */
export const OID = { texto: 25, entero: 23, arregloTexto: 1009 } as const;

export function parametrosTipados(sql: postgres.Sql) {
  return {
    texto: (valor: string | null) => sql.typed(valor, OID.texto),
    entero: (valor: number) => sql.typed(valor, OID.entero),
    arregloTexto: (valor: string[] | null) => sql.typed(valor, OID.arregloTexto),
  };
}

type Parametros = ReturnType<typeof parametrosTipados>;
type Consultar = <T>(operacion: (sql: postgres.Sql, p: Parametros) => Promise<T>) => Promise<T>;

export class AccesoPostgres implements AccesoDatos {
  readonly nombre = "postgres";
  readonly cache: CacheInterpretaciones;
  private sql: postgres.Sql;
  private p: Parametros;
  private readonly topeMs: number;

  constructor(private readonly opciones: OpcionesPostgres) {
    this.sql = postgres(opciones.url, opcionesConexion(opciones));
    this.p = parametrosTipados(this.sql);
    this.topeMs = opciones.topeMs ?? TOPE_OPERACION_MS;
    this.cache = new CachePostgres((operacion) => this.consultar(operacion));
  }

  /** Toda consulta pasa por aquí: tope de reloj y, si vence, conexión nueva. */
  private consultar: Consultar = (operacion) => {
    const sql = this.sql;
    return conTope(() => operacion(sql, this.p), this.topeMs, () => this.descartar(sql));
  };

  /** Cierra sin esperar la conexión atascada; las operaciones siguientes usan una nueva. */
  private descartar(sql: postgres.Sql): void {
    if (this.sql !== sql) return;
    this.sql = postgres(this.opciones.url, opcionesConexion(this.opciones));
    this.p = parametrosTipados(this.sql);
    sql.end({ timeout: 0 }).catch(() => undefined);
  }

  async obtenerVerticales(): Promise<Vertical[]> {
    const [fila] = await this.consultar(
      (sql) => sql<{ verticales: unknown }[]>`
        select catalogo.obtener_verticales() as verticales`,
    );
    return z.array(Vertical).parse(fila?.verticales ?? []);
  }

  async obtenerDiccionario(dominio: Dominio): Promise<Diccionario> {
    const [fila] = await this.consultar(
      (sql, p) => sql<{ diccionario: unknown }[]>`
        select catalogo.obtener_diccionario(${p.texto(dominio)}) as diccionario`,
    );
    return Diccionario.parse(fila?.diccionario);
  }

  async buscar(objeto: ObjetoFiltros, limite = LIMITE_POR_OMISION): Promise<ResultadoBusqueda> {
    const tope = Math.min(Math.max(1, Math.trunc(limite)), LIMITE_MAXIMO);
    const [filas, conteo] = await this.consultar((sql, p) => {
      const filtros = sql.json(objeto.filtros);
      const dominio = p.texto(objeto.dominio);
      const categoria = p.texto(objeto.categoria);
      return Promise.all([
        sql<Record<string, unknown>[]>`
          select id, nombre, marca, precio::float8 as precio, descripcion, cumple, sin_dato
          from catalogo.buscar_productos(${dominio}, ${categoria}, ${filtros}, ${objeto.incluir_sin_dato}, ${p.entero(tope)})`,
        sql<{ total: string | number; faltantes: string | number }[]>`
          select total, faltantes
          from catalogo.contar_productos(${dominio}, ${categoria}, ${filtros}, ${objeto.incluir_sin_dato})`,
      ]);
    });
    const c = conteo[0];
    return {
      // postgres.js entrega bigint como texto para no perder precisión; los id del
      // catálogo caben de sobra en un número de JavaScript.
      resultados: filas.map((f) => Resultado.parse({ ...f, id: Number(f.id) })),
      total: Number(c?.total ?? 0),
      faltantes: Number(c?.faltantes ?? 0),
    };
  }

  async facetas(objeto: ObjetoFiltros, atributos?: string[]): Promise<Faceta[]> {
    const filas = await this.consultar(
      (sql, p) => sql<{ atributo: string; valor: string; productos: string | number }[]>`
        select atributo, valor, productos
        from catalogo.calcular_facetas(${p.texto(objeto.dominio)}, ${p.texto(objeto.categoria)}, ${sql.json(objeto.filtros)}, ${objeto.incluir_sin_dato}, ${p.arregloTexto(atributos ?? null)})`,
    );
    const porAtributo = new Map<string, { valor: string; productos: number }[]>();
    for (const f of filas) {
      const lista = porAtributo.get(f.atributo) ?? [];
      lista.push({ valor: f.valor, productos: Number(f.productos) });
      porAtributo.set(f.atributo, lista);
    }
    return [...porAtributo].map(([atributo, valores]) => Faceta.parse({ atributo, valores }));
  }

  async cerrar(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

class CachePostgres implements CacheInterpretaciones {
  constructor(private readonly consultar: Consultar) {}

  async obtener(clave: string): Promise<EntradaCache | null> {
    const [fila] = await this.consultar(
      (sql, p) => sql<{ entrada: EntradaCache | null }[]>`
        select servicio.cache_obtener(${p.texto(clave)}) as entrada`,
    );
    return fila?.entrada ?? null;
  }

  async guardar(clave: string, entrada: EntradaCache): Promise<void> {
    await this.consultar((sql, p) => sql`select servicio.cache_guardar(${p.texto(clave)}, ${sql.json(entrada)})`);
  }
}
