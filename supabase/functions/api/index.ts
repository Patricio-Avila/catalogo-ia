// Adaptador de Supabase Edge Function (T1, ADR-0002, T7): monta la aplicación Hono
// del núcleo agnóstico. Los secretos provienen exclusivamente de variables de
// entorno configuradas con `supabase secrets`.
//
// _core.mjs es el núcleo empaquetado: se genera con `pnpm build:edge` antes de
// `supabase functions deploy api` y no se versiona.
//
// Sin URL_BASE_AGENTE la función no cae en silencio al catálogo de prueba: responde
// 503 en todo salvo /salud. Para servir el catálogo en memoria hay que declararlo con
// MODO_DEMO=1. GET /salud dice qué acceso y qué adaptador están activos.

import {
  AccesoMemoria,
  AccesoPostgres,
  AdaptadorGemini,
  AdaptadorInteractivo,
  crearApp,
  FIXTURES_DEMO,
  LimiteMemoria,
} from "./_core.mjs";

declare const Deno: {
  env: { get(clave: string): string | undefined };
  serve: (manejador: (req: Request) => Response | Promise<Response>) => void;
};

const MAX_BYTES_CUERPO = 16_384;

const urlBaseDatos = Deno.env.get("URL_BASE_AGENTE")?.trim();
const modoDemo = Deno.env.get("MODO_DEMO")?.trim() === "1";
const sinBase = !urlBaseDatos && !modoDemo;
const claveGemini = Deno.env.get("GEMINI_API_KEY")?.trim();
const modeloGemini = Deno.env.get("GEMINI_MODELO")?.trim();
const origenesConfig = Deno.env.get("ORIGENES_CORS");
const origenes = origenesConfig
  ? origenesConfig.split(",").map((o) => o.trim()).filter(Boolean)
  : ["http://localhost:5173", "https://patricio-avila.github.io"];

const porMinuto = leerEnteroPositivo(Deno.env.get("LIMITE_MODELO_MINUTO"), 8);
const porDia = leerEnteroPositivo(Deno.env.get("LIMITE_MODELO_DIA"), 500);

const acceso = urlBaseDatos ? new AccesoPostgres({ url: urlBaseDatos, max: 1 }) : new AccesoMemoria();
if (sinBase) console.error("[api] Falta URL_BASE_AGENTE; define MODO_DEMO=1 para servir el catálogo de prueba en memoria");
const adaptador = claveGemini
  ? new AdaptadorGemini({ apiKey: claveGemini, modelo: modeloGemini })
  : new AdaptadorInteractivo(FIXTURES_DEMO);
const limiteGasto = new LimiteMemoria({ porMinuto, porDia });

const app = crearApp({
  acceso,
  adaptador,
  origenes,
  limiteGasto,
});

Deno.serve(async (req: Request) => {
  if (req.method === "POST") {
    const largoDeclarado = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(largoDeclarado) && largoDeclarado > MAX_BYTES_CUERPO) {
      return conCabecerasSeguridad(
        new Response(JSON.stringify({ error: "peticion_invalida" }), {
          status: 413,
          headers: { "content-type": "application/json" },
        }),
      );
    }
  }

  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/(?:functions\/v1\/)?api(?=\/|$)/, "") || "/";
  if (sinBase && url.pathname !== "/salud") {
    return conCabecerasSeguridad(
      new Response(JSON.stringify({ error: "error_interno" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
  }
  const res = await app.fetch(new Request(url.toString(), req));
  return conCabecerasSeguridad(res);
});

function conCabecerasSeguridad(res: Response): Response {
  const cabeceras = new Headers(res.headers);
  cabeceras.set("X-Content-Type-Options", "nosniff");
  cabeceras.set("Referrer-Policy", "no-referrer");
  cabeceras.set("Cache-Control", "no-store");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: cabeceras,
  });
}

function leerEnteroPositivo(valor: string | undefined, omision: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : omision;
}
