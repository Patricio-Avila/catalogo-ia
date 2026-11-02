// API Hono (ADR-0002): la misma app corre en la Edge Function de Supabase (T1),
// en Node para el arnés de evaluación y en las pruebas. Solo usa la API web
// estándar. Las dependencias (acceso a datos, adaptador del modelo, caché,
// límite de gasto, orígenes CORS) se inyectan: la app no sabe dónde corre.

import { OpenAPIHono, createRoute, type RouteHandler } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { aplicarAccion } from "../acciones";
import type { CacheInterpretaciones } from "../cache/clave";
import {
  PeticionBuscar,
  PeticionFacetas,
  RespuestaBuscar,
  RespuestaDiccionario,
  RespuestaError,
  RespuestaFacetas,
  RespuestaSalud,
} from "../contrato/api";
import { Dominio, OBJETO_VACIO, type ObjetoFiltros } from "../contrato/filtros";
import type { Faceta, ResultadoBusqueda } from "../contrato/respuestas";
import type { AccesoDatos } from "../datos/acceso";
import { interpretarPeticion, type Etiqueta } from "../interpretar";
import type { AdaptadorModelo } from "../modelo/interfaz";
import { salud } from "../salud";
import { SIN_LIMITE, type LimiteGasto } from "./limite_gasto";

export interface DependenciasApi {
  acceso: AccesoDatos;
  adaptador: AdaptadorModelo;
  /** Orígenes permitidos para CORS: local y https://<usuario>.github.io. */
  origenes: string[];
  /** false durante la evaluación (CLAUDE.md §9). */
  cacheActiva?: boolean;
  limiteGasto?: LimiteGasto;
  /** Registro de errores; por omisión console.error. Nunca llega al cliente. */
  registrar?: (mensaje: string, detalle: unknown) => void;
}

const TEXTO_LIMITE_GASTO =
  "Por ahora no puedo interpretar texto libre. Puedes seguir buscando con las etiquetas manuales o intentar en un minuto.";

