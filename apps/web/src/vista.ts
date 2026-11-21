// Vista principal del cliente web (T5): implementa la maqueta del segundo avance
// (Figura 11 de S6_CPAI_BDE) y las pantallas del tercer avance (detalle,
// aclaración, descartados por G1 y sin resultados).

import {
  OPERADORES_POR_TIPO,
  type Accion,
  type Diccionario,
  type Dominio,
  type EntradaDiccionario,
  type EtiquetaApi,
  type ObjetoFiltros,
  type Operador,
  type RespuestaBuscar,
  type Resultado,
  type ValorFiltro,
  type Vertical,
} from "@catalogo-ia/core";
import { crearClientePorEntorno, type ClienteCatalogo } from "./cliente_api";

const NOMBRES_ATRIBUTOS: Record<string, string> = {
  precio: "Precio",
  marca: "Marca",
  uso_previsto: "Uso previsto",
  requiere_receta: "Requiere receta",
  clase_riesgo: "Clase de riesgo",
  apto_consumo: "Apto para consumo",
  sustancia_activa: "Sustancia activa",
  concentracion_mg: "Concentración (mg)",
  forma_farmaceutica: "Forma farmacéutica",
  via_administracion: "Vía de administración",
  piezas: "Piezas",
  sin_azucar: "Sin azúcar",
  indice_carga: "Índice de carga",
  indice_velocidad: "Índice de velocidad",
  ancho_mm: "Ancho (mm)",
  perfil_pct: "Perfil (%)",
  rin_pulg: "Rin (pulg)",
  temporada: "Temporada",
  run_flat: "Run flat",
  garantia_km: "Garantía (km)",
  anio_fabricacion: "Año de fabricación",
  zona_aplicacion: "Zona de aplicación",
  contenido_ml: "Contenido (ml)",
  fragancia: "Fragancia",
  tipo_piel: "Tipo de piel",
  acabado: "Acabado",
  spf: "FPS / SPF",
  vegano: "Vegano",
  sin_parabenos: "Sin parabenos",
};

const EJEMPLOS_POR_DOMINIO: Record<Dominio, string[]> = {
  belleza: [
    "crema sin perfume para piel sensible de menos de 300 pesos",
    "protector solar vegano",
    "algo para piel delicada",
    "que sea barato",
    "crema que no cause daño",
  ],
  farmacia: [
    "paracetamol en tabletas",
    "jarabe sin azucar",
    "ibuprofeno en capsulas de menos de 100 pesos",
    "suplemento de vitamina c sin azucar",
    "algo que no necesite receta",
  ],
  llantas: [
    "llanta 205/55 R16 para carretera",
    "de invierno con run flat",
    "llantas para la camioneta de carga",
    "llantas de verano con garantia de al menos 50 mil km",
  ],
};

export function etiquetaAtributo(atributo: string): string {
  return NOMBRES_ATRIBUTOS[atributo] ?? atributo.replace(/_/g, " ");
}

export function formatearValor(valor: ValorFiltro | unknown): string {
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  return String(valor);
}

// Solo cambia lo que se muestra: el objeto de filtros conserva los operadores del contrato (§6.1).
const NOMBRES_OPERADORES: Record<Operador, string> = {
  "=": "es",
  "<>": "no es",
  "<": "menos de",
  "<=": "hasta",
  ">": "más de",
  ">=": "desde",
};

export function nombreOperador(operador: Operador): string {
  return NOMBRES_OPERADORES[operador];
}

/** Valor tal como lo lee el usuario: sí/no, precio con signo de pesos, miles separados. */
export function formatearValorAtributo(atributo: string, valor: ValorFiltro | unknown): string {
  if (typeof valor === "number") {
    const numero = valor.toLocaleString("es-MX");
    return atributo === "precio" ? `$${numero}` : numero;
  }
  return formatearValor(valor);
}

/** Condición de un filtro en palabras, sin el nombre del atributo: "sin perfume", "no es floral", "hasta $300". */
export function describirCondicion(atributo: string, operador: Operador, valor: ValorFiltro): string {
  if (typeof valor === "boolean") {
    return formatearValor(operador === "<>" ? !valor : valor);
  }
  const texto = formatearValorAtributo(atributo, valor);
  return operador === "=" ? texto : `${nombreOperador(operador)} ${texto}`;
}

