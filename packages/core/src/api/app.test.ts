// Pruebas de la API con la app en memoria (Hono usa la API web estándar).

import type { ObjetoFiltros } from "../contrato/filtros";
import { AccesoNulo } from "../datos/acceso_nulo";
import { FIXTURES_MODELO } from "../datos_prueba/fixtures_modelo";
import { AdaptadorFixtures } from "../modelo/fixtures";
import type { AdaptadorModelo } from "../modelo/interfaz";
import { claveCliente, crearApp, type DependenciasApi } from "./app";
import { LimiteMemoria } from "./limite_gasto";

const ORIGEN = "https://patricio-avila.github.io";

function montar(extra: Partial<DependenciasApi> = {}) {
  const acceso = new AccesoNulo();
  const adaptador = new AdaptadorFixtures(FIXTURES_MODELO);
  const registros: unknown[] = [];
  const app = crearApp({ acceso, adaptador, origenes: [ORIGEN, "http://localhost:5173"], registrar: (m, d) => registros.push([m, d]), ...extra });
  return { app, acceso, adaptador, registros };
}

const post = (app: ReturnType<typeof crearApp>, ruta: string, cuerpo: unknown, headers: Record<string, string> = {}) =>
  app.request(ruta, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGEN, ...headers },
    body: JSON.stringify(cuerpo),
  });

describe("GET /salud", () => {
  it("responde estado y versión del núcleo", async () => {
    const { app } = montar();
    const r = await app.request("/salud");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ estado: "ok", nucleo: expect.any(String) });
  });
});

describe("GET /diccionario/:dominio", () => {
  it("devuelve el diccionario de la vertical", async () => {
    const { app } = montar();
    const r = await app.request("/diccionario/llantas");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.dominio).toBe("llantas");
    expect(d.categorias).toEqual(["pasajeros", "carga_ligera"]);
  });

  it("dominio desconocido → 400 genérico con el campo", async () => {
    const { app } = montar();
    const r = await app.request("/diccionario/juguetes");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "peticion_invalida", campos: [{ ruta: "dominio", mensaje: expect.any(String) }] });
  });
});

describe("POST /buscar con texto", () => {
  it("interpreta, consulta la base y devuelve el contrato completo", async () => {
    const { app, acceso } = montar();
    const r = await post(app, "/buscar", {
      dominio: "belleza",
      texto: "crema sin perfume para piel sensible de menos de 300 pesos",
      filtros_vigentes: null,
    });
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.filtros.categoria).toBe("cuidado_facial");
    expect(cuerpo.filtros.filtros).toHaveLength(3);
    expect(cuerpo.etiquetas).toHaveLength(3);
    expect(cuerpo).toMatchObject({ descartados: [], resultados: [], total: 0, faltantes: 0, facetas: [], aclaracion: null, sin_consultar: false, llamo_modelo: true, desde_cache: false });
    expect(acceso.llamadas.map((l) => l.metodo)).toEqual(["diccionario", "buscar", "facetas"]);
  });

  it("confianza baja sin nada aplicable: aclaración y no consulta la base", async () => {
    const { app, acceso } = montar();
    const r = await post(app, "/buscar", { dominio: "belleza", texto: "que sea barato", filtros_vigentes: null });
    const cuerpo = await r.json();
    expect(cuerpo.sin_consultar).toBe(true);
    expect(cuerpo.aclaracion).not.toBeNull();
    expect(acceso.llamadas.map((l) => l.metodo)).toEqual(["diccionario"]);
  });

  it("con filtros vigentes, la aclaración no impide consultar", async () => {
    const { app, acceso } = montar();
    const vigente: ObjetoFiltros = { dominio: "belleza", categoria: null, filtros: [{ atributo: "vegano", operador: "=", valor: true }], incluir_sin_dato: false };
    const r = await post(app, "/buscar", { dominio: "belleza", texto: "que sea barato", filtros_vigentes: vigente });
    const cuerpo = await r.json();
    expect(cuerpo.sin_consultar).toBe(false);
    expect(cuerpo.aclaracion).not.toBeNull();
    expect(acceso.llamadas.some((l) => l.metodo === "buscar")).toBe(true);
  });

  it("la caché evita la segunda llamada al modelo", async () => {
    const { app } = montar();
    const cuerpo = { dominio: "farmacia", texto: "paracetamol en tabletas", filtros_vigentes: null };
    const r1 = await (await post(app, "/buscar", cuerpo)).json();
    const r2 = await (await post(app, "/buscar", cuerpo)).json();
    expect(r1.llamo_modelo).toBe(true);
    expect(r2.llamo_modelo).toBe(false);
    expect(r2.desde_cache).toBe(true);
  });

  it("con cacheActiva=false siempre llama al modelo", async () => {
    const { app } = montar({ cacheActiva: false });
    const cuerpo = { dominio: "farmacia", texto: "paracetamol en tabletas", filtros_vigentes: null };
    await post(app, "/buscar", cuerpo);
    const r2 = await (await post(app, "/buscar", cuerpo)).json();
    expect(r2.llamo_modelo).toBe(true);
  });
});

