// Adaptador interactivo para el cliente web (T5): combina las respuestas fijas
// de `AdaptadorFixtures` con coincidencia léxica sobre el diccionario de la
// vertical cuando el usuario escribe una frase libre no listada en los fixtures.
// Toda salida pasa igualmente por el extractor numérico y por la guarda G1.
//
// Reglas generales de la coincidencia (revisión del 2026-11-27, ADR-0003). Ninguna
// depende de una frase concreta; todas salen del diccionario o de la morfología:
//   1. Plural y acentos: "tabletas" coincide con "tableta" y "capsulas" con "cápsula".
//   2. Formas derivadas de un valor en infinitivo: "hidratante" → hidratar,
//      "limpiador" → limpiar, "protector" → proteger. Confianza media: el filtro se
//      aplica marcado como sugerido.
//   3. Categoría deducida: si ninguna palabra nombra la categoría y los valores
//      reconocidos solo existen juntos en una categoría de la vertical, se propone esa.
// Sinónimos y coloquialismos ("pastillas", "piel delicada") no se resuelven aquí:
// son el trabajo del adaptador de lenguaje.

import type { Diccionario } from "../contrato/diccionario";
import type { FiltroPropuesto } from "../contrato/filtros";
import { quitarAcentos } from "../texto";
import { AdaptadorFixtures, type FixturesModelo } from "./fixtures";
import type { AdaptadorModelo, PeticionModelo, RespuestaModelo } from "./interfaz";

const PALABRAS_CATEGORIA: Record<string, string[]> = {
  medicamentos: ["medicamento", "farmaco", "alivio"],
  suplementos: ["suplemento", "vitamina"],
  pasajeros: ["pasajero", "auto", "sedan", "compacto"],
  carga_ligera: ["carga ligera", "camioneta", "carga", "pickup"],
  cuidado_facial: ["facial", "rostro", "cara", "crema facial", "serum", "tonico", "protector solar"],
  cuidado_corporal: ["corporal", "cuerpo", "locion", "exfoliante", "jabon"],
};

const CONFIANZA = { literal: 0.9, derivada: 0.8 } as const;

export class AdaptadorInteractivo implements AdaptadorModelo {
  readonly nombre = "interactivo";
  private readonly base: AdaptadorFixtures;

  constructor(fixtures: FixturesModelo = {}) {
    this.base = new AdaptadorFixtures(fixtures);
  }

  async interpretar(peticion: PeticionModelo): Promise<RespuestaModelo> {
    return (
      this.base.buscar(peticion.diccionario.dominio, peticion.texto) ??
      inferirDesdeDiccionario(peticion.texto, peticion.diccionario)
    );
  }
}

function inferirDesdeDiccionario(textoCrudo: string, diccionario: Diccionario): RespuestaModelo {
  const texto = quitarAcentos(textoCrudo).toLowerCase().trim();

  if (/\b(?:reiniciar|limpiar filtros|empezar de nuevo|borrar todo)\b/.test(texto)) {
    return { reiniciar: true, filtros: [] };
  }

  const palabras = tokens(texto);
  const palabrasSinRaiz = texto.split(/[^a-z0-9ñ]+/).filter(Boolean);

  let categoria: string | undefined;
  for (const cat of diccionario.categorias) {
    const claves = PALABRAS_CATEGORIA[cat] ?? [cat.replace(/_/g, " ")];
    if (claves.some((c) => contieneTermino(palabras, c))) {
      categoria = cat;
      break;
    }
  }

  const filtros: FiltroPropuesto[] = [];
  const yaPropuestos = new Set<string>();
  // Categorías donde existe cada valor de texto reconocido (regla 3).
  const categoriasDeValores: Array<Set<string>> = [];

  for (const entrada of diccionario.entradas) {
    if (yaPropuestos.has(entrada.atributo)) continue;
    if (entrada.atributo === "precio") continue;

    if (entrada.tipo === "texto" && entrada.valores) {
      for (const valor of entrada.valores) {
        const literal = contieneTermino(palabras, valor);
        const derivada = !literal && palabrasSinRaiz.some((p) => esDerivadaDe(valor, p));
        if (!literal && !derivada) continue;
        filtros.push({
          atributo: entrada.atributo,
          operador: "=",
          valor,
          confianza: literal ? CONFIANZA.literal : CONFIANZA.derivada,
          fragmento: valor,
        });
        yaPropuestos.add(entrada.atributo);
        categoriasDeValores.push(categoriasCon(diccionario, entrada.atributo, valor));
        break;
      }
    } else if (entrada.tipo === "booleano") {
      const etiqueta = entrada.atributo.replace(/_/g, " ");
      if (contieneTermino(palabras, etiqueta)) {
        const negado = new RegExp(`\\b(?:no|sin)\\s+${escaparRegex(etiqueta)}\\b`).test(texto);
        filtros.push({
          atributo: entrada.atributo,
          operador: "=",
          valor: !negado,
          confianza: CONFIANZA.literal,
          fragmento: etiqueta,
        });
        yaPropuestos.add(entrada.atributo);
      }
    }
  }

  categoria ??= categoriaUnica(categoriasDeValores);
  return categoria === undefined ? { filtros } : { categoria, filtros };
}