interface EstadoVista {
  verticales: Vertical[];
  dominioActual: Dominio;
  diccionario: Diccionario | null;
  textoBusqueda: string;
  respuesta: RespuestaBuscar | null;
  mostrarPanelManual: boolean;
  atributoManual: string;
  operadorManual: Operador;
  valorManual: string;
  productoDetalleId: number | null;
  cargando: boolean;
  errorMensaje: string | null;
}

export interface ControladorVista {
  readonly estado: EstadoVista;
  cambiarVertical(dominio: Dominio): Promise<void>;
  buscarPorTexto(texto: string): Promise<void>;
  ejecutarAccion(accion: Accion): Promise<void>;
}

export async function iniciarAplicacion(
  contenedor: HTMLElement,
  cliente: ClienteCatalogo = crearClientePorEntorno(),
): Promise<ControladorVista> {
  const estado: EstadoVista = {
    verticales: [],
    dominioActual: "belleza",
    diccionario: null,
    textoBusqueda: "",
    respuesta: null,
    mostrarPanelManual: false,
    atributoManual: "",
    operadorManual: "=",
    valorManual: "",
    productoDetalleId: null,
    cargando: true,
    errorMensaje: null,
  };

  async function cargarVertical(dominio: Dominio, consultaInicial?: string): Promise<void> {
    estado.cargando = true;
    estado.errorMensaje = null;
    estado.dominioActual = dominio;
    estado.productoDetalleId = null;
    renderizar();

    try {
      const dic = await cliente.obtenerDiccionario(dominio);
      estado.diccionario = dic;
      inicializarSelectorManual(dic);

      const respuesta = await cliente.buscar(
        consultaInicial
          ? { dominio, texto: consultaInicial, filtros_vigentes: null }
          : { dominio, accion: { tipo: "reiniciar" }, filtros_vigentes: null },
      );
      estado.textoBusqueda = consultaInicial ?? "";
      estado.respuesta = respuesta;
    } catch (err) {
      estado.errorMensaje = err instanceof Error ? err.message : "No fue posible cargar el catálogo";
    } finally {
      estado.cargando = false;
      renderizar();
    }
  }

  function inicializarSelectorManual(dic: Diccionario): void {
    const primera = obtenerEntradasUnicas(dic)[0];
    if (!primera) return;
    estado.atributoManual = primera.atributo;
    estado.operadorManual = operadorPorOmision(primera);
    estado.valorManual = valorPorOmision(primera);
  }

  async function buscarPorTexto(texto: string): Promise<void> {
    const limpio = texto.trim();
    if (!limpio) return;
    estado.textoBusqueda = limpio;
    estado.cargando = true;
    estado.errorMensaje = null;
    estado.productoDetalleId = null;
    renderizar();

    try {
      const vigentes: ObjetoFiltros | null = estado.respuesta?.filtros ?? null;
      estado.respuesta = await cliente.buscar({
        dominio: estado.dominioActual,
        texto: limpio,
        filtros_vigentes: vigentes,
      });
    } catch (err) {
      estado.errorMensaje = err instanceof Error ? err.message : "No fue posible procesar la búsqueda";
    } finally {
      estado.cargando = false;
      renderizar();
    }
  }

  async function ejecutarAccion(accion: Accion): Promise<void> {
    estado.cargando = true;
    estado.errorMensaje = null;
    estado.productoDetalleId = null;
    renderizar();

    try {
      const vigentes: ObjetoFiltros | null = estado.respuesta?.filtros ?? null;
      estado.respuesta = await cliente.buscar({
        dominio: estado.dominioActual,
        accion,
        filtros_vigentes: vigentes,
      });
      if (accion.tipo === "reiniciar") {
        estado.textoBusqueda = "";
      }
    } catch (err) {
      estado.errorMensaje = err instanceof Error ? err.message : "No fue posible actualizar los filtros";
    } finally {
      estado.cargando = false;
      renderizar();
    }
  }

  function renderizar(): void {
    const vertical = estado.verticales.find((v) => v.dominio === estado.dominioActual);
    const resp = estado.respuesta;
    const filtrosVigentes = resp?.filtros ?? null;
    const entradasUnicas = estado.diccionario ? obtenerEntradasUnicas(estado.diccionario) : [];
    const entradaManualActual = entradasUnicas.find((e) => e.atributo === estado.atributoManual) ?? entradasUnicas[0];

    contenedor.innerHTML = `
      <div class="contenedor-principal">
        <div class="marco-app">
          <header class="cabecera">
            <h1 class="cabecera-titulo">Catálogo · búsqueda asistida</h1>
            <div class="cabecera-controles">
              <div class="selector-vertical" role="tablist" aria-label="Selector de vertical">
                ${estado.verticales
                  .map(
                    (v) => `
                  <button
                    type="button"
                    role="tab"
                    data-dominio="${escapar(v.dominio)}"
                    aria-selected="${v.dominio === estado.dominioActual}"
                    class="btn-vertical ${v.dominio === estado.dominioActual ? "activa" : ""}"
                  >${escapar(v.nombre)}</button>
                `,
                  )
                  .join("")}
              </div>
              <span
                class="insignia-modo"
                data-testid="insignia-modo"
                title="${
                  cliente.modo === "remoto"
                    ? "Consultas a la API publicada"
                    : "Sin API configurada: catálogo de prueba e intérprete local en el navegador, sin base de datos ni modelo de lenguaje"
                }"
              >
                ${cliente.modo === "remoto" ? "API conectada" : "Modo demo local"}
              </span>
            </div>
          </header>

          <main class="cuerpo-app">
            ${
              vertical?.aviso
                ? `<div class="aviso-vertical" role="note" data-testid="aviso-vertical">${escapar(vertical.aviso)}</div>`
                : ""
            }

            <form class="form-busqueda" data-testid="form-busqueda">
              <input
                type="text"
                class="campo-busqueda"
                data-testid="campo-busqueda"
                placeholder="${escapar(vertical?.texto_ayuda ?? "Escribe lo que buscas...")}"
                value="${escapar(estado.textoBusqueda)}"
                aria-label="Campo de búsqueda en lenguaje natural"
              />
              <button type="submit" class="btn-buscar" data-testid="btn-buscar">Buscar</button>
            </form>

            <div class="fila-ejemplos">
              <span>Ejemplos:</span>
              ${(EJEMPLOS_POR_DOMINIO[estado.dominioActual] ?? [])
                .map(
                  (ej) => `
                <button type="button" class="btn-ejemplo" data-ejemplo="${escapar(ej)}">${escapar(ej)}</button>
              `,
                )
                .join("")}
            </div>

            <section class="fila-etiquetas" aria-label="Filtros encontrados" data-testid="fila-etiquetas">
              <span class="etiqueta-titulo">Filtros aplicados:</span>
              ${
                filtrosVigentes?.categoria
                  ? `
                <span class="pastilla-filtro" data-testid="etiqueta-categoria">
                  <span>Categoría: ${escapar(nombreCategoria(vertical, filtrosVigentes.categoria))}</span>
                  <button
                    type="button"
                    class="btn-quitar-etiqueta"
                    data-quitar-categoria="1"
                    aria-label="Quitar categoría"
                    title="Quitar categoría"
                  >×</button>
                </span>
              `
                  : ""
              }
              ${(resp?.etiquetas ?? [])
                .map(
                  (et, idx) => `
                <span
                  class="pastilla-filtro ${et.sugerida ? "sugerida" : ""}"
                  data-testid="etiqueta-filtro"
                  title="Origen: ${escapar(et.origen)} · Confianza: ${Math.round(et.confianza * 100)}%"
                >
                  <span>${escapar(formatearEtiqueta(et))}</span>
                  ${et.sugerida ? `<span class="pastilla-meta">(sugerida)</span>` : ""}
                  <button
                    type="button"
                    class="btn-quitar-etiqueta"
                    data-quitar-indice="${idx}"
                    aria-label="Quitar filtro ${escapar(etiquetaAtributo(et.atributo))}"
                  >×</button>
                </span>
              `,
                )
                .join("")}
              ${
                !filtrosVigentes?.categoria && (resp?.etiquetas.length ?? 0) === 0
                  ? `<span class="etiqueta-titulo" data-testid="sin-filtros-activos">Ninguno activo (mostrando vertical completa)</span>`
                  : ""
              }
              <button type="button" class="btn-accion-secundaria" data-testid="btn-abrir-manual">
                ${estado.mostrarPanelManual ? "Cerrar" : "+ Agregar filtro"}
              </button>
              ${
                filtrosVigentes?.categoria || (resp?.etiquetas.length ?? 0) > 0
                  ? `<button type="button" class="btn-accion-secundaria" data-testid="btn-reiniciar">Reiniciar</button>`
                  : ""
              }
            </section>

            ${estado.mostrarPanelManual && entradaManualActual ? renderizarPanelManual(entradasUnicas, entradaManualActual, estado) : ""}

            ${
              resp && resp.descartados.length > 0
                ? `
              <div class="bloque-descartados" role="status" data-testid="bloque-descartados">
                <strong>Filtros no aplicados (Guarda G1):</strong>
                <ul>
                  ${resp.descartados
                    .map((d) => `<li><strong>${escapar(etiquetaAtributo(d.atributo))}</strong>: ${escapar(d.detalle)}</li>`)
                    .join("")}
                </ul>
              </div>
            `
                : ""
            }

            ${
              resp?.aclaracion
                ? `
              <div class="bloque-aclaracion" role="region" aria-label="Aclaración" data-testid="bloque-aclaracion">
                <div><strong>Aclaración requerida:</strong> ${escapar(resp.aclaracion.pregunta)}</div>
                ${
                  resp.aclaracion.opciones.length > 0
                    ? `
                  <div class="opciones-aclaracion">
                    ${resp.aclaracion.opciones
                      .map(
                        (op) => `
                      <button type="button" class="btn-opcion-aclaracion" data-opcion-aclaracion="${escapar(op)}">
                        ${escapar(op)}
                      </button>
                    `,
                      )
                      .join("")}
                  </div>
                `
                    : ""
                }
              </div>
            `
                : ""
            }

            ${
              estado.errorMensaje
                ? `<div class="bloque-descartados" role="alert">${escapar(estado.errorMensaje)}</div>`
                : ""
            }

            <div class="barra-estado">
              <label class="casilla-sin-dato">
                <input
                  type="checkbox"
                  data-testid="casilla-sin-dato"
                  ${filtrosVigentes?.incluir_sin_dato ? "checked" : ""}
                />
                <span>Incluir productos sin dato del filtro (${resp?.faltantes ?? 0})</span>
              </label>
              <div class="resumen-derecha">
                ${
                  resp
                    ? `<span class="insignia-traza" data-testid="insignia-traza">${
                        resp.desde_cache
                          ? "Caché exacta"
                          : resp.llamo_modelo
                            ? "Interpretado por modelo"
                            : "Directo en base (sin modelo)"
                      }</span>`
                    : ""
                }
                <strong data-testid="conteo-productos">${resp?.total ?? 0} productos</strong>
              </div>
            </div>

            <div class="rejilla-contenido">
              <aside class="panel-facetas" aria-label="Facetas" data-testid="panel-facetas">
                <h2>Filtrar por</h2>
                ${
                  vertical && vertical.categorias.length > 0
                    ? `
                  <div class="grupo-faceta">
                    <div class="titulo-faceta">Categoría</div>
                    <ul class="lista-valores-faceta">
                      <li>
                        <button
                          type="button"
                          class="btn-valor-faceta"
                          data-categoria-faceta=""
                        >
                          <span>Todas</span>
                        </button>
                      </li>
                      ${vertical.categorias
                        .map(
                          (c) => `
                        <li>
                          <button
                            type="button"
                            class="btn-valor-faceta"
                            data-categoria-faceta="${escapar(c.categoria)}"
                          >
                            <span>${escapar(c.nombre)}</span>
                          </button>
                        </li>
                      `,
                        )
                        .join("")}
                    </ul>
                  </div>
                `
                    : ""
                }
                ${(resp?.facetas ?? [])
                  .map(
                    (f) => `
                  <div class="grupo-faceta" data-faceta-atributo="${escapar(f.atributo)}">
                    <div class="titulo-faceta">${escapar(etiquetaAtributo(f.atributo))}</div>
                    <ul class="lista-valores-faceta">
                      ${f.valores
                        .map((v) => {
                          const esSinDato = v.valor === "(sin dato)";
                          return `
                            <li>
                              <button
                                type="button"
                                class="btn-valor-faceta ${esSinDato ? "es-sin-dato" : ""}"
                                data-faceta-sel-atributo="${escapar(f.atributo)}"
                                data-faceta-sel-valor="${escapar(v.valor)}"
                              >
                                <span>${escapar(formatearEtiquetaValorFaceta(v.valor))}</span>
                                <span>(${v.productos})</span>
                              </button>
                            </li>
                          `;
                        })
                        .join("")}
                    </ul>
                  </div>
                `,
                  )
                  .join("")}
              </aside>

              <section aria-label="Resultados de búsqueda">
                <div class="lista-resultados" data-testid="lista-resultados">
                  ${
                    resp && resp.resultados.length > 0
                      ? resp.resultados.map((r) => renderizarTarjetaProducto(r, filtrosVigentes)).join("")
                      : `
                    <div class="sin-resultados" data-testid="sin-resultados">
                      <p>No se encontraron productos con las condiciones actuales.</p>
                      ${
                        (resp?.faltantes ?? 0) > 0 && !filtrosVigentes?.incluir_sin_dato
                          ? `<p>Hay <strong>${resp?.faltantes}</strong> productos sin dato en alguno de los filtros; activa la casilla superior para incluirlos.</p>`
                          : ""
                      }
                    </div>
                  `
                  }
                </div>

                ${
                  estado.productoDetalleId !== null && resp
                    ? renderizarPanelDetalle(
                        resp.resultados.find((r) => r.id === estado.productoDetalleId),
                        cliente,
                      )
                    : ""
                }
              </section>
            </div>

            <p class="pie-nota">
              Cada resultado muestra qué filtros cumple y cuáles no pudieron evaluarse por falta de dato
            </p>
          </main>
        </div>
      </div>
    `;

    enlazarEventos();
  }

  function enlazarEventos(): void {
    // Selector de vertical
    contenedor.querySelectorAll<HTMLButtonElement>("[data-dominio]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dom = btn.getAttribute("data-dominio") as Dominio | null;
        if (dom && dom !== estado.dominioActual) {
          void cargarVertical(dom, EJEMPLOS_POR_DOMINIO[dom]?.[0]);
        }
      });
    });

    // Formulario de búsqueda
    const form = contenedor.querySelector<HTMLFormElement>('[data-testid="form-busqueda"]');
    const input = contenedor.querySelector<HTMLInputElement>('[data-testid="campo-busqueda"]');
    form?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (input) void buscarPorTexto(input.value);
    });

    // Botones de ejemplo
    contenedor.querySelectorAll<HTMLButtonElement>("[data-ejemplo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ej = btn.getAttribute("data-ejemplo");
        if (ej) void buscarPorTexto(ej);
      });
    });

    // Quitar categoría
    contenedor.querySelector<HTMLButtonElement>("[data-quitar-categoria]")?.addEventListener("click", () => {
      void ejecutarAccion({ tipo: "categoria", categoria: null });
    });

    // Quitar etiqueta individual (RF-03)
    contenedor.querySelectorAll<HTMLButtonElement>("[data-quitar-indice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-quitar-indice"));
        const et = estado.respuesta?.etiquetas[idx];
        if (et) {
          void ejecutarAccion({
            tipo: "quitar",
            atributo: et.atributo,
            operador: et.operador,
            valor: et.valor,
          });
        }
      });
    });

    // Abrir/cerrar panel manual (RF-10)
    contenedor.querySelector<HTMLButtonElement>('[data-testid="btn-abrir-manual"]')?.addEventListener("click", () => {
      estado.mostrarPanelManual = !estado.mostrarPanelManual;
      renderizar();
    });

    // Reiniciar
    contenedor.querySelector<HTMLButtonElement>('[data-testid="btn-reiniciar"]')?.addEventListener("click", () => {
      void ejecutarAccion({ tipo: "reiniciar" });
    });

    // Controles del panel manual
    const selAtributo = contenedor.querySelector<HTMLSelectElement>('[data-testid="select-atributo-manual"]');
    const selOperador = contenedor.querySelector<HTMLSelectElement>('[data-testid="select-operador-manual"]');
    const inpValor = contenedor.querySelector<HTMLInputElement | HTMLSelectElement>('[data-testid="input-valor-manual"]');
    const btnAplicarManual = contenedor.querySelector<HTMLButtonElement>('[data-testid="btn-aplicar-manual"]');

    selAtributo?.addEventListener("change", () => {
      estado.atributoManual = selAtributo.value;
      if (estado.diccionario) {
        const entrada = obtenerEntradasUnicas(estado.diccionario).find((e) => e.atributo === estado.atributoManual);
        if (entrada) {
          estado.operadorManual = operadorPorOmision(entrada);
          estado.valorManual = valorPorOmision(entrada);
        }
      }
      renderizar();
    });

    selOperador?.addEventListener("change", () => {
      estado.operadorManual = selOperador.value as Operador;
    });

    inpValor?.addEventListener("change", () => {
      estado.valorManual = inpValor.value;
    });

    btnAplicarManual?.addEventListener("click", () => {
      if (!estado.diccionario) return;
      const entrada = obtenerEntradasUnicas(estado.diccionario).find((e) => e.atributo === estado.atributoManual);
      if (!entrada) return;
      const valorActual = inpValor ? inpValor.value : estado.valorManual;
      const valorTipado = convertirValorManual(entrada, valorActual);
      void ejecutarAccion({
        tipo: "agregar",
        filtro: {
          atributo: entrada.atributo,
          operador: estado.operadorManual,
          valor: valorTipado,
        },
      });
    });

    // Opciones de aclaración
    contenedor.querySelectorAll<HTMLButtonElement>("[data-opcion-aclaracion]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const op = btn.getAttribute("data-opcion-aclaracion");
        if (!op || !estado.diccionario) return;
        const dudoso = estado.respuesta?.aclaracion?.filtros_dudosos[0];
        if (dudoso) {
          void ejecutarAccion({
            tipo: "agregar",
            filtro: {
              atributo: dudoso.atributo,
              operador: dudoso.operador,
              valor: op === String(dudoso.valor) ? dudoso.valor : op,
            },
          });
        } else if (estado.diccionario.categorias.includes(op)) {
          void ejecutarAccion({ tipo: "categoria", categoria: op });
        }
      });
    });

    // Casilla incluir sin dato (RF-06)
    const casilla = contenedor.querySelector<HTMLInputElement>('[data-testid="casilla-sin-dato"]');
    casilla?.addEventListener("change", () => {
      void ejecutarAccion({ tipo: "incluir_sin_dato", valor: casilla.checked });
    });

    // Faceta de categoría
    contenedor.querySelectorAll<HTMLButtonElement>("[data-categoria-faceta]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-categoria-faceta") ?? "";
        void ejecutarAccion({ tipo: "categoria", categoria: cat === "" ? null : cat });
      });
    });

    // Valores de faceta (RF-07)
    contenedor.querySelectorAll<HTMLButtonElement>("[data-faceta-sel-atributo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const atributo = btn.getAttribute("data-faceta-sel-atributo");
        const valorTexto = btn.getAttribute("data-faceta-sel-valor");
        if (!atributo || valorTexto === null) return;
        if (valorTexto === "(sin dato)") {
          void ejecutarAccion({ tipo: "incluir_sin_dato", valor: true });
          return;
        }
        const entrada = estado.diccionario
          ? obtenerEntradasUnicas(estado.diccionario).find((e) => e.atributo === atributo)
          : undefined;
        const valor: ValorFiltro =
          entrada?.tipo === "booleano" ? valorTexto === "true" || valorTexto === "sí" : valorTexto;
        void ejecutarAccion({ tipo: "faceta", atributo, valor });
      });
    });

    // Tarjetas de producto → abrir detalle
    contenedor.querySelectorAll<HTMLElement>("[data-producto-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = Number(el.getAttribute("data-producto-id"));
        estado.productoDetalleId = estado.productoDetalleId === id ? null : id;
        renderizar();
      });
    });

    // Cerrar detalle
    contenedor.querySelector<HTMLButtonElement>("[data-cerrar-detalle]")?.addEventListener("click", () => {
      estado.productoDetalleId = null;
      renderizar();
    });
  }

  estado.verticales = await cliente.obtenerVerticales();
  await cargarVertical("belleza", "busco una crema hidratante sin perfume para piel sensible");

  return {
    estado,
    cambiarVertical: (d) => cargarVertical(d, EJEMPLOS_POR_DOMINIO[d]?.[0]),
    buscarPorTexto,
    ejecutarAccion,
  };
}

