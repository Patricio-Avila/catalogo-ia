import { aBooleano, aNumero, normalizarValor, quitarAcentos } from "./texto";

describe("quitarAcentos", () => {
  it("quita acentos y conserva la longitud", () => {
    expect(quitarAcentos("cápsula sérum índice")).toBe("capsula serum indice");
    expect(quitarAcentos("ñandú").length).toBe("ñandú".length);
  });
});

describe("normalizarValor", () => {
  it("minúsculas, sin acentos, espacios colapsados", () => {
    expect(normalizarValor("  Sin   Perfúme ")).toBe("sin perfume");
  });
});

describe("aNumero", () => {
  it.each([
    [300, 300],
    ["300", 300],
    ["$300", 300],
    ["1,500", 1500],
    ["1,500,000", 1500000],
    ["12.5", 12.5],
    ["12,5", 12.5],
    [" 45 ", 45],
  ])("%p → %p", (entrada, esperado) => {
    expect(aNumero(entrada)).toBe(esperado);
  });

  it.each([["abc"], [""], [null], [undefined], [NaN], [{}], ["12abc"]])("%p → null", (entrada) => {
    expect(aNumero(entrada)).toBeNull();
  });
});

describe("aBooleano", () => {
  it.each([
    [true, true],
    [false, false],
    ["sí", true],
    ["Si", true],
    ["no", false],
    ["true", true],
    ["falso", false],
    [1, true],
    [0, false],
  ])("%p → %p", (entrada, esperado) => {
    expect(aBooleano(entrada)).toBe(esperado);
  });

  it.each([["tal vez"], [2], [null], [{}]])("%p → null", (entrada) => {
    expect(aBooleano(entrada)).toBeNull();
  });
});
