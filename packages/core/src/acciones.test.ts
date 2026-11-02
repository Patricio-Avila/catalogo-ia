// Acciones estructuradas (RF-03, RF-10, RF-11): nunca llaman al modelo.

import { Accion, aplicarAccion } from "./acciones";
import type { ObjetoFiltros } from "./contrato/filtros";
import { DICCIONARIO_BELLEZA, DICCIONARIO_FARMACIA } from "./datos_prueba/diccionarios";

const belleza = DICCIONARIO_BELLEZA;
const vigente: ObjetoFiltros = {
  dominio: "belleza",
  categoria: "cuidado_facial",
  filtros: [
    { atributo: "fragancia", operador: "=", valor: "sin perfume" },
    { atributo: "precio", operador: "<", valor: 300 },
  ],
  incluir_sin_dato: false,
};

describe("esquema Accion", () => {
  it.each([
    { tipo: "quitar", atributo: "precio", operador: "<", valor: 300 },
    { tipo: "faceta", atributo: "tipo_piel", valor: "seca" },
    { tipo: "incluir_sin_dato", valor: true },
    { tipo: "reiniciar" },
    { tipo: "agregar", filtro: { atributo: "vegano", operador: "=", valor: true } },
    { tipo: "categoria", categoria: null },
  ])("%j es válida", (a) => expect(Accion.safeParse(a).success).toBe(true));

  it("rechaza tipos desconocidos", () => {
    expect(Accion.safeParse({ tipo: "borrar_todo" }).success).toBe(false);
  });
});

describe("aplicarAccion", () => {
  it("quitar elimina solo esa etiqueta", () => {
    const r = aplicarAccion(vigente, { tipo: "quitar", atributo: "precio", operador: "<", valor: 300 }, belleza);
    expect(r.objeto.filtros).toEqual([{ atributo: "fragancia", operador: "=", valor: "sin perfume" }]);
    expect(r.descartados).toEqual([]);
  });

  it("quitar compara el valor de forma tolerante", () => {
    const r = aplicarAccion(vigente, { tipo: "quitar", atributo: "fragancia", operador: "=", valor: "Sin Perfume" }, belleza);
    expect(r.objeto.filtros).toHaveLength(1);
  });

  it("faceta agrega un filtro de igualdad validado", () => {
    const r = aplicarAccion(vigente, { tipo: "faceta", atributo: "tipo_piel", valor: "Seca" }, belleza);
    expect(r.objeto.filtros).toContainEqual({ atributo: "tipo_piel", operador: "=", valor: "seca" });
    expect(r.objeto.filtros).toHaveLength(3);
  });

  it("faceta con valor fuera del diccionario se descarta e informa", () => {
    const r = aplicarAccion(vigente, { tipo: "faceta", atributo: "tipo_piel", valor: "escamosa" }, belleza);
    expect(r.objeto.filtros).toHaveLength(2);
    expect(r.descartados[0]?.motivo).toBe("valor_fuera_de_dominio");
  });

  it("incluir_sin_dato solo cambia la bandera", () => {
    const r = aplicarAccion(vigente, { tipo: "incluir_sin_dato", valor: true }, belleza);
    expect(r.objeto).toEqual({ ...vigente, incluir_sin_dato: true });
  });

  it("reiniciar deja el objeto vacío", () => {
    expect(aplicarAccion(vigente, { tipo: "reiniciar" }, belleza).objeto).toEqual({
      dominio: "belleza",
      categoria: null,
      filtros: [],
      incluir_sin_dato: false,
    });
  });

  it("agregar reemplaza si ya había el mismo atributo y operador (RF-04)", () => {
    const r = aplicarAccion(vigente, { tipo: "agregar", filtro: { atributo: "precio", operador: "<", valor: 150 } }, belleza);
    expect(r.objeto.filtros).toEqual([
      { atributo: "fragancia", operador: "=", valor: "sin perfume" },
      { atributo: "precio", operador: "<", valor: 150 },
    ]);
  });

  it("etiqueta manual produce el mismo objeto que el texto libre para el mismo filtro (RF-10)", () => {
    const r = aplicarAccion(null, { tipo: "agregar", filtro: { atributo: "fragancia", operador: "=", valor: "Sin Perfume" } }, belleza);
    expect(r.objeto.filtros).toEqual([{ atributo: "fragancia", operador: "=", valor: "sin perfume" }]);
  });

  it("el usuario sí puede fijar un atributo de riesgo a mano (RF-11)", () => {
    const r = aplicarAccion(null, { tipo: "agregar", filtro: { atributo: "requiere_receta", operador: "=", valor: false } }, DICCIONARIO_FARMACIA);
    expect(r.descartados).toEqual([]);
    expect(r.objeto.filtros).toEqual([{ atributo: "requiere_receta", operador: "=", valor: false }]);
  });

  it("cambiar de categoría revalida y descarta lo que no aplica", () => {
    const conSpf: ObjetoFiltros = { ...vigente, filtros: [...vigente.filtros, { atributo: "spf", operador: ">=", valor: 30 }] };
    const r = aplicarAccion(conSpf, { tipo: "categoria", categoria: "cuidado_corporal" }, belleza);
    expect(r.objeto.categoria).toBe("cuidado_corporal");
    expect(r.objeto.filtros.map((f) => f.atributo)).toEqual(["fragancia", "precio"]);
    expect(r.descartados[0]).toMatchObject({ atributo: "spf", motivo: "atributo_desconocido" });
  });

  it("no muta el objeto vigente", () => {
    const copia = structuredClone(vigente);
    aplicarAccion(vigente, { tipo: "quitar", atributo: "precio", operador: "<", valor: 300 }, belleza);
    aplicarAccion(vigente, { tipo: "faceta", atributo: "vegano", valor: true }, belleza);
    expect(vigente).toEqual(copia);
  });
});
