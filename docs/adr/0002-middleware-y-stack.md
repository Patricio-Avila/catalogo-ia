# ADR-0002: Middleware agnóstico sobre Edge Functions y stack de la Fase 0

- Estado: aceptada, 2026-10-31. El punto 9 (hosting web) queda reemplazado por ADR-0004 el mismo día: GitHub Pages como principal.
- Decisores: Patricio Avila por el equipo (Valeria Hernández, Alejandro Gómez).
- Ámbito: capa intermedia entre el cliente y la base, acceso a datos, contrato de la API, adaptadores de modelo, caché, generador de datos, frontend, hosting, pruebas, CI y estructura del repositorio.

## Contexto

El documento 1 fijó React, Supabase con PostgreSQL y Edge Functions. El equipo quiere que el sistema sea agnóstico: poder cambiar de plataforma de middleware, de host de Postgres y de proveedor del modelo sin reescribir la lógica. La pregunta concreta era si sustituir Edge Functions por otro middleware.

El acoplamiento no está en Edge Functions sino en cómo se escribe el código que corre ahí. Hay tres ejes:

1. Plataforma del middleware: código escrito contra `Deno.serve` y variables de Deno solo corre en Deno.
2. Acceso a datos: `supabase-js` habla con PostgREST, que solo existe en Supabase; un driver de Postgres con SQL plano sirve en cualquier host de Postgres. Supabase indica que, al ser tecnología de servidor, es seguro conectarse directo a la base desde una Edge Function con cualquier cliente de Postgres y ejecutar SQL crudo; para funciones serverless recomienda el pooler Supavisor en modo transacción, con sentencias preparadas desactivadas.
3. Proveedor del modelo: el documento 1 lo deja para el documento 3; el tercer avance propuso Jev sin medición.

Restricciones: equipo de tres personas, dos documentos por escribir, repo público, costo cero.

## Decisión

1. Edge Functions se queda como runtime, solo como adaptador: un archivo que monta una app de Hono. Hono usa la API estándar web, pesa menos de 14 kB, no tiene dependencias y el mismo código corre en Cloudflare Workers, Deno, Bun, AWS Lambda, Vercel y Node.
2. Núcleo agnóstico en `packages/core` (TypeScript puro, sin `Deno.*` ni `supabase-js`): validación del objeto de filtros (G1), extractor numérico, interfaz `interpretar(texto, diccionario, filtrosVigentes)` con adaptadores de modelo, caché exacta y acceso a datos.
3. Acceso a datos con el driver `postgres` (postgres.js) por el pooler en modo transacción y `prepare: false`, conectando con un usuario propio que hereda `agente_lectura`. Nunca `service_role` ni la cadena del superusuario. Esto hace G2 y G3 explícitos y verificables.
4. Contrato: esquema del objeto de filtros en Zod, compartido por núcleo, cliente y OpenAPI 3.1 (`@hono/zod-openapi`). Endpoints `POST /buscar` y `POST /facetas`.
5. Modelo: interfaz única con tres adaptadores en este orden: fixtures (pruebas), LLM con JSON acotado, Jev. La elección se cierra en ADR-0003 con el banco de evaluación corrido contra los dos reales.
6. Caché exacta `servicio.cache_consultas` desde el inicio; caché semántica con pgvector solo como trabajo futuro.
7. Generador de datos en SQL (`generate_series`) dentro de `seed.sql`, conservando en el esquema interno el valor real de cada atributo antes de borrarlo.
8. Frontend: React + Vite + TypeScript + Tailwind, sin SSR; estado de filtros en el cliente.
9. Hosting web: Cloudflare (Workers con assets estáticos o Pages), GitHub Pages como respaldo; se fija en ADR-0004 al primer despliegue.
10. Pruebas: Vitest para el núcleo; pgTAP para funciones, roles y tiempos; GitHub Actions con `supabase start`. Cada guarda tiene al menos una prueba.
11. Repo: monorepo con pnpm (`apps/web`, `packages/core`, `supabase/`, `eval/`, `docs/`); licencia MIT; público desde el primer push con README y `.gitignore`.
12. Prueba de agnosticismo para el documento 3: el mismo núcleo corriendo en Edge Functions (demo) y en Node local (arnés de evaluación y pruebas).