/**
 * Forma base de una palabra para comparar sin plural: quita la "s" final y, si
 * queda una "e" tras l, r, n, d, z o j, también la quita ("jabones" y "jabon",
 * "sensibles" y "sensible" llegan a la misma forma). Se aplica igual al texto y a
 * los valores del diccionario, así que basta con que sea consistente.
 */
function raiz(palabra: string): string {
  let p = palabra;
  if (p.length > 3 && p.endsWith("s")) p = p.slice(0, -1);
  if (p.length > 3 && /[lrndzj]e$/.test(p)) p = p.slice(0, -1);
  return p;
}

function tokens(texto: string): string[] {
  return quitarAcentos(texto).toLowerCase().split(/[^a-z0-9ñ]+/).filter(Boolean).map(raiz);
}

/** El término (una o varias palabras) aparece seguido en el texto, sin plural ni acentos. */
function contieneTermino(palabras: string[], termino: string): boolean {
  const buscado = tokens(termino);
  if (buscado.length === 0 || buscado.join("").length < 2) return false;
  for (let i = 0; i + buscado.length <= palabras.length; i++) {
    if (buscado.every((t, j) => palabras[i + j] === t)) return true;
  }
  return false;
}

/**
 * Sustantivo o adjetivo derivado de un verbo en infinitivo: "hidratante" de
 * hidratar, "limpiador" de limpiar, "protector" de proteger. Se compara contra el
 * tema sin su última consonante para admitir alternancias como g/c.
 */
function esDerivadaDe(valor: string, palabra: string): boolean {
  const infinitivo = /^([a-z]+)(?:ar|er|ir)$/.exec(quitarAcentos(valor).toLowerCase());
  if (!infinitivo || infinitivo[1]!.length < 4) return false;
  const tema = infinitivo[1]!.slice(0, -1);
  if (!palabra.startsWith(tema)) return false;
  return /^[a-z]?(?:ante|ente|iente|ador|edor|idor|tor|or)(?:a|e)?s?$/.test(palabra.slice(tema.length));
}

function categoriasCon(diccionario: Diccionario, atributo: string, valor: string): Set<string> {
  return new Set(
    diccionario.entradas.filter((e) => e.atributo === atributo && e.valores?.includes(valor)).map((e) => e.categoria),
  );
}

/** La única categoría donde existen a la vez todos los valores reconocidos, si la hay. */
function categoriaUnica(conjuntos: Array<Set<string>>): string | undefined {
  if (conjuntos.length === 0) return undefined;
  const comunes = [...conjuntos[0]!].filter((c) => conjuntos.every((s) => s.has(c)));
  return comunes.length === 1 ? comunes[0] : undefined;
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
