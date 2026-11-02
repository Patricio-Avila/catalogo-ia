// Flujo de interpretación (CLAUDE.md §6): caché, extractor + modelo, G1,
// niveles de confianza, fusión con vigentes (RF-04) y aclaración.

import { CacheMemoria } from "./cache/clave";
import type { ObjetoFiltros } from "./contrato/filtros";
import { DICCIONARIO_BELLEZA, DICCIONARIO_FARMACIA, DICCIONARIO_LLANTAS } from "./datos_prueba/diccionarios";
import { FIXTURES_MODELO } from "./datos_prueba/fixtures_modelo";
import { interpretarPeticion, nivelDe } from "./interpretar";
import { AdaptadorFixtures } from "./modelo/fixtures";
import type { AdaptadorModelo } from "./modelo/interfaz";

const adaptador = () => new AdaptadorFixtures(FIXTURES_MODELO);
const belleza = DICCIONARIO_BELLEZA;

const soloFiltros = (o: ObjetoFiltros) => o.filtros.map(({ atributo, operador, valor }) => ({ atributo, operador, valor }));

describe("nivelDe", () => {
  it.each([
    [0.85, "alta"],
    [0.99, "alta"],
    [0.6, "media"],
    [0.84, "media"],
    [0.59, "baja"],
    [0, "baja"],
  ])("%p → %s", (c, nivel) => expect(nivelDe(c)).toBe(nivel));
});

describe("interpretar: extractor + modelo", () => {
  it("une el extractor (números) con el modelo (texto) y propone categoría", async () => {
    const r = await interpretarPeticion({
      texto: "crema sin perfume para piel sensible de menos de 300 pesos",
      diccionario: belleza,
      filtrosVigentes: null,
      adaptador: adaptador(),
    });
    expect(r.objeto.categoria).toBe("cuidado_facial");
    expect(soloFiltros(r.objeto)).toEqual([
      { atributo: "precio", operador: "<", valor: 300 },
      { atributo: "fragancia", operador: "=", valor: "sin perfume" },
      { atributo: "tipo_piel", operador: "=", valor: "sensible" },
    ]);
    expect(r.etiquetas.every((e) => e.origen === "modelo" && e.nivel === "alta" && !e.sugerida)).toBe(true);
    expect(r.aclaracion).toBeNull();
    expect(r.llamo_modelo).toBe(true);
    expect(r.descartados).toEqual([]);
  });

  it("en números manda el extractor sobre el modelo", async () => {
    const modelo: AdaptadorModelo = {
      nombre: "prueba",
      async interpretar() {
        return { filtros: [{ atributo: "precio", operador: "<", valor: 999, confianza: 0.9 }] };
      },
    };
    const r = await interpretarPeticion({ texto: "menos de $300", diccionario: belleza, filtrosVigentes: null, adaptador: modelo });
    expect(soloFiltros(r.objeto)).toEqual([{ atributo: "precio", operador: "<", valor: 300 }]);
  });

  it("confianza media se aplica y se marca sugerida", async () => {
    const r = await interpretarPeticion({ texto: "algo para piel delicada", diccionario: belleza, filtrosVigentes: null, adaptador: adaptador() });
    expect(soloFiltros(r.objeto)).toEqual([{ atributo: "tipo_piel", operador: "=", valor: "sensible" }]);
    expect(r.etiquetas[0]).toMatchObject({ nivel: "media", sugerida: true, confianza: 0.7 });
    expect(r.aclaracion).toBeNull();
  });

  it("confianza baja no se aplica: va a aclaración con opciones del diccionario", async () => {
    const r = await interpretarPeticion({ texto: "que sea barato", diccionario: belleza, filtrosVigentes: null, adaptador: adaptador() });
    expect(r.objeto.filtros).toEqual([]);
    expect(r.aclaracion).not.toBeNull();
    expect(r.aclaracion?.filtros_dudosos).toEqual([{ atributo: "precio", operador: "<", valor: 150, confianza: 0.4 }]);
    expect(r.aclaracion?.opciones).toEqual(["150"]);
  });

  it("texto sin fixture y sin números produce aclaración con las categorías", async () => {
    const r = await interpretarPeticion({ texto: "hola buenas", diccionario: belleza, filtrosVigentes: null, adaptador: adaptador() });
    expect(r.objeto.filtros).toEqual([]);
    expect(r.aclaracion?.opciones).toEqual(belleza.categorias);
  });

  it("texto vacío devuelve lo vigente sin llamar al modelo", async () => {
    const vigente: ObjetoFiltros = { dominio: "belleza", categoria: null, filtros: [{ atributo: "vegano", operador: "=", valor: true }], incluir_sin_dato: true };
    const r = await interpretarPeticion({ texto: "   ", diccionario: belleza, filtrosVigentes: vigente, adaptador: adaptador() });
    expect(r.objeto).toEqual(vigente);
    expect(r.llamo_modelo).toBe(false);
    expect(r.etiquetas[0]).toMatchObject({ origen: "usuario", confianza: 1 });
  });

  it("G1 bloquea un atributo de riesgo propuesto por el modelo y lo informa", async () => {
    const r = await interpretarPeticion({ texto: "crema que no cause daño", diccionario: belleza, filtrosVigentes: null, adaptador: adaptador() });
    expect(r.objeto.filtros).toEqual([]);
    expect(r.descartados).toEqual([expect.objectContaining({ atributo: "clase_riesgo", motivo: "atributo_no_inferible" })]);
    expect(r.aclaracion?.pregunta).toMatch(/No pude usar/);
  });
});