## Alternativas consideradas

- Edge Functions con `Deno.serve` y `supabase-js`. Mínimo esfuerzo, acoplamiento alto a Deno, PostgREST y Supabase. Descartada.
- Servicio aparte desde ahora (Cloudflare Workers, Deno Deploy, Node en contenedor). Independencia total, pero un segundo despliegue, CORS, secretos, pooling y arranques en frío para un equipo de tres. Se conserva como salida futura: con la decisión tomada, migrar es cambiar el adaptador.
- API en Python (FastAPI). Segundo lenguaje y segundo hosting sin beneficio que lo justifique. Descartada.
- Sin middleware: React contra PostgREST. Saca del servidor la validación y la llamada al modelo; rompe G1 a G4. Descartada.
- Next.js o NestJS. No hay contenido que renderizar en servidor ni módulos que lo ameriten. Descartados.

## Consecuencias

- Ser agnóstico cuesta un archivo adaptador, no otra plataforma. Cambiar de host de Postgres es cambiar la cadena de conexión; cambiar de proveedor de modelo es un adaptador; cambiar de plataforma de middleware es un punto de entrada.
- Riesgo principal: que la Edge Function importe `packages/core` desde el monorepo. Es la primera tarea (T1 en `CLAUDE.md`); si no se resuelve en una hora, el núcleo se empaqueta a `supabase/functions/_shared/` en el build.
- Con el pooler en modo transacción no hay sentencias preparadas; el driver se configura con `prepare: false`.
- Límites a respetar en Edge Functions: 256 MB de memoria, 2 s de CPU por petición (la espera de red no cuenta), 150 s de reloj en el plan Free y 400 s en los de pago. El middleware valida un JSON y espera al modelo y a la base; usa milisegundos de CPU.
- El usuario de conexión del agente es un rol `LOGIN` miembro de `agente_lectura`, creado por migración; su contraseña vive en `supabase secrets`.
- Errores hacia el cliente genéricos; el detalle va al log de la función.

## Datos verificados (2026-10-31)

| Elemento | Dato |
|---|---|
| Supabase Edge Functions | Memoria máxima 256 MB; CPU 2 s por petición; reloj 150 s (Free) y 400 s (pago); tiempo de inactividad de petición 150 s; función de hasta 20 MB empaquetada; hasta 100 funciones en Free |
| Conexión directa desde Edge Functions | Soportada con Deno Postgres o postgres.js vía `SUPABASE_DB_URL`; pooler en modo transacción con `prepare: false` |
| Hono | API estándar web, menos de 14 kB, sin dependencias; corre en Cloudflare Workers, Fastly, Deno, Bun, AWS Lambda, Vercel, Netlify y Node (adaptador) |
| Cloudflare Workers Free | 100,000 peticiones al día, 10 ms de CPU por invocación, 128 MB, 50 subpeticiones por petición |
| Deno Deploy Free | 1 millón de peticiones al mes, 20 GiB de egreso, 10 horas de CPU al mes, 5 dominios, 10 apps (límites reducidos en 2026) |

## Fuentes

- Supabase, límites de Edge Functions: https://supabase.com/docs/guides/functions/limits
- Supabase, conexión a Postgres desde Edge Functions: https://supabase.com/docs/guides/functions/connect-to-postgres
- Supabase, pooler Supavisor y modo transacción: https://supabase.com/docs/guides/database/connecting-to-postgres
- Hono: https://hono.dev/docs/
- Cloudflare Workers, límites: https://developers.cloudflare.com/workers/platform/limits
- Deno Deploy y Cloudflare, niveles gratuitos comparados (septiembre de 2026): https://flaviocopes.com/hosting-free-tiers/
