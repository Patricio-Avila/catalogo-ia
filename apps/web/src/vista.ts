// Vista principal del cliente web (T5): implementa la maqueta del segundo avance
// (Figura 11 de S6_CPAI_BDE) y las pantallas del tercer avance (detalle,
// aclaración, descartados por G1 y sin resultados).
//
// Disposición (estilos.css): facetas | resultados | ficha del producto. La ficha
// vive en su propia columna fija desde 900 px y en un diálogo a pantalla completa
// por debajo; nunca debajo de la lista. La vista se redibuja con innerHTML, así que
// el foco se guarda por `data-foco` antes de dibujar y se restaura después.

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
  spf: "SPF",
  vegano: "Vegano",
  sin_parabenos: "Sin parabenos",
};

/** Unidad que se agrega a los rangos del diccionario ("de 20,000 a 100,000 km"). */
const UNIDADES: Record<string, string> = {
  concentracion_mg: "mg",
  ancho_mm: "mm",
  perfil_pct: "%",
  rin_pulg: "pulg",
  garantia_km: "km",
  contenido_ml: "ml",
};

/** Números que no se agrupan por miles: un año se lee 2024, no 2,024. */
const SIN_SEPARADOR_MILES = new Set(["anio_fabricacion"]);

/** Columnas fijas del producto: la ficha las muestra arriba, no entre los atributos. */
const COLUMNAS_FIJAS = new Set(["precio", "marca"]);

/**
 * Verticales que muestra la demo, en este orden; la primera es la de inicio.
 * Llantas sigue en la base, la API y la evaluación, solo no se ofrece en la web.
 * Para volver a mostrarla basta con agregarla aquí.
 */
export const VERTICALES_VISIBLES: readonly Dominio[] = ["belleza", "farmacia"];

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

/** Texto del campo cuando ya hay filtros: un mensaje nuevo los modifica (RF-04). */
const PISTA_REFINAR: Record<Dominio, string> = {
  belleza: "Agrega algo más: solo veganos",
  farmacia: "Agrega algo más: en tabletas",
  llantas: "Agrega algo más: con run flat",
};

const FORMATO_PRECIO = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** Precio en pesos con dos decimales: $1,234.50. */
export function formatearPrecio(valor: number): string {
  return FORMATO_PRECIO.format(valor);
}

