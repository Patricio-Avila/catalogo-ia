// Extractor numérico (CLAUDE.md §6, paso 3): saca del texto, con expresiones
// regulares y sin modelo, los filtros que dependen de números: precios,
// cantidades con unidad, medidas de llanta e índices, SPF y año.
//
// Devuelve filtros propuestos con confianza y el fragmento de texto de origen.
// Pasan por G1 como cualquier otra propuesta. Lo que no se reconoce no se
// inventa: un número suelto sin unidad ni comparador se ignora.
//
// Limitaciones conocidas: no entiende números en palabras ("doscientos"),
// y un número con comparador pero sin unidad se toma como precio con confianza media.

import type { Dominio, FiltroPropuesto, Operador } from "../contrato/filtros";
import { aNumero, quitarAcentos } from "../texto";

const CONFIANZA = {
  medida_llanta: 0.95,
  precio_explicito: 0.95,
  unidad: 0.9,
  precio_sin_unidad: 0.6,
} as const;

/** Frases que preceden a un número y fijan el operador. Se evalúan sobre el texto sin acentos. */
const COMPARADORES_PREVIOS: Array<[RegExp, Operador]> = [
  [/\b(?:menos de|menor(?:es)? (?:a|de|que)|por debajo de|abajo de|inferior(?:es)? a)\s*$/, "<"],
  [/\b(?:maximo|hasta|no mas de|como maximo|a lo mas|tope de|que no pase(?:n)? de)\s*$/, "<="],
  [/\b(?:mas de|mayor(?:es)? (?:a|de|que)|por encima de|arriba de|superior(?:es)? a)\s*$/, ">"],
  [/\b(?:minimo|desde|al menos|por lo menos|como minimo|a partir de)\s*$/, ">="],
];

/** Frases que siguen al número ("o más", "o menos"). */
const COMPARADORES_POSTERIORES: Array<[RegExp, Operador]> = [
  [/^\s*(?:o mas|o mayor|en adelante|para arriba)\b/, ">="],
  [/^\s*(?:o menos|o menor|para abajo)\b/, "<="],
];

