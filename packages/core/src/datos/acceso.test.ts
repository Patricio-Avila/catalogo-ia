import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { OID, opcionesConexion, parametrosTipados } from "./acceso";

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
