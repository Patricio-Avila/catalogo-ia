// Adaptador de fixtures: respuestas fijas por texto normalizado. Sirve a las
// pruebas del núcleo y para simular un modelo engañado en la evaluación de las
// guardas. Un texto desconocido devuelve cero filtros, lo que en interpretar()
// termina en una aclaración.
//
// No guarda estado por petición: en la Edge Function la misma instancia atiende
// peticiones simultáneas, así que nada aquí puede crecer con el uso ni depender
// del orden en que terminan.

import type { Dominio } from "../contrato/filtros";
import { normalizarPeticion } from "../texto";
import type { AdaptadorModelo, PeticionModelo, RespuestaModelo } from "./interfaz";

export type FixturesModelo = Partial<Record<Dominio, Record<string, RespuestaModelo>>>;

export class AdaptadorFixtures implements AdaptadorModelo {
  readonly nombre = "fixtures";
  private readonly tabla: Map<string, RespuestaModelo>;

  constructor(fixtures: FixturesModelo) {
    this.tabla = new Map();
    for (const [dominio, respuestas] of Object.entries(fixtures)) {
      for (const [texto, respuesta] of Object.entries(respuestas)) {
        this.tabla.set(`${dominio}|${normalizarPeticion(texto)}`, respuesta);
      }
    }
  }

  /** La respuesta fija para el texto en esa vertical, o undefined si no hay. */
  buscar(dominio: Dominio, texto: string): RespuestaModelo | undefined {
    return this.tabla.get(`${dominio}|${normalizarPeticion(texto)}`);
  }

  async interpretar({ texto, diccionario }: PeticionModelo): Promise<RespuestaModelo> {
    return this.buscar(diccionario.dominio, texto) ?? { filtros: [] };
  }
}