describe("POST /buscar con acción (RF-03, RF-10)", () => {
  const vigente: ObjetoFiltros = {
    dominio: "belleza",
    categoria: "cuidado_facial",
    filtros: [
      { atributo: "fragancia", operador: "=", valor: "sin perfume" },
      { atributo: "precio", operador: "<", valor: 300 },
    ],
    incluir_sin_dato: false,
  };

  it("quitar etiqueta recalcula sin invocar al modelo", async () => {
    const llamadas: string[] = [];
    const espia: AdaptadorModelo = { nombre: "espia", async interpretar(p) { llamadas.push(p.texto); return { filtros: [] }; } };
    const { app, acceso } = montar({ adaptador: espia });
    const r = await post(app, "/buscar", { dominio: "belleza", accion: { tipo: "quitar", atributo: "precio", operador: "<", valor: 300 }, filtros_vigentes: vigente });
    const cuerpo = await r.json();
    expect(llamadas).toEqual([]);
    expect(cuerpo.llamo_modelo).toBe(false);
    expect(cuerpo.filtros.filtros).toEqual([{ atributo: "fragancia", operador: "=", valor: "sin perfume" }]);
    expect(cuerpo.etiquetas[0]).toMatchObject({ origen: "usuario", confianza: 1 });
    expect(acceso.llamadas.map((l) => l.metodo)).toEqual(["diccionario", "buscar", "facetas"]);
  });

  it("etiqueta manual produce el mismo objeto que el texto libre", async () => {
    const { app } = montar();
    const porTexto = await (await post(app, "/buscar", { dominio: "farmacia", texto: "jarabe sin azúcar", filtros_vigentes: null })).json();
    let obj: ObjetoFiltros | null = null;
    for (const filtro of [
      { atributo: "forma_farmaceutica", operador: "=", valor: "Jarabe" },
      { atributo: "sin_azucar", operador: "=", valor: "sí" },
    ]) {
      obj = (await (await post(app, "/buscar", { dominio: "farmacia", accion: { tipo: "agregar", filtro }, filtros_vigentes: obj })).json()).filtros;
    }
    expect(obj).toEqual(porTexto.filtros);
  });

  it("el usuario fija un atributo de riesgo a mano y la respuesta no lo descarta (RF-11)", async () => {
    const { app } = montar();
    const r = await (await post(app, "/buscar", { dominio: "farmacia", accion: { tipo: "agregar", filtro: { atributo: "requiere_receta", operador: "=", valor: false } }, filtros_vigentes: null })).json();
    expect(r.descartados).toEqual([]);
    expect(r.filtros.filtros).toEqual([{ atributo: "requiere_receta", operador: "=", valor: false }]);
  });
});

describe("POST /buscar: validación de la petición", () => {
  const casos: [unknown, string][] = [
    [{ dominio: "belleza", filtros_vigentes: null }, "ni texto ni acción"],
    [{ dominio: "belleza", texto: "x", accion: { tipo: "reiniciar" }, filtros_vigentes: null }, "texto y acción a la vez"],
    [{ dominio: "ropa", texto: "x", filtros_vigentes: null }, "dominio inválido"],
    [{ dominio: "belleza", texto: "x" }, "sin filtros_vigentes"],
    [{ dominio: "belleza", texto: "x", filtros_vigentes: { dominio: "farmacia", categoria: null, filtros: [], incluir_sin_dato: false } }, "dominio de vigentes distinto"],
    [{ dominio: "belleza", texto: "x", filtros_vigentes: null, limite: 999 }, "límite por encima del tope"],
    [{ dominio: "belleza", texto: "", filtros_vigentes: null }, "texto vacío"],
  ];
  it.each(casos)("%j → 400 (%s)", async (cuerpo) => {
    const { app } = montar();
    const r = await post(app, "/buscar", cuerpo);
    expect(r.status).toBe(400);
    const c = await r.json();
    expect(c.error).toBe("peticion_invalida");
    expect(c.campos.length).toBeGreaterThan(0);
  });

  it("JSON malformado → 400", async () => {
    const { app } = montar();
    const r = await app.request("/buscar", { method: "POST", headers: { "content-type": "application/json" }, body: "{no es json" });
    expect(r.status).toBe(400);
  });
});