describe("interpretar: fusión con vigentes (RF-04)", () => {
  const vigente: ObjetoFiltros = {
    dominio: "belleza",
    categoria: "cuidado_facial",
    filtros: [
      { atributo: "fragancia", operador: "=", valor: "sin perfume" },
      { atributo: "precio", operador: "<", valor: 300 },
    ],
    incluir_sin_dato: true,
  };

  it("un mensaje nuevo agrega sin borrar lo vigente", async () => {
    const r = await interpretarPeticion({ texto: "que no tenga parabenos", diccionario: belleza, filtrosVigentes: vigente, adaptador: adaptador() });
    expect(soloFiltros(r.objeto)).toEqual([
      { atributo: "fragancia", operador: "=", valor: "sin perfume" },
      { atributo: "precio", operador: "<", valor: 300 },
      { atributo: "sin_parabenos", operador: "=", valor: true },
    ]);
    expect(r.objeto.categoria).toBe("cuidado_facial");
    expect(r.objeto.incluir_sin_dato).toBe(true);
    expect(r.etiquetas.map((e) => e.origen)).toEqual(["usuario", "usuario", "modelo"]);
  });

  it("mismo atributo y operador: el nuevo reemplaza al vigente", async () => {
    const r = await interpretarPeticion({ texto: "mejor de menos de $200", diccionario: belleza, filtrosVigentes: vigente, adaptador: adaptador() });
    expect(soloFiltros(r.objeto)).toEqual([
      { atributo: "fragancia", operador: "=", valor: "sin perfume" },
      { atributo: "precio", operador: "<", valor: 200 },
    ]);
  });

  it("reiniciar limpia todo", async () => {
    const r = await interpretarPeticion({ texto: "mejor empezamos de nuevo", diccionario: belleza, filtrosVigentes: vigente, adaptador: adaptador() });
    expect(r.objeto).toEqual({ dominio: "belleza", categoria: null, filtros: [], incluir_sin_dato: false });
    expect(r.aclaracion).toBeNull();
  });

  it("secuencia de tres mensajes", async () => {
    const a = adaptador();
    let obj: ObjetoFiltros | null = null;
    for (const texto of ["protector solar vegano", "fps 50 o más", "de menos de 400 pesos"]) {
      obj = (await interpretarPeticion({ texto, diccionario: belleza, filtrosVigentes: obj, adaptador: a })).objeto;
    }
    expect(obj?.categoria).toBe("cuidado_facial");
    expect(soloFiltros(obj!)).toEqual([
      { atributo: "uso_previsto", operador: "=", valor: "proteger" },
      { atributo: "vegano", operador: "=", valor: true },
      { atributo: "spf", operador: ">=", valor: 50 },
      { atributo: "precio", operador: "<", valor: 400 },
    ]);
  });
});

