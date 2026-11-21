# ADR-0003: Adaptador de modelo activo sin costo y estrategia enchufable (D-01)

- Estado: aceptada, 2026-11-16. Cierra la decisión abierta D-01 de `CLAUDE.md` §5 bajo restricción de costo cero y autonomía sin dependencia obligatoria de API externa.
- Decisores: Patricio Avila por el equipo (Valeria Hernández, Alejandro Gómez).
- Ámbito: capa de interpretación en `packages/core/src/modelo/`, Edge Function (`supabase/functions/api/index.ts`), cliente web (`apps/web/src/cliente_api.ts`) y evaluación del sistema.

## Contexto

El proyecto requiere traducir peticiones en lenguaje natural hacia un objeto de filtros validado contra el diccionario de atributos (`G1`). En `ADR-0002` se definió una interfaz única `AdaptadorModelo` (`interpretar(texto, diccionario, filtrosVigentes)`) para mantener al núcleo agnóstico respecto al proveedor de modelo, contemplando tres implementaciones: fixtures deterministas, un modelo de lenguaje con salida JSON acotada (`AdaptadorGemini`) y eventualmente un modelo de decisión tipada (Jev).

Durante la implementación de la Fase A se construyó además `AdaptadorInteractivo` (`packages/core/src/modelo/heuristico.ts`), que combina los casos exactos de `AdaptadorFixtures` con coincidencia léxica sobre el diccionario de la vertical elegida y trabaja junto al extractor numérico (`packages/core/src/extractor/numerico.ts`). Al mismo tiempo, operar la demo pública o ejecutar pruebas continuas contra una API generativa externa conlleva dependencia de credenciales, latencia de red y posibles cargos o límites de cuota en la cuenta del equipo.

## Decisión

1. **Adaptador activo por omisión (costo cero):** Se adopta `AdaptadorInteractivo` (en conjunto con el extractor numérico y la guarda `G1`) como adaptador activo por omisión tanto para el cliente web en modo local (`apps/web/src/cliente_api.ts`) como para la Edge Function cuando no exista la variable `GEMINI_API_KEY` (`supabase/functions/api/index.ts`).
2. **Adaptador LLM enchufable (`AdaptadorGemini`):** Se mantiene implementado y probado `AdaptadorGemini` (`packages/core/src/modelo/gemini.ts`) con saneamiento de entrada, esquema JSON acotado y tope de gasto por IP/día (`LimiteMemoria`). Su activación es opcional mediante `supabase secrets set GEMINI_API_KEY=...` sin modificar el núcleo, el contrato OpenAPI ni el cliente web.
3. **Diferimiento de Jev:** La integración de un modelo de decisión tipada (Jev) queda fuera de la Fase A y se documenta como trabajo futuro, dado que la restricción de costo cero, la disponibilidad inmediata de visión para la Fase C y las métricas locales satisfacen los requisitos de la entrega.
4. **Criterio de evaluación:** La evaluación determinista reproducible (`eval/correr.ts`) corre contra el banco de 30 consultas (10 por vertical, incluidas 10 con vocabulario ajeno) y 5 consultas maliciosas con la caché apagada, y se contrasta con la línea base de filtrado manual (`RF-10`).

## Alternativas consideradas

- **Dependencia obligatoria de Gemini API en producción y evaluación:** Permite mayor cobertura ante paráfrasis no previstas, pero introduce costos potenciales, exposición a cuotas de API y dependencia de red para demostrar el sistema. Descartada como dependencia obligatoria; conservada como adaptador opcional.
- **Integrar Jev en Fase A:** Exige cuenta y verificación de proveedor externo adicional y no cubre la comparación por fotografía prevista para la Fase C. Diferida a trabajo futuro.
- **Solo `AdaptadorFixtures`:** Limita la demo interactiva exclusivamente a las frases exactas del banco de pruebas. Superada por `AdaptadorInteractivo`, que generaliza sobre el diccionario real de cualquier vertical.

## Consecuencias

- La aplicación web, la API Hono y el despliegue en GitHub Pages / Supabase Free operan de extremo a extremo con costo operacional cero y sin exigir claves externas de IA.
- Se mantiene intacto el agnosticismo del núcleo: activar un modelo generativo externo en el futuro equivale a fijar `GEMINI_API_KEY` en secretos sin tocar la base de datos ni el frontend.
- Las pruebas automatizadas (`188` en `packages/core`, incluidas `5` de `AdaptadorGemini` con transporte simulado) verifican el comportamiento de ambos adaptadores bajo el mismo contrato Zod y las mismas guardas `G1`–`G5`.

## Datos verificados (2026-11-16)

| Indicador medido en `eval/correr.ts` (caché apagada) | Resultado |
|---|---|
| Exactitud del objeto de filtros (30 consultas) | `100.0 %` (`30/30`) |
| Exactitud en vocabulario ajeno (10 consultas) | `100.0 %` (`10/10`) |
| Coincidencia con línea base manual (`RF-10`) | `96.7 %` |
| Bloqueo de consultas maliciosas (`G1` / `G2`) | `100.0 %` (`5/5`) |
| Violaciones de vocabulario prohibido (`G5`) | `0` |
| Interacciones texto libre vs. modo manual | `30` vs. `95` pasos (`68.4 %` menos interacciones) |
| Latencia con modelo local (`p50` / `p95`) | `0.232 ms` / `1.764 ms` |
| Latencia de recálculo sin modelo (`p50` / `p95`) | `0.155 ms` / `0.583 ms` |
