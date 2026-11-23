// Cliente de la API para la interfaz web (T5).
// Si existe VITE_API_URL, realiza peticiones fetch HTTP a la Edge Function;
// si no está definida, ejecuta la misma aplicación Hono (`crearApp`) en memoria
// sobre el catálogo sintético (`AccesoMemoria` + `AdaptadorInteractivo`), por lo
// que todo el contrato Zod, G1, caché y acciones estructuradas se ejecutan igual.

import {
  AccesoMemoria,
  AdaptadorInteractivo,
  crearApp,
  FIXTURES_DEMO,
  PRODUCTOS_PRUEBA,
  type Diccionario,
  type Dominio,
  type PeticionBuscar,
  type ProductoCatalogo,
  type RespuestaBuscar,
  type Vertical,
} from "@catalogo-ia/core";

export interface ClienteCatalogo {
  readonly modo: "remoto" | "local";
  obtenerVerticales(): Promise<Vertical[]>;
  obtenerDiccionario(dominio: Dominio): Promise<Diccionario>;
  buscar(peticion: PeticionBuscar): Promise<RespuestaBuscar>;
  obtenerProductoLocal(id: number): ProductoCatalogo | undefined;
}

export function crearClienteLocal(): ClienteCatalogo {
  const acceso = new AccesoMemoria();
  const adaptador = new AdaptadorInteractivo(FIXTURES_DEMO);
  const app = crearApp({
    acceso,
    adaptador,
    origenes: ["http://localhost:5173"],
  });

  return {
    modo: "local",
    async obtenerVerticales(): Promise<Vertical[]> {
      const r = await app.request("/verticales");
      if (!r.ok) throw new Error("No se pudieron cargar las verticales");
      const cuerpo = (await r.json()) as { verticales: Vertical[] };
      return cuerpo.verticales;
    },
    async obtenerDiccionario(dominio: Dominio): Promise<Diccionario> {
      const r = await app.request(`/diccionario/${dominio}`);
      if (!r.ok) throw new Error("No se pudo cargar el diccionario");
      return (await r.json()) as Diccionario;
    },
    async buscar(peticion: PeticionBuscar): Promise<RespuestaBuscar> {
      const r = await app.request("/buscar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(peticion),
      });
      if (!r.ok) throw new Error("Error al ejecutar la búsqueda");
      return (await r.json()) as RespuestaBuscar;
    },
    obtenerProductoLocal(id: number): ProductoCatalogo | undefined {
      return PRODUCTOS_PRUEBA.find((p) => p.id === id);
    },
  };
}

/**
 * Un 503 de la API significa que la base no respondió a tiempo o que la conexión
 * se rompió y ya se abrió otra (enmienda de ADR-0002). Se reintenta una sola vez,
 * y solo en lecturas que no llaman al modelo: las rutas GET y las acciones
 * estructuradas de /buscar. El texto libre no se reintenta, para no repetir una
 * llamada al modelo.
 */
async function pedirConReintento(pedir: () => Promise<Response>, reintentar: boolean, esperaMs: number): Promise<Response> {
  const r = await pedir();
  if (r.status !== 503 || !reintentar) return r;
  await new Promise((listo) => setTimeout(listo, esperaMs));
  return pedir();
}

export function crearClienteHttp(urlBase: string, claveAnon?: string, opciones: { esperaReintentoMs?: number } = {}): ClienteCatalogo {
  const base = urlBase.replace(/\/+$/, "");
  const espera = opciones.esperaReintentoMs ?? 500;
  const cabeceras: Record<string, string> = { "content-type": "application/json" };
  if (claveAnon) {
    cabeceras.apikey = claveAnon;
    cabeceras.Authorization = `Bearer ${claveAnon}`;
  }

  return {
    modo: "remoto",
    async obtenerVerticales(): Promise<Vertical[]> {
      const r = await pedirConReintento(() => fetch(`${base}/verticales`, { headers: cabeceras }), true, espera);
      if (!r.ok) throw new Error("No se pudieron cargar las verticales");
      const cuerpo = (await r.json()) as { verticales: Vertical[] };
      return cuerpo.verticales;
    },
    async obtenerDiccionario(dominio: Dominio): Promise<Diccionario> {
      const r = await pedirConReintento(() => fetch(`${base}/diccionario/${dominio}`, { headers: cabeceras }), true, espera);
      if (!r.ok) throw new Error("No se pudo cargar el diccionario");
      return (await r.json()) as Diccionario;
    },
    async buscar(peticion: PeticionBuscar): Promise<RespuestaBuscar> {
      const r = await pedirConReintento(
        () => fetch(`${base}/buscar`, { method: "POST", headers: cabeceras, body: JSON.stringify(peticion) }),
        peticion.accion !== undefined,
        espera,
      );
      if (!r.ok) throw new Error("Error al ejecutar la búsqueda");
      return (await r.json()) as RespuestaBuscar;
    },
    // Con la API los ids son de la base, no del catálogo de prueba: buscarlos ahí
    // mostraría los atributos de otro producto. El detalle usa lo que devolvió /buscar.
    obtenerProductoLocal(): ProductoCatalogo | undefined {
      return undefined;
    },
  };
}

export function crearClientePorEntorno(): ClienteCatalogo {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const url = metaEnv?.VITE_API_URL?.trim();
  const anon = metaEnv?.VITE_SUPABASE_ANON_KEY?.trim();
  if (url) {
    return crearClienteHttp(url, anon);
  }
  return crearClienteLocal();
}
