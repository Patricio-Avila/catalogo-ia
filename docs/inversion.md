# Inversión — efectivo, costo variable y horas

Foto al 2026-10-31. Montos en USD salvo indicación. Este archivo cubre el costo de construir y operar la demo académica; no contiene precios a clientes, márgenes ni modelo comercial, que no van al repositorio público.

## 1. Efectivo

| Concepto | Monto | Cuándo | Nota |
|---|---|---|---|
| Supabase, plan Free | 0 | Siempre | 500 MB de base, 50,000 MAU, 5 GB de egreso, 500,000 invocaciones de Edge Functions al mes; pausa tras una semana sin actividad, mitigada con el keep-alive semanal |
| Supabase, plan Pro | 25 al mes | Solo si hace falta en la semana de entrega | 8 GB, sin pausa, respaldos diarios, 10 de crédito de cómputo |
| GitHub: repositorio, Actions y Pages | 0 | Siempre | Gratuito en repositorios públicos |
| Cloudflare Pages (respaldo) | 0 | Solo si se usa | |
| Dominio propio | 10 a 30 al año | Opcional | `.com` a costo en Cloudflare Registrar; `.com.mx` ronda los 500 MXN al año. La demo funciona sin dominio en `usuario.github.io/repo` |
| Herramientas de desarrollo | 0 | | Node, pnpm, Docker, Supabase CLI, Vite, Hono, Vitest, pgTAP, Tailwind: todas gratuitas |
| Cuentas de tiendas de apps | 0 | No aplica | Sin app instalable no hay cuota de Apple (99 al año) ni de Google Play (25 una sola vez) |

Total en efectivo para construir y demostrar: 0. Con dominio propio, de 10 a 30 al año.

## 2. Costo variable: el modelo

Supuesto de trabajo por búsqueda en texto libre: 3,500 tokens de entrada (texto + diccionario de la vertical + filtros vigentes) y 150 de salida. Las acciones estructuradas (quitar etiqueta, elegir faceta, incluir sin dato) y los aciertos de caché no llaman al modelo. Precios por millón de tokens.

| Opción | Precio | Por cada 1,000 búsquedas | Con caché del proveedor sobre el diccionario | Fuente y estado |
|---|---|---|---|---|
| Claude Haiku 5.5 | 0.10 entrada, 0.50 salida, 0.01 lectura de caché (peticiones de hasta 100K tokens) | 0.43 | 0.15 a 0.20 | Rastreador de precios llmreference.com (2026-10-07); confirmar en https://www.anthropic.com/pricing/claude |
| GPT-5.6 Luna | 0.20 entrada, 1.20 salida, 0.02 entrada en caché | 0.88 | 0.34 | Página oficial del modelo en developers.openai.com (2026-10-31) |
| Jev (TypeSafe AI) | 0.042 entrada, salida sin costo | 0.15 | no aplica | Rastreadores de precios (eesel.ai, flaviocopes.com, 2026); confirmar en docs.typesafe.ai |

Cálculo: 1,000 búsquedas = 3.5 millones de tokens de entrada y 0.15 millones de salida. Haiku 5.5: 3.5 × 0.10 + 0.15 × 0.50 = 0.425. Luna: 3.5 × 0.20 + 0.15 × 1.20 = 0.88. Jev: 3.5 × 0.042 = 0.147. Con caché del proveedor se asume que 3,000 de los 3,500 tokens de entrada (el diccionario) se cobran a la tarifa de caché.

Demo y evaluación completas, unas 5,000 búsquedas en texto libre: Haiku 5.5 ≈ 2.1; Luna ≈ 4.4; Jev ≈ 0.75. Menos de 5 USD con cualquiera. El adaptador de respaldo para números ambiguos (LLM con JSON acotado junto a Jev) agrega centavos.

Regla: ningún precio de modelo entra a un entregable sin la página oficial del proveedor como fuente y con fecha de consulta. Los rastreadores sirven para esta estimación, no para citar.

## 3. Horas

Estimación propia para el equipo de tres; se ajusta con las semanas reales que queden del tetramestre. Las tareas son las de `CLAUDE.md` §11.

