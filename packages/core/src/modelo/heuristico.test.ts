import { describe, expect, it } from "vitest";
import { DICCIONARIO_FARMACIA } from "../datos_prueba/diccionarios";
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
