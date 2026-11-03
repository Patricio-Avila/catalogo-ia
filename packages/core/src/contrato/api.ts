// Contrato HTTP (CLAUDE.md §6.2): entradas y salidas de /buscar, /facetas,
// /diccionario y /salud en Zod. De aquí sale el OpenAPI 3.1 (docs/api/openapi.json).

import { z } from "zod";
import { Accion } from "../acciones";
import { MOTIVOS_DESCARTE } from "../g1/validar";
import { Diccionario, Vertical } from "./diccionario";
import { Dominio, Filtro, FiltroPropuesto, NombreAtributo, ObjetoFiltros } from "./filtros";
import { Faceta, Resultado } from "./respuestas";

export const LIMITE_MAXIMO_API = 200;

export const PeticionBuscar = z
  .object({
    dominio: Dominio,
    /** Petición en lenguaje natural; pasa por el modelo. */
    texto: z.string().trim().min(1).max(500).optional(),
    /** Acción estructurada; nunca pasa por el modelo (RF-03, RF-10). */
    accion: Accion.optional(),
    filtros_vigentes: ObjetoFiltros.nullable(),
    limite: z.number().int().min(1).max(LIMITE_MAXIMO_API).optional(),
  })
  .refine((p) => (p.texto === undefined) !== (p.accion === undefined), {
    message: "exactamente uno de texto o accion",
  })
  .refine((p) => p.filtros_vigentes === null || p.filtros_vigentes.dominio === p.dominio, {
    message: "filtros_vigentes.dominio debe coincidir con dominio",
    path: ["filtros_vigentes", "dominio"],
  });
export type PeticionBuscar = z.infer<typeof PeticionBuscar>;

export const Nivel = z.enum(["alta", "media", "baja"]);
export const OrigenEtiqueta = z.enum(["modelo", "usuario", "cache"]);

export const EtiquetaApi = Filtro.extend({
  confianza: z.number().min(0).max(1),
  origen: OrigenEtiqueta,
  nivel: Nivel,
  sugerida: z.boolean(),
  fragmento: z.string().optional(),
});
export type EtiquetaApi = z.infer<typeof EtiquetaApi>;

export const DescartadoApi = z.object({
  atributo: z.string(),
  operador: z.string().optional(),
  valor: z.unknown().optional(),
  motivo: z.enum(MOTIVOS_DESCARTE),
  detalle: z.string(),
});

export const AclaracionApi = z.object({
  pregunta: z.string(),
  opciones: z.array(z.string()),
  filtros_dudosos: z.array(FiltroPropuesto),
});

export const RespuestaBuscar = z.object({
  filtros: ObjetoFiltros,
  etiquetas: z.array(EtiquetaApi),
  descartados: z.array(DescartadoApi),
  resultados: z.array(Resultado),
  total: z.number().int().nonnegative(),
  faltantes: z.number().int().nonnegative(),
  facetas: z.array(Faceta),
  aclaracion: AclaracionApi.nullable(),
  /** true cuando la aclaración o el límite de gasto impidieron consultar la base. */
  sin_consultar: z.boolean(),
  desde_cache: z.boolean(),
  llamo_modelo: z.boolean(),
});
export type RespuestaBuscar = z.infer<typeof RespuestaBuscar>;

export const PeticionFacetas = z.object({
  filtros: ObjetoFiltros,
  atributos: z.array(NombreAtributo).max(20).optional(),
});
export type PeticionFacetas = z.infer<typeof PeticionFacetas>;

export const RespuestaFacetas = z.object({ facetas: z.array(Faceta) });

export const RespuestaDiccionario = Diccionario;

export const RespuestaVerticales = z.object({ verticales: z.array(Vertical) });

export const RespuestaSalud = z.object({ estado: z.literal("ok"), nucleo: z.string() });

/** Errores al cliente siempre genéricos; el detalle va al log de la función. */
export const RespuestaError = z.object({
  error: z.enum(["peticion_invalida", "no_encontrado", "error_interno"]),
  /** Solo en peticion_invalida: qué campo del cuerpo falló. Nunca detalle interno. */
  campos: z.array(z.object({ ruta: z.string(), mensaje: z.string() })).optional(),
});
export type RespuestaError = z.infer<typeof RespuestaError>;
