// La evaluación no puede medir una tabla de búsqueda (revisión del 2026-11-20):
// ninguna frase del banco tiene respuesta fija en el adaptador que se despliega y
// se evalúa, y ese adaptador no usa los fixtures de pruebas unitarias.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizarPeticion } from "../texto";
import { FIXTURES_DEMO } from "./fixtures_demo";

const raiz = new URL("../../../../", import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), "utf8");

interface CasoBanco {
  id: string;
  dominio: string;
  texto: string;
}

describe("FIXTURES_DEMO", () => {
  const banco = JSON.parse(leer("eval/consultas.json")) as Record<string, unknown>;
  const casos = Object.values(banco).filter(Array.isArray).flat() as CasoBanco[];

  it("el banco tiene casos que revisar", () => {
    expect(casos.length).toBeGreaterThanOrEqual(35);
  });

  it("ninguna frase del banco tiene respuesta fija", () => {
    const conFixture = casos.filter((c) => {
      const tabla = FIXTURES_DEMO[c.dominio as keyof typeof FIXTURES_DEMO] ?? {};
      return Object.keys(tabla).some((k) => normalizarPeticion(k) === normalizarPeticion(c.texto));
    });
    expect(conFixture.map((c) => c.id)).toEqual([]);
  });

  it("el cliente web, la Edge Function y el arnés usan FIXTURES_DEMO y no los de pruebas", () => {
    for (const archivo of ["apps/web/src/cliente_api.ts", "supabase/functions/api/index.ts", "eval/correr.ts"]) {
      const fuente = leer(archivo);
      expect(fuente, archivo).toContain("FIXTURES_DEMO");
      expect(fuente, archivo).not.toContain("FIXTURES_MODELO");
    }
  });
});
