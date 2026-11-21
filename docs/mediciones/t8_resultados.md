# Mediciones T8 — Comparación Híbrido (`JSONB`) vs. EAV vs. Tabla Ancha y Clase GIN

**Fecha de ejecución:** 2026-11-14  
**Entorno medido:** Proyecto Supabase PostgreSQL 17 (`oowpkqcmqbiqctcbkzuo`, región `us-east-2`)  
**Volumen del catálogo:** `100,020` productos (`16,669` a `16,671` por categoría en 6 categorías; `866,471` pares clave-valor en EAV).  
**Equivalencia funcional verificada:** En los tres esquemas (`catalogo`, `eav`, `ancha`), `contar_productos('belleza', 'cuidado_facial', '[{"atributo":"tipo_piel","operador":"=","valor":"sensible"},{"atributo":"fragancia","operador":"=","valor":"sin perfume"}]', false)` devuelve exactamente `(total = 420, faltantes = 3090)`.

> **Notas de la revisión del 2026-11-20**
> 1. **Entorno.** Estas cifras se midieron en el proyecto de Supabase en la nube. ADR-0001 y `CLAUDE.md` §7.3 piden Supabase local con hardware documentado, y aquí no consta el hardware del servidor. Para el documento 2 deben medirse de nuevo en local o declararse como medición en la nube.
> 2. **Plan de §4.1.** Es el de una consulta directa sobre `catalogo.producto`, ordenada por `precio, id`. No es el plan de `buscar_productos` de 0005, que ordena por `cardinality(sin_dato), precio, id` y arma `cumple[]` y `sin_dato[]` con `GROUP BY`. Sirve como evidencia del uso del índice GIN con `@>`, no como plan de la función.
> 3. **§3.2.** Medía `buscar_productos` de 0005, que superaba la meta de 1 s (RNF-05) y el `statement_timeout` de 2 s del agente (G4) con 3 a 5 filtros. La migración 0007 cambia ese camino. Las cifras posteriores, medidas en CI con Supabase local (`pnpm medir`), van en §3.3.

---

## 1. Comparación de espacio en disco (`pg_total_relation_size`)

| Modelo / Esquema | Filas | Tamaño de tabla(s) | Tamaño de índices | Tamaño total (`pg_total_relation_size`) | Observaciones de evolución de esquema |
|---|---:|---:|---:|---:|---|
| **Híbrido (`catalogo.producto`) — con `pg_trgm`** | `100,020` | `50 MB` | `46 MB` | **`96 MB`** (`101,097,472` B) | Incluye `38 MB` de índices GIN `pg_trgm` sobre `nombre` (`11 MB`) y `descripcion` (`27 MB`) para búsqueda tolerante (Fase B). |
| **Híbrido (`catalogo.producto`) — solo estructural + GIN `jsonb`** | `100,020` | `50 MB` | `8.4 MB` | **`58.4 MB`** | Sin `pg_trgm`: `producto_pkey` (`2,208 kB`) + `dominio_categoria_idx` (`712 kB`) + `producto_atributos_idx` GIN (`5,496 kB`). No requiere `ALTER TABLE` al agregar atributos o verticales. |
| **EAV (`eav.producto` + `eav.producto_atributo`)** | `100,020` + `866,471` | `81 MB` | `78 MB` | **`159 MB`** (`166,912,000` B) | **2.7× más grande** que el híbrido estructural. Multiplica por `8.66` el número de filas por producto y exige clave primaria compuesta `(producto_id, atributo)` más tres índices parciales por tipo. |
| **Tabla Ancha (`ancha.producto`, 32 columnas)** | `100,020` | `32 MB` | `7,840 kB` | **`40 MB`** (`41,869,312` B) | Compacta el bitmap de `NULL` en la cabecera de tupla (`~65 %` de celdas vacías por fila), pero **viola P1**: cada nuevo atributo o vertical exige `ALTER TABLE` e índices B-Tree combinatorios por categoría. |

---

