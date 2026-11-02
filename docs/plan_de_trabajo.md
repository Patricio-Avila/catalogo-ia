# Plan de trabajo — Fase A y documentos 2 y 3

Foto al 2026-10-31. Horizonte: seis semanas, del lunes 2 de noviembre al viernes 11 de diciembre de 2026. Se ajusta en cuanto el asesor confirme las fechas de entrega de los documentos 2 y 3 (D-04).

Este plan ejecuta lo que `CLAUDE.md` §11 ya define (tareas T0 a T9) y le agrega orden semanal, responsables, horas y las correcciones de la auditoría del 31 de octubre. No reabre ninguna decisión cerrada.

## 1. Alcance congelado

Se construye la Fase A completa y se escriben los documentos 2 y 3. Las fases B (comparación por nombre y modo asistido) y C (foto) quedan como trabajo futuro con su diseño ya documentado en `CLAUDE.md` §6.2 y §7.2; solo se abren si la Fase A está cerrada y sobran horas.

Dentro de la Fase A, orden de recorte si falta tiempo: primero T8 (comparación EAV y tabla ancha se documenta con diseño y mediciones parciales), después la PWA y las pantallas secundarias de T5. Nunca se recortan T6 (banco de evaluación) ni las pruebas de las guardas G1 a G5.

Lo que sí se construye de ADR-0005 en Fase A porque el esquema lo necesita desde la primera migración: tablas `vertical` y `atributo_meta`, trigger de obligatorios (RF-11), etiquetas manuales (RF-10) y los pares trampa en el generador. La función `comparar_productos` se crea en la migración 0005 con su prueba pgTAP, pero no tiene endpoint ni pantalla hasta Fase B.

## 2. Correcciones de la auditoría que entran al plan

| Id | Corrección | Dónde cae | Criterio |
|---|---|---|---|
| C1 | Las igualdades del objeto de filtros se traducen a contención `@>` para que el índice GIN participe; se decide `jsonb_ops` vs `jsonb_path_ops` midiendo | T2 y T8 | `EXPLAIN (ANALYZE, BUFFERS)` muestra uso del índice en igualdades; el documento 2 reporta el plan real, sea cual sea |
| C2 | El adaptador LLM con salida JSON estructurada es el camino principal; Jev solo si queda tiempo en T7 | T3 y T7 | ADR-0003 puede cerrarse con un solo adaptador real medido |
| C3 | El banco de evaluación incluye por vertical al menos 3 consultas con vocabulario ajeno al diccionario (sinónimos, coloquialismos, errores de dedo) | T6 | `eval/consultas.json` las marca con `tipo: "vocabulario_ajeno"` y se reportan aparte |
| C4 | Tope de gasto del modelo antes de publicar la demo: límite por IP por minuto y presupuesto diario de llamadas al adaptador | T4 y T9 | Prueba Vitest: la llamada número N+1 recibe respuesta de aclaración sin invocar al modelo |
| C5 | El cálculo de `nivel` en `comparar_productos` se documenta con su limitación (referencias con pocos atributos inflan el nivel) | T2 | Comentario en la migración y nota en el documento 2 |
| C6 | Borrar los duplicados `CLAUDE.md`, `*_1.md` y dejar una sola versión de cada archivo en `docs/` | T0 | Un solo `CLAUDE.md` en la raíz del repo, el que hoy es `CLAUDE_1.md` |
| C7 | Opcional, solo si T6 cierra antes de tiempo: muestra de 200 a 300 productos reales de Open Beauty Facts para medir P2 con datos no sintéticos | Semana 5 | Mismo banco de belleza corrido contra la muestra real; resultado en el documento 3 como validación externa |

## 3. Equipo y frentes de trabajo

Tres personas, tres frentes. La asignación es una propuesta; el equipo la confirma el lunes 2 de noviembre. Cada frente tiene un responsable que integra y un apoyo que revisa.

| Frente | Qué cubre | Responsable (propuesta) | Apoyo |
|---|---|---|---|
| Base de datos | Migraciones, generador, diccionario, funciones, roles, pgTAP, comparación EAV y ancha, documento 2 | Patricio | Alejandro |
| Núcleo y API | `packages/core`, Zod, G1, extractor numérico, adaptadores, Hono, OpenAPI, tope de gasto, banco de evaluación y arnés | Alejandro | Patricio |
| Cliente y entregables | `apps/web`, pantallas de la maqueta S06 y S7, despliegue en Pages, documento 3, formato y referencias APA | Valeria | Patricio |

