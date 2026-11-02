// Interfaz única del modelo (ADR-0002, punto 5). Cada proveedor es un adaptador:
// fixtures (pruebas y cliente sin modelo), LLM con JSON acotado, Jev.
// El adaptador recibe el texto, el diccionario de la vertical y los filtros
// vigentes; devuelve propuestas. Nunca toca la base. Todo lo que devuelve
// pasa por G1 antes de usarse.

import type { Diccionario } from "../contrato/diccionario";
import type { FiltroPropuesto, ObjetoFiltros } from "../contrato/filtros";

export interface PeticionModelo {
  texto: string;
  diccionario: Diccionario;
  filtrosVigentes: ObjetoFiltros | null;
}

export interface AclaracionPropuesta {
  pregunta: string;
  opciones: string[];
}

export interface RespuestaModelo {
  /** Categoría que el texto hace evidente; null o ausente si no. */
  categoria?: string | null;
  filtros: FiltroPropuesto[];
  /** true si el usuario pidió empezar de nuevo (RF-04). */
  reiniciar?: boolean;
  /** Pregunta cerrada cuando el texto es ambiguo; las opciones salen del diccionario. */
  aclaracion?: AclaracionPropuesta | null;
}

export interface AdaptadorModelo {
  readonly nombre: string;
  interpretar(peticion: PeticionModelo): Promise<RespuestaModelo>;
}
