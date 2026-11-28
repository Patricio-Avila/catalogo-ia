# ADR-0007: Cambios respecto al documento 1 (D-08)

- Estado: aceptada, 2026-11-28. Registra la decisión D-08, declarada el 2026-11-16 en el borrador del documento 2, y la amplía con los cambios posteriores.
- Decisores: Patricio Avila por el equipo (Valeria Hernández, Alejandro Gómez).
- Ámbito: lo que los documentos 2 y 3 declaran como cambio respecto al documento 1 (entregado el 2026-09-29, revisado el 2026-11-03) y a los avances S06 a S8.

## Contexto

El borrador del documento 2 cierra con una "declaración de cambios" que llama D-08. Esa lista solo existía en el archivo de Word: no tenía ADR ni registro en el repositorio. Después del 16 de noviembre hubo más cambios que los documentos 2 y 3 también deben declarar: el cliente sin framework, la evaluación del adaptador, el tope de tiempo del agente y la conexión en la nube.

## Decisión

Esta tabla es la lista única de cambios. Los documentos 2 y 3 la citan; un cambio nuevo se agrega aquí antes de pasar a un documento.

| # | Cambio | Antes | Ahora | Fecha y fuente | Lo declara |
|---|---|---|---|---|---|
| 1 | Catálogo | Cinco categorías genéricas (prototipo del S8) | Tres verticales con dos categorías cada una: farmacia, llantas y belleza | 2026-10-31, ADR-0004 y ADR-0005 | Documento 2 |
| 2 | Contrato del objeto de filtros | Claves cortas `a`, `op`, `v` en el prototipo | `atributo`, `operador`, `valor`; `dominio` obligatorio y `categoria` opcional | 2026-11-03, `CLAUDE.md` §7.2 (puntos 1 y 12) | Documento 2 |
| 3 | Índice de atributos | Operador `?` sin uso del índice GIN | Igualdades por contención `@>` con GIN `jsonb_path_ops`, elegido midiendo | 2026-11-14, `docs/mediciones/t8_resultados.md` §2 | Documento 2 |
| 4 | Contexto obligatorio | Sin metadatos de uso ni de riesgo | `vertical`, `atributo_meta` y trigger de obligatorios desde las migraciones base (RF-11) | 2026-10-31, ADR-0005 | Documento 2 |
| 5 | Comparación | Solo diseño | `comparar_productos()` implementada y probada en SQL, sin endpoint hasta la fase B | 2026-11-03, migración 0005; falla cerrada desde la 0008 (2026-11-20) | Documento 2 |
| 6 | Cliente web | React y Tailwind (documento 1, delimitaciones del S7) | TypeScript con Vite, sin framework | 2026-11-28, ADR-0006 | Documento 3 |
| 7 | Interpretación | "Modelo de lenguaje" (objetivo particular 5) | `AdaptadorInteractivo` (coincidencia con el diccionario y extractor numérico) por omisión y sin costo; `AdaptadorGemini` enchufable y sin evaluar; Jev diferido | 2026-11-16, ADR-0003; sin llamadas a Gemini desde el 2026-11-21 | Documento 3 |
| 8 | Tope de tiempo del agente (G4) | `statement_timeout` de 2 s (S8, migración 0002) | 5 s, por la instancia nano del plan Free; el tope de filas no cambia | 2026-11-22, migración 0009 | Documento 3 |
| 9 | Conexión de la Edge Function | Driver por el pooler en modo transacción, sin más | Socket con TCP y TLS de Deno, tope de 12 s por operación, 503 con un reintento del cliente | 2026-11-23 y 2026-11-28, enmiendas de ADR-0002 | Documento 3 |
| 10 | Dónde se midió T8 | Supabase local con hardware documentado (ADR-0001, `CLAUDE.md` §7.3) | Tamaños, clase de índice y planes medidos en la nube; las funciones de 0007, en CI | 2026-11-14 y 2026-11-21, `t8_resultados.md` | Documento 2 |

## Consecuencias

- Los documentos 2 y 3 declaran estos cambios en su sección de evolución con la fecha y la fuente de cada uno, como hace la versión revisada del documento 1.
- El punto 7 obliga al documento 3 a reportar la exactitud del adaptador que se despliega, no la de un modelo que no se evaluó.
- El punto 10 no se corrige midiendo de nuevo en local, porque el equipo no tiene Docker en todas las máquinas. Se declara el entorno de cada medición: nube o CI.
- La cifra de latencia en la nube no es la de RNF-05. RNF-05 se mide en CI (`t8_resultados.md` §3.3).
