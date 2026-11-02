// Núcleo agnóstico del proyecto (ADR-0002).
// Sin dependencias de Deno ni de supabase-js: TypeScript puro.

export const VERSION_NUCLEO = "0.1.0";

/** Respuesta de salud que la Edge Function expone en GET /salud (T1). */
export function salud(): { estado: "ok"; nucleo: string } {
  return { estado: "ok", nucleo: VERSION_NUCLEO };
}

// Contrato (§6.1)
export {
  DOMINIOS,
  Dominio,
  OPERADORES,
  Operador,
  OPERADORES_POR_TIPO,
  TIPOS_ATRIBUTO,
  TipoAtributo,
  NombreAtributo,
  ValorFiltro,
  Filtro,
  ObjetoFiltros,
  FiltroPropuesto,
  SalidaModelo,
  OBJETO_VACIO,
} from "./contrato/filtros";
export { Diccionario, EntradaDiccionario, entradasDe } from "./contrato/diccionario";

// G1
export { validarObjetoFiltros } from "./g1/validar";
export type {
  Origen,
  MotivoDescarte,
  Descartado,
  FiltroCrudo,
  EntradaValidacion,
  FiltroValidado,
  ResultadoValidacion,
} from "./g1/validar";

// Extractor numérico
export { extraerNumeros } from "./extractor/numerico";

// Utilidades de texto
export { quitarAcentos, normalizarValor, aNumero, aBooleano } from "./texto";
