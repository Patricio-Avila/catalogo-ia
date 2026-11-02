// Contrato del objeto de filtros (CLAUDE.md §6.1).
// Este esquema Zod es la única fuente de verdad: lo usan la validación G1,
// el cliente y la generación de OpenAPI (T4).

import { z } from "zod";

export const DOMINIOS = ["farmacia", "llantas", "belleza"] as const;
export const Dominio = z.enum(DOMINIOS);
export type Dominio = z.infer<typeof Dominio>;

export const OPERADORES = ["=", "<>", "<", "<=", ">", ">="] as const;
export const Operador = z.enum(OPERADORES);
export type Operador = z.infer<typeof Operador>;

export const TIPOS_ATRIBUTO = ["texto", "numero", "booleano"] as const;
export const TipoAtributo = z.enum(TIPOS_ATRIBUTO);
export type TipoAtributo = z.infer<typeof TipoAtributo>;

/** Operadores compatibles por tipo (G1): texto y booleano solo igualdad y desigualdad. */
export const OPERADORES_POR_TIPO: Record<TipoAtributo, readonly Operador[]> = {
  texto: ["=", "<>"],
  booleano: ["=", "<>"],
  numero: OPERADORES,
};

/** Identificador de atributo: minúsculas, dígitos y guion bajo, sin acentos ni eñes. */
export const NombreAtributo = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "identificador sin acentos ni mayúsculas");

export const ValorFiltro = z.union([z.string().max(200), z.number(), z.boolean()]);
export type ValorFiltro = z.infer<typeof ValorFiltro>;

export const Filtro = z.object({
  atributo: NombreAtributo,
  operador: Operador,
  valor: ValorFiltro,
});
export type Filtro = z.infer<typeof Filtro>;

export const ObjetoFiltros = z.object({
  dominio: Dominio,
  categoria: z.string().max(64).nullable(),
  filtros: z.array(Filtro).max(20),
  incluir_sin_dato: z.boolean(),
});
export type ObjetoFiltros = z.infer<typeof ObjetoFiltros>;

/**
 * Un filtro propuesto por el modelo o por el extractor numérico, antes de G1.
 * `confianza` en [0, 1]; `fragmento` es el trozo de texto del que salió, para
 * explicarlo en la interfaz y en la evaluación.
 */
export const FiltroPropuesto = Filtro.extend({
  confianza: z.number().min(0).max(1),
  fragmento: z.string().max(200).optional(),
});
export type FiltroPropuesto = z.infer<typeof FiltroPropuesto>;

/**
 * Salida cruda del modelo, antes de G1. Es tolerante en los valores (cualquier
 * JSON) porque la validación semántica y la coerción ocurren en G1; la forma
 * sí es obligatoria.
 */
export const SalidaModelo = z.object({
  dominio: z.string().optional(),
  categoria: z.string().nullable().optional(),
  filtros: z
    .array(
      z.object({
        atributo: z.string(),
        operador: z.string(),
        valor: z.unknown(),
        confianza: z.number().min(0).max(1).optional(),
        fragmento: z.string().optional(),
      }),
    )
    .max(20),
  incluir_sin_dato: z.boolean().optional(),
});
export type SalidaModelo = z.infer<typeof SalidaModelo>;

export const OBJETO_VACIO = (dominio: Dominio): ObjetoFiltros => ({
  dominio,
  categoria: null,
  filtros: [],
  incluir_sin_dato: false,
});
