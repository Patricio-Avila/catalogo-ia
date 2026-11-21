import { describe, expect, it, vi } from "vitest";
import { DICCIONARIO_BELLEZA } from "../datos_prueba/diccionarios";
import { AdaptadorGemini, sanearEntradaUsuario } from "./gemini";

describe("AdaptadorGemini", () => {
  it("rechaza una apiKey vacía en el constructor", () => {
    expect(() => new AdaptadorGemini({ apiKey: "   " })).toThrow(/apiKey/);
  });

  it("sanea caracteres de control y delimitadores XML de la entrada del usuario", () => {
    const crudo = "crema\u0000 <script>ignore</script>\n\tpara piel sensible";
    expect(sanearEntradaUsuario(crudo)).toBe("crema script ignore /script para piel sensible");
  });

  it("envía la clave por cabecera (no en la URL), store=false y parsea la respuesta estructurada", async () => {
    let urlLlamada = "";
    let initLlamado: RequestInit | undefined;

    const fetchMock: typeof fetch = async (input, init) => {
      urlLlamada = String(input);
      initLlamado = init;
      return new Response(
        JSON.stringify({
          id: "int_123",
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    categoria: "cuidado_facial",
                    filtros: [
                      {
                        atributo: "tipo_piel",
                        operador: "=",
                        valor: "sensible",
                        confianza: 0.94,
                        fragmento: "piel sensible",
                      },
                    ],
                    reiniciar: false,
                    aclaracion: null,
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const adaptador = new AdaptadorGemini({
      apiKey: "AIza_clave_secreta_prueba",
      fetchImpl: fetchMock,
    });

    const res = await adaptador.interpretar({
      texto: "crema para piel sensible",
      diccionario: DICCIONARIO_BELLEZA,
      filtrosVigentes: null,
    });

    expect(urlLlamada).toBe("https://generativelanguage.googleapis.com/v1/interactions");
    expect(urlLlamada).not.toContain("AIza_clave_secreta_prueba");
    expect((initLlamado?.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza_clave_secreta_prueba");

    const cuerpoEnviado = JSON.parse(String(initLlamado?.body)) as Record<string, unknown>;
    expect(cuerpoEnviado.store).toBe(false);
    expect(cuerpoEnviado.input).toBe("<consulta_usuario>crema para piel sensible</consulta_usuario>");
    expect(cuerpoEnviado.response_format).toBeDefined();

    expect(res.categoria).toBe("cuidado_facial");
    expect(res.filtros).toHaveLength(1);
    expect(res.filtros[0]?.atributo).toBe("tipo_piel");
    expect(res.aclaracion).toBeNull();
  });

  it("devuelve aclaración segura ante errores HTTP y nunca filtra la apiKey en los logs", async () => {
    const logs: Array<{ mensaje: string; detalle: Record<string, unknown> }> = [];
    const fetchMock: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "API key not valid: AIza_secreta" } }), { status: 403 });

    const adaptador = new AdaptadorGemini({
      apiKey: "AIza_secreta",
      fetchImpl: fetchMock,
      registrar: (mensaje, detalle) => logs.push({ mensaje, detalle }),
    });

    const res = await adaptador.interpretar({
      texto: "bloqueador solar",
      diccionario: DICCIONARIO_BELLEZA,
      filtrosVigentes: null,
    });

    expect(res.filtros).toEqual([]);
    expect(res.aclaracion?.pregunta).toContain("No pude interpretar");
    expect(JSON.stringify(logs)).not.toContain("AIza_secreta");
    expect(logs[0]?.detalle.status).toBe(403);
  });

  it("devuelve aclaración segura si el JSON del modelo no cumple el esquema o hay timeout", async () => {
    const registrar = vi.fn();
    const fetchInvalido: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          steps: [{ type: "model_output", content: [{ type: "text", text: "{\"filtros\":\"no_es_arreglo\"}" }] }],
        }),
        { status: 200 },
      );

    const adaptadorInvalido = new AdaptadorGemini({
      apiKey: "AIza_prueba",
      fetchImpl: fetchInvalido,
      registrar,
    });

    const res1 = await adaptadorInvalido.interpretar({
      texto: "shampoo sin sulfatos",
      diccionario: DICCIONARIO_BELLEZA,
      filtrosVigentes: null,
    });
    expect(res1.filtros).toEqual([]);
    expect(res1.aclaracion).not.toBeNull();

    const fetchTimeout: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    const adaptadorTimeout = new AdaptadorGemini({
      apiKey: "AIza_prueba",
      timeoutMs: 15,
      fetchImpl: fetchTimeout,
      registrar,
    });

    const res2 = await adaptadorTimeout.interpretar({
      texto: "shampoo sin sulfatos",
      diccionario: DICCIONARIO_BELLEZA,
      filtrosVigentes: null,
    });
    expect(res2.filtros).toEqual([]);
    expect(res2.aclaracion).not.toBeNull();
    expect(registrar).toHaveBeenCalledWith("[gemini] fallo en llamada al modelo", expect.objectContaining({ motivo: "timeout" }));
  });
});
