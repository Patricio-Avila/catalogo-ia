import { vocabularioProhibidoEn, type PeticionBuscar, type Resultado } from "@catalogo-ia/core";
import { describe, expect, it, vi } from "vitest";
import { crearClienteLocal, type ClienteCatalogo } from "./cliente_api";
import {
  describirFiltroEnFrase,
  etiquetaAtributo,
  formatearEtiqueta,
  formatearPrecio,
  formatearRango,
  formatearValor,
  iniciarAplicacion,
  nombreOperador,
} from "./vista";

const CONSULTA_CREMA = "busco una crema hidratante sin perfume para piel sensible";

function crearContenedorPrueba(): HTMLElement {
  return {
    innerHTML: "",
    querySelectorAll: () => [],
    querySelector: () => null,
  } as unknown as HTMLElement;
}

/** Cliente local que registra cada llamada a /buscar. */
function clienteEspia(base: ClienteCatalogo = crearClienteLocal()): { cliente: ClienteCatalogo; llamadas: PeticionBuscar[] } {
  const llamadas: PeticionBuscar[] = [];
  return {
    llamadas,
    cliente: {
      ...base,
      buscar: (p) => {
        llamadas.push(p);
        return base.buscar(p);
      },
    },
  };
}

/** Lo que hay dentro de la columna de la ficha. */
function columnaDetalle(html: string): string {
  const inicio = html.indexOf('data-testid="columna-detalle"');
  expect(inicio).toBeGreaterThan(-1);
  return html.slice(inicio, html.indexOf("</aside>", inicio));
}

/** Una lista de atributos de la ficha (`<dl>`), por su data-testid. */
function seccion(html: string, testid: string): string {
  const inicio = html.indexOf(`data-testid="${testid}"`);
  if (inicio < 0) return "";
  return html.slice(inicio, html.indexOf("</dl>", inicio));
}