function renderizarPanelManual(
  entradas: EntradaDiccionario[],
  actual: EntradaDiccionario,
  estado: EstadoVista,
): string {
  const operadores = OPERADORES_POR_TIPO[actual.tipo];
  let controlValor = "";
  if (actual.tipo === "booleano") {
    controlValor = `
      <select data-testid="input-valor-manual" aria-label="Valor del filtro">
        <option value="true" ${estado.valorManual === "true" ? "selected" : ""}>sí</option>
        <option value="false" ${estado.valorManual === "false" ? "selected" : ""}>no</option>
      </select>
    `;
  } else if (actual.tipo === "texto" && actual.valores && actual.valores.length > 0) {
    controlValor = `
      <select data-testid="input-valor-manual" aria-label="Valor del filtro">
        ${actual.valores
          .map(
            (v) => `<option value="${escapar(v)}" ${estado.valorManual === v ? "selected" : ""}>${escapar(v)}</option>`,
          )
          .join("")}
      </select>
    `;
  } else {
    controlValor = `
      <input
        type="number"
        data-testid="input-valor-manual"
        aria-label="Valor numérico del filtro"
        min="${actual.minimo ?? 0}"
        max="${actual.maximo ?? 100000}"
        value="${escapar(estado.valorManual)}"
      />
    `;
  }

  // La cobertura solo se anuncia cuando no todos los productos tienen el dato (P2).
  const nombreOpcion = (e: EntradaDiccionario): string =>
    e.cobertura_pct < 100
      ? `${etiquetaAtributo(e.atributo)} (dato en ${Math.round(e.cobertura_pct)} % de los productos)`
      : etiquetaAtributo(e.atributo);

  return `
    <div class="panel-manual" data-testid="panel-manual">
      <strong>Agregar filtro:</strong>
      <select data-testid="select-atributo-manual" aria-label="Característica">
        ${entradas
          .map(
            (e) => `
          <option value="${escapar(e.atributo)}" ${e.atributo === actual.atributo ? "selected" : ""}>
            ${escapar(nombreOpcion(e))}
          </option>
        `,
          )
          .join("")}
      </select>
      <select data-testid="select-operador-manual" aria-label="Condición">
        ${operadores
          .map(
            (op) =>
              `<option value="${escapar(op)}" ${op === estado.operadorManual ? "selected" : ""}>${escapar(nombreOperador(op))}</option>`,
          )
          .join("")}
      </select>
      ${controlValor}
      <button type="button" class="btn-agregar-manual" data-testid="btn-aplicar-manual">Agregar</button>
    </div>
  `;
}

