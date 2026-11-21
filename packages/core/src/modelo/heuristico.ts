// Adaptador interactivo para el cliente web (T5): combina las respuestas fijas
// de `AdaptadorFixtures` con coincidencia léxica sobre el diccionario de la
// vertical cuando el usuario escribe una frase libre no listada en los fixtures.
// Toda salida pasa igualmente por el extractor numérico y por la guarda G1.

import type { Diccionario } from "../contrato/diccionario";
import type { FiltroPropuesto } from "../contrato/filtros";
import { normalizarValor, quitarAcentos } from "../texto";
import { AdaptadorFixtures, type FixturesModelo } from "./fixtures";
import type { AdaptadorModelo, PeticionModelo, RespuestaModelo } from "./interfaz";

const PALABRAS_CATEGORIA: Record<string, string[]> = {
  medicamentos: ["medicamento", "medicamentos", "farmaco", "alivio"],
  suplementos: ["suplemento", "suplementos", "vitamina", "vitaminas"],
  pasajeros: ["pasajero", "pasajeros", "auto", "sedan", "compacto"],
  carga_ligera: ["carga ligera", "camioneta", "carga", "pickup"],
  cuidado_facial: ["facial", "rostro", "cara", "crema facial", "serum", "tonico", "protector solar"],
  cuidado_corporal: ["corporal", "cuerpo", "locion", "exfoliante", "jabon"],
};

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

  let categoria: string | undefined;
  for (const cat of diccionario.categorias) {
    const claves = PALABRAS_CATEGORIA[cat] ?? [cat.replace(/_/g, " ")];
    if (claves.some((c) => contieneTermino(texto, c))) {
      categoria = cat;
      break;
    }
  }

  const filtros: FiltroPropuesto[] = [];
  const yaPropuestos = new Set<string>();

  for (const entrada of diccionario.entradas) {
    if (yaPropuestos.has(entrada.atributo)) continue;
    if (entrada.atributo === "precio") continue;

    if (entrada.tipo === "texto" && entrada.valores) {
      for (const valor of entrada.valores) {
        const valorNorm = normalizarValor(valor);
        if (valorNorm.length >= 2 && contieneTermino(texto, valorNorm)) {
          filtros.push({
            atributo: entrada.atributo,
            operador: "=",
            valor,
            confianza: 0.9,
            fragmento: valor,
          });
          yaPropuestos.add(entrada.atributo);
          break;
        }
      }
    } else if (entrada.tipo === "booleano") {
      const etiqueta = entrada.atributo.replace(/_/g, " ");
      if (contieneTermino(texto, etiqueta)) {
        const negado = new RegExp(`\\b(?:no|sin)\\s+${escaparRegex(etiqueta)}\\b`).test(texto);
        filtros.push({
          atributo: entrada.atributo,
          operador: "=",
          valor: !negado,
          confianza: 0.9,
          fragmento: etiqueta,
        });
        yaPropuestos.add(entrada.atributo);
      }
    }
  }

  return categoria === undefined ? { filtros } : { categoria, filtros };
}

function contieneTermino(texto: string, termino: string): boolean {
  const limpio = quitarAcentos(termino).toLowerCase().trim();
  if (!limpio) return false;
  const patron = new RegExp(`(?:^|[^a-z0-9])${escaparRegex(limpio)}(?:$|[^a-z0-9])`);
  return patron.test(texto);
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
