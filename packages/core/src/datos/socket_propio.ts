// Socket propio para postgres.js (enmienda de ADR-0002, 2026-11-27).
//
// En la Edge Function, postgres.js abre TCP y TLS con la capa de compatibilidad
// con Node de Deno, y ahí pierde el hilo del protocolo ("The server sent a message
// with an invalid length"). Con este socket, la conexión y el TLS los hacen las
// primitivas que entrega el adaptador: Deno.connect y Deno.startTls en la Edge
// Function. El núcleo no usa Deno.*; recibe las primitivas como parámetro.
//
// Negociación: se envía SSLRequest, se espera la 'S' de la base y se inicia TLS.
// El socket se marca `negotiated` para que postgres.js no la repita. Cada lectura
// usa un búfer nuevo, así que ningún trozo que el driver guarde en su cola se
// sobrescribe después.

/** Lo mínimo de una conexión de red: la forma de Deno.Conn. */
export interface ConexionRed {
  read(destino: Uint8Array): Promise<number | null>;
  write(datos: Uint8Array): Promise<number>;
  close(): void;
}

export interface PrimitivasRed {
  conectar(destino: { hostname: string; port: number }): Promise<ConexionRed>;
  iniciarTls(conexion: ConexionRed, destino: { hostname: string }): Promise<ConexionRed>;
  /** Envuelve lo leído en el Buffer que espera postgres.js (readInt32BE, copy). */
  aBuffer(datos: Uint8Array): Uint8Array;
}

/** SSLRequest del protocolo de PostgreSQL: largo 8 y el código 80877103. */
export const SSL_REQUEST = new Uint8Array([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]);
const ACEPTA_TLS = 0x53; // 'S'
const TAMANO_LECTURA = 65_536;

type Oyente = (...args: never[]) => void;

/**
 * Fábrica para la opción `socket` de postgres.js. Cada conexión del driver llama a
 * la fábrica con el host y el puerto de la cadena de conexión.
 */
export function socketTlsPropio(primitivas: PrimitivasRed) {
  return async (_opciones: unknown, host: string, port: number): Promise<SocketPropio> => {
    const tcp = await primitivas.conectar({ hostname: host, port });
    try {
      await escribirTodo(tcp, SSL_REQUEST);
      const respuesta = new Uint8Array(1);
      const leidos = await tcp.read(respuesta);
      if (leidos !== 1 || respuesta[0] !== ACEPTA_TLS) {
        throw Object.assign(new Error("La base no aceptó la conexión con TLS"), { code: "SSL_NOT_SUPPORTED" });
      }
      const tls = await primitivas.iniciarTls(tcp, { hostname: host });
      return new SocketPropio(tls, primitivas.aBuffer);
    } catch (error) {
      cerrarSinFallar(tcp);
      throw error;
    }
  };
}

/** Lo que postgres.js usa de un net.Socket (`SocketLike` en sus tipos). */
export class SocketPropio {
  readonly negotiated = true;
  readonly secure = true;
  private readonly oyentes = new Map<string, Set<Oyente>>();
  private pausado = false;
  private reanudar: (() => void) | null = null;
  private leyendo = false;
  private cerrado = false;
  private escrituras: Promise<void> = Promise.resolve();

  constructor(
    private readonly conexion: ConexionRed,
    private readonly aBuffer: (datos: Uint8Array) => Uint8Array,
  ) {}

  on(evento: string, oyente: Oyente): this {
    let conjunto = this.oyentes.get(evento);
    if (!conjunto) this.oyentes.set(evento, (conjunto = new Set()));
    conjunto.add(oyente);
    // Se lee hasta que alguien escucha: un trozo emitido antes se perdería.
    if (evento === "data" && !this.leyendo) {
      this.leyendo = true;
      void this.leer();
    }
    return this;
  }

  off(evento: string, oyente: Oyente): this {
    this.oyentes.get(evento)?.delete(oyente);
    return this;
  }

  write(datos: Uint8Array): boolean {
    if (this.cerrado) return false;
    // Copia: la escritura es asíncrona y el driver puede reutilizar su búfer.
    const copia = new Uint8Array(datos);
    this.escrituras = this.escrituras.then(
      async () => {
        if (this.cerrado) return;
        await escribirTodo(this.conexion, copia);
        this.emitir("drain");
      },
    ).catch((error: unknown) => this.fallar(error));
    return true;
  }

  end(datos?: Uint8Array): void {
    if (datos) this.write(datos);
    this.escrituras = this.escrituras.then(() => this.cerrar());
  }

  destroy(_error?: Error): void {
    this.cerrar();
  }

  pause(): void {
    this.pausado = true;
  }

  resume(): void {
    this.pausado = false;
    const reanudar = this.reanudar;
    this.reanudar = null;
    reanudar?.();
  }

  private async leer(): Promise<void> {
    try {
      while (!this.cerrado) {
        const bufer = new Uint8Array(TAMANO_LECTURA);
        const leidos = await this.conexion.read(bufer);
        if (leidos === null) break;
        if (leidos === 0) continue;
        if (this.pausado) await new Promise<void>((listo) => (this.reanudar = listo));
        if (this.cerrado) break;
        this.emitir("data", this.aBuffer(bufer.subarray(0, leidos)));
      }
    } catch (error) {
      this.fallar(error);
    }
    this.cerrar();
  }

  private fallar(error: unknown): void {
    if (this.cerrado) return;
    this.emitir("error", error);
    this.cerrar();
  }

  private cerrar(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    cerrarSinFallar(this.conexion);
    const reanudar = this.reanudar;
    this.reanudar = null;
    reanudar?.();
    this.emitir("close");
  }

  private emitir(evento: string, ...argumentos: unknown[]): void {
    for (const oyente of [...(this.oyentes.get(evento) ?? [])]) {
      (oyente as (...a: unknown[]) => void)(...argumentos);
    }
  }
}

async function escribirTodo(conexion: ConexionRed, datos: Uint8Array): Promise<void> {
  let escritos = 0;
  while (escritos < datos.length) escritos += await conexion.write(datos.subarray(escritos));
}

function cerrarSinFallar(conexion: ConexionRed): void {
  try {
    conexion.close();
  } catch {
    // Ya estaba cerrada: Deno lanza BadResource.
  }
}