describe("errores y CORS", () => {
  it("un fallo del acceso a datos devuelve 500 genérico y registra el detalle", async () => {
    const { app, acceso, registros } = montar();
    acceso.buscar = async () => { throw new Error("conexión rechazada (detalle interno que no debe salir)"); };
    const r = await post(app, "/buscar", { dominio: "belleza", texto: "protector solar vegano", filtros_vigentes: null });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "error_interno" });
    expect(registros).toHaveLength(1);
  });

  it("ruta inexistente → 404 genérico", async () => {
    const { app } = montar();
    const r = await app.request("/nada");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "no_encontrado" });
  });

  it("CORS: origen permitido recibe la cabecera; otro no", async () => {
    const { app } = montar();
    const ok = await app.request("/salud", { headers: { origin: ORIGEN } });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGEN);
    const no = await app.request("/salud", { headers: { origin: "https://malicioso.example" } });
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("preflight OPTIONS para el origen permitido", async () => {
    const { app } = montar();
    const r = await app.request("/buscar", { method: "OPTIONS", headers: { origin: ORIGEN, "access-control-request-method": "POST" } });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
  });
});

describe("tope de gasto del modelo (C4)", () => {
  it("la llamada N+1 con texto recibe aclaración sin invocar al modelo; las acciones siguen", async () => {
    const llamadas: string[] = [];
    const espia: AdaptadorModelo = { nombre: "espia", async interpretar(p) { llamadas.push(p.texto); return { filtros: [] }; } };
    const { app, acceso } = montar({ adaptador: espia, limiteGasto: new LimiteMemoria({ porMinuto: 2, porDia: 100 }) });
    const ip = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
    const cuerpo = { dominio: "belleza", texto: "hola", filtros_vigentes: null };
    await post(app, "/buscar", cuerpo, ip);
    await post(app, "/buscar", cuerpo, ip);
    const r = await (await post(app, "/buscar", cuerpo, ip)).json();
    expect(llamadas).toHaveLength(2);
    expect(r.sin_consultar).toBe(true);
    expect(r.llamo_modelo).toBe(false);
    expect(r.aclaracion.pregunta).toMatch(/etiquetas manuales/);
    expect(acceso.llamadas.filter((l) => l.metodo === "buscar")).toHaveLength(0);

    const accion = await (await post(app, "/buscar", { dominio: "belleza", accion: { tipo: "faceta", atributo: "vegano", valor: true }, filtros_vigentes: null }, ip)).json();
    expect(accion.sin_consultar).toBe(false);
    expect(accion.filtros.filtros).toHaveLength(1);
  });

  it("claveCliente toma la IP del proxy", () => {
    expect(claveCliente(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(claveCliente(new Headers({ "cf-connecting-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(claveCliente(new Headers())).toBe("desconocido");
  });
});

describe("POST /facetas", () => {
  it("devuelve facetas para el objeto", async () => {
    const { app, acceso } = montar();
    const r = await post(app, "/facetas", { filtros: { dominio: "belleza", categoria: null, filtros: [], incluir_sin_dato: false }, atributos: ["fragancia"] });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ facetas: [] });
    expect(acceso.llamadas.map((l) => l.metodo)).toEqual(["facetas"]);
  });
});

describe("GET /openapi.json", () => {
  it("documenta las rutas con esquemas", async () => {
    const { app } = montar();
    const r = await app.request("/openapi.json");
    expect(r.status).toBe(200);
    const doc = await r.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual(["/buscar", "/diccionario/{dominio}", "/facetas", "/salud"]);
    expect(doc.paths["/buscar"].post.requestBody.content["application/json"].schema).toBeDefined();
  });
});
