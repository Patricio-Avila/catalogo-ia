import { createServer, Socket, type AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { AccesoPostgres, BaseNoDisponible } from "./acceso";
import { SSL_REQUEST, socketTlsPropio, type ConexionRed, type PrimitivasRed } from "./socket_propio";

const aBuffer = (d: Uint8Array) => Buffer.from(d.buffer, d.byteOffset, d.byteLength);

/** Conexión falsa: entrega los trozos de `lecturas` en orden y guarda lo escrito. */
function conexionFalsa(lecturas: Uint8Array[]) {
  const escritos: Uint8Array[] = [];
  let cerrada = false;
  let despertar: (() => void) | null = null;
  const conexion: ConexionRed & { escritos: Uint8Array[]; cerrada: () => boolean; empujar: (d: Uint8Array) => void } = {
    escritos,
    cerrada: () => cerrada,
    empujar(d) {
      lecturas.push(d);
      despertar?.();
    },
    async read(destino) {
      while (lecturas.length === 0) {
        if (cerrada) return null;
        await new Promise<void>((listo) => (despertar = listo));
        despertar = null;
      }
      const trozo = lecturas.shift()!;
      destino.set(trozo);
      return trozo.length;
    },
    async write(datos) {
      escritos.push(new Uint8Array(datos));
      return datos.length;
    },
    close() {
      cerrada = true;
      despertar?.();
    },
  };
  return conexion;
}

function primitivas(tcp: ConexionRed, tls: ConexionRed): PrimitivasRed & { hosts: string[] } {
  const hosts: string[] = [];
  return {
    hosts,
    conectar: async ({ hostname }) => (hosts.push(hostname), tcp),
    iniciarTls: async () => tls,
    aBuffer,
  };
}

const esperar = () => new Promise((listo) => setTimeout(listo, 0));

describe("Socket propio con TLS del runtime (enmienda de ADR-0002)", () => {
  it("negocia TLS con SSLRequest y queda marcado para que el driver no lo repita", async () => {
    const tcp = conexionFalsa([Uint8Array.of(0x53)]);
    const tls = conexionFalsa([]);
    const p = primitivas(tcp, tls);
    const socket = await socketTlsPropio(p)({}, "pooler.ejemplo.invalid", 6543);
    expect(p.hosts).toEqual(["pooler.ejemplo.invalid"]);
    expect(tcp.escritos).toEqual([SSL_REQUEST]);
    expect(socket.negotiated).toBe(true);
    expect(socket.secure).toBe(true);
  });

  it("si la base no acepta TLS, falla y cierra la conexión", async () => {
    const tcp = conexionFalsa([Uint8Array.of(0x4e)]); // 'N'
    await expect(socketTlsPropio(primitivas(tcp, conexionFalsa([])))({}, "h", 1)).rejects.toMatchObject({ code: "SSL_NOT_SUPPORTED" });
    expect(tcp.cerrada()).toBe(true);
  });

  it("cada trozo leído llega como Buffer con memoria propia", async () => {
    const tls = conexionFalsa([Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5)]);
    const socket = await socketTlsPropio(primitivas(conexionFalsa([Uint8Array.of(0x53)]), tls))({}, "h", 1);
    const recibidos: Uint8Array[] = [];
    socket.on("data", (d: Uint8Array) => recibidos.push(d));
    await esperar();
    expect(recibidos.map((d) => [...d])).toEqual([[1, 2, 3], [4, 5]]);
    expect(Buffer.isBuffer(recibidos[0])).toBe(true);
    expect(recibidos[0]!.buffer).not.toBe(recibidos[1]!.buffer);
  });

  it("en pausa retiene lo leído y lo entrega al reanudar", async () => {
    const tls = conexionFalsa([]);
    const socket = await socketTlsPropio(primitivas(conexionFalsa([Uint8Array.of(0x53)]), tls))({}, "h", 1);
    const recibidos: number[][] = [];
    socket.on("data", (d: Uint8Array) => recibidos.push([...d]));
    socket.pause();
    tls.empujar(Uint8Array.of(9));
    await esperar();
    expect(recibidos).toEqual([]);
    socket.resume();
    await esperar();
    expect(recibidos).toEqual([[9]]);
  });

  it("escribe una copia en orden, end la manda antes de cerrar y close se emite una vez", async () => {
    const tls = conexionFalsa([]);
    const socket = await socketTlsPropio(primitivas(conexionFalsa([Uint8Array.of(0x53)]), tls))({}, "h", 1);
    let cierres = 0;
    socket.on("close", () => cierres++);
    const bufer = Uint8Array.of(1, 2);
    socket.write(bufer);
    bufer[0] = 7; // el driver reutiliza su búfer
    socket.end(Uint8Array.of(3));
    await esperar();
    await esperar();
    expect(tls.escritos.map((d) => [...d])).toEqual([[1, 2], [3]]);
    expect(tls.cerrada()).toBe(true);
    socket.destroy();
    expect(cierres).toBe(1);
  });

  it("un error de lectura se emite como error y después close", async () => {
    const tls = conexionFalsa([]);
    tls.read = async () => {
      throw new Error("conexión reiniciada");
    };
    const socket = await socketTlsPropio(primitivas(conexionFalsa([Uint8Array.of(0x53)]), tls))({}, "h", 1);
    const eventos: string[] = [];
    socket.on("error", () => eventos.push("error"));
    socket.on("close", () => eventos.push("close"));
    socket.on("data", () => eventos.push("data"));
    await esperar();
    expect(eventos).toEqual(["error", "close"]);
  });

  it("AccesoPostgres usa el socket propio: la base recibe SSLRequest una vez y luego el arranque", async () => {
    // Servidor que acepta TLS ('S') y después no responde. El TLS falso es la misma
    // conexión TCP, así que se ve lo que el driver manda tras la negociación.
    const recibido: Buffer[] = [];
    const sockets: Socket[] = [];
    const servidor = createServer((s) => {
      sockets.push(s);
      s.once("data", (d: Buffer) => {
        recibido.push(d);
        s.write(Buffer.of(0x53));
        s.on("data", (resto: Buffer) => recibido.push(resto));
      });
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const { port } = servidor.address() as AddressInfo;

    // Host remoto en la cadena para que opcionesConexion pida ssl: "require"; la
    // primitiva conecta al servidor local sin importar el nombre.
    const hosts: string[] = [];
    const conectar: PrimitivasRed["conectar"] = ({ hostname, port: puerto }) =>
      new Promise((resolver, rechazar) => {
        hosts.push(hostname);
        const cliente = new Socket();
        cliente.once("error", rechazar);
        cliente.connect(puerto, "127.0.0.1", () => resolver(conexionDeNode(cliente)));
      });
    const socket = socketTlsPropio({ conectar, iniciarTls: async (c) => c, aBuffer });
    const acceso = new AccesoPostgres({ url: `postgresql://agente_api@db.ejemplo.invalid:${port}/postgres`, topeMs: 300, socket });
    try {
      await expect(acceso.obtenerVerticales()).rejects.toBeInstanceOf(BaseNoDisponible);
      expect(hosts).toEqual(["db.ejemplo.invalid"]);
      // Si el driver repitiera la negociación, después de la primera SSLRequest vendría otra.
      const todo = Buffer.concat(recibido);
      expect([...todo.subarray(0, 8)]).toEqual([...SSL_REQUEST]);
      // StartupMessage: largo, versión 3.0 (196608) y el usuario.
      expect(todo.readInt32BE(12)).toBe(196608);
      expect(todo.subarray(16).toString("latin1")).toContain("agente_api");
    } finally {
      await acceso.cerrar();
      sockets.forEach((s) => s.destroy());
      await new Promise((listo) => servidor.close(listo));
    }
  });
});

/** Adapta un net.Socket de Node a la forma de Deno.Conn que esperan las primitivas. */
function conexionDeNode(s: Socket): ConexionRed {
  const cola: Buffer[] = [];
  let fin = false;
  let despertar: (() => void) | null = null;
  s.on("data", (d: Buffer) => (cola.push(d), despertar?.()));
  s.on("close", () => ((fin = true), despertar?.()));
  return {
    async read(destino) {
      while (cola.length === 0) {
        if (fin) return null;
        await new Promise<void>((listo) => (despertar = listo));
        despertar = null;
      }
      const trozo = cola.shift()!;
      const n = Math.min(trozo.length, destino.length);
      destino.set(trozo.subarray(0, n));
      if (n < trozo.length) cola.unshift(trozo.subarray(n));
      return n;
    },
    write: (datos) => new Promise((listo, fallo) => s.write(datos, (e) => (e ? fallo(e) : listo(datos.length)))),
    close: () => s.destroy(),
  };
}
