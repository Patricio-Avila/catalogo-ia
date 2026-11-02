// Formas de lo que devuelve la base (CLAUDE.md §6.2). Las usan el acceso a
// datos y, en T4, la generación de OpenAPI.

import { z } from "zod";
import { NombreAtributo } from "./filtros";

export const Resultado = z.object({
  id: z.number().int(),
  nombre: z.string(),
  marca: z.string(),
  precio: z.number(),
  descripcion: z.string(),
  /** Filtros que cumple, calculados en SQL (RF-05). */
  cumple: z.array(NombreAtributo),
  /** Atributos del filtro sin dato en este producto (RF-05). */
  sin_dato: z.array(NombreAtributo),
});
export type Resultado = z.infer<typeof Resultado>;

export const ResultadoBusqueda = z.object({
  resultados: z.array(Resultado),
  /** Productos que cumplen todos los filtros (con o sin dato según incluir_sin_dato). */
  total: z.number().int().nonnegative(),
  /** Productos excluidos por no tener el dato de algún filtro (RF-06). */
  faltantes: z.number().int().nonnegative(),
});
export type ResultadoBusqueda = z.infer<typeof ResultadoBusqueda>;

export const ValorFaceta = z.object({
  /** Valor del atributo o "(sin dato)" para el grupo sin dato (RF-07). */
  valor: z.string(),
  productos: z.number().int().nonnegative(),
});

export const Faceta = z.object({
  atributo: NombreAtributo,
  valores: z.array(ValorFaceta),
});
export type Faceta = z.infer<typeof Faceta>;