export function etiquetaAtributo(atributo: string): string {
  const conocido = NOMBRES_ATRIBUTOS[atributo];
  if (conocido) return conocido;
  const texto = atributo.replace(/_/g, " ").trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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

// Forma de frase, para preguntas y avisos: "Precio menor a $150.00".
const OPERADORES_FRASE: Record<Operador, string> = {
  "=": "",
  "<>": "distinto de",
  "<": "menor a",
  "<=": "hasta",
  ">": "mayor a",
  ">=": "desde",
};

export function nombreOperador(operador: Operador): string {
  return NOMBRES_OPERADORES[operador];
}

/** Valor tal como lo lee el usuario: sí/no, precio con signo de pesos, miles separados. */
export function formatearValorAtributo(atributo: string, valor: ValorFiltro | unknown): string {
  if (typeof valor === "number") {
    if (SIN_SEPARADOR_MILES.has(atributo)) return String(valor);
    const numero = valor.toLocaleString("es-MX");
    return atributo === "precio" ? `$${numero}` : numero;
  }
  return formatearValor(valor);
}

/** Rango numérico del diccionario: "de $50.00 a $1,000.00", "de 20,000 a 100,000 km". */
export function formatearRango(atributo: string, minimo: number, maximo: number): string {
  if (atributo === "precio") return `de ${formatearPrecio(minimo)} a ${formatearPrecio(maximo)}`;
  const unidad = UNIDADES[atributo];
  const desde = formatearValorAtributo(atributo, minimo);
  const hasta = formatearValorAtributo(atributo, maximo);
  return `de ${desde} a ${hasta}${unidad ? ` ${unidad}` : ""}`;
}

/** Condición de un filtro en palabras, sin el nombre del atributo: "sin perfume", "no es floral", "hasta $300". */
export function describirCondicion(atributo: string, operador: Operador, valor: ValorFiltro): string {
  if (typeof valor === "boolean") {
    return formatearValor(operador === "<>" ? !valor : valor);
  }
  const texto = formatearValorAtributo(atributo, valor);
  return operador === "=" ? texto : `${nombreOperador(operador)} ${texto}`;
}

/** Filtro completo como frase: "Precio menor a $150.00", "Tipo de piel: sensible". */
export function describirFiltroEnFrase(filtro: { atributo: string; operador: Operador; valor: ValorFiltro }): string {
  const nombre = etiquetaAtributo(filtro.atributo);
  if (typeof filtro.valor === "boolean") {
    return `${nombre}: ${formatearValor(filtro.operador === "<>" ? !filtro.valor : filtro.valor)}`;
  }
  const valor =
    filtro.atributo === "precio" && typeof filtro.valor === "number"
      ? formatearPrecio(filtro.valor)
      : formatearValorAtributo(filtro.atributo, filtro.valor);
  return filtro.operador === "=" ? `${nombre}: ${valor}` : `${nombre} ${OPERADORES_FRASE[filtro.operador]} ${valor}`;
}

/** Anuncio de la región viva tras cada búsqueda: "4 productos cumplen, 2 sin dato". */
export function textoAnuncio(resp: RespuestaBuscar): string {
  if (resp.sin_consultar) {
    return resp.aclaracion ? "Se necesita una aclaración antes de buscar" : "No se consultó el catálogo";
  }
  const total = resp.total.toLocaleString("es-MX");
  const cumplen = resp.total === 1 ? "1 producto cumple" : `${total} productos cumplen`;
  return `${cumplen}, ${resp.faltantes.toLocaleString("es-MX")} sin dato`;
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
  /** Producto con la ficha abierta; se conserva mientras siga en los resultados. */
  productoDetalleId: number | null;
  cargando: boolean;
  /** Texto del estado de carga: "Buscando…" o "Cargando la vertical…". */
  mensajeCarga: string;
  errorMensaje: string | null;
  /** Último texto de la región viva. */
  anuncio: string;
  /** Facetas desplegadas por el usuario cuando la pantalla mide menos de 1200 px. */
  facetasAbiertas: boolean;
}

export interface ControladorVista {
  readonly estado: EstadoVista;
  cambiarVertical(dominio: Dominio): Promise<void>;
  buscarPorTexto(texto: string): Promise<void>;
  ejecutarAccion(accion: Accion): Promise<void>;
  /** Abre la ficha del producto (o la cierra con null). */
  seleccionarProducto(id: number | null): void;
}

interface Contexto {
  estado: EstadoVista;
  vertical: Vertical | undefined;
  filtros: ObjetoFiltros | null;
  /** Menos de 900 px: la ficha se abre como diálogo. */
  movil: boolean;
  /** 1200 px o más: facetas en columna, siempre desplegadas. */
  ancho: boolean;
  modo: ClienteCatalogo["modo"];
}

type AclaracionApi = NonNullable<RespuestaBuscar["aclaracion"]>;
type FiltroDudoso = AclaracionApi["filtros_dudosos"][number];
type DescartadoApi = RespuestaBuscar["descartados"][number];

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
    mensajeCarga: "Cargando la vertical…",
    errorMensaje: null,
    anuncio: "",
    facetasAbiertas: false,
  };

  // Al cruzar 900 px la ficha pasa de columna a diálogo; al cruzar 1200 px, las facetas se pliegan.
  const consultaMovil = crearConsulta("(max-width: 899.98px)");
  const consultaAncha = crearConsulta("(min-width: 1200px)");
  for (const consulta of [consultaMovil, consultaAncha]) {
    if (typeof consulta?.addEventListener === "function") consulta.addEventListener("change", () => renderizar());
  }

  const regionViva = crearRegionViva(contenedor);
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", manejarEscape);
  }

  // Cada consulta lleva un turno: una respuesta vieja (de otra vertical o de una
  // búsqueda que ya se reemplazó) se descarta en lugar de pintarse.
  let turno = 0;

  async function cargarVertical(dominio: Dominio): Promise<void> {
    if (!estado.verticales.some((v) => v.dominio === dominio)) return;
    const mio = ++turno;
    estado.dominioActual = dominio;
    estado.diccionario = null;
    estado.respuesta = null;
    estado.productoDetalleId = null;
    estado.textoBusqueda = "";
    estado.errorMensaje = null;
    estado.cargando = true;
    estado.mensajeCarga = "Cargando la vertical…";
    estado.anuncio = "";
    renderizar();

    // Sin búsqueda automática: la vertical abre con una invitación y ejemplos.
    try {
      const dic = await cliente.obtenerDiccionario(dominio);
      if (dominio !== estado.dominioActual) return;
      estado.diccionario = dic;
      inicializarSelectorManual(dic);
    } catch (err) {
      if (dominio !== estado.dominioActual) return;
      estado.errorMensaje = err instanceof Error ? err.message : "No fue posible cargar el catálogo";
    } finally {
      if (dominio === estado.dominioActual) {
        if (mio === turno) estado.cargando = false;
        renderizar();
      }
    }
  }

  function inicializarSelectorManual(dic: Diccionario): void {
    const primera = obtenerEntradasUnicas(dic)[0];
    if (!primera) return;
    estado.atributoManual = primera.atributo;
    estado.operadorManual = operadorPorOmision(primera);
    estado.valorManual = valorPorOmision(primera);
  }

  async function consultar(
    parte: { texto: string } | { accion: Accion },
    mensajeError: string,
    alAplicar?: (r: RespuestaBuscar) => void,
  ): Promise<void> {
    const mio = ++turno;
    const dominio = estado.dominioActual;
    estado.cargando = true;
    estado.mensajeCarga = "Buscando…";
    estado.errorMensaje = null;
    renderizar();

    try {
      const vigentes: ObjetoFiltros | null = estado.respuesta?.filtros ?? null;
      const respuesta = await cliente.buscar({ dominio, ...parte, filtros_vigentes: vigentes });
      if (mio !== turno) return;
      estado.respuesta = respuesta;
      // La ficha se conserva si el producto sigue en los resultados.
      if (estado.productoDetalleId !== null && !respuesta.resultados.some((r) => r.id === estado.productoDetalleId)) {
        estado.productoDetalleId = null;
      }
      alAplicar?.(respuesta);
      anunciar(textoAnuncio(respuesta));
    } catch (err) {
      if (mio !== turno) return;
      estado.errorMensaje = err instanceof Error ? err.message : mensajeError;
    } finally {
      if (mio === turno) {
        estado.cargando = false;
        renderizar();
      }
    }
  }

  async function buscarPorTexto(texto: string): Promise<void> {
    const limpio = texto.trim();
    if (!limpio) return;
    estado.textoBusqueda = limpio;
    await consultar({ texto: limpio }, "No fue posible procesar la búsqueda", (r) => {
      // Las etiquetas son el estado: el campo se vacía para el siguiente mensaje (RF-04).
      if (!r.sin_consultar) estado.textoBusqueda = "";
    });
  }

  async function ejecutarAccion(accion: Accion): Promise<void> {
    await consultar({ accion }, "No fue posible actualizar los filtros", () => {
      if (accion.tipo === "reiniciar") estado.textoBusqueda = "";
    });
  }

  function seleccionarProducto(id: number | null): void {
    if (id === null) {
      cerrarFicha();
      return;
    }
    estado.productoDetalleId = id;
    renderizar("ficha-titulo");
  }

  function cerrarFicha(): void {
    const id = estado.productoDetalleId;
    if (id === null) return;
    estado.productoDetalleId = null;
    renderizar(`tarjeta-${id}`, true);
  }

  function anunciar(texto: string): void {
    estado.anuncio = texto;
    const region = regionViva;
    if (!region) return;
    // Vaciar y volver a escribir hace que el lector anuncie aunque el texto se repita.
    region.textContent = "";
    setTimeout(() => {
      if (estado.anuncio === texto) region.textContent = texto;
    }, 150);
  }

  function manejarEscape(ev: KeyboardEvent): void {
    if (ev.key !== "Escape" || estado.productoDetalleId === null || ev.defaultPrevented) return;
    const objetivo = ev.target instanceof Element ? ev.target : null;
    if (objetivo?.matches("input, select, textarea")) return;
    // El diálogo modal ya cierra con Esc mediante su evento cancel.
    const dialogo = objetivo?.closest("dialog");
    if (dialogo && typeof (dialogo as HTMLDialogElement).showModal === "function") return;
    ev.preventDefault();
    cerrarFicha();
  }

  function claveFocoActual(): string | null {
    if (typeof document === "undefined") return null;
    const activo = document.activeElement;
    if (!activo || activo === document.body || !contenedor.contains(activo)) return null;
    return activo.getAttribute("data-foco");
  }

  function enfocar(clave: string, desplazar: boolean): void {
    const destino = Array.from(contenedor.querySelectorAll<HTMLElement>("[data-foco]")).find(
      (el) => el.getAttribute("data-foco") === clave,
    );
    if (!destino) return;
    destino.focus({ preventScroll: !desplazar });
    if (destino instanceof HTMLInputElement && destino.type === "text") {
      const fin = destino.value.length;
      destino.setSelectionRange(fin, fin);
    }
  }

  function mostrarDialogo(): void {
    const dialogo = contenedor.querySelector<HTMLDialogElement>('[data-testid="dialogo-ficha"]');
    if (!dialogo) return;
    dialogo.addEventListener("cancel", (ev) => {
      ev.preventDefault();
      cerrarFicha();
    });
    if (typeof dialogo.showModal === "function") {
      if (!dialogo.open) dialogo.showModal();
    } else {
      dialogo.setAttribute("open", "");
    }
  }

  function renderizar(focoDestino?: string, desplazar = false): void {
    const clave = focoDestino ?? claveFocoActual();
    const ctx: Contexto = {
      estado,
      vertical: estado.verticales.find((v) => v.dominio === estado.dominioActual),
      filtros: estado.respuesta?.filtros ?? null,
      movil: consultaMovil?.matches ?? false,
      ancho: consultaAncha?.matches ?? false,
      modo: cliente.modo,
    };
    contenedor.innerHTML = plantillaApp(ctx);
    enlazarEventos();
    mostrarDialogo();
    if (clave) enfocar(clave, desplazar);
  }

  function enlazarEventos(): void {
    // Selector de vertical: limpia la selección y no busca nada por su cuenta.
    contenedor.querySelectorAll<HTMLButtonElement>("[data-dominio]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dom = btn.getAttribute("data-dominio") as Dominio | null;
        if (dom && dom !== estado.dominioActual) {
          void cargarVertical(dom);
        }
      });
    });

    // Formulario de búsqueda
    const form = contenedor.querySelector<HTMLFormElement>('[data-testid="form-busqueda"]');
    const input = contenedor.querySelector<HTMLInputElement>('[data-testid="campo-busqueda"]');
    input?.addEventListener("input", () => {
      estado.textoBusqueda = input.value;
    });
    form?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (input) void buscarPorTexto(input.value);
    });

    // Botones de ejemplo (fila compacta e invitación)
    contenedor.querySelectorAll<HTMLButtonElement>("[data-ejemplo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ej = btn.getAttribute("data-ejemplo");
        if (ej) void buscarPorTexto(ej);
      });
    });

    // Ver todo el catálogo de la vertical, sin modelo
    contenedor.querySelector<HTMLButtonElement>('[data-testid="btn-ver-todo"]')?.addEventListener("click", () => {
      void ejecutarAccion({ tipo: "reiniciar" });
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
        if (op === null || !estado.diccionario) return;
        const dudoso = estado.respuesta?.aclaracion?.filtros_dudosos[0];
        if (dudoso) {
          void ejecutarAccion({
            tipo: "agregar",
            filtro: { atributo: dudoso.atributo, operador: dudoso.operador, valor: valorDeOpcion(op, dudoso) },
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

    // Facetas plegables: se recuerda si el usuario las abrió (solo bajo 1200 px)
    const plegables = contenedor.querySelector<HTMLDetailsElement>('[data-testid="facetas-plegables"]');
    plegables?.addEventListener("toggle", () => {
      if (!(consultaAncha?.matches ?? false)) estado.facetasAbiertas = plegables.open;
    });

    // Faceta de categoría
    contenedor.querySelectorAll<HTMLButtonElement>("[data-categoria-faceta]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-categoria-faceta") ?? "";
        void ejecutarAccion({ tipo: "categoria", categoria: cat === "" ? null : cat });
      });
    });

    // Valores de faceta (RF-07): un valor elegido se vuelve a tocar para quitarlo
    contenedor.querySelectorAll<HTMLButtonElement>("[data-faceta-sel-atributo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const atributo = btn.getAttribute("data-faceta-sel-atributo");
        const valorTexto = btn.getAttribute("data-faceta-sel-valor");
        if (!atributo || valorTexto === null) return;
        const presionado = btn.getAttribute("aria-pressed") === "true";
        if (valorTexto === "(sin dato)") {
          void ejecutarAccion({ tipo: "incluir_sin_dato", valor: !presionado });
          return;
        }
        if (presionado) {
          const vigente = filtroDeFaceta(estado.respuesta?.filtros ?? null, atributo, valorTexto);
          if (vigente) {
            void ejecutarAccion({ tipo: "quitar", ...vigente });
            return;
          }
        }
        const entrada = estado.diccionario
          ? obtenerEntradasUnicas(estado.diccionario).find((e) => e.atributo === atributo)
          : undefined;
        const valor: ValorFiltro =
          entrada?.tipo === "booleano" ? valorTexto === "true" || valorTexto === "sí" : valorTexto;
        void ejecutarAccion({ tipo: "faceta", atributo, valor });
      });
    });

    // Tarjetas: abrir la ficha; tocar otra vez la misma la cierra
    contenedor.querySelectorAll<HTMLButtonElement>("[data-abrir-detalle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-abrir-detalle"));
        if (estado.productoDetalleId === id) cerrarFicha();
        else seleccionarProducto(id);
      });
    });

    // Cerrar ficha (× en columna, "← Resultados" en diálogo)
    contenedor.querySelector<HTMLButtonElement>("[data-cerrar-detalle]")?.addEventListener("click", () => {
      cerrarFicha();
    });
  }

  const todas = await cliente.obtenerVerticales();
  estado.verticales = VERTICALES_VISIBLES.flatMap((d) => todas.filter((v) => v.dominio === d));
  await cargarVertical(estado.verticales[0]?.dominio ?? "belleza");

  return {
    estado,
    cambiarVertical: (d) => cargarVertical(d),
    buscarPorTexto,
    ejecutarAccion,
    seleccionarProducto,
  };
}