/** Unidades por vertical: atributo al que corresponde el número que las precede. */
const UNIDADES: Record<Dominio, Array<{ atributo: string; patron: RegExp; factor?: number }>> = {
  farmacia: [
    { atributo: "concentracion_mg", patron: /\s*(?:mg|miligramos?)\b/ },
    { atributo: "piezas", patron: /\s*(?:piezas?|pzas?\.?|pz\b|tabletas?|tabs?\b|capsulas?|comprimidos?|sobres?|unidades?)/ },
  ],
  llantas: [
    { atributo: "garantia_km", patron: /\s*mil\s*(?:km|kilometros)\b/, factor: 1000 },
    { atributo: "garantia_km", patron: /\s*(?:km|kilometros)\b/ },
    { atributo: "rin_pulg", patron: /\s*(?:pulgadas?|")/ },
  ],
  belleza: [
    { atributo: "contenido_ml", patron: /\s*(?:ml|mililitros?)\b/ },
    { atributo: "spf", patron: /\s*(?:spf|fps)\b/ },
  ],
};

const NUMERO = String.raw`\$?\s*(\d{1,3}(?:,\d{3})+|\d+(?:[.,]\d+)?)`;
const PALABRAS_PRECIO = /\s*(?:pesos|mxn|varos|lucas|\$)/;

export function extraerNumeros(texto: string, dominio: Dominio): FiltroPropuesto[] {
  // Se trabaja sobre una copia sin acentos y en minúsculas; los índices coinciden
  // con el original porque quitar acentos no cambia la longitud de la cadena.
  let plano = quitarAcentos(texto).toLowerCase();
  const propuestas: FiltroPropuesto[] = [];

  const consumir = (inicio: number, fin: number) => {
    plano = plano.slice(0, inicio) + " ".repeat(fin - inicio) + plano.slice(fin);
  };
  const fragmentoDe = (inicio: number, fin: number) => texto.slice(inicio, fin).trim();

  // 1. Medida de llanta: 205/55 R16 91V (índices opcionales). Va primero porque
  //    contiene números que otras reglas confundirían.
  if (dominio === "llantas") {
    const medida = /\b(\d{3})\s*\/\s*(\d{2})\s*(?:z?r|-)?\s*(\d{2})(?:\s*(\d{2,3})\s*([a-z]))?\b/g;
    for (const m of plano.matchAll(medida)) {
      const fragmento = fragmentoDe(m.index, m.index + m[0].length);
      const comun = { operador: "=" as const, confianza: CONFIANZA.medida_llanta, fragmento };
      propuestas.push({ atributo: "ancho_mm", valor: Number(m[1]), ...comun });
      propuestas.push({ atributo: "perfil_pct", valor: Number(m[2]), ...comun });
      propuestas.push({ atributo: "rin_pulg", valor: Number(m[3]), ...comun });
      if (m[4] !== undefined) propuestas.push({ atributo: "indice_carga", valor: Number(m[4]), ...comun });
      if (m[5] !== undefined) propuestas.push({ atributo: "indice_velocidad", valor: m[5].toUpperCase(), ...comun });
      consumir(m.index, m.index + m[0].length);
    }
    // "rin 16", "r16"
    for (const m of plano.matchAll(/\b(?:rin|r)\s*(\d{2})\b/g)) {
      propuestas.push({
        atributo: "rin_pulg",
        operador: "=",
        valor: Number(m[1]),
        confianza: CONFIANZA.unidad,
        fragmento: fragmentoDe(m.index, m.index + m[0].length),
      });
      consumir(m.index, m.index + m[0].length);
    }
    for (const m of plano.matchAll(/\bindice de carga\s*(?:de\s*)?(\d{2,3})\b/g)) {
      propuestas.push({ atributo: "indice_carga", operador: "=", valor: Number(m[1]), confianza: CONFIANZA.unidad, fragmento: fragmentoDe(m.index, m.index + m[0].length) });
      consumir(m.index, m.index + m[0].length);
    }
    for (const m of plano.matchAll(/\bindice de velocidad\s*(?:de\s*)?([a-z])\b/g)) {
      propuestas.push({ atributo: "indice_velocidad", operador: "=", valor: m[1]!.toUpperCase(), confianza: CONFIANZA.unidad, fragmento: fragmentoDe(m.index, m.index + m[0].length) });
      consumir(m.index, m.index + m[0].length);
    }
    for (const m of plano.matchAll(/\b(?:del|modelo|ano|fabricad[ao]s?(?:\s+en)?)\s+(20\d{2})\b/g)) {
      propuestas.push({ atributo: "anio_fabricacion", operador: "=", valor: Number(m[1]), confianza: CONFIANZA.unidad, fragmento: fragmentoDe(m.index, m.index + m[0].length) });
      consumir(m.index, m.index + m[0].length);
    }
  }

  // 2. SPF / FPS: la unidad va antes del número.
  if (dominio === "belleza") {
    for (const m of plano.matchAll(/\b(?:spf|fps|factor(?: de proteccion)?)\s*(\d{1,3})\b/g)) {
      const fin = m.index + m[0].length;
      const operador = comparadorPosterior(plano.slice(fin)) ?? comparadorPrevio(plano.slice(0, m.index)) ?? "=";
      propuestas.push({ atributo: "spf", operador, valor: Number(m[1]), confianza: CONFIANZA.unidad, fragmento: fragmentoDe(m.index, fin) });
      consumir(m.index, fin);
    }
  }

  // 3. "entre X y Y <unidad>": dos filtros.
  const entre = new RegExp(String.raw`\bentre\s+${NUMERO}\s*(?:y|a)\s+${NUMERO}([a-z"\s]{0,20})`, "g");
  for (const m of plano.matchAll(entre)) {
    const a = aNumero(m[1]);
    const b = aNumero(m[2]);
    if (a === null || b === null) continue;
    const cola = m[3] ?? "";
    const unidad = unidadEn(cola, dominio);
    const esPrecio = unidad === null && (PALABRAS_PRECIO.test(cola) || m[0].includes("$"));
    const atributo = unidad?.atributo ?? (esPrecio || unidad === null ? "precio" : unidad.atributo);
    const factor = unidad?.factor ?? 1;
    const confianza = unidad ? CONFIANZA.unidad : esPrecio ? CONFIANZA.precio_explicito : CONFIANZA.precio_sin_unidad;
    const finUtil = m.index + m[0].length - cola.length + (unidad?.largo ?? (esPrecio ? largoPrecio(cola) : 0));
    const fragmento = fragmentoDe(m.index, finUtil);
    propuestas.push({ atributo, operador: ">=", valor: Math.min(a, b) * factor, confianza, fragmento });
    propuestas.push({ atributo, operador: "<=", valor: Math.max(a, b) * factor, confianza, fragmento });
    consumir(m.index, finUtil);
  }

  // 4. Número con unidad de la vertical.
  for (const unidad of UNIDADES[dominio]) {
    const patron = new RegExp(String.raw`${NUMERO}${unidad.patron.source}`, "g");
    for (const m of plano.matchAll(patron)) {
      const n = aNumero(m[1]);
      if (n === null) continue;
      const fin = m.index + m[0].length;
      const operador = comparadorPosterior(plano.slice(fin)) ?? comparadorPrevio(plano.slice(0, m.index)) ?? "=";
      propuestas.push({ atributo: unidad.atributo, operador, valor: n * (unidad.factor ?? 1), confianza: CONFIANZA.unidad, fragmento: fragmentoDe(m.index, fin) });
      consumir(m.index, fin);
    }
  }

  // 5. Precio: número con $ o palabra de dinero, o número suelto con comparador.
  const precio = new RegExp(String.raw`${NUMERO}(${PALABRAS_PRECIO.source})?`, "g");
  for (const m of plano.matchAll(precio)) {
    const n = aNumero(m[1]);
    if (n === null) continue;
    const fin = m.index + m[0].length;
    const explicito = m[2] !== undefined || m[0].includes("$");
    const operador = comparadorPosterior(plano.slice(fin)) ?? comparadorPrevio(plano.slice(0, m.index));
    if (!explicito && operador === null) continue; // número suelto: se ignora
    propuestas.push({
      atributo: "precio",
      operador: operador ?? "=",
      valor: n,
      confianza: explicito ? CONFIANZA.precio_explicito : CONFIANZA.precio_sin_unidad,
      fragmento: fragmentoDe(m.index, fin),
    });
    consumir(m.index, fin);
  }

  return propuestas;
}

function comparadorPrevio(prefijo: string): Operador | null {
  const cola = prefijo.slice(-40);
  for (const [patron, operador] of COMPARADORES_PREVIOS) if (patron.test(cola)) return operador;
  return null;
}

function comparadorPosterior(sufijo: string): Operador | null {
  for (const [patron, operador] of COMPARADORES_POSTERIORES) if (patron.test(sufijo)) return operador;
  return null;
}

function unidadEn(cola: string, dominio: Dominio): { atributo: string; factor: number; largo: number } | null {
  for (const u of UNIDADES[dominio]) {
    const m = new RegExp(`^${u.patron.source}`).exec(cola);
    if (m) return { atributo: u.atributo, factor: u.factor ?? 1, largo: m[0].length };
  }
  return null;
}

function largoPrecio(cola: string): number {
  const m = new RegExp(`^${PALABRAS_PRECIO.source}`).exec(cola);
  return m ? m[0].length : 0;
}