Reglas de equipo, tomadas de `CLAUDE.md` §1: plan antes de ejecutar, alcance mínimo, todo en español, esquema solo por migraciones, nunca secretos en el repo, cada guarda con prueba, nada se da por terminado sin revisión de otra persona del equipo.

Ritmo: una reunión corta los lunes (30 minutos: qué se cerró, qué se abre, qué bloquea) y revisión de pull requests entre semana. Cada tarea entra como pull request contra `main` con el criterio de terminado en la descripción.

## 4. Calendario por semanas

Horas por persona: meta de 8 a 10 semanales. Con 6 semanales la Fase A se cierra sin T8 completo; con 10, cabe completa.

### Semana 1 · 2 al 8 de noviembre · Cimientos

| Tarea | Responsable | Horas | Terminado cuando |
|---|---|---|---|
| T0 Repo público, monorepo pnpm, README, LICENSE MIT, `.gitignore`, `.editorconfig`, CI esqueleto; cerrar D-06 (nombre del repo) | Patricio | 4 a 6 | `pnpm install` y `supabase start` corren en las tres máquinas; CI en verde con pruebas vacías |
| C6 Consolidar documentación en `docs/` (CLAUDE.md único, ADR 0001 a 0005, marco teórico, inversión, modelo de datos, este plan) | Valeria | 1 a 2 | Sin duplicados; enlaces de CLAUDE.md apuntan a rutas reales |
| T1 La Edge Function importa `packages/core` | Alejandro | 2 a 4 | `GET /salud` responde usando una función del núcleo. Si no sale en una hora: empaquetar a `_shared/` en el build |
| T2.a Migraciones 0001 a 0003: esquemas, `producto` con `dominio` y `descripcion`, índices, roles y usuario de conexión, `vertical`, `atributo_meta` y trigger de obligatorios | Patricio | 8 a 10 | `supabase db reset` en limpio; pgTAP verde para G3 y el trigger (RF-11) |
| Pedir al asesor la rúbrica y fechas de los documentos 2 y 3 (D-04); confirmar en Moodle la entrega del documento 1 | Valeria | 1 | Respuesta registrada en CLAUDE.md §2 |
| Instalación de Docker y Supabase CLI en cada máquina | Todos | 1 a 2 c/u | `supabase status` muestra el stack local |

Hito 1 (viernes 6): repo público con CI, base local con esquema, roles probados.

### Semana 2 · 9 al 15 de noviembre · Datos y núcleo

| Tarea | Responsable | Horas | Terminado cuando |
|---|---|---|---|
| T2.b Migración 0004 diccionario por dominio con `version` y refresco concurrente; `seed.sql` con generador de tres verticales (§7.4), `producto_verdad`, `par_trampa`, semilla fija | Patricio | 6 a 8 | Coberturas del diccionario coinciden con las metas del generador (RF-08); carga reproducible entre máquinas |
| T2.c Migración 0005 `buscar_productos`, `calcular_facetas` y `comparar_productos` con el contrato de §6.1, cambios de §7.2 y C1 (`@>` en igualdades); migración 0006 `cache_consultas` | Patricio | 6 a 8 | pgTAP verde para G4, motivo de coincidencia (RF-05), facetas sobre el conjunto resultante (RF-07) y pares trampa en `comparar_productos`; `EXPLAIN` guardado en `docs/mediciones/` |
| T3.a Núcleo: esquema Zod del objeto de filtros, validación G1 con `inferible`, extractor numérico (precios, cantidades, medidas de llanta `205/55 R16 91V`, concentraciones) | Alejandro | 8 a 10 | Vitest verde; casos de G1 con atributos, valores y operadores inválidos y con atributos `define_riesgo` propuestos por el modelo |
| T5.a Cliente: esqueleto Vite + React + Tailwind, selector de vertical leído de `vertical`, pantalla principal con campo único, etiquetas y resultados contra datos de prueba locales | Valeria | 8 a 10 | Pantalla principal navegable en móvil con datos fijos |

Hito 2 (viernes 13): base completa con 100,000 productos reproducibles; G1 probado; cliente con pantalla principal.