| Fase y tarea | Horas |
|---|---|
| A · T0 Repo, monorepo, CI esqueleto | 4 a 6 |
| A · T1 Importar el núcleo desde la Edge Function | 2 a 4 |
| A · T2 Migraciones, roles, `vertical`, `atributo_meta` y trigger, diccionario, funciones de búsqueda, facetas y comparación, caché, generador con verdad y pares trampa | 16 a 22 |
| A · T3 Núcleo: esquema, validación con `inferible`, extractor, adaptador de fixtures, acceso a datos, vocabulario prohibido | 12 a 16 |
| A · T4 API Hono, OpenAPI, CORS | 6 a 8 |
| A · T5 Cliente web: selector de vertical, pantalla principal con etiquetas manuales, detalle, aclaración, sin resultados, menú, PWA | 26 a 34 |
| A · T6 Banco de evaluación y arnés, línea base manual | 10 a 14 |
| A · T7 Adaptadores reales y ADR-0003 | 10 a 14 |
| A · T8 Comparación EAV y tabla ancha | 10 a 14 |
| A · T9 Despliegue en Supabase y GitHub Pages, keep-alive | 3 a 5 |
| Fase A, total | 99 a 137 |
| B · T10 Comparación por identificador y nombre: endpoint, `pg_trgm`, extracción desde texto, pantalla, casos y pares trampa | 16 a 24 |
| B · T11 Modo asistido: esquema, máquina de estados, endpoint, alertas por SQL, plantillas, panel, escenarios | 18 a 28 |
| Fase B, total | 34 a 52 |
| C · T12 Comparación por foto: adaptador de visión, imágenes sintéticas de prueba, entrada en pantalla | 15 a 25 |
| Construcción, total | 148 a 214 |
| Documento 2 | 20 a 30 |
| Documento 3 | 20 a 30 |
| Total con documentos | 188 a 274 |

Capacidad de referencia: tres personas durante seis semanas a 6 horas semanales son 108 horas; a 10 horas semanales, 180. La fase A cabe en el primer escenario; B y C requieren el segundo o más semanas. Orden de recorte si falta tiempo: C, luego B, y dentro de A primero T8 (se documenta como trabajo futuro con su diseño). Nunca se recortan T6 ni las guardas.

## 3.1 Costo de la comparación por foto

Una imagen cuesta del orden de 1,000 a 1,500 tokens de entrada en los modelos con visión de los proveedores considerados (cifra de trabajo; confirmar en la página oficial del proveedor elegido en ADR-0003). A los precios de §2: entre 0.0001 y 0.0003 USD por foto con Haiku 5.5 o Luna. Mil comparaciones por foto: menos de 0.50 USD. Jev no procesa imágenes.

## 4. Supuestos

- Tokens por búsqueda: 3,500 de entrada y 150 de salida, estimados en el tercer avance; se recalculan con el banco de evaluación.
- Tipo de cambio de referencia para montos en MXN: 18.50 MXN por USD; etiquetarlo siempre.
- Las horas son de personas con el stack ya instalado; la primera instalación de Docker y Supabase CLI suma de 1 a 2 horas por integrante.

## 5. Fuentes (verificadas el 2026-10-31)

- Supabase, precios: https://supabase.com/pricing (resúmenes consultados en makerkit.dev, jetadmin.io y selfhost.dev)
- OpenAI, GPT-5.6 Luna: https://developers.openai.com/api/docs/models/gpt-5.6-luna.md
- Claude Haiku 5.5 según rastreador: https://www.llmreference.com/model/claude-haiku-5-5/anthropic-api ; página oficial: https://www.anthropic.com/pricing/claude
- Jev según rastreadores: https://www.eesel.ai/blog/typesafe-jev-pricing ; https://flaviocopes.com/jev-pricing/ ; oficial: https://docs.typesafe.ai
- GitHub Actions, facturación: https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- Cuotas de tiendas (no aplican; referencia): https://splitmetrics.com/blog/google-play-apple-app-store-fees/