describe("interpretar: otras verticales", () => {
  it("llantas: medida por extractor y uso por modelo", async () => {
    const r = await interpretarPeticion({ texto: "llanta 205/55 R16 para carretera", diccionario: DICCIONARIO_LLANTAS, filtrosVigentes: null, adaptador: adaptador() });
    expect(r.objeto.categoria).toBe("pasajeros");
    expect(soloFiltros(r.objeto)).toEqual([
      { atributo: "ancho_mm", operador: "=", valor: 205 },
      { atributo: "perfil_pct", operador: "=", valor: 55 },
      { atributo: "rin_pulg", operador: "=", valor: 16 },
      { atributo: "uso_previsto", operador: "=", valor: "carretera" },
    ]);
  });

  it("farmacia: el modelo no fija requiere_receta aunque el usuario lo pida en texto", async () => {
    const r = await interpretarPeticion({ texto: "algo que no necesite receta", diccionario: DICCIONARIO_FARMACIA, filtrosVigentes: null, adaptador: adaptador() });
    expect(r.objeto.filtros).toEqual([]);
    expect(r.descartados[0]?.motivo).toBe("atributo_no_inferible");
  });
});

describe("interpretar: caché exacta", () => {
  it("segunda petición idéntica no llama al modelo y marca origen cache", async () => {
    const cache = new CacheMemoria();
    const a = adaptador();
    const texto = "crema sin perfume para piel sensible de menos de 300 pesos";
    const r1 = await interpretarPeticion({ texto, diccionario: belleza, filtrosVigentes: null, adaptador: a, cache });
    const r2 = await interpretarPeticion({ texto, diccionario: belleza, filtrosVigentes: null, adaptador: a, cache });
    expect(r1.desde_cache).toBe(false);
    expect(r2.desde_cache).toBe(true);
    expect(r2.llamo_modelo).toBe(false);
    expect(soloFiltros(r2.objeto)).toEqual(soloFiltros(r1.objeto));
    expect(r2.etiquetas.every((e) => e.origen === "cache")).toBe(true);
    expect(cache.aciertos).toBe(1);
  });

  it("la clave distingue filtros vigentes distintos", async () => {
    const cache = new CacheMemoria();
    const a = adaptador();
    const texto = "que no tenga parabenos";
    await interpretarPeticion({ texto, diccionario: belleza, filtrosVigentes: null, adaptador: a, cache });
    const r = await interpretarPeticion({
      texto,
      diccionario: belleza,
      filtrosVigentes: { dominio: "belleza", categoria: null, filtros: [{ atributo: "vegano", operador: "=", valor: true }], incluir_sin_dato: false },
      adaptador: a,
      cache,
    });
    expect(r.desde_cache).toBe(false);
    expect(cache.tamano).toBe(2);
  });

  it("cambiar la versión del diccionario invalida la caché", async () => {
    const cache = new CacheMemoria();
    const a = adaptador();
    const texto = "que no tenga parabenos";
    await interpretarPeticion({ texto, diccionario: belleza, filtrosVigentes: null, adaptador: a, cache });
    const r = await interpretarPeticion({ texto, diccionario: { ...belleza, version: "prueba-2" }, filtrosVigentes: null, adaptador: a, cache });
    expect(r.desde_cache).toBe(false);
  });

  it("no guarda lo que no pasó G1", async () => {
    const cache = new CacheMemoria();
    await interpretarPeticion({ texto: "crema que no cause daño", diccionario: belleza, filtrosVigentes: null, adaptador: adaptador(), cache });
    expect(cache.tamano).toBe(0);
  });

  it("sin caché no se llama a obtener ni guardar", async () => {
    const r = await interpretarPeticion({ texto: "que no tenga parabenos", diccionario: belleza, filtrosVigentes: null, adaptador: adaptador(), cache: null });
    expect(r.desde_cache).toBe(false);
  });
});