describe("Cliente y vista web (T5)", () => {
  it("al cargar no busca nada: muestra una invitación con los ejemplos como botones", async () => {
    const contenedor = crearContenedorPrueba();
    const { cliente, llamadas } = clienteEspia();
    const ctrl = await iniciarAplicacion(contenedor, cliente);

    expect(ctrl.estado.verticales).toHaveLength(3);
    expect(ctrl.estado.dominioActual).toBe("belleza");
    expect(llamadas).toHaveLength(0);
    expect(ctrl.estado.respuesta).toBeNull();
    expect(contenedor.innerHTML).toContain('data-testid="invitacion"');
    expect(contenedor.innerHTML).toContain("¿Qué buscas en Belleza y cuidado de la piel?");
    expect(contenedor.innerHTML).toContain('data-ejemplo="protector solar vegano"');
    expect(contenedor.innerHTML).not.toContain('data-testid="sin-resultados"');
    expect(contenedor.innerHTML).toContain("Selecciona un producto para ver su ficha");
  });

  it("carga la pantalla principal con etiquetas, facetas, resultados y faltantes", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
    await ctrl.buscarPorTexto(CONSULTA_CREMA);

    // Adaptador interactivo sin fixtures del banco: entiende fragancia, tipo de piel y
    // "hidratante" como forma derivada de hidratar (sugerida); no deduce la categoría
    // porque esos valores existen en las dos (la evaluación reporta este hueco).
    expect(ctrl.estado.respuesta?.filtros.categoria).toBeNull();
    expect(ctrl.estado.respuesta?.etiquetas.map((e) => e.atributo)).toEqual(["uso_previsto", "fragancia", "tipo_piel"]);
    expect(ctrl.estado.respuesta?.etiquetas.find((e) => e.atributo === "uso_previsto")?.sugerida).toBe(true);
    expect(ctrl.estado.respuesta?.total).toBe(4);
    expect(ctrl.estado.respuesta?.faltantes).toBe(2);
    expect(contenedor.innerHTML).toContain("Catálogo · búsqueda asistida");
    expect(contenedor.innerHTML).toContain("Crema facial hidratante 50 ml");
    expect(contenedor.innerHTML).toContain("Cumple:");
    expect(contenedor.innerHTML).toContain("Incluir productos sin dato del filtro (2)");
    // Región viva y campo listo para el siguiente mensaje (RF-04)
    expect(ctrl.estado.anuncio).toBe("4 productos cumplen, 2 sin dato");
    expect(ctrl.estado.textoBusqueda).toBe("");
    expect(contenedor.innerHTML).toContain('placeholder="Agrega algo más: solo veganos"');
  });

  it("muestra el aviso obligatorio al cambiar a la vertical de farmacia", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    await ctrl.cambiarVertical("farmacia");
    expect(ctrl.estado.dominioActual).toBe("farmacia");
    expect(contenedor.innerHTML).toContain("data-testid=\"aviso-vertical\"");
    expect(contenedor.innerHTML).toContain("No recomienda");
    await ctrl.buscarPorTexto("paracetamol en tabletas");
    expect(ctrl.estado.respuesta?.total).toBeGreaterThan(0);
  });

  it("al cambiar de vertical no hay búsqueda automática ni quedan resultados de la anterior", async () => {
    const contenedor = crearContenedorPrueba();
    const { cliente, llamadas } = clienteEspia();
    const ctrl = await iniciarAplicacion(contenedor, cliente);
    await ctrl.buscarPorTexto(CONSULTA_CREMA);
    ctrl.seleccionarProducto(1);
    expect(llamadas).toHaveLength(1);

    const pendiente = ctrl.cambiarVertical("llantas");
    // Mientras carga: sin resultados de belleza y con estado de carga, no "sin resultados".
    expect(contenedor.innerHTML).not.toContain("Crema facial hidratante 50 ml");
    expect(contenedor.innerHTML).toContain("Cargando la vertical…");
    expect(contenedor.innerHTML).not.toContain('data-testid="sin-resultados"');
    await pendiente;

    expect(llamadas).toHaveLength(1);
    expect(ctrl.estado.respuesta).toBeNull();
    expect(ctrl.estado.productoDetalleId).toBeNull();
    expect(contenedor.innerHTML).toContain('data-testid="invitacion"');
    expect(contenedor.innerHTML).toContain('data-ejemplo="llanta 205/55 R16 para carretera"');
    expect(contenedor.innerHTML).not.toContain('data-testid="panel-detalle"');
  });

  it("mientras busca muestra «Buscando…» con aria-busy, no el estado vacío", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    const pendiente = ctrl.buscarPorTexto("protector solar vegano");
    expect(ctrl.estado.cargando).toBe(true);
    expect(contenedor.innerHTML).toContain('data-testid="estado-cargando"');
    expect(contenedor.innerHTML).toContain("Buscando…");
    expect(contenedor.innerHTML).toContain('aria-busy="true"');
    expect(contenedor.innerHTML).not.toContain('data-testid="sin-resultados"');
    await pendiente;

    expect(contenedor.innerHTML).not.toContain("Buscando…");
    expect(contenedor.innerHTML).toContain('aria-busy="false"');
  });

  it("acciones estructuradas (incluir_sin_dato, quitar, faceta, agregar) recalculan sin modelo (RF-03, RF-06, RF-07, RF-10)", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
    await ctrl.buscarPorTexto(CONSULTA_CREMA);

    // Incluir productos sin dato (RF-06)
    await ctrl.ejecutarAccion({ tipo: "incluir_sin_dato", valor: true });
    expect(ctrl.estado.respuesta?.llamo_modelo).toBe(false);
    expect(ctrl.estado.respuesta?.total).toBe(6);
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

    // La faceta elegida queda marcada con aria-pressed
    await ctrl.ejecutarAccion({ tipo: "categoria", categoria: "cuidado_facial" });
    expect(contenedor.innerHTML).toMatch(/data-categoria-faceta="cuidado_facial"[^>]*aria-pressed="true"/);
    expect(contenedor.innerHTML).toMatch(/data-categoria-faceta=""[^>]*aria-pressed="false"/);
  });

  it("muestra la aclaración en palabras y los descartes sin jerga interna", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    await ctrl.buscarPorTexto("que sea barato");
    expect(ctrl.estado.respuesta?.aclaracion).not.toBeNull();
    expect(contenedor.innerHTML).toContain("data-testid=\"bloque-aclaracion\"");
    expect(contenedor.innerHTML).toContain("¿Te refieres a precio menor a $150.00?");
    expect(contenedor.innerHTML).toContain("Precio menor a $150.00");
    expect(contenedor.innerHTML).not.toContain("precio &lt; 150");
    // Sin consultar la base, el texto se conserva para reescribirlo.
    expect(ctrl.estado.textoBusqueda).toBe("que sea barato");
    expect(contenedor.innerHTML).toContain('data-testid="sin-consultar"');

    await ctrl.ejecutarAccion({ tipo: "reiniciar" });
    // El adaptador propone clase_riesgo por coincidencia léxica; G1 lo descarta (RF-11)
    await ctrl.buscarPorTexto("crema con clase de riesgo ninguno");
    expect(ctrl.estado.respuesta?.descartados.length).toBeGreaterThan(0);
    expect(contenedor.innerHTML).toContain("data-testid=\"bloque-descartados\"");
    expect(contenedor.innerHTML).toContain("No se aplicó:");
    expect(contenedor.innerHTML).toContain("Clase de riesgo (ninguno)");
    expect(contenedor.innerHTML).not.toContain("G1");
    // Las opciones de categoría se leen con su nombre, no con el identificador.
    expect(contenedor.innerHTML).toMatch(/data-opcion-aclaracion="cuidado_facial"[^>]*>\s*Cuidado facial\s*</);
  });

  it("ningún resultado, motivo ni ficha mostrada contiene vocabulario prohibido (G5)", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());

    for (const dom of ["belleza", "farmacia", "llantas"] as const) {
      await ctrl.cambiarVertical(dom);
      await ctrl.ejecutarAccion({ tipo: "reiniciar" });
      const resultados = ctrl.estado.respuesta?.resultados ?? [];
      expect(resultados.length).toBeGreaterThan(0);
      for (const r of resultados) {
        expect(vocabularioProhibidoEn(r.nombre)).toEqual([]);
        expect(vocabularioProhibidoEn(r.descripcion)).toEqual([]);
      }
      ctrl.seleccionarProducto(resultados[0]!.id);
      // Incluye el aviso de la vertical: desde la migración 0010 tampoco lleva vocabulario prohibido.
      const ficha = columnaDetalle(contenedor.innerHTML).replace(/<[^>]*>/g, " ");
      expect(vocabularioProhibidoEn(ficha)).toEqual([]);
    }
    expect(etiquetaAtributo("forma_farmaceutica")).toBe("Forma farmacéutica");
    expect(formatearValor(true)).toBe("sí");
  });

  it("las etiquetas se leen con palabras, sin operadores ni nombres internos", () => {
    expect(formatearEtiqueta({ atributo: "precio", operador: "<=", valor: 300 })).toBe("Precio: hasta $300");
    expect(formatearEtiqueta({ atributo: "garantia_km", operador: ">=", valor: 50000 })).toBe(
      "Garantía (km): desde 50,000",
    );
    expect(formatearEtiqueta({ atributo: "tipo_piel", operador: "=", valor: "sensible" })).toBe(
      "Tipo de piel: sensible",
    );
    expect(formatearEtiqueta({ atributo: "fragancia", operador: "<>", valor: "floral" })).toBe(
      "Fragancia: no es floral",
    );
    expect(formatearEtiqueta({ atributo: "run_flat", operador: "<>", valor: true })).toBe("Run flat: no");
    expect(formatearEtiqueta({ atributo: "anio_fabricacion", operador: ">=", valor: 2024 })).toBe(
      "Año de fabricación: desde 2024",
    );
    expect(nombreOperador("<")).toBe("menos de");
    expect(etiquetaAtributo("spf")).toBe("SPF");
    expect(etiquetaAtributo("color_de_envase")).toBe("Color de envase");
    expect(describirFiltroEnFrase({ atributo: "precio", operador: "<", valor: 150 })).toBe("Precio menor a $150.00");
    expect(formatearRango("garantia_km", 20000, 100000)).toBe("de 20,000 a 100,000 km");
    expect(formatearRango("precio", 50, 1000)).toBe("de $50.00 a $1,000.00");
  });

  it("los precios se muestran en pesos con dos decimales en tarjetas y ficha", async () => {
    expect(formatearPrecio(1234.5)).toBe("$1,234.50");
    expect(formatearPrecio(289)).toBe("$289.00");

    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
    await ctrl.buscarPorTexto(CONSULTA_CREMA);
    expect(contenedor.innerHTML).toMatch(/data-testid="tarjeta-precio">\$289\.00</);

    ctrl.seleccionarProducto(1);
    expect(columnaDetalle(contenedor.innerHTML)).toMatch(/data-testid="ficha-precio">\$289\.00</);
  });

  it("el panel de agregar filtro muestra nombres, condiciones y rangos en palabras (RF-10)", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
    ctrl.estado.mostrarPanelManual = true;
    await ctrl.ejecutarAccion({ tipo: "agregar", filtro: { atributo: "precio", operador: "<", valor: 300 } });

    expect(contenedor.innerHTML).toContain("Agregar filtro:");
    expect(contenedor.innerHTML).toContain("Precio: menos de $300");
    expect(contenedor.innerHTML).toContain(">menos de</option>");
    expect(contenedor.innerHTML).toContain("En el catálogo: de $50.00 a $1,000.00");
    // Texto visible (sin etiquetas ni atributos HTML): ningún nombre interno con guion bajo.
    expect(contenedor.innerHTML.replace(/<[^>]*>/g, "")).not.toContain("_");
  });
});