## 2. Elección de clase de operadores GIN (`jsonb_ops` vs. `jsonb_path_ops` — Corrección C1)

Se midieron ambos índices GIN simultáneamente sobre las `100,020` filas de `catalogo.producto`:

| Clase de operadores GIN | Índice | Tamaño en disco | Operadores soportados | Tiempo `Bitmap Index Scan` (3 igualdades `@>`) | Bloques leídos del índice |
|---|---|---:|---|---:|---:|
| `jsonb_ops` (por omisión) | `producto_atributos_idx` | **`5,496 kB`** (`5,627,904` B) | `@>`, `?`, `?|`, `?&`, `@?`, `@@` | `0.930 ms` | `16` (`shared hit=16`) |
| `jsonb_path_ops` | `producto_atributos_path_idx` | **`1,904 kB`** (`1,949,696` B) | `@>`, `@?`, `@@` *(no soporta `?`)* | `0.581 ms` | `16` (`shared hit=16`) |

**Justificación técnica (C1):**
1. En `catalogo.evaluar_filtros` (migración `0005`), las igualdades sobre atributos técnicos cuando `p_solo_con_dato = true` se agrupan en un único documento JSON y se evalúan mediante contención `p.atributos @> c.doc`.
2. El operador `?` (`not (c.atributos ? f.atributo)`) solo se evalúa en la proyección sobre el subconjunto de candidatos ya filtrado, por lo que no requiere un recorrido de índice GIN independiente.
3. `jsonb_path_ops` reduce el tamaño del índice GIN en **65.4 %** (`1,904 kB` frente a `5,496 kB`) y mejora el tiempo del `Bitmap Index Scan` de `0.930 ms` a `0.581 ms` porque almacena hashes de rutas completas (`clave → valor`) en lugar de entradas separadas por clave y valor.

---

## 3. Tiempos de respuesta `p50` y `p95` (1 a 5 filtros, con y sin `incluir_sin_dato`)

Consultas medidas sobre `belleza / cuidado_facial` (`16,669` productos en la categoría, `100,020` en la tabla), invocando `buscar_productos(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato, 20)` tras corrida de calentamiento:

1. **1 filtro:** `tipo_piel = 'sensible'`
2. **2 filtros:** `+ fragancia = 'sin perfume'`
3. **3 filtros:** `+ precio < 300` (rango numérico sobre columna fija)
4. **4 filtros:** `+ vegano = true` (booleano con cobertura 40 %)
5. **5 filtros:** `+ sin_parabenos = true` (booleano con cobertura 50 %)

### 3.1 Sin incluir faltantes (`incluir_sin_dato = false`, uso de índice en igualdades)

| Número de filtros | Híbrido (`catalogo`) `p50` / `p95` (ms) | Tabla Ancha (`ancha`) `p50` / `p95` (ms) | EAV (`eav`) `p50` / `p95` (ms) | Ventaja Híbrido vs. EAV (`p50`) |
|---:|---:|---:|---:|---:|
| **1 filtro** | **`54.95` / `59.12`** | `75.48` / `76.80` | `394.07` / `564.31` | **7.2× más rápido** |
| **2 filtros** | **`22.71` / `22.92`** | `41.25` / `41.36` | `354.19` / `355.80` | **15.6× más rápido** |
| **3 filtros** | **`39.70` / `40.44`** | `57.85` / `64.01` | `370.03` / `370.96` | **9.3× más rápido** |
| **4 filtros** | **`13.03` / `13.13`** | `31.80` / `31.91` | `306.86` / `307.02` | **23.5× más rápido** |
| **5 filtros** | **`6.64` / `6.69`** | `25.40` / `25.57` | `298.88` / `300.51` | **45.0× más rápido** |

