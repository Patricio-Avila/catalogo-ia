# ADR-0001: PostgreSQL en Supabase para la base real y Supabase local para desarrollo y mediciones

- Estado: aceptada, 2026-10-31. Reconstruida el 2026-11-20 a partir de `CLAUDE.md` §4 y §7.3, porque el archivo original no llegó al repositorio. La decisión es la registrada en esa fecha. Las razones marcadas como reconstrucción deben confirmarse con el equipo.
- Decisores: Patricio Avila por el equipo (Valeria Hernández, Alejandro Gómez).
- Ámbito: dónde vive la base de datos del sistema, dónde se desarrolla y se mide, y con qué se prueba.

## Contexto

El documento 1 fijó PostgreSQL con Supabase. El prototipo del cuarto avance (S8) corrió en PostgreSQL 16 y midió la búsqueda con faltantes en 183 ms. Para los documentos 2 y 3 hacían falta tres cosas:

- una base pública para la demo;
- un entorno reproducible para desarrollar y medir, con hardware documentado (§7.3);
- pruebas automatizadas de las guardas G3 y G4, que viven en roles, permisos y funciones SQL.

Restricciones: costo cero, repo público y tres integrantes.

## Decisión

1. Base real: PostgreSQL en Supabase nube, plan Free. El plan Free pausa los proyectos inactivos, así que un flujo semanal de GitHub Actions (`keepalive.yml`) la mantiene activa.
2. Desarrollo y mediciones: Supabase local en Docker (`supabase start`), con las mismas migraciones que la nube. Las cifras de los documentos 2 y 3 se toman ahí, con el hardware documentado junto a cada medición.
3. Pruebas de base: pgTAP con `supabase test db`, en local y en CI (GitHub Actions con `supabase start`).
4. El esquema solo cambia por migraciones en `supabase/migrations/`. Antes de aplicar a la nube: `supabase db reset` en limpio y pgTAP en verde.

## Alternativas consideradas

- PGlite (PostgreSQL en WebAssembly). Fuera. La razón reconstruida: no reproduce roles, `statement_timeout` por rol ni la Edge Function, que son justo lo que G3 y G4 deben demostrar.
- Neon. Descartado. La razón reconstruida: ya se había elegido Supabase en el documento 1 por las Edge Functions, y agregar otro proveedor sumaba cuentas y configuración sin cambiar el modelo de datos.

## Consecuencias

- Las mediciones son reproducibles en cualquier máquina con Docker y en el runner de CI. Por eso las cifras de la nube no sirven para comparar con las de local.
- Desde el 2026-11-20, CI corre las mediciones de las funciones de búsqueda (`pnpm medir`) y el banco de evaluación contra PostgreSQL. Los resultados quedan como artefacto de cada corrida.
- `docs/mediciones/t8_resultados.md` se midió en la nube. Una nota en ese documento lo declara.