function crearConsulta(consulta: string): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(consulta);
}

/**
 * La región viva vive fuera del árbol que se redibuja: si se recreara con cada
 * innerHTML, los lectores de pantalla no anunciarían el cambio.
 */
function crearRegionViva(contenedor: HTMLElement): HTMLElement | null {
  if (typeof document === "undefined" || typeof contenedor.insertAdjacentElement !== "function") return null;
  const region = document.createElement("div");
  region.className = "solo-lectores";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("data-testid", "anuncio-resultados");
  contenedor.insertAdjacentElement("afterend", region);
  return region;
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

function plantillaApp(ctx: Contexto): string {
  const { estado, vertical } = ctx;
  const resp = estado.respuesta;
  const seleccionado =
    resp && estado.productoDetalleId !== null
      ? resp.resultados.find((r) => r.id === estado.productoDetalleId)
      : undefined;

  return `
    <div class="contenedor-principal">
      <div class="marco-app">
        ${plantillaCabecera(ctx)}

        <main class="cuerpo-app">
          ${
            vertical?.aviso
              ? `<div class="aviso-vertical" role="note" data-testid="aviso-vertical">${escapar(vertical.aviso)}</div>`
              : ""
          }

          ${plantillaFormulario(ctx)}
          ${plantillaEtiquetas(ctx)}
          ${estado.mostrarPanelManual ? plantillaPanelManual(estado) : ""}
          ${resp && resp.descartados.length > 0 ? plantillaDescartados(resp.descartados, estado.diccionario) : ""}
          ${resp?.aclaracion ? plantillaAclaracion(resp.aclaracion, vertical) : ""}
          ${
            estado.errorMensaje
              ? `<div class="bloque-descartados" role="alert">${escapar(estado.errorMensaje)}</div>`
              : ""
          }
          ${resp ? plantillaBarraEstado(resp) : ""}

          <div class="rejilla-contenido">
            ${plantillaFacetas(ctx)}
            ${plantillaResultados(ctx)}
            <aside class="columna-detalle" id="columna-detalle" aria-label="Ficha del producto" data-testid="columna-detalle">
              ${seleccionado && !ctx.movil ? plantillaFicha(seleccionado, ctx, "columna") : plantillaDetalleVacio()}
            </aside>
          </div>

          <p class="pie-nota">
            Cada resultado muestra qué filtros cumple y cuáles no pudieron evaluarse por falta de dato
          </p>
        </main>
      </div>
    </div>
    ${
      seleccionado && ctx.movil
        ? `<dialog class="dialogo-ficha" id="ficha-producto" data-testid="dialogo-ficha" aria-labelledby="ficha-titulo">${plantillaFicha(seleccionado, ctx, "dialogo")}</dialog>`
        : ""
    }
  `;
}

function plantillaCabecera(ctx: Contexto): string {
  const { estado } = ctx;
  return `
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
              data-foco="vertical-${escapar(v.dominio)}"
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
            ctx.modo === "remoto"
              ? "Consultas a la API publicada"
              : "Sin API configurada: catálogo de prueba e intérprete local en el navegador, sin base de datos ni modelo de lenguaje"
          }"
        >
          ${ctx.modo === "remoto" ? "API conectada" : "Modo demo local"}
        </span>
      </div>
    </header>
  `;
}

function plantillaFormulario(ctx: Contexto): string {
  const { estado, vertical, filtros } = ctx;
  const resp = estado.respuesta;
  const hayFiltros = Boolean(filtros?.categoria) || (resp?.etiquetas.length ?? 0) > 0;
  const placeholder = hayFiltros
    ? PISTA_REFINAR[estado.dominioActual]
    : (vertical?.texto_ayuda ?? "Escribe lo que buscas...");
  const ejemplos = EJEMPLOS_POR_DOMINIO[estado.dominioActual] ?? [];

  return `
    <form class="form-busqueda" data-testid="form-busqueda" role="search">
      <input
        type="text"
        class="campo-busqueda"
        data-testid="campo-busqueda"
        data-foco="campo-busqueda"
        placeholder="${escapar(placeholder)}"
        value="${escapar(estado.textoBusqueda)}"
        aria-label="Campo de búsqueda en lenguaje natural"
        autocomplete="off"
        enterkeyhint="search"
      />
      <button type="submit" class="btn-buscar" data-testid="btn-buscar" data-foco="btn-buscar">Buscar</button>
    </form>

    ${
      resp
        ? `
      <div class="fila-ejemplos">
        <span>Ejemplos:</span>
        ${ejemplos
          .map(
            (ej, i) => `
          <button type="button" class="btn-ejemplo" data-ejemplo="${escapar(ej)}" data-foco="ejemplo-${i}">${escapar(ej)}</button>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }
  `;
}

function plantillaEtiquetas(ctx: Contexto): string {
  const { estado, vertical, filtros } = ctx;
  const resp = estado.respuesta;
  const hayFiltros = Boolean(filtros?.categoria) || (resp?.etiquetas.length ?? 0) > 0;

  return `
    <section class="fila-etiquetas" aria-label="Filtros encontrados" data-testid="fila-etiquetas">
      <span class="etiqueta-titulo">Filtros aplicados:</span>
      ${
        filtros?.categoria
          ? `
        <span class="pastilla-filtro" data-testid="etiqueta-categoria">
          <span>Categoría: ${escapar(nombreCategoria(vertical, filtros.categoria))}</span>
          <button
            type="button"
            class="btn-quitar-etiqueta"
            data-quitar-categoria="1"
            data-foco="quitar-categoria"
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
            data-foco="quitar-${idx}"
            aria-label="Quitar filtro ${escapar(etiquetaAtributo(et.atributo))}"
          >×</button>
        </span>
      `,
        )
        .join("")}
      ${
        !hayFiltros
          ? `<span class="etiqueta-titulo" data-testid="sin-filtros-activos">${
              resp ? "Ninguno activo (mostrando vertical completa)" : "Ninguno activo"
            }</span>`
          : ""
      }
      <button
        type="button"
        class="btn-accion-secundaria"
        data-testid="btn-abrir-manual"
        data-foco="abrir-manual"
        aria-expanded="${estado.mostrarPanelManual}"
        aria-controls="panel-manual"
      >
        ${estado.mostrarPanelManual ? "Cerrar panel de filtro" : "+ Agregar filtro"}
      </button>
      ${
        hayFiltros
          ? `<button type="button" class="btn-accion-secundaria" data-testid="btn-reiniciar" data-foco="reiniciar">Reiniciar</button>`
          : ""
      }
    </section>
  `;
}

function plantillaPanelManual(estado: EstadoVista): string {
  if (!estado.diccionario) return "";
  const entradas = obtenerEntradasUnicas(estado.diccionario);
  const actual = entradas.find((e) => e.atributo === estado.atributoManual) ?? entradas[0];
  if (!actual) return "";

  const operadores = OPERADORES_POR_TIPO[actual.tipo];
  let controlValor = "";
  if (actual.tipo === "booleano") {
    controlValor = `
      <select data-testid="input-valor-manual" data-foco="manual-valor" aria-label="Valor del filtro">
        <option value="true" ${estado.valorManual === "true" ? "selected" : ""}>sí</option>
        <option value="false" ${estado.valorManual === "false" ? "selected" : ""}>no</option>
      </select>
    `;
  } else if (actual.tipo === "texto" && actual.valores && actual.valores.length > 0) {
    controlValor = `
      <select data-testid="input-valor-manual" data-foco="manual-valor" aria-label="Valor del filtro">
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
        data-foco="manual-valor"
        aria-label="Valor numérico del filtro"
        min="${actual.minimo ?? 0}"
        max="${actual.maximo ?? 100000}"
        value="${escapar(estado.valorManual)}"
      />
    `;
  }

  const rango = actual.tipo === "numero" ? rangoDe(estado.diccionario, actual.atributo) : null;
  const pistaRango = rango
    ? `<span class="pista-rango" data-testid="pista-rango">En el catálogo: ${escapar(formatearRango(actual.atributo, rango.minimo, rango.maximo))}</span>`
    : "";

  // La cobertura solo se anuncia cuando no todos los productos tienen el dato (P2).
  const nombreOpcion = (e: EntradaDiccionario): string =>
    e.cobertura_pct < 100
      ? `${etiquetaAtributo(e.atributo)} (dato en ${Math.round(e.cobertura_pct)} % de los productos)`
      : etiquetaAtributo(e.atributo);

  return `
    <div class="panel-manual" id="panel-manual" role="group" aria-label="Agregar filtro" data-testid="panel-manual">
      <strong>Agregar filtro:</strong>
      <select data-testid="select-atributo-manual" data-foco="manual-atributo" aria-label="Característica">
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
      <select data-testid="select-operador-manual" data-foco="manual-operador" aria-label="Condición">
        ${operadores
          .map(
            (op) =>
              `<option value="${escapar(op)}" ${op === estado.operadorManual ? "selected" : ""}>${escapar(nombreOperador(op))}</option>`,
          )
          .join("")}
      </select>
      ${controlValor}
      <button type="button" class="btn-agregar-manual" data-testid="btn-aplicar-manual" data-foco="manual-aplicar">Agregar</button>
      ${pistaRango}
    </div>
  `;
}

/** Motivo de descarte en palabras del usuario, sin jerga interna (G1, RF-02). */
function motivoDescarte(d: DescartadoApi, diccionario: Diccionario | null): string {
  switch (d.motivo) {
    case "dominio_no_coincide":
      return "Pertenece a otra vertical";
    case "categoria_no_pertenece":
      return "Esa categoría no existe en esta vertical";
    case "atributo_desconocido":
      return "Esa característica no existe en este catálogo";
    case "atributo_no_inferible":
      return "Es un dato de contexto: solo puedes fijarlo tú con “+ Agregar filtro”";
    case "operador_desconocido":
      return "No se entendió la condición";
    case "operador_incompatible":
      return "Esa condición no aplica a esta característica";
    case "valor_no_convertible":
      return "No se pudo leer el valor";
    case "valor_fuera_de_dominio": {
      const valores = diccionario
        ? [...new Set(diccionario.entradas.filter((e) => e.atributo === d.atributo).flatMap((e) => e.valores ?? []))]
        : [];
      return valores.length > 0
        ? `Ese valor no existe en el catálogo; valores disponibles: ${valores.join(", ")}`
        : "Ese valor no existe en el catálogo";
    }
    case "valor_fuera_de_rango": {
      const rango = diccionario ? rangoDe(diccionario, d.atributo) : null;
      return rango
        ? `Está fuera de lo que hay en el catálogo (${formatearRango(d.atributo, rango.minimo, rango.maximo)})`
        : "Está fuera de lo que hay en el catálogo";
    }
    case "duplicado":
      return "Ya estaba aplicado";
  }
}

function descripcionDescartado(d: DescartadoApi): string {
  const nombre = d.atributo === "categoria" ? "Categoría" : d.atributo === "dominio" ? "Vertical" : etiquetaAtributo(d.atributo);
  const valor = d.valor;
  if (typeof valor !== "string" && typeof valor !== "number" && typeof valor !== "boolean") return nombre;
  const operador = d.operador && d.operador in NOMBRES_OPERADORES ? (d.operador as Operador) : "=";
  return `${nombre} (${describirCondicion(d.atributo, operador, valor)})`;
}

function plantillaDescartados(descartados: DescartadoApi[], diccionario: Diccionario | null): string {
  return `
    <div class="bloque-descartados" role="status" data-testid="bloque-descartados">
      <strong>Algunos filtros no se aplicaron</strong>
      <ul>
        ${descartados
          .map(
            (d) =>
              `<li data-testid="descartado">No se aplicó: <strong>${escapar(descripcionDescartado(d))}</strong>. ${escapar(motivoDescarte(d, diccionario))}.</li>`,
          )
          .join("")}
      </ul>
    </div>
  `;
}

function valorDeOpcion(opcion: string, dudoso: FiltroDudoso): ValorFiltro {
  if (opcion === String(dudoso.valor)) return dudoso.valor;
  if (typeof dudoso.valor === "number" && opcion.trim() !== "" && Number.isFinite(Number(opcion))) {
    return Number(opcion);
  }
  return opcion;
}

function minusculaInicial(texto: string): string {
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ ]/.test(texto) ? texto.charAt(0).toLowerCase() + texto.slice(1) : texto;
}

function plantillaAclaracion(aclaracion: AclaracionApi, vertical: Vertical | undefined): string {
  const dudoso = aclaracion.filtros_dudosos[0];
  // Con un filtro dudoso la pregunta se arma aquí, en palabras: "¿Te refieres a precio menor a $150.00?"
  const pregunta = dudoso
    ? `${
        dudoso.fragmento
          ? `No estoy seguro de qué quisiste decir con “${dudoso.fragmento}”.`
          : "No estoy seguro de lo que pediste."
      } ¿Te refieres a ${minusculaInicial(describirFiltroEnFrase(dudoso))}?`
    : aclaracion.pregunta;
  const textoOpcion = (op: string): string =>
    dudoso
      ? describirFiltroEnFrase({ atributo: dudoso.atributo, operador: dudoso.operador, valor: valorDeOpcion(op, dudoso) })
      : nombreCategoriaVisible(vertical, op);

  return `
    <div class="bloque-aclaracion" role="region" aria-label="Aclaración" data-testid="bloque-aclaracion">
      <p class="aclaracion-pregunta"><strong>Aclaración:</strong> ${escapar(pregunta)}</p>
      ${
        aclaracion.opciones.length > 0
          ? `
        <div class="opciones-aclaracion">
          ${aclaracion.opciones
            .map(
              (op, i) => `
            <button type="button" class="btn-opcion-aclaracion" data-opcion-aclaracion="${escapar(op)}" data-foco="aclaracion-${i}">
              ${escapar(textoOpcion(op))}
            </button>
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

function plantillaBarraEstado(resp: RespuestaBuscar): string {
  return `
    <div class="barra-estado">
      <label class="casilla-sin-dato">
        <input
          type="checkbox"
          data-testid="casilla-sin-dato"
          data-foco="casilla-sin-dato"
          ${resp.filtros.incluir_sin_dato ? "checked" : ""}
        />
        <span>Incluir productos sin dato del filtro (${resp.faltantes})</span>
      </label>
      <div class="resumen-derecha">
        <span class="insignia-traza" data-testid="insignia-traza">${
          resp.desde_cache ? "Caché exacta" : resp.llamo_modelo ? "Interpretado por modelo" : "Directo en base (sin modelo)"
        }</span>
        <strong data-testid="conteo-productos">${resp.total} ${resp.total === 1 ? "producto" : "productos"}</strong>
      </div>
    </div>
  `;
}

function plantillaFacetas(ctx: Contexto): string {
  const { estado, vertical, filtros } = ctx;
  const resp = estado.respuesta;
  const abiertas = ctx.ancho || estado.facetasAbiertas;
  const categoriaActual = filtros?.categoria ?? null;

  return `
    <details class="zona-facetas" data-testid="facetas-plegables"${abiertas ? " open" : ""}>
      <summary class="resumen-facetas" data-foco="resumen-facetas">Facetas</summary>
      <aside class="panel-facetas" aria-label="Facetas" data-testid="panel-facetas">
        <h2 class="titulo-panel-facetas">Filtrar por</h2>
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
                  data-foco="categoria-todas"
                  aria-pressed="${categoriaActual === null}"
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
                    data-foco="categoria-${escapar(c.categoria)}"
                    aria-pressed="${categoriaActual === c.categoria}"
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
                  const presionado = esSinDato
                    ? Boolean(filtros?.incluir_sin_dato)
                    : filtroDeFaceta(filtros, f.atributo, v.valor) !== undefined;
                  return `
                    <li>
                      <button
                        type="button"
                        class="btn-valor-faceta ${esSinDato ? "es-sin-dato" : ""}"
                        data-faceta-sel-atributo="${escapar(f.atributo)}"
                        data-faceta-sel-valor="${escapar(v.valor)}"
                        data-foco="faceta-${escapar(f.atributo)}-${escapar(v.valor)}"
                        aria-pressed="${presionado}"
                      >
                        <span>${escapar(formatearEtiquetaValorFaceta(f.atributo, v.valor))}</span>
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
    </details>
  `;
}

function plantillaResultados(ctx: Contexto): string {
  const { estado } = ctx;
  const resp = estado.respuesta;
  let contenido = "";
  if (resp && resp.resultados.length > 0) {
    contenido = resp.resultados.map((r) => plantillaTarjeta(r, ctx)).join("");
  } else if (!resp) {
    contenido = plantillaInvitacion(ctx);
  } else if (estado.cargando) {
    contenido = "";
  } else if (resp.sin_consultar) {
    contenido = `
      <div class="sin-resultados" data-testid="sin-consultar">
        <p>Todavía no se consultó el catálogo: responde la aclaración o escribe tu búsqueda de otra forma.</p>
      </div>
    `;
  } else {
    contenido = `
      <div class="sin-resultados" data-testid="sin-resultados">
        <p>No se encontraron productos con las condiciones actuales.</p>
        ${
          resp.faltantes > 0 && !resp.filtros.incluir_sin_dato
            ? `<p>Hay <strong>${resp.faltantes}</strong> productos sin dato en alguno de los filtros; activa la casilla superior para incluirlos.</p>`
            : ""
        }
      </div>
    `;
  }

  return `
    <section class="columna-resultados" aria-label="Resultados de búsqueda" aria-busy="${estado.cargando}" data-testid="region-resultados">
      ${
        estado.cargando
          ? `<p class="estado-carga" role="status" data-testid="estado-cargando"><span class="indicador-carga" aria-hidden="true"></span>${escapar(estado.mensajeCarga)}</p>`
          : ""
      }
      <div class="lista-resultados${estado.cargando ? " atenuada" : ""}" data-testid="lista-resultados">${contenido.trim()}</div>
    </section>
  `;
}

function plantillaInvitacion(ctx: Contexto): string {
  const ejemplos = EJEMPLOS_POR_DOMINIO[ctx.estado.dominioActual] ?? [];
  const nombre = ctx.vertical?.nombre ?? "el catálogo";
  return `
    <div class="invitacion" data-testid="invitacion">
      <h2 class="invitacion-titulo">¿Qué buscas en ${escapar(nombre)}?</h2>
      <p>Escríbelo con tus palabras o empieza con un ejemplo:</p>
      <ul class="invitacion-ejemplos">
        ${ejemplos
          .map(
            (ej, i) =>
              `<li><button type="button" class="btn-ejemplo" data-ejemplo="${escapar(ej)}" data-foco="ejemplo-${i}">${escapar(ej)}</button></li>`,
          )
          .join("")}
      </ul>
      <p class="invitacion-alterna">
        También puedes elegir una categoría, agregar un filtro manual o
        <button type="button" class="btn-enlace" data-testid="btn-ver-todo" data-foco="ver-todo">ver todo el catálogo</button>.
      </p>
    </div>
  `;
}

function plantillaTarjeta(r: Resultado, ctx: Contexto): string {
  const { filtros, vertical } = ctx;
  const seleccionado = ctx.estado.productoDetalleId === r.id;
  const listaCumple = r.cumple.map((attr) => describirAtributoCumplido(attr, filtros));
  if (filtros?.categoria) {
    listaCumple.push(nombreCategoria(vertical, filtros.categoria));
  }
  const textoCumple =
    listaCumple.length > 0 ? `Cumple: ${listaCumple.join(" · ")}` : "Cumple: catálogo de la vertical";
  const textoSinDato =
    r.sin_dato.length > 0 ? `Sin dato: ${r.sin_dato.map(etiquetaAtributo).join(" · ").toLowerCase()}` : "";

  return `
    <article class="tarjeta-producto" data-testid="tarjeta-producto" data-producto-id="${r.id}"${seleccionado ? ' aria-current="true"' : ""}>
      <div class="tarjeta-cabecera">
        <h3 class="tarjeta-nombre">
          <button
            type="button"
            class="tarjeta-abrir"
            data-abrir-detalle="${r.id}"
            data-foco="tarjeta-${r.id}"
            aria-expanded="${seleccionado}"
            aria-controls="ficha-producto"
          >${escapar(r.nombre)}</button>
        </h3>
        <span class="tarjeta-precio" data-testid="tarjeta-precio">${escapar(formatearPrecio(r.precio))}</span>
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

function plantillaDetalleVacio(): string {
  return `
    <div class="detalle-vacio" data-testid="detalle-vacio">
      <p>Selecciona un producto para ver su ficha</p>
    </div>
  `;
}

function plantillaFicha(r: Resultado, ctx: Contexto, modo: "columna" | "dialogo"): string {
  const { vertical, filtros } = ctx;
  // Contra una API anterior al cambio de contrato pueden faltar en tiempo de ejecución.
  const categoria = (r as Partial<Resultado>).categoria;

  const chipsCumple = r.cumple.map((attr) => {
    const filtro = filtros?.filtros.find((f) => f.atributo === attr);
    return filtro ? formatearEtiqueta(filtro) : etiquetaAtributo(attr);
  });
  if (filtros?.categoria) {
    chipsCumple.push(`Categoría: ${nombreCategoria(vertical, filtros.categoria)}`);
  }
  const chipsSinDato = r.sin_dato.map(etiquetaAtributo);

  const botonCerrar =
    modo === "dialogo"
      ? `<button type="button" class="btn-volver" data-cerrar-detalle="1" data-foco="cerrar-ficha" data-testid="btn-cerrar-detalle">← Resultados</button>`
      : `<button type="button" class="btn-cerrar-ficha" data-cerrar-detalle="1" data-foco="cerrar-ficha" data-testid="btn-cerrar-detalle" aria-label="Cerrar ficha" title="Cerrar ficha">×</button>`;
  const titulo = `<h2 class="ficha-titulo" id="ficha-titulo" tabindex="-1" data-foco="ficha-titulo">${escapar(r.nombre)}</h2>`;

  return `
    <article class="panel-detalle"${modo === "columna" ? ' id="ficha-producto"' : ""} data-testid="panel-detalle" aria-labelledby="ficha-titulo">
      ${
        modo === "dialogo"
          ? `<div class="ficha-barra">${botonCerrar}</div>${titulo}`
          : `<div class="ficha-cabecera">${titulo}${botonCerrar}</div>`
      }
      <dl class="ficha-resumen">
        <div><dt>Marca</dt><dd>${escapar(r.marca)}</dd></div>
        <div><dt>Precio</dt><dd class="ficha-precio" data-testid="ficha-precio">${escapar(formatearPrecio(r.precio))}</dd></div>
        ${categoria ? `<div><dt>Categoría</dt><dd>${escapar(nombreCategoriaVisible(vertical, categoria))}</dd></div>` : ""}
      </dl>

      ${vertical?.aviso ? `<p class="aviso-vertical ficha-aviso" role="note" data-testid="ficha-aviso">${escapar(vertical.aviso)}</p>` : ""}

      ${
        chipsCumple.length > 0 || chipsSinDato.length > 0
          ? `
        <section class="ficha-seccion" aria-label="Motivo de coincidencia" data-testid="ficha-motivo">
          ${
            chipsCumple.length > 0
              ? `<h3>Cumple</h3><ul class="lista-chips">${chipsCumple.map((c) => `<li class="chip chip-cumple">${escapar(c)}</li>`).join("")}</ul>`
              : ""
          }
          ${
            chipsSinDato.length > 0
              ? `<h3>Sin dato</h3><ul class="lista-chips">${chipsSinDato.map((c) => `<li class="chip chip-sin-dato">${escapar(c)}</li>`).join("")}</ul>`
              : ""
          }
        </section>
      `
          : ""
      }

      ${plantillaAtributosFicha(r, ctx)}

      <section class="ficha-seccion">
        <h3>Descripción</h3>
        <p class="ficha-descripcion">${escapar(r.descripcion)}</p>
      </section>

      <p class="ficha-id">Identificador del producto: ${r.id}</p>
    </article>
  `;
}

/**
 * Contexto (uso y riesgo, obligatorios) y atributos técnicos de la categoría del
 * producto según el diccionario. Una clave ausente es "sin dato" (§12).
 */
function plantillaAtributosFicha(r: Resultado, ctx: Contexto): string {
  const atributos = (r as Partial<Resultado>).atributos;
  if (!atributos) {
    return `<p class="ficha-nota" data-testid="ficha-sin-atributos">Los atributos de este producto no están disponibles en esta conexión.</p>`;
  }

  const entradas = entradasDeCategoria(ctx.estado.diccionario, (r as Partial<Resultado>).categoria);
  const esContexto = (e: EntradaDiccionario): boolean => e.define_uso || e.define_riesgo || e.obligatorio;
  const contexto = entradas.filter(esContexto).map((e) => e.atributo);
  const conocidos = new Set(entradas.map((e) => e.atributo));
  const tecnicos = [
    ...entradas.filter((e) => !esContexto(e)).map((e) => e.atributo),
    // Lo que trae el producto y el diccionario no conoce también se muestra.
    ...Object.keys(atributos).filter((k) => !conocidos.has(k) && !COLUMNAS_FIJAS.has(k)),
  ];

  const filas = (lista: string[]): string =>
    lista
      .map((atributo) => {
        const tiene = Object.prototype.hasOwnProperty.call(atributos, atributo);
        return `<div class="fila-atributo${tiene ? "" : " es-sin-dato"}" data-atributo="${escapar(atributo)}"><dt>${escapar(
          etiquetaAtributo(atributo),
        )}</dt><dd>${tiene ? escapar(formatearValorAtributo(atributo, atributos[atributo])) : "sin dato"}</dd></div>`;
      })
      .join("");

  return `
    ${
      contexto.length > 0
        ? `
      <section class="ficha-seccion">
        <h3>Contexto</h3>
        <p class="ficha-nota">Uso y riesgo declarados en el catálogo.</p>
        <dl class="lista-atributos" data-testid="ficha-contexto">${filas(contexto)}</dl>
      </section>
    `
        : ""
    }
    ${
      tecnicos.length > 0
        ? `
      <section class="ficha-seccion">
        <h3>Atributos</h3>
        <dl class="lista-atributos" data-testid="ficha-atributos">${filas(tecnicos)}</dl>
      </section>
    `
        : ""
    }
  `;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

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

function formatearEtiquetaValorFaceta(atributo: string, valor: string): string {
  if (valor === "true") return "sí";
  if (valor === "false") return "no";
  if (valor === "(sin dato)") return "sin dato";
  const numero = Number(valor);
  if (valor.trim() !== "" && Number.isFinite(numero)) return formatearValorAtributo(atributo, numero);
  return valor;
}

/** Filtro "=" vigente que corresponde a un valor de faceta, si lo hay. */
function filtroDeFaceta(
  filtros: ObjetoFiltros | null,
  atributo: string,
  valorTexto: string,
): { atributo: string; operador: Operador; valor: ValorFiltro } | undefined {
  return filtros?.filtros.find((f) => f.atributo === atributo && f.operador === "=" && String(f.valor) === valorTexto);
}

function nombreCategoria(vertical: Vertical | undefined, categoria: string): string {
  const hallada = vertical?.categorias.find((c) => c.categoria === categoria);
  return hallada ? hallada.nombre.toLowerCase() : categoria.replace(/_/g, " ");
}

/** Nombre de la categoría como lo declara la vertical: "Cuidado facial". */
function nombreCategoriaVisible(vertical: Vertical | undefined, categoria: string): string {
  const hallada = vertical?.categorias.find((c) => c.categoria === categoria);
  if (hallada) return hallada.nombre;
  const texto = categoria.replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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

/** Entradas del diccionario para la categoría del producto, sin las columnas fijas. */
function entradasDeCategoria(dic: Diccionario | null, categoria: string | undefined): EntradaDiccionario[] {
  if (!dic) return [];
  const mapa = new Map<string, EntradaDiccionario>();
  for (const e of dic.entradas) {
    if (COLUMNAS_FIJAS.has(e.atributo)) continue;
    if (categoria !== undefined && e.categoria !== categoria) continue;
    if (!mapa.has(e.atributo)) mapa.set(e.atributo, e);
  }
  return [...mapa.values()];
}

/** Rango de un atributo numérico en toda la vertical. */
function rangoDe(dic: Diccionario, atributo: string): { minimo: number; maximo: number } | null {
  const entradas = dic.entradas.filter((e) => e.atributo === atributo);
  const minimos = entradas.map((e) => e.minimo).filter((m): m is number => m !== undefined);
  const maximos = entradas.map((e) => e.maximo).filter((m): m is number => m !== undefined);
  if (minimos.length === 0 || maximos.length === 0) return null;
  return { minimo: Math.min(...minimos), maximo: Math.max(...maximos) };
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