### Semana 3 · 16 al 22 de noviembre · API y flujo de extremo a extremo

| Tarea | Responsable | Horas | Terminado cuando |
|---|---|---|---|
| T3.b Núcleo: interfaz `interpretar()` con adaptador de fixtures, acceso a datos con driver `postgres` (`prepare: false`), caché exacta, prueba de vocabulario prohibido | Alejandro | 4 a 6 | Vitest verde; G2 probada con fragmentos SQL en valores |
| T4 API Hono: `/buscar`, `/facetas`, OpenAPI 3.1 generado, CORS con lista de orígenes, C4 tope de gasto | Alejandro | 6 a 8 | Llamadas de prueba desde `supabase functions serve`; `docs/api/openapi.json` publicado; prueba del tope en verde |
| T5.b Cliente conectado a la API: etiquetas con confianza y origen, quitar etiqueta y elegir faceta sin modelo (RF-03), casilla de incluir sin dato (RF-06), agregar etiqueta manual con autocompletado del diccionario (RF-10), aviso en farmacia | Valeria | 10 a 12 | Flujo completo en las tres verticales contra Supabase local con el adaptador de fixtures, en texto libre y en modo manual |
| T6.a Banco de evaluación: 30 consultas (10 por vertical, 3 de ellas con vocabulario ajeno, C3), 4 o 5 maliciosas, secuencias de dos y tres mensajes; referencia SQL a mano por consulta | Patricio | 6 a 8 | `eval/consultas.json` y `eval/referencia/*.sql` completos y revisados por otra persona |

Hito 3 (viernes 20): demo funcional de punta a punta en local con fixtures.

### Semana 4 · 23 al 29 de noviembre · Modelo real y evaluación

| Tarea | Responsable | Horas | Terminado cuando |
|---|---|---|---|
| T7.a Adaptador LLM con JSON estructurado (proveedor elegido por precio oficial verificado, C2); secreto en `supabase secrets` | Alejandro | 6 a 8 | Las 30 consultas del banco producen objeto de filtros; errores del proveedor devuelven aclaración, nunca error crudo |
| T6.b Arnés `eval/correr.ts`: exactitud del objeto, coincidencia de resultados, exactitud de faltantes, p50 y p95 separando base y modelo; línea base con el modo manual (número de interacciones) | Patricio | 4 a 6 | Reporte reproducible en `eval/resultados/<fecha>-<adaptador>.json`; caché apagada; versión del modelo fija |
| T7.b Correr la evaluación; escribir ADR-0003 (D-01). Jev solo si quedan horas y el proveedor se verifica en su documentación oficial | Alejandro y Patricio | 4 a 6 | ADR-0003 aceptado con tabla de resultados |
| T5.c Pantallas del S7: detalle con descripción y motivo, aclaración con opciones, sin resultados, menú; manifiesto PWA | Valeria | 6 a 8 | Flujo revisado en un teléfono real |
| Documento 2: arranque. Diagrama entidad-relación, DDL comentado, generador con tabla de verdad, diccionario | Patricio y Valeria | 6 a 8 | Borrador con secciones y figuras numeradas |

Hito 4 (viernes 27): evaluación corrida con un modelo real; ADR-0003 cerrado; documento 2 en borrador.

### Semana 5 · 30 de noviembre al 6 de diciembre · Mediciones, despliegue y documento 2

| Tarea | Responsable | Horas | Terminado cuando |
|---|---|---|---|
| T8 Esquemas `eav` y `ancha` con funciones de la misma firma; tamaño con `pg_total_relation_size`; p50 y p95 con 1 a 5 filtros, con y sin `incluir_sin_dato`; planes; elección de clase de operadores GIN (C1) | Patricio | 10 a 14 | Tablas y planes en `docs/mediciones/`; hardware documentado |
| T9 Despliegue: `supabase db push`, `functions deploy`, secretos, `pages.yml`, `keepalive.yml`; `base` de Vite, `404.html` | Alejandro | 3 a 5 | Demo pública en `https://<usuario>.github.io/<repo>/` contra la base en la nube; tope de gasto activo |
| Documento 2: cierre. Comparación medida, matriz de trazabilidad hallazgo → requisito → módulo → entidad → prueba, declaración de cambios (D-08), referencias de `marco_teorico.md` verificadas | Patricio y Valeria | 10 a 14 | Documento 2 entregado en el formato de la materia |
| C7 opcional: muestra real de Open Beauty Facts | Alejandro | 4 a 6 | Solo si T6 y T7 cerraron antes |

