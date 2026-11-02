import { DICCIONARIO_BELLEZA, DICCIONARIO_LLANTAS } from "../datos_prueba/diccionarios";
import { FIXTURES_MODELO } from "../datos_prueba/fixtures_modelo";
import { AdaptadorFixtures } from "./fixtures";

describe("AdaptadorFixtures", () => {
  const a = new AdaptadorFixtures(FIXTURES_MODELO);

  it("responde por texto normalizado, sin importar mayúsculas, acentos ni números", async () => {
    const r = await a.interpretar({ texto: "LLANTA 185/60 r14 para carretera", diccionario: DICCIONARIO_LLANTAS, filtrosVigentes: null });
    expect(r.categoria).toBe("pasajeros");
    expect(r.filtros).toHaveLength(1);
  });

  it("separa por dominio", async () => {
    const r = await a.interpretar({ texto: "paracetamol en tabletas", diccionario: DICCIONARIO_BELLEZA, filtrosVigentes: null });
    expect(r.filtros).toEqual([]);
  });

  it("registra los textos sin fixture", async () => {
    const b = new AdaptadorFixtures(FIXTURES_MODELO);
    await b.interpretar({ texto: "algo rarísimo", diccionario: DICCIONARIO_BELLEZA, filtrosVigentes: null });
    expect(b.sinFixture).toEqual(["belleza|algo rarisimo"]);
  });
});
