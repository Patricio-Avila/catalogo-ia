// Acceso a datos (ADR-0002, punto 3): driver postgres.js con SQL plano y
// parámetros (G2), por el pooler en modo transacción con `prepare: false`, con
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
}

export class AccesoPostgres implements AccesoDatos {
  private readonly sql: postgres.Sql;
  readonly cache: CacheInterpretaciones;

  constructor(opciones: OpcionesPostgres) {
    this.sql = postgres(opciones.url, {
      prepare: false, // pooler en modo transacción (ADR-0002)
      max: opciones.max ?? 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this.cache = new CachePostgres(this.sql);
  }

  async obtenerVerticales(): Promise<Vertical[]> {
    const [fila] = await this.sql<{ verticales: unknown }[]>`
      select catalogo.obtener_verticales() as verticales`;
    return z.array(Vertical).parse(fila?.verticales ?? []);
  }

  async obtenerDiccionario(dominio: Dominio): Promise<Diccionario> {
    const [fila] = await this.sql<{ diccionario: unknown }[]>`
      select catalogo.obtener_diccionario(${dominio}) as diccionario`;
    return Diccionario.parse(fila?.diccionario);
  }

  async buscar(objeto: ObjetoFiltros, limite = LIMITE_POR_OMISION): Promise<ResultadoBusqueda> {
    const tope = Math.min(Math.max(1, Math.trunc(limite)), LIMITE_MAXIMO);
    const filtros = this.sql.json(objeto.filtros);
    const [filas, conteo] = await Promise.all([
      this.sql<Record<string, unknown>[]>`
        select id, nombre, marca, precio::float8 as precio, descripcion, cumple, sin_dato
        from catalogo.buscar_productos(${objeto.dominio}, ${objeto.categoria}, ${filtros}, ${objeto.incluir_sin_dato}, ${tope})`,
      this.sql<{ total: string | number; faltantes: string | number }[]>`
        select total, faltantes
        from catalogo.contar_productos(${objeto.dominio}, ${objeto.categoria}, ${filtros}, ${objeto.incluir_sin_dato})`,
    ]);
    const c = conteo[0];
    return {
      resultados: filas.map((f) => Resultado.parse(f)),
      total: Number(c?.total ?? 0),
      faltantes: Number(c?.faltantes ?? 0),
    };
  }

  async facetas(objeto: ObjetoFiltros, atributos?: string[]): Promise<Faceta[]> {
    const filas = await this.sql<{ atributo: string; valor: string; productos: string | number }[]>`
      select atributo, valor, productos
      from catalogo.calcular_facetas(${objeto.dominio}, ${objeto.categoria}, ${this.sql.json(objeto.filtros)}, ${objeto.incluir_sin_dato}, ${atributos ?? null})`;
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
  constructor(private readonly sql: postgres.Sql) {}

  async obtener(clave: string): Promise<EntradaCache | null> {
    const [fila] = await this.sql<{ entrada: EntradaCache | null }[]>`
      select servicio.cache_obtener(${clave}) as entrada`;
    return fila?.entrada ?? null;
  }

  async guardar(clave: string, entrada: EntradaCache): Promise<void> {
    await this.sql`select servicio.cache_guardar(${clave}, ${this.sql.json(entrada)})`;
  }
}
