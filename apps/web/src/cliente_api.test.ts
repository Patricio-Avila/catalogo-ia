import { afterEach, describe, expect, it, vi } from "vitest";
import { crearClienteHttp } from "./cliente_api";

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
