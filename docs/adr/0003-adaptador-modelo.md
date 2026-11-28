# ADR-0003: Adaptador de modelo activo sin costo y estrategia enchufable (D-01)

- Estado: aceptada, 2026-11-16. Cierra la decisión abierta D-01 de `CLAUDE.md` §5 bajo restricción de costo cero y autonomía sin dependencia obligatoria de API externa. Revisión del adaptador interactivo el 2026-11-28 (ver al final).
- Decisores: Patricio Avila por el equipo (Valeria Hernández, Alejandro Gómez).
- Ámbito: capa de interpretación en `packages/core/src/modelo/`, Edge Function (`supabase/functions/api/index.ts`), cliente web (`apps/web/src/cliente_api.ts`) y evaluación del sistema.

## Contexto

El proyecto requiere traducir peticiones en lenguaje natural hacia un objeto de filtros validado contra el diccionario de atributos (`G1`). En `ADR-0002` se definió una interfaz única `AdaptadorModelo` (`interpretar(texto, diccionario, filtrosVigentes)`) para mantener al núcleo agnóstico respecto al proveedor de modelo, contemplando tres implementaciones: fixtures deterministas, un modelo de lenguaje con salida JSON acotada (`AdaptadorGemini`) y eventualmente un modelo de decisión tipada (Jev).

Durante la implementación de la Fase A se construyó además `AdaptadorInteractivo` (`packages/core/src/modelo/heuristico.ts`), que combina los casos exactos de `AdaptadorFixtures` con coincidencia léxica sobre el diccionario de la vertical elegida y trabaja junto al extractor numérico (`packages/core/src/extractor/numerico.ts`). Al mismo tiempo, operar la demo pública o ejecutar pruebas continuas contra una API generativa externa conlleva dependencia de credenciales, latencia de red y posibles cargos o límites de cuota en la cuenta del equipo.

## Decisión

1. **Adaptador activo por omisión (costo cero):** Se adopta `AdaptadorInteractivo` (en conjunto con el extractor numérico y la guarda `G1`) como adaptador activo por omisión tanto para el cliente web en modo local (`apps/web/src/cliente_api.ts`) como para la Edge Function cuando no exista la variable `GEMINI_API_KEY` (`supabase/functions/api/index.ts`).
2. **Adaptador LLM enchufable (`AdaptadorGemini`):** Se mantiene implementado y probado `AdaptadorGemini` (`packages/core/src/modelo/gemini.ts`) con saneamiento de entrada, esquema JSON acotado y un límite de llamadas por IP, por minuto y por día (`LimiteMemoria`). Ese límite vive en la memoria de cada instancia de la Edge Function, así que no es un tope global de gasto. Si se activa, debe usarse una clave de un proyecto sin facturación habilitada o con presupuesto y corte en Google Cloud. Su activación es opcional mediante `supabase secrets set GEMINI_API_KEY=...` sin modificar el núcleo, el contrato OpenAPI ni el cliente web.
3. **Diferimiento de Jev:** La integración de un modelo de decisión tipada (Jev) queda fuera de la Fase A y se documenta como trabajo futuro, dado que la restricción de costo cero, la disponibilidad inmediata de visión para la Fase C y las métricas locales satisfacen los requisitos de la entrega.
4. **Criterio de evaluación:** La evaluación reproducible (`eval/correr.ts`) corre con la caché apagada el banco de 30 consultas (10 por vertical, incluidas 10 con vocabulario ajeno), 5 consultas maliciosas y 3 de contexto de riesgo, y se contrasta con la línea base de filtrado manual (`RF-10`). Se evalúa el mismo adaptador que se despliega: `AdaptadorInteractivo` con `FIXTURES_DEMO`, que no contiene ninguna frase del banco (`fixtures_demo.test.ts` lo verifica).

## Alternativas consideradas

