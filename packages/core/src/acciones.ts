// Acciones estructuradas (CLAUDE.md §4 y §6; RF-03, RF-10): quitar etiqueta,
// elegir faceta, incluir sin dato, reiniciar, agregar etiqueta manual y fijar
// categoría. Modifican el objeto de filtros vigente sin llamar al modelo. Lo que
// agrega el usuario pasa por G1 con origen "usuario": puede fijar atributos de
// riesgo (RF-11) pero no inventar atributos ni valores fuera del diccionario.

import { z } from "zod";
import type { Diccionario } from "./contrato/diccionario";
import { Filtro, OBJETO_VACIO, Operador, ValorFiltro, type ObjetoFiltros } from "./contrato/filtros";
import { validarObjetoFiltros, type Descartado } from "./g1/validar";
import { normalizarValor } from "./texto";

export const Accion = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("quitar"), atributo: z.string(), operador: Operador, valor: ValorFiltro }),
  z.object({ tipo: z.literal("faceta"), atributo: z.string(), valor: ValorFiltro }),
  z.object({ tipo: z.literal("incluir_sin_dato"), valor: z.boolean() }),
  z.object({ tipo: z.literal("reiniciar") }),
  z.object({ tipo: z.literal("agregar"), filtro: Filtro }),
  z.object({ tipo: z.literal("categoria"), categoria: z.string().nullable() }),
]);
export type Accion = z.infer<typeof Accion>;

export interface ResultadoAccion {
  objeto: ObjetoFiltros;
  descartados: Descartado[];
}

export function aplicarAccion(
  vigente: ObjetoFiltros | null,
  accion: Accion,
  diccionario: Diccionario,
): ResultadoAccion {
  const base: ObjetoFiltros = vigente
    ? { ...vigente, filtros: [...vigente.filtros] }
    : OBJETO_VACIO(diccionario.dominio);

  switch (accion.tipo) {
    case "reiniciar":
      return { objeto: OBJETO_VACIO(diccionario.dominio), descartados: [] };

    case "incluir_sin_dato":
      return { objeto: { ...base, incluir_sin_dato: accion.valor }, descartados: [] };

    case "quitar": {
      const filtros = base.filtros.filter((f) => !mismoFiltro(f, accion));
      return { objeto: { ...base, filtros }, descartados: [] };
    }

    case "categoria":
      return revalidar({ ...base, categoria: accion.categoria }, diccionario);

    case "faceta":
      return revalidar(
        { ...base, filtros: reemplazar(base.filtros, { atributo: accion.atributo, operador: "=", valor: accion.valor }) },
        diccionario,
      );

    case "agregar":
      return revalidar({ ...base, filtros: reemplazar(base.filtros, accion.filtro) }, diccionario);
  }
}

/** Un filtro nuevo con el mismo atributo y operador reemplaza al vigente (RF-04). */
export function reemplazar<F extends Filtro>(vigentes: F[], nuevo: F): F[] {
  const resto = vigentes.filter((f) => !(f.atributo === nuevo.atributo && f.operador === nuevo.operador));
  return [...resto, nuevo];
}

function mismoFiltro(a: Filtro, b: Filtro): boolean {
  return (
    a.atributo === b.atributo &&
    a.operador === b.operador &&
    normalizarValor(String(a.valor)) === normalizarValor(String(b.valor))
  );
}

/** Todo lo que toca el usuario se revalida contra el diccionario con origen "usuario". */
function revalidar(objeto: ObjetoFiltros, diccionario: Diccionario): ResultadoAccion {
  const r = validarObjetoFiltros(objeto, diccionario, "usuario");
  return { objeto: { ...r.objeto, filtros: r.objeto.filtros.map(soloFiltro) }, descartados: r.descartados };
}

function soloFiltro(f: Filtro): Filtro {
  return { atributo: f.atributo, operador: f.operador, valor: f.valor };
}
