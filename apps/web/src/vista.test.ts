import { vocabularioProhibidoEn } from "@catalogo-ia/core";
import { describe, expect, it } from "vitest";
import { crearClienteLocal } from "./cliente_api";
import { etiquetaAtributo, formatearValor, iniciarAplicacion } from "./vista";

function crearContenedorPrueba(): HTMLElement {
  return {
    innerHTML: "",
    querySelectorAll: () => [],
    querySelector: () => null,
  } as unknown as HTMLElement;
}

describe("Cliente y vista web (T5)", () => {
  it("carga la pantalla principal con etiquetas, facetas, resultados y faltantes", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    expect(ctrl.estado.verticales).toHaveLength(3);
    expect(ctrl.estado.dominioActual).toBe("belleza");
    // Adaptador interactivo sin fixtures del banco: entiende fragancia y tipo de piel,
    // no "hidratante" ni la categoría (la evaluación reporta estos huecos).
    expect(ctrl.estado.respuesta?.filtros.categoria).toBeNull();
    expect(ctrl.estado.respuesta?.etiquetas.map((e) => e.atributo)).toEqual(["fragancia", "tipo_piel"]);
    expect(ctrl.estado.respuesta?.total).toBe(6);
    expect(ctrl.estado.respuesta?.faltantes).toBe(2);
    expect(contenedor.innerHTML).toContain("Catálogo · búsqueda asistida");
    expect(contenedor.innerHTML).toContain("Crema facial hidratante 50 ml");
    expect(contenedor.innerHTML).toContain("Cumple:");
    expect(contenedor.innerHTML).toContain("Incluir productos sin dato del filtro (2)");
  });

  it("muestra el aviso obligatorio al cambiar a la vertical de farmacia", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    await ctrl.cambiarVertical("farmacia");
    expect(ctrl.estado.dominioActual).toBe("farmacia");
    expect(contenedor.innerHTML).toContain("data-testid=\"aviso-vertical\"");
    expect(contenedor.innerHTML).toContain("No recomienda");
    expect(ctrl.estado.respuesta?.total).toBeGreaterThan(0);
  });

  it("acciones estructuradas (incluir_sin_dato, quitar, faceta, agregar) recalculan sin modelo (RF-03, RF-06, RF-07, RF-10)", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    // Incluir productos sin dato (RF-06)
    await ctrl.ejecutarAccion({ tipo: "incluir_sin_dato", valor: true });
    expect(ctrl.estado.respuesta?.llamo_modelo).toBe(false);
    expect(ctrl.estado.respuesta?.total).toBe(8);
    expect(contenedor.innerHTML).toContain("Sin dato:");

    // Quitar etiqueta (RF-03)
    await ctrl.ejecutarAccion({
      tipo: "quitar",
      atributo: "tipo_piel",
      operador: "=",
      valor: "sensible",
    });
    expect(ctrl.estado.respuesta?.llamo_modelo).toBe(false);
    expect(ctrl.estado.respuesta?.etiquetas.some((e) => e.atributo === "tipo_piel")).toBe(false);

    // Agregar etiqueta manual (RF-10)
    await ctrl.ejecutarAccion({
      tipo: "agregar",
      filtro: { atributo: "precio", operador: "<", valor: 300 },
    });
    expect(ctrl.estado.respuesta?.llamo_modelo).toBe(false);
    expect(ctrl.estado.respuesta?.etiquetas.some((e) => e.atributo === "precio")).toBe(true);
  });

  it("muestra aclaración en confianza baja y descarte G1 en atributos de riesgo", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    await ctrl.ejecutarAccion({ tipo: "reiniciar" });
    await ctrl.buscarPorTexto("que sea barato");
    expect(ctrl.estado.respuesta?.aclaracion).not.toBeNull();
    expect(contenedor.innerHTML).toContain("data-testid=\"bloque-aclaracion\"");

    await ctrl.ejecutarAccion({ tipo: "reiniciar" });
    // El adaptador propone clase_riesgo por coincidencia léxica; G1 lo descarta (RF-11)
    await ctrl.buscarPorTexto("crema con clase de riesgo ninguno");
    expect(ctrl.estado.respuesta?.descartados.length).toBeGreaterThan(0);
    expect(contenedor.innerHTML).toContain("data-testid=\"bloque-descartados\"");
  });

  it("ningún resultado ni motivo mostrado contiene vocabulario prohibido (G5)", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    for (const dom of ["belleza", "farmacia", "llantas"] as const) {
      await ctrl.cambiarVertical(dom);
      for (const r of ctrl.estado.respuesta?.resultados ?? []) {
        expect(vocabularioProhibidoEn(r.nombre)).toEqual([]);
        expect(vocabularioProhibidoEn(r.descripcion)).toEqual([]);
      }
    }
    expect(etiquetaAtributo("forma_farmaceutica")).toBe("Forma farmacéutica");
    expect(formatearValor(true)).toBe("sí");
  });
});
