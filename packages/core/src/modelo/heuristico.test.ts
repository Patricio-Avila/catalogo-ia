import { describe, expect, it } from "vitest";
import { DICCIONARIO_FARMACIA } from "../datos_prueba/diccionarios";
import type { Diccionario } from "../contrato/diccionario";
import { nivelDe } from "../interpretar";
import { AdaptadorInteractivo } from "./heuristico";

describe("AdaptadorInteractivo", () => {
  const fixtures = {
    farmacia: {
      "frase fija": { categoria: "medicamentos", filtros: [] },
    },
  };

  it("peticiones simultáneas reciben cada una su respuesta (fixture o diccionario)", async () => {
    const a = new AdaptadorInteractivo(fixtures);
    const [fija, libre, otraFija] = await Promise.all([
      a.interpretar({ texto: "frase fija", diccionario: DICCIONARIO_FARMACIA, filtrosVigentes: null }),
      a.interpretar({ texto: "ibuprofeno oral", diccionario: DICCIONARIO_FARMACIA, filtrosVigentes: null }),
      a.interpretar({ texto: "Frase FIJA", diccionario: DICCIONARIO_FARMACIA, filtrosVigentes: null }),
    ]);
    expect(fija.categoria).toBe("medicamentos");
    expect(otraFija.categoria).toBe("medicamentos");
    expect(libre.filtros.map((f) => f.atributo)).toEqual(["sustancia_activa", "via_administracion"]);
  });

  it("sin fixtures usa solo el diccionario", async () => {
    const a = new AdaptadorInteractivo();
    const r = await a.interpretar({ texto: "frase fija", diccionario: DICCIONARIO_FARMACIA, filtrosVigentes: null });
    expect(r.filtros).toEqual([]);
  });
});

describe("AdaptadorInteractivo: reglas generales (revisión del 2026-11-27)", () => {
  const entrada = (categoria: string, atributo: string, valores?: string[]) => ({
    categoria,
    atributo,
    tipo: valores ? ("texto" as const) : ("booleano" as const),
    ...(valores ? { valores } : {}),
    cobertura_pct: 100,
    obligatorio: false,
    define_uso: false,
    define_riesgo: false,
    inferible: true,
  });
  const diccionario: Diccionario = {
    dominio: "belleza",
    version: "prueba",
    categorias: ["uno", "dos"],
    entradas: [
      entrada("uno", "forma", ["cápsula", "jabón"]),
      entrada("dos", "forma", ["cápsula"]),
      entrada("uno", "uso_previsto", ["hidratar", "proteger", "limpiar"]),
      entrada("dos", "uso_previsto", ["hidratar"]),
      entrada("uno", "tipo_piel", ["sensible"]),
      entrada("dos", "tipo_piel", ["sensible"]),
    ],
  };
  const interpretar = (texto: string) =>
    new AdaptadorInteractivo().interpretar({ texto, diccionario, filtrosVigentes: null });

  it("el plural y los acentos no impiden la coincidencia", async () => {
    const r = await interpretar("Capsulas para pieles sensibles");
    expect(r.filtros.map((f) => [f.atributo, f.valor])).toEqual([
      ["forma", "cápsula"],
      ["tipo_piel", "sensible"],
    ]);
  });

  it("una forma derivada de un valor en infinitivo se propone con confianza media", async () => {
    const r = await interpretar("un limpiador para el rostro");
    const uso = r.filtros.find((f) => f.atributo === "uso_previsto");
    expect(uso).toMatchObject({ valor: "limpiar", confianza: 0.8 });
    expect(nivelDe(uso!.confianza)).toBe("media");
  });

  it("no confunde palabras que solo comparten el inicio", async () => {
    const r = await interpretar("hidra y protesis");
    expect(r.filtros).toEqual([]);
  });

  it("deduce la categoría cuando los valores reconocidos solo existen juntos en una", async () => {
    expect((await interpretar("jabones")).categoria).toBe("uno");
    expect((await interpretar("capsulas para hidratar")).categoria).toBeUndefined();
    expect((await interpretar("capsulas para proteger")).categoria).toBe("uno");
  });
});
