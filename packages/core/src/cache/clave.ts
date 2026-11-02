// Caché exacta de interpretaciones (CLAUDE.md §6): clave = hash(dominio, categoría
// vigente, texto normalizado, filtros vigentes, versión del diccionario). Solo se
// guardan propuestas que pasaron G1. Se invalida sola al cambiar la versión del
// diccionario porque la versión forma parte de la clave. Apagada en la evaluación.

import type { FiltroPropuesto, ObjetoFiltros } from "../contrato/filtros";
import { normalizarPeticion } from "../texto";

export interface EntradaCache {
  categoria: string | null;
  filtros: FiltroPropuesto[];
  version_diccionario: string;
}

export interface CacheInterpretaciones {
  obtener(clave: string): Promise<EntradaCache | null>;
  guardar(clave: string, entrada: EntradaCache): Promise<void>;
}

export interface DatosClave {
  dominio: string;
  texto: string;
  filtrosVigentes: ObjetoFiltros | null;
  versionDiccionario: string;
}

/** Serialización estable: filtros ordenados, claves en orden fijo. */
export function materialClave(d: DatosClave): string {
  const filtros = (d.filtrosVigentes?.filtros ?? [])
    .map((f) => `${f.atributo}${f.operador}${String(f.valor)}`)
    .sort();
  return JSON.stringify([
    d.dominio,
    d.filtrosVigentes?.categoria ?? null,
    normalizarPeticion(d.texto),
    filtros,
    d.filtrosVigentes?.incluir_sin_dato ?? false,
    d.versionDiccionario,
  ]);
}

/** SHA-256 en hexadecimal con la API web estándar (Node 20+, Deno, navegadores). */
export async function claveCache(d: DatosClave): Promise<string> {
  const bytes = new TextEncoder().encode(materialClave(d));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Caché en memoria para pruebas y para correr el núcleo sin base. */
export class CacheMemoria implements CacheInterpretaciones {
  private readonly mapa = new Map<string, EntradaCache>();
  aciertos = 0;
  fallos = 0;

  async obtener(clave: string): Promise<EntradaCache | null> {
    const e = this.mapa.get(clave) ?? null;
    if (e) this.aciertos++;
    else this.fallos++;
    return e;
  }

  async guardar(clave: string, entrada: EntradaCache): Promise<void> {
    this.mapa.set(clave, entrada);
  }

  get tamano(): number {
    return this.mapa.size;
  }
}