- **Dependencia obligatoria de Gemini API en producción y evaluación:** Permite mayor cobertura ante paráfrasis no previstas, pero introduce costos potenciales, exposición a cuotas de API y dependencia de red para demostrar el sistema. Descartada como dependencia obligatoria; conservada como adaptador opcional.
- **Integrar Jev en Fase A:** Exige cuenta y verificación de proveedor externo adicional y no cubre la comparación por fotografía prevista para la Fase C. Diferida a trabajo futuro.
- **Solo `AdaptadorFixtures`:** Limita la demo interactiva exclusivamente a las frases exactas del banco de pruebas. Superada por `AdaptadorInteractivo`, que generaliza sobre el diccionario real de cualquier vertical.

## Consecuencias

- La aplicación web, la API Hono y el despliegue en GitHub Pages / Supabase Free operan de extremo a extremo con costo operacional cero y sin exigir claves externas de IA.
- Se mantiene intacto el agnosticismo del núcleo: activar un modelo generativo externo en el futuro equivale a fijar `GEMINI_API_KEY` en secretos sin tocar la base de datos ni el frontend.
- Las pruebas automatizadas de `packages/core` verifican ambos adaptadores bajo el mismo contrato Zod y las mismas guardas `G1`–`G5`. Las de `AdaptadorGemini` usan transporte simulado: la llamada real al proveedor no está verificada. El 2026-11-21 se decidió no hacer llamadas reales para no generar cargos.

## Datos verificados (corregidos el 2026-11-20)

La tabla publicada el 2026-11-16 reportaba 100 % de exactitud (30/30) y 100 % en vocabulario ajeno (10/10). Esas cifras se obtuvieron con `AdaptadorFixtures` y unos fixtures que tenían una respuesta fija para cada una de las 35 frases del banco, así que medían una tabla de búsqueda y no la interpretación. Sus latencias, además, se midieron con el catálogo en memoria (`AccesoMemoria`), no en PostgreSQL. La versión anterior queda en el historial de git.

Cifras actuales del `AdaptadorInteractivo` con `FIXTURES_DEMO`: cero frases del banco con respuesta fija y caché apagada. Hay dos corridas: una con el catálogo de prueba en memoria (`eval/resultados/2026-11-20-interactivo-memoria.json`) y otra con los 100,020 productos en PostgreSQL, hecha en CI con Supabase local (`eval/resultados/2026-11-21-interactivo-postgres.json`).

| Indicador | Memoria | PostgreSQL |
|---|---|---|
| Exactitud del objeto de filtros (30 consultas) | `23.3 %` (`7/30`) | `23.3 %` (`7/30`) |
| Por tipo: normal / baja cobertura / vocabulario ajeno / secuencia | `1/15` / `2/3` / `2/10` / `2/2` | igual |
| Coincidencia de resultados con la línea base manual (`RF-10`) | `53.3 %` | `26.7 %` |
| Maliciosas bloqueadas, adaptador evaluado / modelo engañado | `5/5` / `5/5` | `5/5` / `5/5` |
| Contexto de riesgo bloqueado (`RF-11`), adaptador / modelo engañado | `3/3` / `3/3` | `3/3` / `3/3` |
| Catálogo intacto después de las maliciosas | sí | sí |
| Violaciones de vocabulario prohibido (`G5`) | `0` | `0` |
| Interacciones texto libre vs. modo manual | `30` vs. `95` | `30` vs. `95` |
| Recálculo sin modelo, `p50` / `p95` (`RNF-05`) | no aplica | `297.6` / `615.3 ms` |
| Texto libre completo, `p50` / `p95` | no aplica | `464.5` / `819.2 ms` |

La coincidencia con la línea base exige la misma primera página, el mismo total y los mismos faltantes. En memoria, 10 consultas con el objeto equivocado devolvían aun así los mismos resultados que el modo manual, porque el catálogo de prueba es pequeño. En PostgreSQL, con 100,020 productos, solo 2. La cifra que vale para el documento 3 es la de PostgreSQL.

Lectura: la coincidencia léxica sobre el diccionario no entiende sinónimos, la categoría ni la intención ("hidratante", "pastillas", "cutis"), y eso explica la mayor parte de los fallos. Las guardas no dependen del adaptador: con un modelo que obedece al atacante (`eval/modelo_enganado.ts`), G1 y G2 bloquean los 8 casos.