> **Hallazgo clave:** En el esquema híbrido (`catalogo`), agregar más filtros de igualdad **reduce** la latencia de `54.95 ms` (1 filtro) hasta **`6.64 ms`** (5 filtros), porque el índice GIN intersecta las listas de posting de todas las claves del documento `@>` antes de tocar las páginas de la tabla (`Heap Blocks: exact=84`). En la tabla ancha (`ancha`), el índice compuesto B-Tree `(dominio, categoria, tipo_piel, fragancia)` solo cubre los primeros atributos y obliga a filtrar `vegano` y `sin_parabenos` leyendo el heap (`25.40 ms` a `31.80 ms`). En EAV, cada filtro exige un semi-join correlacionado contra `866,471` filas (`~300–394 ms`).

### 3.2 Incluyendo productos sin dato (`incluir_sin_dato = true`, recorrido completo de la categoría, RF-06)

| Número de filtros | Híbrido (`catalogo`) `p50` / `p95` (ms) | Tabla Ancha (`ancha`) `p50` / `p95` (ms) | EAV (`eav`) `p50` / `p95` (ms) |
|---:|---:|---:|---:|
| **1 filtro** | **`337.15` / `427.71`** | `370.01` / `370.93` | `572.82` / `606.54` |
| **2 filtros** | **`631.58` / `655.53`** | `682.25` / `690.51` | `829.02` / `888.15` |
| **3 filtros** | **`1337.13` / `1365.77`** | `1359.22` / `1380.86` | `1540.70` / `1561.00` |
| **4 filtros** | `1599.82` / `1615.66` | **`1552.16` / `1562.15`** | `1921.02` / `1952.74` |
| **5 filtros** | `1885.30` / `2369.43` | **`1782.64` / `1790.12`** | `2103.77` / `2138.38` |

> **Observación sobre `incluir_sin_dato = true`:** Cuando el usuario activa explícitamente la casilla para incluir productos que carecen del atributo filtrado (`RF-06`), ningún índice de igualdad puede descartar filas por adelantado porque la ausencia de clave (`not (atributos ? k)` o `columna IS NULL`) califica como candidata potencial. En ese régimen, el costo está dominado por el `GROUP BY` de construcción de los arreglos `cumple[]` y `sin_dato[]` sobre los `16,669` productos de la categoría.

### 3.3 Después de la migración 0007 (2026-11-20)

Pendiente: se llena con el artefacto `resultados-base-de-datos` del job de base de datos en CI. `pnpm medir` deja `docs/mediciones/resultados/funciones-<fecha>.json`, con las funciones de 0007 (usuario del agente, `statement_timeout` de 2 s) frente a los cuerpos de 0005 (administrador, sin tope de tiempo). Los casos son los de §3.

---

## 4. Planes de ejecución (`EXPLAIN (ANALYZE, BUFFERS)`)

### 4.1 Esquema Híbrido (`catalogo.producto` con GIN `@>` y `BitmapAnd`)
```text
Limit  (cost=148.68..148.73 rows=20 width=54) (actual time=6.215..6.220 rows=20 loops=1)
  Buffers: shared hit=115
  ->  Sort  (cost=148.68..148.82 rows=57 width=54) (actual time=6.213..6.216 rows=20 loops=1)
        Sort Key: precio, id
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=115
        ->  Bitmap Heap Scan on producto p  (cost=84.00..147.16 rows=57 width=54) (actual time=5.977..6.152 rows=86 loops=1)
              Recheck Cond: ((atributos @> '{"vegano": true, "fragancia": "sin perfume", "tipo_piel": "sensible"}'::jsonb) AND (dominio = 'belleza'::text) AND (categoria = 'cuidado_facial'::text))
              Heap Blocks: exact=84
              Buffers: shared hit=115
              ->  BitmapAnd  (cost=84.00..84.00 rows=57 width=0) (actual time=5.947..5.948 rows=0 loops=1)
                    Buffers: shared hit=31
                    ->  Bitmap Index Scan on producto_atributos_path_idx  (cost=0.00..18.42 rows=983 width=0) (actual time=0.581..0.581 rows=169 loops=1)
                          Index Cond: (atributos @> '{"vegano": true, "fragancia": "sin perfume", "tipo_piel": "sensible"}'::jsonb)
                          Buffers: shared hit=16
                    ->  Bitmap Index Scan on producto_dominio_categoria_idx  (cost=0.00..65.30 rows=5841 width=0) (actual time=5.352..5.352 rows=16669 loops=1)
                          Index Cond: ((dominio = 'belleza'::text) AND (categoria = 'cuidado_facial'::text))
                          Buffers: shared hit=15
Planning Time: 4.230 ms
Execution Time: 6.280 ms
```

