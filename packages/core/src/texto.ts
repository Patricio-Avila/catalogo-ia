// Utilidades de texto compartidas por la validación G1 y el extractor numérico.

/** Quita acentos y diéresis conservando la eñe como "n" no: la eñe se mantiene. */
export function quitarAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

/** Forma canónica para comparar valores de texto: minúsculas, sin acentos, espacios colapsados. */
export function normalizarValor(texto: string): string {
  return quitarAcentos(texto).toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Convierte a número lo que el modelo o el extractor entregan: acepta números,
 * cadenas con signo de pesos, separador de miles con coma y decimal con punto o coma.
 * Devuelve null si no es un número.
 */
export function aNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  let limpio = valor.trim().replace(/\$/g, "").replace(/\s/g, "");
  // "1,500" o "1,500,000": coma como separador de miles
  limpio = limpio.replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  // coma decimal residual ("12,5") → punto
  limpio = limpio.replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

const VERDADEROS = new Set(["true", "si", "verdadero", "1", "con"]);
const FALSOS = new Set(["false", "no", "falso", "0", "sin"]);

/** Convierte a booleano valores como true, "sí", "no", "verdadero". Devuelve null si no se reconoce. */
export function aBooleano(valor: unknown): boolean | null {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor === 1 ? true : valor === 0 ? false : null;
  if (typeof valor !== "string") return null;
  const v = normalizarValor(valor);
  if (VERDADEROS.has(v)) return true;
  if (FALSOS.has(v)) return false;
  return null;
}
