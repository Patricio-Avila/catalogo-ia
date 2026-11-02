export const VERSION_NUCLEO = "0.1.0";

/** Respuesta de salud que la API expone en GET /salud (T1). */
export function salud(): { estado: "ok"; nucleo: string } {
  return { estado: "ok", nucleo: VERSION_NUCLEO };
}