### 4.2 Esquema EAV (`eav.producto` + 3 joins a `eav.producto_atributo` con `CREATE STATISTICS`)
```text
Limit  (cost=7236.09..7236.10 rows=1 width=54) (actual time=886.409..886.419 rows=20 loops=1)
  Buffers: shared hit=10924
  ->  Sort  (cost=7236.09..7236.10 rows=1 width=54) (actual time=886.407..886.414 rows=20 loops=1)
        Sort Key: p.precio, p.id
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=10924
        ->  Nested Loop  (cost=3316.68..7236.08 rows=1 width=54) (actual time=36.608..886.314 rows=86 loops=1)
              Join Filter: (a1.producto_id = a2.producto_id)
              Buffers: shared hit=10924
              ->  Nested Loop  (cost=3316.25..7203.36 rows=17 width=70) (actual time=36.005..885.201 rows=391 loops=1)
                    Join Filter: (a1.producto_id = a3.producto_id)
                    Buffers: shared hit=9441
                    ->  Hash Join  (cost=3315.83..6724.35 rows=233 width=62) (actual time=35.858..876.614 rows=1998 loops=1)
                          Hash Cond: (a1.producto_id = p.id)
                          Buffers: shared hit=2675
                          ->  Bitmap Heap Scan on producto_atributo a1  (cost=47.88..3445.38 rows=4201 width=8) (actual time=9.222..846.545 rows=3970 loops=1)
                                Recheck Cond: ((atributo = 'tipo_piel'::text) AND (valor_texto = 'sensible'::text))
                                Heap Blocks: exact=1817
                                Buffers: shared hit=1823
                          ->  Hash  (cost=3198.61..3198.61 rows=5547 width=54) (actual time=26.572..26.574 rows=16669 loops=1)
                                Buckets: 32768  Batches: 1  Memory Usage: 1701kB
                                Buffers: shared hit=852
                    ->  Index Scan using producto_atributo_pkey on producto_atributo a3  (cost=0.42..2.04 rows=1 width=8) (actual time=0.004..0.004 rows=0 loops=1998)
                          Index Cond: ((producto_id = p.id) AND (atributo = 'vegano'::text))
                          Filter: valor_bool
                          Buffers: shared hit=6766
              ->  Index Scan using producto_atributo_pkey on producto_atributo a2  (cost=0.42..1.91 rows=1 width=8) (actual time=0.003..0.003 rows=0 loops=391)
                    Index Cond: ((producto_id = a3.producto_id) AND (atributo = 'fragancia'::text))
                    Filter: (valor_texto = 'sin perfume'::text)
                    Buffers: shared hit=1483
Planning Time: 9.449 ms
Execution Time: 886.660 ms
```
> Incluso con estadísticas extendidas (`CREATE STATISTICS eav.estadisticas_attr_valor (dependencies, ndistinct, mcv)`), las estadísticas de PostgreSQL solo cubren correlaciones dentro de una misma fila y no entre auto-joins (`a1 ⋈ a2 ⋈ a3`). Como resultado, el optimizador subestima la cardinalidad (`rows=17` estimado vs `391` real; `rows=1` estimado vs `86` real) y ejecuta `1,998 + 391 = 2,389` búsquedas puntuales por B-Tree (`10,924` buffers frente a `115` buffers del modelo híbrido).

