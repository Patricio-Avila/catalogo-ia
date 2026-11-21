# catalogo-ia

Filtrado asistido por IA sobre catálogos con atributos heterogéneos.

Proyecto integrador de la materia Base de Datos Especializadas (Universidad Lux, Monterrey, tetramestre 6). Un catálogo de productos con atributos variables e incompletos en PostgreSQL (JSONB), un diccionario de atributos calculado por la propia base y un agente de solo lectura que traduce peticiones en lenguaje natural a un objeto de filtros validado, lo ejecuta con funciones parametrizadas y explica cada resultado, incluidos los productos sin dato.

Equipo: Carlos Patricio Avila Izaguirre, Valeria Hernández Hernández, Alejandro Gómez Martínez. Asesor: Ing. Julio A. García M.

## Estructura

```
apps/web/          cliente Vite + TypeScript sin framework (ADR-0006, propuesta)
packages/core/     validación, extractor numérico, adaptadores de modelo, acceso a datos
supabase/          migraciones, seed, Edge Function (Hono), pruebas pgTAP
eval/              banco de consultas, referencia SQL, arnés y resultados
docs/              ADR, marco teórico, inversión, modelo de datos, plan de trabajo
```

La memoria del proyecto y las reglas de trabajo están en `CLAUDE.md`. Las decisiones técnicas en `docs/adr/`.

## Requisitos

- Node 20 o superior y pnpm 9 o superior
- Docker Desktop (para `supabase start`)
- La CLI de Supabase viene como dependencia de desarrollo: `pnpm supabase <comando>`

## Arranque

```
pnpm install
pnpm supabase start          # stack local en Docker
pnpm supabase db reset       # migraciones y seed desde cero
pnpm supabase test db        # pruebas pgTAP
pnpm -r test                 # Vitest en packages/core y apps/web
pnpm --filter web dev        # cliente en desarrollo
pnpm eval                    # banco de evaluación en memoria (--acceso=postgres contra la base)
pnpm medir                   # p50/p95 de las funciones de búsqueda (URL_BASE_AGENTE y URL_BASE_ADMIN en .env)
```

## Licencia

MIT. Ver `LICENSE`. Excepción: `eval/resultados/obf-muestra.json` es un extracto de Open Beauty Facts bajo ODbL v1.0; ver `eval/resultados/LICENCIA_OBF.md`.
