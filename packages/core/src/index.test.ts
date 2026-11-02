import { salud, VERSION_NUCLEO } from "./index";

describe("núcleo", () => {
  it("responde salud con la versión", () => {
    expect(salud()).toEqual({ estado: "ok", nucleo: VERSION_NUCLEO });
  });
});
