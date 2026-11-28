// Acceso a datos en memoria con el catálogo sintético de prueba (T5, T6).
// Reproduce con fidelidad la semántica de las funciones SQL de la migración 0005
// (`evaluar_filtros`, `buscar_productos`, `contar_productos`, `calcular_facetas`)
// para que el cliente web y el arnés de evaluación funcionen de extremo a extremo
// también sin una instancia activa de PostgreSQL.

import { CacheMemoria, type CacheInterpretaciones } from "../cache/clave";
import type { Diccionario, Vertical } from "../contrato/diccionario";
import type { Dominio, Filtro, ObjetoFiltros, Operador } from "../contrato/filtros";
import type { Faceta, Resultado, ResultadoBusqueda } from "../contrato/respuestas";
import { DICCIONARIOS } from "../datos_prueba/diccionarios";
import { PRODUCTOS_PRUEBA, type ProductoCatalogo } from "../datos_prueba/productos";
import { VERTICALES_PRUEBA } from "../datos_prueba/verticales";
import { LIMITE_MAXIMO, LIMITE_POR_OMISION, type AccesoDatos } from "./acceso";

interface ProductoEvaluado {
  producto: ProductoCatalogo;
  cumple: string[];
  sin_dato: string[];
  valido: boolean;
}

export class AccesoMemoria implements AccesoDatos {
  readonly nombre = "memoria";
  readonly cache: CacheInterpretaciones = new CacheMemoria();
  private readonly productos: readonly ProductoCatalogo[];

  constructor(productos: readonly ProductoCatalogo[] = PRODUCTOS_PRUEBA) {
    this.productos = productos;
  }

  async obtenerVerticales(): Promise<Vertical[]> {
    return VERTICALES_PRUEBA;
  }

  async obtenerDiccionario(dominio: Dominio): Promise<Diccionario> {
    return DICCIONARIOS[dominio];
  }

  async buscar(objeto: ObjetoFiltros, limite = LIMITE_POR_OMISION): Promise<ResultadoBusqueda> {
    const tope = Math.min(Math.max(1, Math.trunc(limite)), LIMITE_MAXIMO);
    const evaluados = this.evaluar(objeto);
    const validos = evaluados.filter((e) => e.valido);

    const faltantes = validos.filter((e) => e.sin_dato.length > 0).length;
    const aplicables = validos.filter((e) => objeto.incluir_sin_dato || e.sin_dato.length === 0);

    aplicables.sort((a, b) => {
      if (a.sin_dato.length !== b.sin_dato.length) return a.sin_dato.length - b.sin_dato.length;
      if (a.producto.precio !== b.producto.precio) return a.producto.precio - b.producto.precio;
      return a.producto.id - b.producto.id;
    });

    const resultados: Resultado[] = aplicables.slice(0, tope).map((e) => ({
      id: e.producto.id,
      nombre: e.producto.nombre,
      marca: e.producto.marca,
      precio: e.producto.precio,
      descripcion: e.producto.descripcion,
      categoria: e.producto.categoria,
      atributos: { ...e.producto.atributos },
      cumple: e.cumple,
      sin_dato: e.sin_dato,
    }));

    return {
      resultados,
      total: aplicables.length,
      faltantes,
    };
  }

  async facetas(objeto: ObjetoFiltros, atributos?: string[]): Promise<Faceta[]> {
    const conjunto = this.evaluar(objeto).filter(
      (e) => e.valido && (objeto.incluir_sin_dato || e.sin_dato.length === 0),
    );
    if (conjunto.length === 0) return [];

    const diccionario = DICCIONARIOS[objeto.dominio];
    const fijados = new Set(objeto.filtros.filter((f) => f.operador === "=").map((f) => f.atributo));
    const filtroAtributos = atributos ? new Set(atributos) : null;

    const candidatos = [
      ...new Set(
        diccionario.entradas
          .filter(
            (e) =>
              (objeto.categoria === null || e.categoria === objeto.categoria) &&
              (e.tipo === "texto" || e.tipo === "booleano") &&
              !fijados.has(e.atributo) &&
              (filtroAtributos === null || filtroAtributos.has(e.atributo)),
          )
          .map((e) => e.atributo),
      ),
    ].sort();

    const salida: Faceta[] = [];
    for (const atributo of candidatos) {
      const conteos = new Map<string, number>();
      for (const item of conjunto) {
        const valorCrudo =
          atributo === "marca" ? item.producto.marca : item.producto.atributos[atributo];
        const clave = valorCrudo === undefined ? "(sin dato)" : String(valorCrudo);
        conteos.set(clave, (conteos.get(clave) ?? 0) + 1);
      }

      if (conteos.size < 2) continue;

      const valores = [...conteos.entries()]
        .map(([valor, productos]) => ({ valor, productos }))
        .sort((a, b) => (b.productos !== a.productos ? b.productos - a.productos : a.valor.localeCompare(b.valor)))
        .slice(0, 20);

      salida.push({ atributo, valores });
    }

    return salida;
  }

  async cerrar(): Promise<void> {}

  private evaluar(objeto: ObjetoFiltros): ProductoEvaluado[] {
    const candidatos = this.productos.filter(
      (p) => p.dominio === objeto.dominio && (objeto.categoria === null || p.categoria === objeto.categoria),
    );

    return candidatos.map((producto) => {
      const cumple: string[] = [];
      const sin_dato: string[] = [];
      let valido = true;

      for (const f of objeto.filtros) {
        const estado = evaluarFiltro(producto, f);
        if (estado === "cumple") {
          cumple.push(f.atributo);
        } else if (estado === "sin_dato") {
          sin_dato.push(f.atributo);
        } else {
          valido = false;
        }
      }

      cumple.sort();
      sin_dato.sort();

      return { producto, cumple, sin_dato, valido };
    });
  }
}

function evaluarFiltro(p: ProductoCatalogo, f: Filtro): "cumple" | "sin_dato" | "no" {
  if (f.atributo === "precio") {
    return typeof f.valor === "number" && compararNumero(p.precio, f.operador, f.valor) ? "cumple" : "no";
  }
  if (f.atributo === "marca") {
    return compararValor(p.marca, f.operador, f.valor) ? "cumple" : "no";
  }
  const actual = p.atributos[f.atributo];
  if (actual === undefined) {
    return "sin_dato";
  }
  if (typeof actual === "number") {
    return typeof f.valor === "number" && compararNumero(actual, f.operador, f.valor) ? "cumple" : "no";
  }
  return compararValor(actual, f.operador, f.valor) ? "cumple" : "no";
}

function compararNumero(a: number, op: Operador, b: number): boolean {
  switch (op) {
    case "=":
      return a === b;
    case "<>":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
  }
}

function compararValor(a: string | number | boolean, op: Operador, b: string | number | boolean): boolean {
  if (op === "=") return a === b;
  if (op === "<>") return a !== b;
  return false;
}