### 4.3 Esquema Tabla Ancha (`ancha.producto`)
```text
Limit  (cost=478.19..478.19 rows=1 width=54) (actual time=63.175..63.181 rows=20 loops=1)
  Buffers: shared hit=310 read=41
  ->  Sort  (cost=478.19..478.19 rows=1 width=54) (actual time=63.173..63.177 rows=20 loops=1)
        Sort Key: precio, id
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=310 read=41
        ->  Index Scan using producto_belleza_idx on producto p  (cost=0.29..478.18 rows=1 width=54) (actual time=49.088..63.103 rows=86 loops=1)
              Index Cond: ((categoria = 'cuidado_facial'::text) AND (tipo_piel = 'sensible'::text) AND (fragancia = 'sin perfume'::text))
              Filter: vegano
              Rows Removed by Filter: 334
              Buffers: shared hit=310 read=41
Planning Time: 0.492 ms
Execution Time: 63.216 ms
```

---

## 5. Matriz de trazabilidad (Documento 2 — `CLAUDE.md §7.3`)

| Problema / Hallazgo | Requisito | Guarda | Módulo / Archivo | Entidad / Función SQL | Prueba que lo verifica |
|---|---|---|---|---|---|
| **P1** Atributos heterogéneos entre verticales y categorías | `RF-08`, `RF-10` | `G1` | `supabase/migrations/20261102160000_esquemas_vertical_producto.sql`, `20261102160300_diccionario.sql` | `catalogo.producto (atributos jsonb)`, `catalogo.diccionario_atributos`, `catalogo.obtener_diccionario()` | `03_diccionario.test.sql` (pgTAP) y `validar.test.ts` (Vitest) |
| **P2** Datos incompletos (coberturas 40 % a 100 %) que un filtro ingenuo excluye en silencio | `RF-05`, `RF-06`, `RF-07`, `RF-11` | `G5` | `supabase/migrations/20261102160200_atributo_meta_y_trigger.sql`, `20261102160400_funciones_busqueda.sql` | `interno.producto_verdad`, `catalogo.verificar_producto()`, `catalogo.contar_productos()`, `catalogo.calcular_facetas()` | `02_trigger_obligatorios.test.sql`, `04_busqueda.test.sql`, `acceso_memoria.test.ts` |
| **P3** Carga de traducir lenguaje natural a filtros y recalcular sin re-invocar al modelo | `RF-01`, `RF-03`, `RF-04`, `RF-10`, `RNF-05` | `G5` | `packages/core/src/interpretar.ts`, `acciones.ts`, `extractor/numerico.ts`, `apps/web/src/vista.ts` | `servicio.cache_consultas`, `catalogo.buscar_productos()` | `interpretar.test.ts`, `acciones.test.ts`, `numerico.test.ts`, `vista.test.ts`, `06_cache.test.sql` |
| **P4** Riesgos de inyección de instrucciones (LLM01), inyección SQL y agencia excesiva (LLM06) | `RF-02`, `RF-11`, `RNF-01`, `RNF-02`, `RNF-03`, `RNF-04` | `G1`, `G2`, `G3`, `G4` | `packages/core/src/g1/validar.ts`, `datos/acceso.ts`, `supabase/migrations/20261102160100_roles.sql` | Roles `catalogo_duenio`, `agente_lectura`, `agente_api`; esquemas `interno` y `servicio` aislados | `01_guardas_g3_g4.test.sql`, `validar.test.ts`, `app.test.ts`, `eval/correr.ts` (5 consultas maliciosas) |
| **P5** Falta de trazabilidad entre lo pedido y el resultado; riesgo de confundir compatibilidad técnica con equivalencia o uso/riesgo | `RF-05`, `RF-09`, `RF-11` | `G5` | `packages/core/src/vocabulario.ts`, `supabase/migrations/20261102160400_funciones_busqueda.sql` | `catalogo.buscar_productos()` (`cumple`, `sin_dato`), `catalogo.comparar_productos()`, `interno.par_trampa` | `05_comparar.test.sql` (9 pares trampa), `vocabulario.test.ts` |
