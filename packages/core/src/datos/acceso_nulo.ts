// Acceso a datos sin base: sirve los diccionarios de prueba y no devuelve
// productos. Para generar el OpenAPI y para pruebas de la API que no necesitan
// resultados reales.

import { CacheMemoria, type CacheInterpretaciones } from "../cache/clave";
import type { Diccionario } from "../contrato/diccionario";
import type { Dominio, ObjetoFiltros } from "../contrato/filtros";
import type { Faceta, ResultadoBusqueda } from "../contrato/respuestas";
import { DICCIONARIOS } from "../datos_prueba/diccionarios";
import type { AccesoDatos } from "./acceso";

export class AccesoNulo implements AccesoDatos {
  readonly cache: CacheInterpretaciones = new CacheMemoria();
  /** Registro de llamadas, para que las pruebas verifiquen qué se consultó. */
  readonly llamadas: { metodo: "buscar" | "facetas" | "diccionario"; objeto?: ObjetoFiltros }[] = [];

  async obtenerDiccionario(dominio: Dominio): Promise<Diccionario> {
    this.llamadas.push({ metodo: "diccionario" });
    return DICCIONARIOS[dominio];
  }

  async buscar(objeto: ObjetoFiltros): Promise<ResultadoBusqueda> {
    this.llamadas.push({ metodo: "buscar", objeto });
    return { resultados: [], total: 0, faltantes: 0 };
  }

  async facetas(objeto: ObjetoFiltros): Promise<Faceta[]> {
    this.llamadas.push({ metodo: "facetas", objeto });
    return [];
  }

  async cerrar(): Promise<void> {}
}
