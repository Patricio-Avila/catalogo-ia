// Vocabulario prohibido en cualquier texto que vea el usuario (CLAUDE.md §6).
// El sistema no afirma equivalencias ni recomienda. Hay una prueba de contrato
// que recorre los textos que produce el núcleo y exige cero apariciones.

import { normalizarValor } from "./texto";

export const VOCABULARIO_PROHIBIDO = [
  "igual",
  "equivalente",
  "sustituto",
  "intercambiable",
  "recomendado",
  "indicado para",
  "dosis",
] as const;

// Formas flexionadas: plural y género. Se evalúa sobre texto normalizado (sin acentos).
const PATRON = /\b(igual(?:es)?|equivalentes?|sustitut[oa]s?|intercambiables?|recomendad[oa]s?|indicad[oa]s? para|dosis)\b/g;

/** Palabras prohibidas presentes en el texto, sin repetir. Vacío si está limpio. */
export function vocabularioProhibidoEn(texto: string): string[] {
  const halladas = normalizarValor(texto).match(PATRON) ?? [];
  return [...new Set(halladas)];
}
