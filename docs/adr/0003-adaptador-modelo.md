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
4. **Criterio de evaluación:** La evaluación reproducible (`eval/correr.ts`) corre con la caché apagada el banco de 30 consultas (10 por vertical, incluidas 10 con vocabulario ajeno), 5 consultas maliciosas y 3 de contexto de riesgo, y se contrasta con la línea base de filtrado manual (`RF-10`). Se evalúa el mismo adaptador que se despliega: `AdaptadorInteractivo` con `FIXTURES_DEMO`, que no contiene ninguna frase del banco (`fixtures_demo.test.ts` lo verifica).

## Alternativas consideradas

- **Dependencia obligatoria de Gemini API en producción y evaluación:** Permite mayor cobertura ante paráfrasis no previstas, pero introduce costos potenciales, exposición a cuotas de API y dependencia de red para demostrar el sistema. Descartada como dependencia obligatoria; conservada como adaptador opcional.
- **Integrar Jev en Fase A:** Exige cuenta y verificación de proveedor externo adicional y no cubre la comparación por fotografía prevista para la Fase C. Diferida a trabajo futuro.
- **Solo `AdaptadorFixtures`:** Limita la demo interactiva exclusivamente a las frases exactas del banco de pruebas. Superada por `AdaptadorInteractivo`, que generaliza sobre el diccionario real de cualquier vertical.

## Consecuencias

- La aplicación web, la API Hono y el despliegue en GitHub Pages / Supabase Free operan de extremo a extremo con costo operacional cero y sin exigir claves externas de IA.
- Se mantiene intacto el agnosticismo del núcleo: activar un modelo generativo externo en el futuro equivale a fijar `GEMINI_API_KEY` en secretos sin tocar la base de datos ni el frontend.
- Las pruebas automatizadas de `packages/core` verifican ambos adaptadores bajo el mismo contrato Zod y las mismas guardas `G1`–`G5`. Las de `AdaptadorGemini` usan transporte simulado: la llamada real al proveedor no está verificada todavía (fase 5 de la revisión del 2026-11-20).

## Datos verificados (corregidos el 2026-11-20)

La tabla publicada el 2026-11-16 reportaba 100 % de exactitud (30/30) y 100 % en vocabulario ajeno (10/10). Esas cifras se obtuvieron con `AdaptadorFixtures` y unos fixtures que tenían una respuesta fija para cada una de las 35 frases del banco, así que medían una tabla de búsqueda y no la interpretación. Sus latencias, además, se midieron con el catálogo en memoria (`AccesoMemoria`), no en PostgreSQL. La versión anterior queda en el historial de git.

Cifras actuales, `eval/resultados/2026-11-20-interactivo-memoria.json` (`AdaptadorInteractivo` con `FIXTURES_DEMO`, cero frases del banco con respuesta fija, caché apagada, catálogo sintético en memoria):

| Indicador | Resultado |
|---|---|
| Exactitud del objeto de filtros (30 consultas) | `23.3 %` (`7/30`) |
| Por tipo: normal / baja cobertura / vocabulario ajeno / secuencia | `1/15` / `2/3` / `2/10` / `2/2` |
| Coincidencia de resultados con la línea base manual (`RF-10`) | `53.3 %` |
| Maliciosas bloqueadas, adaptador evaluado / modelo engañado | `5/5` / `5/5` |
| Contexto de riesgo bloqueado (`RF-11`), adaptador / modelo engañado | `3/3` / `3/3` |
| Catálogo intacto después de las maliciosas | sí |
| Violaciones de vocabulario prohibido (`G5`) | `0` |
| Interacciones texto libre vs. modo manual | `30` vs. `95` |

Lectura: la coincidencia léxica sobre el diccionario no entiende sinónimos, la categoría ni la intención ("hidratante", "pastillas", "cutis"), y eso explica la mayor parte de los fallos. Las guardas no dependen del adaptador: con un modelo que obedece al atacante (`eval/modelo_enganado.ts`), G1 y G2 bloquean los 8 casos.

Las latencias en memoria no se reportan como evidencia de `RNF-05`: el recálculo contra PostgreSQL se mide con `pnpm eval -- --acceso=postgres` (ver `docs/mediciones/`).

Pendiente: con `7/30`, la afirmación de que el adaptador interactivo basta para la entrega ya no se sostiene por sí sola. Si se mantiene esta decisión o se activa `AdaptadorGemini` por omisión lo decide el equipo, después de correr el mismo banco con Gemini (`pnpm eval -- --adaptador=gemini`).