describe("Ficha del producto", () => {
  it("se dibuja en la columna de detalle, no después de la lista, y marca la tarjeta elegida", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
    await ctrl.buscarPorTexto(CONSULTA_CREMA);
    expect(columnaDetalle(contenedor.innerHTML)).toContain('data-testid="detalle-vacio"');

    ctrl.seleccionarProducto(1);
    const html = contenedor.innerHTML;
    const iLista = html.indexOf('data-testid="lista-resultados"');
    const iColumna = html.indexOf('data-testid="columna-detalle"');
    const iFicha = html.indexOf('data-testid="panel-detalle"');
    expect(iLista).toBeGreaterThan(-1);
    expect(iColumna).toBeGreaterThan(iLista);
    expect(iFicha).toBeGreaterThan(iColumna);
    expect(html.split('data-testid="panel-detalle"')).toHaveLength(2);
    expect(columnaDetalle(html)).toContain('id="ficha-titulo"');
    expect(columnaDetalle(html)).not.toContain('data-testid="detalle-vacio"');

    // Tarjeta elegida: aria-current y botón expandido; las demás no.
    expect(html).toMatch(/data-producto-id="1"\s+aria-current="true"/);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-abrir-detalle="1"[^>]*aria-expanded="true"/);
    expect(html).toMatch(/data-abrir-detalle="2"[^>]*aria-expanded="false"/);

    // Cerrar deja otra vez el estado vacío.
    ctrl.seleccionarProducto(null);
    expect(contenedor.innerHTML).not.toContain('data-testid="panel-detalle"');
    expect(contenedor.innerHTML).not.toContain('aria-current="true"');
    expect(columnaDetalle(contenedor.innerHTML)).toContain("Selecciona un producto para ver su ficha");
  });

  it("separa el contexto de los atributos técnicos y marca «sin dato» donde falta la clave", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
    await ctrl.buscarPorTexto(CONSULTA_CREMA);
    ctrl.seleccionarProducto(1);
    const ficha = columnaDetalle(contenedor.innerHTML);

    // Encabezado en orden: nombre, marca, precio, categoría legible
    expect(ficha.indexOf("Crema facial hidratante 50 ml")).toBeLessThan(ficha.indexOf("Marca A"));
    expect(ficha.indexOf("Marca A")).toBeLessThan(ficha.indexOf("$289.00"));
    expect(ficha.indexOf("$289.00")).toBeLessThan(ficha.indexOf("Cuidado facial"));

    const contexto = seccion(ficha, "ficha-contexto");
    const tecnicos = seccion(ficha, "ficha-atributos");
    for (const atributo of ["uso_previsto", "zona_aplicacion", "clase_riesgo", "apto_consumo"]) {
      expect(contexto).toContain(`data-atributo="${atributo}"`);
      expect(tecnicos).not.toContain(`data-atributo="${atributo}"`);
    }
    expect(contexto).toMatch(/data-atributo="apto_consumo"[^]*?<dd>no<\/dd>/);
    // Todos los atributos técnicos del diccionario de cuidado facial, presentes o no
    for (const atributo of ["contenido_ml", "fragancia", "tipo_piel", "acabado", "vegano", "sin_parabenos", "spf"]) {
      expect(tecnicos).toContain(`data-atributo="${atributo}"`);
    }
    expect(tecnicos).not.toContain('data-atributo="precio"');
    expect(tecnicos).not.toContain('data-atributo="marca"');
    expect(tecnicos).toMatch(/data-atributo="spf"><dt>SPF<\/dt><dd>sin dato<\/dd>/);
    expect(tecnicos).toMatch(/data-atributo="vegano"><dt>Vegano<\/dt><dd>sí<\/dd>/);
    expect(tecnicos).toMatch(/data-atributo="contenido_ml"><dt>Contenido \(ml\)<\/dt><dd>50<\/dd>/);
    // Motivo como chips
    expect(ficha).toContain("Tipo de piel: sensible");
  });

  it("conserva la selección entre búsquedas si el producto sigue en los resultados", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
    await ctrl.buscarPorTexto(CONSULTA_CREMA);
    ctrl.seleccionarProducto(1);

    await ctrl.ejecutarAccion({ tipo: "incluir_sin_dato", valor: true });
    expect(ctrl.estado.respuesta?.resultados.some((r) => r.id === 1)).toBe(true);
    expect(ctrl.estado.productoDetalleId).toBe(1);
    expect(columnaDetalle(contenedor.innerHTML)).toContain('data-testid="panel-detalle"');

    // El producto 1 es de piel sensible: con piel grasa sale de los resultados y la ficha se cierra.
    await ctrl.ejecutarAccion({ tipo: "agregar", filtro: { atributo: "tipo_piel", operador: "=", valor: "grasa" } });
    expect(ctrl.estado.respuesta?.resultados.some((r) => r.id === 1)).toBe(false);
    expect(ctrl.estado.productoDetalleId).toBeNull();
    expect(contenedor.innerHTML).not.toContain('data-testid="panel-detalle"');
  });

  it("en farmacia la ficha repite el aviso de la vertical", async () => {
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
    await ctrl.cambiarVertical("farmacia");
    await ctrl.buscarPorTexto("paracetamol en tabletas");
    const primero = ctrl.estado.respuesta?.resultados[0];
    expect(primero).toBeDefined();
    ctrl.seleccionarProducto(primero!.id);

    const ficha = columnaDetalle(contenedor.innerHTML);
    expect(ficha).toContain('data-testid="ficha-aviso"');
    expect(ficha).toContain("No recomienda");
    expect(seccion(ficha, "ficha-contexto")).toContain('data-atributo="requiere_receta"');
  });

  it("en pantallas menores a 900 px la ficha se abre como diálogo con «← Resultados»", async () => {
    // Solo la consulta de celular coincide; el entorno de pruebas no tiene <dialog>.
    vi.stubGlobal("window", {
      matchMedia: (consulta: string) => ({ matches: consulta.includes("max-width"), addEventListener: () => {} }),
    });
    try {
      const contenedor = crearContenedorPrueba();
      const ctrl = await iniciarAplicacion(contenedor, crearClienteLocal());
      await ctrl.buscarPorTexto(CONSULTA_CREMA);
      ctrl.seleccionarProducto(1);

      const html = contenedor.innerHTML;
      expect(columnaDetalle(html)).not.toContain('data-testid="panel-detalle"');
      const iDialogo = html.indexOf('data-testid="dialogo-ficha"');
      expect(iDialogo).toBeGreaterThan(html.indexOf('data-testid="columna-detalle"'));
      expect(html.indexOf('data-testid="panel-detalle"')).toBeGreaterThan(iDialogo);
      expect(html).toContain("← Resultados");
      expect(html).not.toContain('aria-label="Cerrar ficha"');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("si la API no envía atributos, la ficha los omite sin afirmar «sin dato»", async () => {
    const base = crearClienteLocal();
    const anterior: ClienteCatalogo = {
      ...base,
      async buscar(p) {
        const r = await base.buscar(p);
        return {
          ...r,
          resultados: r.resultados.map((x) => {
            const copia: Partial<Resultado> = { ...x };
            delete copia.atributos;
            delete copia.categoria;
            return copia as Resultado;
          }),
        };
      },
    };
    const contenedor = crearContenedorPrueba();
    const ctrl = await iniciarAplicacion(contenedor, anterior);
    await ctrl.buscarPorTexto(CONSULTA_CREMA);
    ctrl.seleccionarProducto(1);

    const ficha = columnaDetalle(contenedor.innerHTML);
    expect(ficha).toContain('data-testid="panel-detalle"');
    expect(ficha).toContain('data-testid="ficha-sin-atributos"');
    expect(ficha).not.toContain('data-testid="ficha-atributos"');
    expect(ficha).not.toContain("<dd>sin dato</dd>");
  });
});
