import { normalizarPeticion } from "../texto";
import { claveCache, materialClave } from "./clave";

describe("normalizarPeticion", () => {
  it.each([
    ["Crema de menos de 300 pesos", "crema de menos de # pesos"],
    ["  Menos de 250 PESOS!!  ", "menos de # pesos"],
    ["llanta 205/55 R16 91V", "llanta #/# r# #v"],
    ["sérum de 1,500 mxn", "serum de # mxn"],
  ])("%s → %s", (t, e) => expect(normalizarPeticion(t)).toBe(e));

  it("dos peticiones que difieren solo en números comparten forma", () => {
    expect(normalizarPeticion("menos de 300 pesos")).toBe(normalizarPeticion("menos de 1200 pesos"));
  });
});

describe("claveCache", () => {
  const base = { dominio: "belleza", texto: "menos de 300 pesos", filtrosVigentes: null, versionDiccionario: "v1" };

  it("es SHA-256 hexadecimal y determinista", async () => {
    const a = await claveCache(base);
    const b = await claveCache(base);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  it("cambia con dominio, versión y filtros vigentes; no con el número ni con mayúsculas", async () => {
    const k = await claveCache(base);
    expect(await claveCache({ ...base, dominio: "farmacia" })).not.toBe(k);
    expect(await claveCache({ ...base, versionDiccionario: "v2" })).not.toBe(k);
    expect(
      await claveCache({ ...base, filtrosVigentes: { dominio: "belleza", categoria: null, filtros: [{ atributo: "vegano", operador: "=", valor: true }], incluir_sin_dato: false } }),
    ).not.toBe(k);
    expect(await claveCache({ ...base, texto: "MENOS DE 999 PESOS" })).toBe(k);
  });

  it("el orden de los filtros vigentes no importa", () => {
    const f1 = { atributo: "a", operador: "=" as const, valor: 1 };
    const f2 = { atributo: "b", operador: "=" as const, valor: 2 };
    const con = (filtros: (typeof f1)[]) =>
      materialClave({ ...base, filtrosVigentes: { dominio: "belleza", categoria: null, filtros, incluir_sin_dato: false } });
    expect(con([f1, f2])).toBe(con([f2, f1]));
  });
});
