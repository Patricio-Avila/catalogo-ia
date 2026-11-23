import { createServer, type AddressInfo, type Socket } from "node:net";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { AccesoPostgres, BaseNoDisponible, conTope, esFallaDeConexion, OID, opcionesConexion, parametrosTipados } from "./acceso";

describe("Tope por operación (enmienda de ADR-0002)", () => {
  it("una operación a tiempo devuelve su resultado y no descarta la conexión", async () => {
    let descartes = 0;
    await expect(conTope(async () => 7, 1000, () => descartes++)).resolves.toBe(7);
    expect(descartes).toBe(0);
  });

  it("una operación atascada vence, descarta la conexión y sale como BaseNoDisponible", async () => {
    let descartes = 0;
    const atascada = new Promise<never>(() => {});
    await expect(conTope(() => atascada, 20, () => descartes++)).rejects.toBeInstanceOf(BaseNoDisponible);
    expect(descartes).toBe(1);
  });

  it("las fallas de conexión del driver salen como BaseNoDisponible", async () => {
    for (const code of ["QUEUE_TIMEOUT", "CONNECTION_CLOSED", "PROTOCOL_ERROR"]) {
      const error = Object.assign(new Error(code), { code });
      await expect(conTope(() => Promise.reject(error), 1000, () => {})).rejects.toMatchObject({ name: "BaseNoDisponible", motivo: code });
    }
  });

  it("el statement_timeout (57014) y los demás errores de la consulta pasan tal cual", async () => {
    const error = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    await expect(conTope(() => Promise.reject(error), 1000, () => {})).rejects.toBe(error);
    expect(esFallaDeConexion(error)).toBe(false);
  });

  it("AccesoPostgres: si la base no contesta, vence el tope y la siguiente operación abre otra conexión", async () => {
    // Servidor que acepta la conexión y nunca responde: el caso de la consulta atascada.
    const sockets: Socket[] = [];
    const servidor = createServer((s) => void sockets.push(s));
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const { port } = servidor.address() as AddressInfo;
    const acceso = new AccesoPostgres({ url: `postgresql://agente_api@127.0.0.1:${port}/postgres`, topeMs: 200 });
    try {
      await expect(acceso.obtenerVerticales()).rejects.toBeInstanceOf(BaseNoDisponible);
      await expect(acceso.obtenerDiccionario("belleza")).rejects.toBeInstanceOf(BaseNoDisponible);
      expect(sockets).toHaveLength(2);
    } finally {
      await acceso.cerrar();
      sockets.forEach((s) => s.destroy());
      await new Promise((listo) => servidor.close(listo));
    }
  });
});

describe("Opciones del driver para el pooler (ADR-0002)", () => {
  it("una consulta en vuelo por conexión, sin sentencias preparadas y con espera acotada", () => {
    const op = opcionesConexion({ url: "postgresql://agente_api.ref@pooler.ejemplo.invalid:6543/postgres" });
    expect(op.max_pipeline).toBe(1);
    expect(op.prepare).toBe(false);
    expect(op.max).toBe(1);
    expect(op.queue_timeout).toBeGreaterThan(0);
    expect(op.ssl).toBe("require");
  });

  it("en local no exige SSL", () => {
    expect(opcionesConexion({ url: "postgresql://agente_api@127.0.0.1:54322/postgres" }).ssl).toBeUndefined();
  });

  it("los parámetros de texto, número y arreglo llevan tipo, también cuando son null", () => {
    // postgres() no abre conexión hasta la primera consulta.
    const sql = postgres("postgresql://agente_api@127.0.0.1:1/postgres");
    const p = parametrosTipados(sql);
    expect(p.texto("belleza")).toMatchObject({ type: OID.texto, value: "belleza" });
    expect(p.texto(null)).toMatchObject({ type: OID.texto, value: null });
    expect(p.entero(20)).toMatchObject({ type: OID.entero, value: 20 });
    expect(p.arregloTexto(null)).toMatchObject({ type: OID.arregloTexto, value: null });
  });
});
