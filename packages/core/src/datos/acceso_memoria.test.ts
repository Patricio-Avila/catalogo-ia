import { crearApp } from "../api/app";
import { DICCIONARIOS } from "../datos_prueba/diccionarios";
import { FIXTURES_MODELO } from "../datos_prueba/fixtures_modelo";
import { PRODUCTOS_PRUEBA } from "../datos_prueba/productos";
import { AdaptadorInteractivo } from "../modelo/heuristico";
import { vocabularioProhibidoEn } from "../vocabulario";
import { AccesoMemoria } from "./acceso_memoria";

describe("AccesoMemoria y catálogo sintético", () => {
  const acceso = new AccesoMemoria();

  it("todos los productos cumplen obligatorios y están libres de vocabulario prohibido", () => {
    for (const p of PRODUCTOS_PRUEBA) {
      expect(vocabularioProhibidoEn(p.nombre)).toEqual([]);
      expect(vocabularioProhibidoEn(p.descripcion)).toEqual([]);

      const dic = DICCIONARIOS[p.dominio];
      const obligatorios = dic.entradas.filter((e) => e.categoria === p.categoria && e.obligatorio);
      for (const ob of obligatorios) {
        expect(p.atributos[ob.atributo]).toBeDefined();
      }
    }
  });

  it("calcula motivos cumple y sin_dato, y cuenta faltantes (RF-05, RF-06)", async () => {
    const objeto = {
      dominio: "belleza" as const,
      categoria: "cuidado_facial",
      filtros: [
        { atributo: "fragancia", operador: "=" as const, valor: "sin perfume" },
        { atributo: "tipo_piel", operador: "=" as const, valor: "sensible" },
        { atributo: "precio", operador: "<" as const, valor: 300 },
      ],
      incluir_sin_dato: false,
    };

    const sinFaltantes = await acceso.buscar(objeto);
    expect(sinFaltantes.total).toBe(2);
    expect(sinFaltantes.faltantes).toBe(2);
    for (const r of sinFaltantes.resultados) {
      expect(r.cumple).toEqual(["fragancia", "precio", "tipo_piel"]);
      expect(r.sin_dato).toEqual([]);
    }

    const conFaltantes = await acceso.buscar({ ...objeto, incluir_sin_dato: true });
    expect(conFaltantes.total).toBe(4);
    expect(conFaltantes.faltantes).toBe(2);
    const conSinDato = conFaltantes.resultados.filter((r) => r.sin_dato.length > 0);
    expect(conSinDato).toHaveLength(2);
    expect(conSinDato.some((r) => r.sin_dato.includes("tipo_piel"))).toBe(true);
    expect(conSinDato.some((r) => r.sin_dato.includes("fragancia"))).toBe(true);
  });

  it("calcula facetas sobre el conjunto resultante y omite atributos fijados con '=' (RF-07)", async () => {
    const objeto = {
      dominio: "farmacia" as const,
      categoria: "medicamentos",
      filtros: [{ atributo: "sustancia_activa", operador: "=" as const, valor: "paracetamol" }],
      incluir_sin_dato: false,
    };
    const facetas = await acceso.facetas(objeto);
    expect(facetas.some((f) => f.atributo === "sustancia_activa")).toBe(false);
    const forma = facetas.find((f) => f.atributo === "forma_farmaceutica");
    expect(forma).toBeDefined();
    expect(forma!.valores.length).toBeGreaterThanOrEqual(2);
  });

  it("AdaptadorInteractivo resuelve tanto fixtures como consultas libres contra el diccionario", async () => {
    const adaptador = new AdaptadorInteractivo(FIXTURES_MODELO);
    const app = crearApp({ acceso, adaptador, origenes: ["http://localhost:5173"] });

    const r1 = await app.request("/buscar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dominio: "llantas",
        texto: "llanta 205/55 R16 para carretera",
        filtros_vigentes: null,
      }),
    });
    const c1 = await r1.json();
    expect(c1.total).toBeGreaterThan(0);
    expect(c1.filtros.filtros).toHaveLength(4);

    // Frase libre no presente en FIXTURES_MODELO
    const r2 = await app.request("/buscar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dominio: "farmacia",
        texto: "ibuprofeno oral",
        filtros_vigentes: null,
      }),
    });
    const c2 = await r2.json();
    expect(c2.total).toBeGreaterThan(0);
    expect(c2.filtros.filtros).toEqual([
      { atributo: "sustancia_activa", operador: "=", valor: "ibuprofeno" },
      { atributo: "via_administracion", operador: "=", valor: "oral" },
    ]);
  });
});
