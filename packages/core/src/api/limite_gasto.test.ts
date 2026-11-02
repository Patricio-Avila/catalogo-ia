import { LimiteMemoria, SIN_LIMITE } from "./limite_gasto";

describe("LimiteMemoria", () => {
  it("permite hasta porMinuto llamadas por cliente y rechaza la siguiente", () => {
    let t = 1_700_000_000_000;
    const l = new LimiteMemoria({ porMinuto: 3, porDia: 100 }, () => t);
    expect([l.permitir("a"), l.permitir("a"), l.permitir("a")]).toEqual([true, true, true]);
    expect(l.permitir("a")).toBe(false);
    expect(l.permitir("b")).toBe(true); // otro cliente no se ve afectado
    t += 61_000;
    expect(l.permitir("a")).toBe(true); // la ventana se deslizó
    expect(l.rechazadas).toBe(1);
  });

  it("aplica el tope diario global y lo reinicia al cambiar de día", () => {
    let t = Date.UTC(2026, 10, 2, 23, 59, 0);
    const l = new LimiteMemoria({ porMinuto: 100, porDia: 2 }, () => t);
    expect([l.permitir("a"), l.permitir("b"), l.permitir("c")]).toEqual([true, true, false]);
    t = Date.UTC(2026, 10, 3, 0, 0, 1);
    expect(l.permitir("c")).toBe(true);
  });

  it("SIN_LIMITE siempre permite", () => {
    expect(SIN_LIMITE.permitir("x")).toBe(true);
  });
});
