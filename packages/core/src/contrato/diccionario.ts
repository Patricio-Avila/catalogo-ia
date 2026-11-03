// Diccionario de atributos: lo único del catálogo que ve el modelo (CLAUDE.md §4).
// Lo sirve la base por vertical; aquí se tipa y se valida lo que llega.
// Combina la vista materializada `diccionario_atributos` (tipo, dominio de
// valores, cobertura) con `atributo_meta` (obligatorio, define_uso,
// define_riesgo, peso, inferible). Las columnas fijas (`precio`, `marca`) se
// incluyen como entradas más: la función SQL sabe cuáles son columnas.

import { z } from "zod";
import { Dominio, NombreAtributo, TipoAtributo } from "./filtros";

export const EntradaDiccionario = z
  .object({
    categoria: z.string().min(1).max(64),
    atributo: NombreAtributo,
    tipo: TipoAtributo,
    /** Dominio de valores para texto y booleano (los booleanos no lo necesitan). */
    valores: z.array(z.string()).optional(),
    /** Rango para numéricos. */
    minimo: z.number().optional(),
    maximo: z.number().optional(),
    /** Porcentaje de productos de la categoría que tienen el dato. */
    cobertura_pct: z.number().min(0).max(100),
    obligatorio: z.boolean(),
    define_uso: z.boolean(),
    define_riesgo: z.boolean(),
    /** false: el modelo nunca lo propone (RF-11). Siempre false si define_riesgo. */
    inferible: z.boolean(),
    peso: z.number().min(0).optional(),
  })
  .refine((e) => !(e.define_riesgo && e.inferible), {
    message: "un atributo que define riesgo nunca es inferible",
  });
export type EntradaDiccionario = z.infer<typeof EntradaDiccionario>;

export const Diccionario = z.object({
  dominio: Dominio,
  /** Cambia en cada refresco; forma parte de la clave de la caché exacta. */
  version: z.string().min(1),
  categorias: z.array(z.string().min(1)).min(1),
  entradas: z.array(EntradaDiccionario),
});
export type Diccionario = z.infer<typeof Diccionario>;

/** Configuración de una vertical, tal como la sirve catalogo.obtener_verticales(). */
export const Vertical = z.object({
  dominio: Dominio,
  nombre: z.string().min(1),
  texto_ayuda: z.string(),
  /** Texto que el cliente muestra siempre en la vertical (farmacia: solo búsqueda de catálogo). */
  aviso: z.string().nullable(),
  atributos_destacados: z.array(NombreAtributo),
  version_diccionario: z.string(),
  categorias: z.array(z.object({ categoria: z.string().min(1), nombre: z.string().min(1) })),
});
export type Vertical = z.infer<typeof Vertical>;

/**
 * Entradas aplicables a un atributo. Con categoría, la entrada exacta; sin
 * categoría (`null`), todas las categorías de la vertical que lo tienen.
 */
export function entradasDe(
  diccionario: Diccionario,
  categoria: string | null,
  atributo: string,
): EntradaDiccionario[] {
  return diccionario.entradas.filter(
    (e) => e.atributo === atributo && (categoria === null || e.categoria === categoria),
  );
}
