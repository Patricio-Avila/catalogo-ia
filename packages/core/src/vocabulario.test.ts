// Prueba de contrato del vocabulario prohibido (CLAUDE.md §6): ningún texto que
// produce el núcleo para el usuario contiene las palabras vedadas.

import { aplicarAccion } from "./acciones";
import { DICCIONARIOS } from "./datos_prueba/diccionarios";
import { FIXTURES_MODELO } from "./datos_prueba/fixtures_modelo";
import { validarObjetoFiltros } from "./g1/validar";
import { interpretarPeticion } from "./interpretar";
import { AdaptadorFixtures } from "./modelo/fixtures";
import { VOCABULARIO_PROHIBIDO, vocabularioProhibidoEn } from "./vocabulario";

describe("vocabularioProhibidoEn", () => {
  it.each([
    ["este producto es igual al otro", ["igual"]],
    ["son Equivalentes", ["equivalentes"]],
    ["un sustituto recomendado", ["sustituto", "recomendado"]],
    ["indicado para la tos, dosis de 5 ml", ["indicado para", "dosis"]],
    ["piezas intercambiables", ["intercambiables"]],
  ])("%s → %j", (texto, esperado) => expect(vocabularioProhibidoEn(texto)).toEqual(esperado));

  it("no marca palabras parecidas ni el lenguaje permitido", () => {
    expect(vocabularioProhibidoEn("coincide en 5 de 7 atributos; difiere en: potencia; sin dato en: material")).toEqual([]);
    expect(vocabularioProhibidoEn("igualmente, la equivalencia no se afirma")).toEqual([]);
  });

  it("la lista exportada tiene las siete palabras de CLAUDE.md", () => {
    expect(VOCABULARIO_PROHIBIDO).toHaveLength(7);
  });
});

describe("contrato: textos del núcleo limpios", () => {
  it("detalles de descarte de G1", () => {
    const textos: string[] = [];
    for (const d of Object.values(DICCIONARIOS)) {
      const r = validarObjetoFiltros(
        {
          dominio: "otro",
          categoria: "ajena",
          filtros: [
            { atributo: "color", operador: "=", valor: "rojo" },
            { atributo: "precio", operador: "~", valor: 1 },
            { atributo: "precio", operador: "<", valor: 1 },
            { atributo: "uso_previsto", operador: "<", valor: "x" },
            { atributo: "uso_previsto", operador: "=", valor: "zzz" },
            { atributo: "clase_riesgo", operador: "=", valor: "ninguno" },
            { atributo: "precio", operador: "=", valor: "abc" },
            { atributo: "precio", operador: "=", valor: 100 },
            { atributo: "precio", operador: "=", valor: 100 },
          ],
        },
        d,
        "modelo",
      );
      textos.push(...r.descartados.map((x) => x.detalle));
    }
    expect(textos.length).toBeGreaterThan(10);
    for (const t of textos) expect(vocabularioProhibidoEn(t)).toEqual([]);
  });

  it("preguntas de aclaración y fixtures", async () => {
    const adaptador = new AdaptadorFixtures(FIXTURES_MODELO);
    const textos: string[] = [];
    for (const d of Object.values(DICCIONARIOS)) {
      const fixtures = FIXTURES_MODELO[d.dominio] ?? {};
      for (const texto of [...Object.keys(fixtures), "hola", "crema que no cause daño", "que sea barato"]) {
        const r = await interpretarPeticion({ texto, diccionario: d, filtrosVigentes: null, adaptador });
        if (r.aclaracion) textos.push(r.aclaracion.pregunta, ...r.aclaracion.opciones);
        textos.push(...r.descartados.map((x) => x.detalle));
      }
      const acc = aplicarAccion(null, { tipo: "faceta", atributo: "uso_previsto", valor: "nada" }, d);
      textos.push(...acc.descartados.map((x) => x.detalle));
    }
    expect(textos.length).toBeGreaterThan(5);
    for (const t of textos) expect(vocabularioProhibidoEn(t)).toEqual([]);
  });

  it("valores de los diccionarios de prueba", () => {
    for (const d of Object.values(DICCIONARIOS)) {
      for (const e of d.entradas) for (const v of e.valores ?? []) expect(vocabularioProhibidoEn(v)).toEqual([]);
    }
  });
});