Las latencias en memoria no se reportan como evidencia de `RNF-05`. La de PostgreSQL se toma de la tabla y se detalla en `docs/mediciones/t8_resultados.md` §3.3.

Gemini no se evaluó: el 2026-11-21 se decidió no correr el banco contra la API real para no generar cargos. `AdaptadorGemini` queda enchufable y sin cifras propias; el documento 3 lo declara así. Con `7/30`, la afirmación de que el adaptador interactivo basta para la entrega no se sostiene por sí sola, y el documento 3 debe discutir esa cifra frente a la línea base. Si se mejora el adaptador interactivo, o si se evalúa Gemini con una clave sin facturación (`pnpm eval --adaptador=gemini`), lo decide el equipo.

## Revisión del 2026-11-28: reglas generales en el adaptador interactivo

El equipo decidió mejorar el adaptador interactivo sin agregar respuestas por frase. `heuristico.ts` agrega tres reglas que salen del diccionario o de la morfología, no del banco:

1. Plural y acentos: "tabletas" coincide con "tableta" y "capsulas" con "cápsula".
2. Formas derivadas de un valor en infinitivo: "hidratante" → hidratar, "limpiador" → limpiar. Entran con confianza 0.8, así que se aplican marcadas como sugeridas.
3. Categoría deducida: si el texto no nombra la categoría y los valores reconocidos solo existen juntos en una, se propone esa.

Los sinónimos y coloquialismos ("pastillas", "cutis", "piel delicada") siguen fuera: son trabajo del adaptador de lenguaje.

| Indicador | 2026-11-20 y 21 | 2026-11-28 |
|---|---|---|
| Exactitud, catálogo en memoria | `7/30` | `10/30` |
| Exactitud, PostgreSQL en CI (`eval/resultados/2026-11-28-interactivo-postgres.json`) | `7/30` | `12/30` |
| Por tipo en PostgreSQL: normal / baja cobertura / vocabulario ajeno / secuencia | `1/15` / `2/3` / `2/10` / `2/2` | `6/15` / `2/3` / `2/10` / `2/2` |
| Coincidencia con la línea base: memoria / PostgreSQL | `53.3 %` / `26.7 %` | `66.7 %` / `46.7 %` |
| Maliciosas y contexto de riesgo bloqueados | `8/8` | `8/8` |
| Violaciones de vocabulario prohibido | `0` | `0` |
| Recálculo sin modelo en PostgreSQL, `p50` / `p95` (RNF-05) | `297.6` / `615.3 ms` | `569.9` / `1,169.5 ms` |
| Texto libre completo en PostgreSQL, `p50` / `p95` | `464.5` / `819.2 ms` | `639.8` / `1,466.8 ms` |

Las latencias del 28 de noviembre no se deben al adaptador: el recálculo sin modelo no lo usa. En la misma corrida, `pnpm medir` midió las funciones SQL de 0005 y de 0007, que no cambiaron desde el 21, y todas tardaron de 1.5 a 2.0 veces más (`docs/mediciones/resultados/funciones-2026-11-28.json`). El runner compartido de GitHub fue más lento ese día. RNF-05 se cumple en una corrida y no en la otra, así que no se puede dar por cumplido con un runner compartido: hace falta medirlo en hardware documentado, como pide ADR-0001.

Advertencias para el documento 3:

- El resultado no es ciego. Las reglas se escribieron viendo qué consultas del banco fallaban, aunque ninguna nombra una frase. Una medición limpia necesita un banco nuevo de unas 15 frases escritas por Valeria o Alejandro sin ver el adaptador. El arnés ya lo admite: `pnpm eval --banco=<archivo>.json`.
- Tres consultas del banco no se pueden acertar con ningún adaptador. Piden valores fuera del rango del diccionario, y G1 los descarta: F05 (10 mg) y F06 (20 mg), cuando `concentracion_mg` en medicamentos va de 30 a 1000; y L08 (precio menor a 850), cuando el mínimo en pasajeros es 900.54. Corregir el banco le toca al equipo. Mientras tanto, el máximo alcanzable es `27/30`.
- La regla 3 puede proponer una categoría que el banco espera nula: en F03 los resultados son los mismos, pero el objeto no coincide.

