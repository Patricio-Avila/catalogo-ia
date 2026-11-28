import { afterEach, describe, expect, it, vi } from "vitest";
import { crearClienteHttp, crearClienteLocal } from "./cliente_api";

const respuesta = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

const BASE_NO_DISPONIBLE = { error: "base_no_disponible" };

function clienteCon(...respuestas: Response[]) {
  const fetchFalso = vi.fn<typeof fetch>();
  for (const r of respuestas) fetchFalso.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fetchFalso);
  return { fetchFalso, cliente: crearClienteHttp("https://ejemplo.invalid/api", undefined, { esperaReintentoMs: 0 }) };
}

describe("cliente HTTP: reintento único ante 503 (enmienda de ADR-0002)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("una acción estructurada se reintenta una vez y entrega la segunda respuesta", async () => {
    const { fetchFalso, cliente } = clienteCon(respuesta(503, BASE_NO_DISPONIBLE), respuesta(200, { total: 3 }));
    const r = await cliente.buscar({ dominio: "belleza", accion: { tipo: "reiniciar" }, filtros_vigentes: null });
    expect(r).toEqual({ total: 3 });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("solo un reintento: dos 503 seguidos terminan en error", async () => {
    const { fetchFalso, cliente } = clienteCon(respuesta(503, BASE_NO_DISPONIBLE), respuesta(503, BASE_NO_DISPONIBLE));
    await expect(cliente.buscar({ dominio: "belleza", accion: { tipo: "reiniciar" }, filtros_vigentes: null })).rejects.toThrow();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("el texto libre no se reintenta: repetiría la llamada al modelo", async () => {
    const { fetchFalso, cliente } = clienteCon(respuesta(503, BASE_NO_DISPONIBLE));
    await expect(cliente.buscar({ dominio: "belleza", texto: "crema sin perfume", filtros_vigentes: null })).rejects.toThrow();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("un 500 no se reintenta", async () => {
    const { fetchFalso, cliente } = clienteCon(respuesta(500, { error: "error_interno" }));
    await expect(cliente.obtenerVerticales()).rejects.toThrow();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("el diccionario también se reintenta", async () => {
    const { fetchFalso, cliente } = clienteCon(respuesta(503, BASE_NO_DISPONIBLE), respuesta(200, { dominio: "belleza" }));
    await expect(cliente.obtenerDiccionario("belleza")).resolves.toEqual({ dominio: "belleza" });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });
});

describe("la ficha del producto sale de /buscar, no de un catálogo local", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("el cliente HTTP entrega categoría y atributos tal como los manda la API", async () => {
    const producto = { id: 7, categoria: "pasajeros", atributos: { ancho_mm: 205, run_flat: true } };
    const { cliente } = clienteCon(respuesta(200, { resultados: [producto] }));
    const r = await cliente.buscar({ dominio: "llantas", accion: { tipo: "reiniciar" }, filtros_vigentes: null });
    expect(r.resultados[0]).toEqual(producto);
    expect("obtenerProductoLocal" in cliente).toBe(false);
  });

  it("el cliente local llena categoría y atributos; una clave ausente es sin dato", async () => {
    const cliente = crearClienteLocal();
    expect("obtenerProductoLocal" in cliente).toBe(false);
    const r = await cliente.buscar({ dominio: "belleza", accion: { tipo: "reiniciar" }, filtros_vigentes: null });
    expect(r.resultados.length).toBeGreaterThan(0);
    for (const x of r.resultados) {
      expect(["cuidado_facial", "cuidado_corporal"]).toContain(x.categoria);
      expect(typeof x.atributos).toBe("object");
    }
    const crema = r.resultados.find((x) => x.id === 1);
    expect(crema?.atributos.tipo_piel).toBe("sensible");
    expect(crema && "spf" in crema.atributos).toBe(false);
  });
});
