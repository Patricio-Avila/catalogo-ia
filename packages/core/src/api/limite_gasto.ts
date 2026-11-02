// Tope de gasto del modelo (plan de trabajo, C4). La demo es pública y la clave
// anónima viaja al cliente: cualquiera puede llamar a /buscar en bucle. G4 limita
// la base; esto limita las llamadas al modelo. Solo aplica al camino con texto
// libre; las acciones estructuradas no cuestan y no se limitan.
//
// Dos topes: por cliente (ventana deslizante de un minuto) y global por día.
// La implementación en memoria vive por instancia de la función; es una primera
// barrera, no una contabilidad exacta. Si hiciera falta precisión, la misma
// interfaz se implementa sobre una tabla del esquema servicio.

export interface LimiteGasto {
  /** true si la petición puede llamar al modelo; false si se agotó algún tope. */
  permitir(clave: string): boolean;
}

export interface OpcionesLimite {
  /** Llamadas al modelo por cliente por minuto. */
  porMinuto: number;
  /** Llamadas al modelo en total por día (UTC). */
  porDia: number;
}

export const LIMITE_POR_OMISION: OpcionesLimite = { porMinuto: 12, porDia: 3000 };

export class LimiteMemoria implements LimiteGasto {
  private readonly ventanas = new Map<string, number[]>();
  private diaActual = "";
  private usadasHoy = 0;
  rechazadas = 0;

  constructor(
    private readonly opciones: OpcionesLimite = LIMITE_POR_OMISION,
    private readonly ahora: () => number = () => Date.now(),
  ) {}

  permitir(clave: string): boolean {
    const t = this.ahora();
    const dia = new Date(t).toISOString().slice(0, 10);
    if (dia !== this.diaActual) {
      this.diaActual = dia;
      this.usadasHoy = 0;
    }
    if (this.usadasHoy >= this.opciones.porDia) {
      this.rechazadas++;
      return false;
    }

    const desde = t - 60_000;
    const recientes = (this.ventanas.get(clave) ?? []).filter((x) => x > desde);
    if (recientes.length >= this.opciones.porMinuto) {
      this.ventanas.set(clave, recientes);
      this.rechazadas++;
      return false;
    }

    recientes.push(t);
    this.ventanas.set(clave, recientes);
    this.usadasHoy++;
    if (this.ventanas.size > 10_000) this.podar(desde);
    return true;
  }

  private podar(desde: number): void {
    for (const [clave, marcas] of this.ventanas) {
      if (marcas.every((x) => x <= desde)) this.ventanas.delete(clave);
    }
  }
}

/** Sin tope: para pruebas y para el arnés de evaluación. */
export const SIN_LIMITE: LimiteGasto = { permitir: () => true };