function renderizarTarjetaProducto(r: Resultado, filtrosVigentes: ObjetoFiltros | null): string {
  const listaCumple = r.cumple.map((attr) => describirAtributoCumplido(attr, filtrosVigentes));
  if (filtrosVigentes?.categoria) {
    listaCumple.push(filtrosVigentes.categoria.replace(/_/g, " "));
  }
  const textoCumple =
    listaCumple.length > 0 ? `Cumple: ${listaCumple.join(" · ")}` : "Cumple: catálogo de la vertical";
  const textoSinDato =
    r.sin_dato.length > 0 ? `Sin dato: ${r.sin_dato.map(etiquetaAtributo).join(" · ").toLowerCase()}` : "";

  return `
    <article class="tarjeta-producto" data-testid="tarjeta-producto" data-producto-id="${r.id}">
      <div class="tarjeta-cabecera">
        <h3 class="tarjeta-nombre">${escapar(r.nombre)}</h3>
        <span class="tarjeta-precio">$${r.precio}</span>
      </div>
      <div class="tarjeta-marca">${escapar(r.marca)}</div>
      <p class="tarjeta-descripcion">${escapar(r.descripcion)}</p>
      <div class="tarjeta-motivos">
        <span class="motivo-cumple" data-testid="motivo-cumple">${escapar(textoCumple)}</span>
        ${textoSinDato ? `<span class="motivo-sin-dato" data-testid="motivo-sin-dato">${escapar(textoSinDato)}</span>` : ""}
      </div>
    </article>
  `;
}