Hito 5 (viernes 4): demo pública; documento 2 entregado; mediciones de T8 cerradas.

### Semana 6 · 7 al 11 de diciembre · Documento 3 y cierre

| Tarea | Responsable | Horas | Terminado cuando |
|---|---|---|---|
| Documento 3: agente, interfaz, guardas con sus pruebas, prueba de agnosticismo (mismo núcleo en Edge Functions y en Node), resultados de la evaluación, línea base, limitaciones, trabajo futuro (Fases B y C con su diseño) | Valeria, con todos | 14 a 18 | Documento 3 entregado |
| Pruebas finales: CI en verde, `supabase db reset` limpio, revisión de secretos en el historial, README con instrucciones de arranque | Alejandro | 3 a 4 | Una persona ajena al equipo levanta el proyecto siguiendo el README |
| Colchón para lo que se atrasó | Todos | 6 a 8 | |

Hito 6 (viernes 11): todo entregado, repo limpio, demo viva.

## 5. Resumen de horas por persona

| Persona | Semanas 1 a 3 | Semanas 4 a 6 | Total |
|---|---|---|---|
| Patricio | 25 a 32 | 28 a 38 | 53 a 70 |
| Alejandro | 20 a 28 | 20 a 29 | 40 a 57 |
| Valeria | 20 a 24 | 26 a 34 | 46 a 58 |
| Equipo | 65 a 84 | 74 a 101 | 139 a 185 |

El total cae dentro de los 148 a 214 estimados en `inversion.md` para construcción más documentos, porque Fases B y C quedan fuera. Si una persona no alcanza su meta semanal, se recorta por el orden de §1, no se reparte a los demás.

## 6. Riesgos y qué hacer

| Riesgo | Señal temprana | Respuesta |
|---|---|---|
| T1 no resuelve la importación del núcleo | Más de una hora sin `GET /salud` | Empaquetar a `_shared/` en el build, como dice ADR-0002 |
| El proveedor de modelo no da salida JSON estable | Más de 10 % de respuestas que no pasan el esquema Zod en T7.a | Reintento único con instrucción de corrección; si persiste, cambiar de proveedor; el adaptador es un archivo |
| El índice GIN no se usa ni con `@>` | `EXPLAIN` muestra barrido secuencial en igualdades | Reportarlo tal cual en el documento 2 con la explicación del planificador a 100,000 filas; no inventar |
| Supabase Free se pausa | Demo caída al abrir | `keepalive.yml` semanal; en la semana de entrega, considerar Pro un mes (25 USD) |
| Sin rúbrica al llegar a la semana 4 | D-04 sin respuesta | Escribir los documentos con las secciones del documento 1 como plantilla y declararlo |
| El alcance vuelve a crecer | Una tarea nueva que no está en este plan | Se anota en §1 como trabajo futuro; no se construye sin un ADR y sin que el equipo lo pida |
| Un integrante pierde una semana | Hito sin cerrar el viernes | El apoyo del frente toma la tarea crítica; se recorta por el orden de §1 |

## 7. Definición de terminado

Una tarea está terminada cuando se cumplen todas:

1. El criterio de la tabla se verificó y quien lo verificó no es quien lo hizo.
2. Las pruebas que toca (pgTAP o Vitest) están en verde en CI.
3. No hay secretos en el diff.
4. Si cambió un contrato, un requisito o una decisión, `CLAUDE.md` o el ADR correspondiente ya lo dicen.
5. El pull request está fusionado en `main`.

## 8. Primeras acciones, lunes 2 de noviembre

1. Reunión de 30 minutos: confirmar frentes, nombre del repo (D-06), licencia MIT, meta de horas semanales.
2. Patricio crea el repo público y la estructura de `CLAUDE.md` §11.2.
3. Valeria mueve la documentación a `docs/`, borra duplicados y envía el correo al asesor por la rúbrica.
4. Alejandro instala el stack y arranca T1.
5. Todos: Docker y Supabase CLI funcionando antes del martes.
