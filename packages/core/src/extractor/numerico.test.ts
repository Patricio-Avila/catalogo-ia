import { extraerNumeros } from "./numerico";

const sinExtras = (lista: ReturnType<typeof extraerNumeros>) =>
  lista.map(({ atributo, operador, valor }) => ({ atributo, operador, valor }));

describe("extractor: precio", () => {
  it.each([
    ["crema de menos de 300 pesos", [{ atributo: "precio", operador: "<", valor: 300 }]],
    ["máximo $250", [{ atributo: "precio", operador: "<=", valor: 250 }]],
    ["hasta 1,500 pesos", [{ atributo: "precio", operador: "<=", valor: 1500 }]],
    ["que cueste más de 200", [{ atributo: "precio", operador: ">", valor: 200 }]],
    ["desde 100 mxn", [{ atributo: "precio", operador: ">=", valor: 100 }]],
    ["de 300 pesos o menos", [{ atributo: "precio", operador: "<=", valor: 300 }]],
    ["entre 200 y 400 pesos", [
      { atributo: "precio", operador: ">=", valor: 200 },
      { atributo: "precio", operador: "<=", valor: 400 },
    ]],
  ])("%s", (texto, esperado) => {
    expect(sinExtras(extraerNumeros(texto, "belleza"))).toEqual(esperado);
  });

  it("un número suelto sin unidad ni comparador se ignora", () => {
    expect(extraerNumeros("quiero 3 cremas", "belleza")).toEqual([]);
  });

  it("precio explícito tiene confianza alta; sin unidad, media", () => {
    expect(extraerNumeros("menos de $300", "belleza")[0]?.confianza).toBeGreaterThanOrEqual(0.85);
    const media = extraerNumeros("menos de 300", "belleza")[0]?.confianza ?? 1;
    expect(media).toBeGreaterThanOrEqual(0.6);
    expect(media).toBeLessThan(0.85);
  });
});

describe("extractor: belleza", () => {
  it("contenido en ml y SPF", () => {
    expect(sinExtras(extraerNumeros("protector solar spf 50 de 200 ml", "belleza"))).toEqual([
      { atributo: "spf", operador: "=", valor: 50 },
      { atributo: "contenido_ml", operador: "=", valor: 200 },
    ]);
  });

  it("'fps 30 o más' → spf >= 30", () => {
    expect(sinExtras(extraerNumeros("con fps 30 o más", "belleza"))).toEqual([{ atributo: "spf", operador: ">=", valor: 30 }]);
  });

  it("'al menos 100 ml' → contenido_ml >= 100", () => {
    expect(sinExtras(extraerNumeros("al menos 100 ml", "belleza"))).toEqual([{ atributo: "contenido_ml", operador: ">=", valor: 100 }]);
  });

  it("no mezcla el ml con el precio", () => {
    expect(sinExtras(extraerNumeros("sérum de 30 ml de menos de 500 pesos", "belleza"))).toEqual([
      { atributo: "contenido_ml", operador: "=", valor: 30 },
      { atributo: "precio", operador: "<", valor: 500 },
    ]);
  });

  it("conserva el fragmento original con acentos", () => {
    const [f] = extraerNumeros("Máximo 300 pesos", "belleza");
    expect(f?.fragmento).toBe("300 pesos");
  });
});

describe("extractor: farmacia", () => {
  it("concentración y piezas", () => {
    expect(sinExtras(extraerNumeros("paracetamol 500 mg caja con 20 tabletas", "farmacia"))).toEqual([
      { atributo: "concentracion_mg", operador: "=", valor: 500 },
      { atributo: "piezas", operador: "=", valor: 20 },
    ]);
  });

  it("'mínimo 10 cápsulas' con acento", () => {
    expect(sinExtras(extraerNumeros("mínimo 10 cápsulas", "farmacia"))).toEqual([{ atributo: "piezas", operador: ">=", valor: 10 }]);
  });

  it("ml no es unidad de farmacia: se ignora", () => {
    expect(extraerNumeros("jarabe de 120 ml", "farmacia")).toEqual([]);
  });
});

describe("extractor: llantas", () => {
  it("medida completa con índices", () => {
    expect(sinExtras(extraerNumeros("llanta 205/55 R16 91V", "llantas"))).toEqual([
      { atributo: "ancho_mm", operador: "=", valor: 205 },
      { atributo: "perfil_pct", operador: "=", valor: 55 },
      { atributo: "rin_pulg", operador: "=", valor: 16 },
      { atributo: "indice_carga", operador: "=", valor: 91 },
      { atributo: "indice_velocidad", operador: "=", valor: "V" },
    ]);
  });

  it("medida sin índices y en minúsculas", () => {
    expect(sinExtras(extraerNumeros("busco 185/65r15", "llantas"))).toEqual([
      { atributo: "ancho_mm", operador: "=", valor: 185 },
      { atributo: "perfil_pct", operador: "=", valor: 65 },
      { atributo: "rin_pulg", operador: "=", valor: 15 },
    ]);
  });

  it("la medida no se confunde con precio", () => {
    expect(sinExtras(extraerNumeros("205/55 R16 de menos de 2000 pesos", "llantas"))).toEqual([
      { atributo: "ancho_mm", operador: "=", valor: 205 },
      { atributo: "perfil_pct", operador: "=", valor: 55 },
      { atributo: "rin_pulg", operador: "=", valor: 16 },
      { atributo: "precio", operador: "<", valor: 2000 },
    ]);
  });

  it("rin suelto, garantía en mil km y año", () => {
    expect(sinExtras(extraerNumeros("rin 17 con garantía de 60 mil km modelo 2025", "llantas"))).toEqual([
      { atributo: "rin_pulg", operador: "=", valor: 17 },
      { atributo: "anio_fabricacion", operador: "=", valor: 2025 },
      { atributo: "garantia_km", operador: "=", valor: 60000 },
    ]);
  });

  it("índices por nombre", () => {
    expect(sinExtras(extraerNumeros("índice de carga 95 e índice de velocidad H", "llantas"))).toEqual([
      { atributo: "indice_carga", operador: "=", valor: 95 },
      { atributo: "indice_velocidad", operador: "=", valor: "H" },
    ]);
  });
});