export function crearApp(deps: DependenciasApi) {
  const registrar = deps.registrar ?? ((m, d) => console.error(m, d));
  const limite = deps.limiteGasto ?? SIN_LIMITE;
  const cache: CacheInterpretaciones | null = deps.cacheActiva === false ? null : deps.acceso.cache;

  const app = new OpenAPIHono({
    defaultHook: (resultado, c) => {
      if (!resultado.success) {
        return c.json(
          {
            error: "peticion_invalida",
            campos: resultado.error.issues.map((i) => ({ ruta: i.path.join("."), mensaje: i.message })),
          } satisfies z.infer<typeof RespuestaError>,
          400,
        );
      }
      return undefined;
    },
  });

  app.use(
    "*",
    cors({
      origin: (origen) => (deps.origenes.includes(origen) ? origen : null),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "apikey"],
      maxAge: 600,
    }),
  );

  app.onError((err, c) => {
    // Cuerpo que no es JSON o excepción HTTP de Hono (4xx): error del cliente, no interno.
    if (err instanceof SyntaxError || (err instanceof HTTPException && err.status < 500)) {
      return c.json({ error: "peticion_invalida" } satisfies z.infer<typeof RespuestaError>, 400);
    }
    registrar(`[api] ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: "error_interno" } satisfies z.infer<typeof RespuestaError>, 500);
  });

  app.notFound((c) => c.json({ error: "no_encontrado" } satisfies z.infer<typeof RespuestaError>, 404));

  // GET /salud
  app.openapi(
    createRoute({
      method: "get",
      path: "/salud",
      summary: "Estado de la API y versión del núcleo",
      responses: { 200: { description: "ok", content: { "application/json": { schema: RespuestaSalud } } } },
    }),
    (c) => c.json(salud(), 200),
  );

  // GET /diccionario/{dominio}
  app.openapi(
    createRoute({
      method: "get",
      path: "/diccionario/{dominio}",
      summary: "Diccionario de atributos de una vertical (para etiquetas manuales, RF-10)",
      request: { params: z.object({ dominio: Dominio }) },
      responses: {
        200: { description: "diccionario", content: { "application/json": { schema: RespuestaDiccionario } } },
        400: { description: "dominio inválido", content: { "application/json": { schema: RespuestaError } } },
      },
    }),
    async (c) => {
      const { dominio } = c.req.valid("param");
      return c.json(await deps.acceso.obtenerDiccionario(dominio), 200);
    },
  );

  // POST /buscar
  const rutaBuscar = createRoute({
    method: "post",
    path: "/buscar",
    summary: "Interpreta texto libre o aplica una acción estructurada y busca",
    request: { body: { content: { "application/json": { schema: PeticionBuscar } }, required: true } },
    responses: {
      200: { description: "resultados, etiquetas, facetas y aclaración", content: { "application/json": { schema: RespuestaBuscar } } },
      400: { description: "petición inválida", content: { "application/json": { schema: RespuestaError } } },
      500: { description: "error interno", content: { "application/json": { schema: RespuestaError } } },
    },
  });

  const manejarBuscar: RouteHandler<typeof rutaBuscar> = async (c) => {
    const p = c.req.valid("json");
    const diccionario = await deps.acceso.obtenerDiccionario(p.dominio);
    const vigente = p.filtros_vigentes;

    let objeto: ObjetoFiltros;
    let etiquetas: Etiqueta[];
    let descartados: RespuestaBuscar["descartados"];
    let aclaracion: RespuestaBuscar["aclaracion"] = null;
    let desdeCache = false;
    let llamoModelo = false;
    let bloqueadoPorGasto = false;

    if (p.accion !== undefined) {
      const r = aplicarAccion(vigente, p.accion, diccionario);
      objeto = r.objeto;
      descartados = r.descartados;
      etiquetas = etiquetasUsuario(objeto);
    } else if (!limite.permitir(claveCliente(c.req.raw.headers))) {
      bloqueadoPorGasto = true;
      objeto = vigente ?? OBJETO_VACIO(p.dominio);
      descartados = [];
      etiquetas = etiquetasUsuario(objeto);
      aclaracion = { pregunta: TEXTO_LIMITE_GASTO, opciones: [], filtros_dudosos: [] };
    } else {
      const r = await interpretarPeticion({
        texto: p.texto ?? "",
        diccionario,
        filtrosVigentes: vigente,
        adaptador: deps.adaptador,
        cache,
      });
      objeto = r.objeto;
      etiquetas = r.etiquetas;
      descartados = r.descartados;
      aclaracion = r.aclaracion;
      desdeCache = r.desde_cache;
      llamoModelo = r.llamo_modelo;
    }

    // Confianza baja sin nada aplicable: aclaración sin consultar la base (§6, paso 5).
    const sinConsultar = bloqueadoPorGasto || (aclaracion !== null && objeto.filtros.length === 0 && p.accion === undefined);

    let busqueda: ResultadoBusqueda = { resultados: [], total: 0, faltantes: 0 };
    let facetas: Faceta[] = [];
    if (!sinConsultar) {
      [busqueda, facetas] = await Promise.all([deps.acceso.buscar(objeto, p.limite), deps.acceso.facetas(objeto)]);
    }

    const respuesta: RespuestaBuscar = {
      filtros: objeto,
      etiquetas,
      descartados,
      resultados: busqueda.resultados,
      total: busqueda.total,
      faltantes: busqueda.faltantes,
      facetas,
      aclaracion,
      sin_consultar: sinConsultar,
      desde_cache: desdeCache,
      llamo_modelo: llamoModelo,
    };
    return c.json(respuesta, 200);
  };
  app.openapi(rutaBuscar, manejarBuscar);

  // POST /facetas
  app.openapi(
    createRoute({
      method: "post",
      path: "/facetas",
      summary: "Facetas sobre el conjunto resultante, incluido el grupo sin dato (RF-07)",
      request: { body: { content: { "application/json": { schema: PeticionFacetas } }, required: true } },
      responses: {
        200: { description: "facetas", content: { "application/json": { schema: RespuestaFacetas } } },
        400: { description: "petición inválida", content: { "application/json": { schema: RespuestaError } } },
      },
    }),
    async (c) => {
      const p = c.req.valid("json");
      const facetas = await deps.acceso.facetas(p.filtros, p.atributos);
      return c.json({ facetas }, 200);
    },
  );

  app.doc31("/openapi.json", CONFIG_OPENAPI);

  return app;
}

export const CONFIG_OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "catalogo-ia",
    version: "0.1.0",
    description:
      "Filtrado asistido por IA sobre catálogos con atributos heterogéneos. El modelo nunca escribe SQL: devuelve un objeto de filtros validado contra el diccionario (G1) y la base lo ejecuta con funciones parametrizadas (G2).",
  },
} as const;

export type AppApi = ReturnType<typeof crearApp>;

/** Las etiquetas de un objeto que solo tocó el usuario: confianza 1, origen usuario. */
function etiquetasUsuario(objeto: ObjetoFiltros): Etiqueta[] {
  return objeto.filtros.map((f) => ({ ...f, confianza: 1, origen: "usuario", nivel: "alta", sugerida: false }));
}

/** Identifica al cliente para el tope de gasto: IP tras el proxy o "desconocido". */
export function claveCliente(headers: Headers): string {
  const reenviada = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? reenviada ?? "desconocido";
}