function renderizarPanelDetalle(r: Resultado | undefined, cliente: ClienteCatalogo): string {
  if (!r) return "";
  const completo = cliente.obtenerProductoLocal(r.id);
  const pares = completo ? Object.entries(completo.atributos) : [];

  return `
    <div class="panel-detalle" data-testid="panel-detalle">
      <div class="panel-detalle-cabecera">
        <strong>Detalle del producto #${r.id}: ${escapar(r.nombre)}</strong>
        <button type="button" class="btn-accion-secundaria" data-cerrar-detalle="1">Cerrar</button>
      </div>
      <div>Marca: <strong>${escapar(r.marca)}</strong> · Precio: <strong>$${r.precio}</strong></div>
      <p>${escapar(r.descripcion)}</p>
      ${
        pares.length > 0
          ? `
        <div><strong>Atributos registrados en JSONB:</strong></div>
        <div class="rejilla-atributos">
          ${pares
            .map(
              ([clave, valor]) => `
            <div class="celda-atributo">
              <strong>${escapar(etiquetaAtributo(clave))}:</strong> ${escapar(formatearValor(valor))}
            </div>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }
    </div>
  `;
}

function describirAtributoCumplido(atributo: string, vigente: ObjetoFiltros | null): string {
  const filtro = vigente?.filtros.find((f) => f.atributo === atributo);
  const nombre = etiquetaAtributo(atributo).toLowerCase();
  if (!filtro) return nombre;
  if (typeof filtro.valor === "boolean") {
    const afirmativo = filtro.operador === "<>" ? !filtro.valor : filtro.valor;
    return afirmativo ? nombre : `no ${nombre}`;
  }
  if (filtro.operador === "=") return String(filtro.valor);
  return `${nombre} ${describirCondicion(atributo, filtro.operador, filtro.valor)}`;
}

export function formatearEtiqueta(et: Pick<EtiquetaApi, "atributo" | "operador" | "valor">): string {
  return `${etiquetaAtributo(et.atributo)}: ${describirCondicion(et.atributo, et.operador, et.valor)}`;
}

function formatearEtiquetaValorFaceta(valor: string): string {
  if (valor === "true") return "sí";
  if (valor === "false") return "no";
  return valor;
}

function nombreCategoria(vertical: Vertical | undefined, categoria: string): string {
  const hallada = vertical?.categorias.find((c) => c.categoria === categoria);
  return hallada ? hallada.nombre.toLowerCase() : categoria.replace(/_/g, " ");
}

function obtenerEntradasUnicas(dic: Diccionario): EntradaDiccionario[] {
  const mapa = new Map<string, EntradaDiccionario>();
  for (const e of dic.entradas) {
    if (!mapa.has(e.atributo)) {
      mapa.set(e.atributo, e);
    }
  }
  return [...mapa.values()];
}

// En números lo común es poner un tope ("hasta $300"), no un valor exacto.
function operadorPorOmision(entrada: EntradaDiccionario): Operador {
  if (entrada.tipo === "numero") return "<=";
  return OPERADORES_POR_TIPO[entrada.tipo][0] ?? "=";
}

function valorPorOmision(entrada: EntradaDiccionario): string {
  if (entrada.tipo === "booleano") return "true";
  if (entrada.tipo === "texto") return entrada.valores?.[0] ?? "";
  if (entrada.minimo !== undefined && entrada.maximo !== undefined) {
    return String(Math.round((entrada.minimo + entrada.maximo) / 2));
  }
  return String(entrada.minimo ?? 100);
}

function convertirValorManual(entrada: EntradaDiccionario, valorTexto: string): ValorFiltro {
  if (entrada.tipo === "booleano") return valorTexto === "true";
  if (entrada.tipo === "numero") return Number(valorTexto);
  return valorTexto;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
