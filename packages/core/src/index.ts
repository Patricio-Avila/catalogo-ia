// Núcleo agnóstico del proyecto (ADR-0002).
// Sin dependencias de Deno ni de supabase-js: TypeScript puro.
// Los módulos reales (esquema Zod, validación G1, extractor numérico,
// adaptadores de modelo, acceso a datos) se agregan en T3.

export const VERSION_NUCLEO = "0.1.0";

/** Respuesta de salud que la Edge Function expone en GET /salud (T1). */
export function salud(): { estado: "ok"; nucleo: string } {
  return { estado: "ok", nucleo: VERSION_NUCLEO };
}
