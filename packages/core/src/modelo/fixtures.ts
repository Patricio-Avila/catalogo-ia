// Adaptador de fixtures: respuestas fijas por texto normalizado. Sirve a las
// pruebas del núcleo, al arnés de evaluación en seco y al cliente mientras no
// hay proveedor real (CLAUDE.md §1.11). Un texto desconocido devuelve cero
// filtros, lo que en interpretar() termina en una aclaración.

import type { Dominio } from "../contrato/filtros";
import { normalizarPeticion } from "../texto";
import type { AdaptadorModelo, PeticionModelo, RespuestaModelo } from "./interfaz";

export type FixturesModelo = Partial<Record<Dominio, Record<string, RespuestaModelo>>>;

export class AdaptadorFixtures implements AdaptadorModelo {
  readonly nombre = "fixtures";
  private readonly tabla: Map<string, RespuestaModelo>;
  /** Textos que se consultaron sin tener fixture; útil para saber qué falta. */
  readonly sinFixture: string[] = [];

  constructor(fixtures: FixturesModelo) {
    this.tabla = new Map();
    for (const [dominio, respuestas] of Object.entries(fixtures)) {
      for (const [texto, respuesta] of Object.entries(respuestas)) {
        this.tabla.set(`${dominio}|${normalizarPeticion(texto)}`, respuesta);
      }
    }
  }

  async interpretar({ texto, diccionario }: PeticionModelo): Promise<RespuestaModelo> {
    const clave = `${diccionario.dominio}|${normalizarPeticion(texto)}`;
    const respuesta = this.tabla.get(clave);
    if (respuesta === undefined) {
      this.sinFixture.push(clave);
      return { filtros: [] };
    }
    return respuesta;
  }
}
