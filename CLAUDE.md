# CLAUDE.md — Filtrado asistido por IA sobre catálogos con atributos heterogéneos

Contexto base del proyecto para Claude Code. Foto al 2026-10-31. Idioma de trabajo: español.

Este archivo es la memoria del proyecto. Las decisiones técnicas viven en `docs/adr/` y las fuentes para la documentación en `docs/marco_teorico.md`. Pesa ~52 KB; se lee completo en cada sesión. El DDL histórico del prototipo ya vive en `docs/modelo_datos.md`; si este archivo sigue creciendo, lo siguiente que se mueve a `docs/` son §8.1 (requisitos) y §9 (evaluación), dejando aquí los enlaces.

## 1. Cómo trabajar en este repo

1. Plan primero, ejecución después. Para cualquier tarea que toque más de un archivo, agregue una dependencia, cree una migración o implique una decisión de diseño: presentar un plan breve (qué, dónde, criterio de terminado) y esperar el visto bueno ("adelante", "dale", "genera"). Sin visto bueno no se escribe nada.
2. Alcance mínimo. Hacer exactamente lo pedido. No agregar archivos, scripts, documentos, mejoras ni refactors no solicitados. Antecedente: el 11 de octubre una tarea de seis capturas creció a "todo el proyecto desde cero" sin confirmar alcance y hubo que borrarlo todo.
3. Nada es final hasta que Patricio lo revisa. Al terminar una tarea: dos o tres líneas con el resultado, qué se verificó y qué queda abierto. Sin recapitular pasos.
4. Español en todo lo visible: documentación, comentarios, mensajes de commit y nombres de dominio en SQL y TypeScript (`producto`, `atributos`, `buscar_productos`). Identificadores sin acentos ni eñes. Un idioma por módulo, nunca mezclado.
5. Solo migraciones. Ningún cambio de esquema fuera de `supabase/migrations/` (`YYYYMMDDHHMMSS_descripcion.sql`). Antes de aplicar a la nube: `supabase db reset` en limpio y pruebas pgTAP en verde.
6. Repo público. Nunca credenciales, claves de servicio, cadenas de conexión con contraseña ni `service_role` en código, documentación, ejemplos o commits. Secretos solo en `supabase secrets` y en `.env` (ignorado). En el cliente, únicamente la clave anónima o publicable. Revisar el diff por secretos antes de cada commit.
7. No reabrir las decisiones cerradas (§4) ni los ADR aceptados sin que el equipo lo pida. Una decisión abierta (§5) se cierra con un ADR nuevo, no con código.
8. Fuentes. Para cualquier texto que vaya a un entregable, solo fuentes admisibles: normas, literatura arbitrada, libros de editorial reconocida, documentación oficial, publicaciones institucionales. Nada de blogs, foros ni contenido generado por IA. Máximo 4 referencias por entregable semanal. Todo sale de `docs/marco_teorico.md`; si falta una fuente, se verifica y se agrega ahí primero. Estilo APA 7.
9. Cada guarda G1 a G5 tiene al menos una prueba automatizada que la demuestra. Un requisito sin prueba no se da por cumplido.
10. Datos: catálogo sintético, sin datos de personas. El sistema no emite recomendaciones de uso ni de sustitución de productos.
11. Jev no se implementa hasta cerrar ADR-0003 (§5, D-01). Mientras tanto, el adaptador de modelo se desarrolla contra una interfaz y fixtures.

## 2. Ficha del proyecto

- Título: Filtrado asistido por IA sobre catálogos con atributos heterogéneos.
- Materia: Base de Datos Especializadas. Ingeniería en Sistemas Computacionales, Universidad Lux, Monterrey, N. L. Tetramestre 6, grupo 6T.
- Asesor: Ing. Julio A. García M.
- Equipo: Carlos Patricio Avila Izaguirre (017497), Valeria Hernández Hernández (017402), Alejandro Gómez Martínez (017321).
- Entrega: tres documentos. Documento 1 (qué se quiere lograr, por qué, especificaciones y antecedentes) entregado el 29 de septiembre de 2026 como `PI1_BDE_CPAI.docx`, 16 páginas. Documento 2 (modelo de datos) y documento 3 (agente, interfaz, guardas, evaluación y resultados) pendientes. Además, cada tarea semanal de la materia lleva una parte de equipo que es un avance del proyecto.
- Rúbrica: no disponible. Sin ella no se fija extensión ni secciones obligatorias de los documentos 2 y 3.
- Formato de entregables: portada institucional (falta el binario `Portada.docx`; hoy se rearma desde un PDF), nombre de archivo `S<semana>_CPAI_BDE`, figuras y tablas numeradas y citadas en el texto, referencias APA 7.
- Repo: público, `github.com/Patricio-Avila/catalogo-ia`, creado el 2026-11-01 (D-06 cerrada). Licencia MIT. La CLI de Supabase va como dependencia de desarrollo (`pnpm supabase <comando>`).
- Demo: aplicación web estática en GitHub Pages (ADR-0004); nadie instala nada; la API vive en Supabase Edge Functions. Tres verticales de prueba: farmacia, llantas y belleza (ADR-0005). Construcción en tres fases: A núcleo, B comparación y asistente, C foto.

### 2.1 Historial de entregas

| Fecha | Entrega | Qué contiene del proyecto |
|---|---|---|
| 2026-09-29 | Documento 1, `PI1_BDE_CPAI.docx` | Problema, objetivos, antecedentes con fichas (ExtractGPT 8/8, ToxicSQL 8/8, AlloyDB 6/8), arquitectura, modelo de datos preliminar, requisitos RF/RNF, guardas, plan de evaluación, alcance |
| 2026-10-10 | S05 (individual) | Reflexión que liga los ejercicios de respaldo con el proyecto (PostgreSQL por JSONB y GIN; patrón de rol de solo lectura para el agente) |
| 2026-10-17 | S06, segundo avance | Objetivo general y seis particulares; diagrama de flujo de una búsqueda (ISO 5807); esquema de componentes y permisos por esquema; maqueta de la pantalla principal |
| 2026-10-24 | S7, tercer avance | Limitaciones y delimitaciones; esquema con Jev, extractor de números y caché; flujo con niveles de confianza; mockups de detalle, aclaración y sin resultados; prototipo de menú; estimación de costos (fuentes no admisibles, rehacer) |
| 2026-10-31 | S8, cuarto avance | Marco teórico (tabla ancha, EAV, JSONB, diccionario, text-to-SQL, seguridad con LLM); primer prototipo real en PostgreSQL 16: 100,000 productos, diccionario calculado, búsqueda con faltantes en 183 ms (287 ms incluyendo sin dato), rol de solo lectura con `statement_timeout` de 2 s |

Pendiente de confirmar: en Moodle, la tarea "Antecedentes" de BDE aparece cerrada sin entrega; verificar si el documento 1 se entregó por otra vía.

## 3. Problema y objetivos

### 3.1 Problemas trazables (P1 a P5)

Texto literal en `PI1_BDE_CPAI.docx`; aquí el sentido:

- P1 Atributos heterogéneos: cada categoría y cada producto tienen atributos distintos; un esquema fijo no los representa.
- P2 Datos incompletos: muchos productos no tienen el dato por el que se filtra; un filtro ingenuo los excluye en silencio.
- P3 Carga de traducir la necesidad a filtros: el usuario no conoce el vocabulario del catálogo y los paneles de filtros son confusos.
- P4 Riesgos de seguridad al poner un modelo de lenguaje frente a la base: inyección de instrucciones, inyección SQL, agencia excesiva, exposición de datos.
- P5 Falta de trazabilidad entre lo pedido y el resultado: el usuario no sabe por qué aparece un producto ni qué no se pudo evaluar.

### 3.2 Objetivo general (texto del S06)

Diseñar e implementar una base de datos de catálogo con atributos heterogéneos e incompletos y un agente de IA de solo lectura que interprete peticiones en lenguaje natural, determine los filtros aplicables a partir de un diccionario de atributos calculado por la propia base de datos, los ejecute mediante consultas parametrizadas y explique cómo se obtuvo cada resultado.

### 3.3 Objetivos particulares (texto del S06)

1. Modelar el catálogo con un esquema híbrido de columnas fijas y atributos en JSONB, y justificar la elección frente al modelo entidad-atributo-valor y a la tabla ancha mediante mediciones de tiempo de consulta y espacio en disco.
2. Generar un conjunto de datos sintético del orden de 10⁵ productos en 5 o 6 categorías, con la cobertura de cada atributo definida de antemano entre 40 % y 100 %.
3. Construir el diccionario de atributos como vista materializada con tipo, dominio de valores y cobertura por categoría.
4. Implementar funciones parametrizadas de búsqueda y de cálculo de facetas que devuelvan el motivo de coincidencia y el conteo de productos sin dato, con un tiempo de recálculo sin modelo menor a 1 s en el percentil 95.
5. Integrar un modelo de lenguaje que traduzca texto libre a un objeto de filtros validado contra el diccionario, bajo las cinco guardas de seguridad definidas (G1 a G5).
6. Evaluar la exactitud de la interpretación, la corrección de los resultados y el tiempo de respuesta con un conjunto de alrededor de 30 consultas de prueba con resultado esperado y de 4 a 5 consultas maliciosas, contra una línea base de filtrado manual.

Nota: el objetivo 5 dice "modelo de lenguaje". Si ADR-0003 adopta Jev, el objetivo se reescribe como "modelo de decisión tipada o modelo de lenguaje" en el documento 2, declarando el cambio.

### 3.4 Limitaciones y delimitaciones (S7, sección 7)

Limitaciones: la evaluación usa datos sintéticos, por lo que el comportamiento puede diferir en catálogos reales; la IA puede interpretar mal una petición y producir filtros que no corresponden; la seguridad no se garantiza por completo aunque haya permisos restringidos y validaciones; puede haber dificultades de tiempo de respuesta con volúmenes grandes.

Delimitaciones: diseño e implementación de un sistema de búsqueda de productos asistido por IA sobre PostgreSQL; catálogo sintético de aproximadamente 100,000 productos en cinco o seis categorías (farmacia y belleza como ejemplos); peticiones en lenguaje natural traducidas a filtros; muestra los criterios usados e informa cuando faltan datos; solo lectura; sin recomendaciones médicas ni sugerencias de uso o sustitución de productos; interfaz web en React, PostgreSQL administrado con Supabase y funciones de procesamiento para validar las consultas.

## 4. Decisiones cerradas (no reabrir)

Del documento 1 (septiembre de 2026):

- El agente es de solo lectura y solo accede a las vistas y funciones permitidas. Márgenes e información interna viven en un esquema sin permisos para el rol del agente.
- El modelo no escribe SQL. Devuelve un objeto de filtros en JSON que se valida contra el diccionario de atributos antes de tocar la base.
- Esquema híbrido: tabla `producto` con columnas fijas más columna `atributos jsonb` con índice GIN. Dato faltante = clave ausente.
- Diccionario de atributos como vista materializada (tipo, dominio y cobertura por categoría). Es lo único del catálogo que ve el modelo.
- Las acciones estructuradas (quitar etiqueta, elegir faceta, incluir sin dato) van directo a la base sin pasar por el modelo. Un mensaje nuevo modifica el objeto de filtros vigente, no lo reemplaza. El estado de filtros vive en el cliente.
- El motivo de coincidencia de cada resultado se calcula en SQL, no por el modelo.
- Cinco guardas G1 a G5 (§8.2).
- Datos sintéticos: generador propio, del orden de 10⁵ productos, 5 o 6 categorías, cobertura de cada atributo fijada entre 40 % y 100 %.
- Stack: React, Supabase con PostgreSQL y Edge Functions. El proveedor del modelo se define en el documento 3.
- Sin datos de personas; el sistema no recomienda ni sustituye productos.
- Innovación defendida: diccionario calculado por la base sobre datos incompletos, explicación de resultados con faltantes en SQL y facetas dinámicas, todo sobre PostgreSQL estándar. AlloyDB AI es precedente, no competidor. Descartados: RxNorm, COFEPRIS, CNIS.

Del 2026-10-31 (ADR-0001 y ADR-0002):

- Base real: PostgreSQL en Supabase nube, plan Free con keep-alive. Desarrollo y mediciones: Supabase local en Docker. Pruebas de base: pgTAP con `supabase test db`. PGlite fuera. Neon descartado.
- Middleware: Edge Functions como adaptador de una app Hono. Núcleo agnóstico en `packages/core` (TypeScript puro, sin `Deno.*` ni `supabase-js`). Acceso a datos con el driver `postgres` y un usuario que hereda `agente_lectura`.
- Contrato: esquema del objeto de filtros en Zod, compartido por núcleo, cliente y OpenAPI 3.1. Dos endpoints: `POST /buscar` y `POST /facetas`.
- Modelo: interfaz única `interpretar()` con dos adaptadores (Jev y LLM con JSON acotado) y extractor numérico compartido. La elección se mide, no se opina (ADR-0003).
- Caché exacta `servicio.cache_consultas` desde el inicio; caché semántica solo como trabajo futuro.
- Generador en SQL (`generate_series`) en `seed.sql`, conservando en el esquema interno el valor real antes de borrarlo.
- Frontend: React + Vite + TypeScript + Tailwind; sin SSR; móvil primero; instalable como PWA desde el navegador, sin tiendas.
- Pruebas: Vitest (núcleo) y pgTAP (base); CI en GitHub Actions con `supabase start`.
- Monorepo con pnpm; licencia MIT; público desde el primer push.

Del 2026-10-31 (ADR-0004, reemplaza el punto de hosting del ADR-0002):

- Un solo cliente web. Hosting: GitHub Pages desplegado por GitHub Actions en cada push a `main`; Cloudflare Pages solo como respaldo. Flutter y cualquier app instalable quedan descartados.
- Catálogo de tres verticales (dominios), con dos categorías cada una (seis en total) y atributos propios por vertical (§7.4); la tercera vertical fue ferretería hasta que ADR-0005 la sustituyó por llantas. Cada producto lleva `descripcion` generada por plantilla. El generador conserva la verdad completa en `interno.producto_verdad`.
- El usuario elige la vertical al entrar; el modelo recibe solo el diccionario de esa vertical.
- Farmacia es búsqueda de catálogo (nombre, sustancia, forma, presentación, precio): sin recomendaciones ni sustituciones, con aviso en pantalla. Nombres sintéticos; sustancias genéricas, nunca marcas reales.
- El banco de evaluación se reparte en 10 consultas por vertical.

Del 2026-10-31 (ADR-0005, sustituye la vertical de ferretería del ADR-0004):

- Verticales definitivas: `farmacia`, `llantas` y `belleza`. Llantas reemplaza a ferretería como vertical de precisión (medida exacta, índices de carga y velocidad, foto del costado).
- Una vertical es configuración, no código: registro `vertical` (nombre, textos, aviso, atributos destacados) más su diccionario. Agregar una vertical es cargar datos.
- El contexto se modela, no se lee de la descripción. Cada categoría tiene atributos de contexto obligatorios (`uso_previsto`, `clase_riesgo`, `apto_consumo` y los que la vertical defina), declarados en `atributo_meta` y exigidos por trigger. El riesgo nunca se infiere del texto ni de una foto; lo declara quien administra el catálogo. Para los atributos de riesgo, "sin dato" se trata como desconocido y falla cerrado.
- Dos entradas que producen el mismo objeto de filtros: texto libre (inexpertos, pasa por el modelo) y etiquetas manuales desde el diccionario (expertos, acción estructurada sin modelo). El modo manual es la línea base de filtrado sin IA de la evaluación.
- Comparación de productos: a partir de un producto de referencia (por nombre, y en la fase C por foto) se calculan en SQL, dentro de la misma categoría, las diferencias atributo por atributo y un nivel de compatibilidad ponderado por `atributo_meta`. Una diferencia en un atributo con `define_riesgo` deja el nivel en 0; una en `define_uso` lo acota y se anuncia. La interfaz nunca dice "igual", "equivalente", "sustituto" ni "intercambiable".
- Modo asistido ("¿Necesitas ayuda? Cuéntame qué buscas"): el modelo extrae intención, contexto del usuario, filtros propuestos y preguntas con opciones del diccionario; las alertas (uso distinto, riesgo, sin dato, no está en el catálogo, requiere receta) las calcula la base tomando el contexto del usuario como referencia virtual. No diagnostica fallas ni da indicaciones de uso o dosis.
- Construcción por fases: A (núcleo para la materia), B (comparación por nombre y modo asistido), C (comparación por foto). Cada fase se cierra completa antes de abrir la siguiente.

## 5. Decisiones abiertas

| Id | Decisión | Cómo se cierra |
|---|---|---|
| D-01 | Modelo: Jev (decisión tipada) vs LLM con JSON acotado, o ambos | ADR-0003 con el banco de evaluación corrido contra los dos adaptadores. Hasta entonces: interfaz + adaptador de fixtures; después el adaptador LLM-JSON (proveedor con salida JSON estructurada); después Jev. Restricción nueva: la comparación por foto (fase C) exige un modelo con visión, así que el adaptador LLM existe en cualquier escenario y Jev solo cubre texto |
| D-02 | Procedencia por atributo (declarado / inferido con probabilidad / desconocido) e inferencia por lote de faltantes | No adoptada. El generador conserva la verdad completa y las descripciones mencionan atributos borrados, así que se puede habilitar sin rehacer nada. Se decide después de D-01 y con la rúbrica |
| D-04 | Rúbrica del integrador | Pedirla al asesor. Condiciona extensión y secciones de documentos 2 y 3 |
| D-05 | Caché semántica con pgvector | Trabajo futuro; solo si sobra tiempo y con verificación por pregunta sí/no |
| D-08 | Reconciliar el segundo avance (modelo de lenguaje, aclaración solo por G1) con el tercero (Jev, confianza, caché) y el cambio a tres verticales | El documento 2 declara los cambios y actualiza RF, RNF, generador y diagramas |

Cerradas el 2026-10-31 por ADR-0004: D-03 (hosting: GitHub Pages) y D-07 (categorías: tres verticales con dos categorías cada una). Cerrada el 2026-11-01: D-06 (repo `catalogo-ia`, MIT). Fuera de alcance salvo que el equipo lo pida: calificación "útil / no útil" por búsqueda, app instalable, segundo cliente.

## 6. Arquitectura y flujo

```
Cliente React estático en GitHub Pages (estado de filtros, etiquetas, facetas)
   │  0. el usuario elige la vertical: farmacia | llantas | belleza
   │  POST /buscar {dominio, texto | accion, filtros_vigentes}   POST /facetas
   ▼
API Hono (adaptador: Supabase Edge Function; CORS con el origen de Pages)
   │  packages/core:
   │   1. normalizar texto (números → marcador)
   │   2. caché exacta (servicio.cache_consultas)      ──► acierto: reutilizar objeto
   │   3. interpretar(texto, diccionario[dominio], filtros_vigentes) → objeto + confianza por filtro
   │      + extractor numérico (regex) para precios, cantidades y medidas
   │   4. validar contra el diccionario (G1): lo inválido se descarta y se informa
   │   5. confianza: alta → aplicar; media → aplicar y marcar "sugerida"; baja → aclaración sin consultar la base
   ▼
PostgreSQL (driver postgres, usuario que hereda agente_lectura; consultas parametrizadas G2)
   esquema catalogo  : producto (dominio, categoria, descripcion, atributos), diccionario_atributos (vista mat.),
                       buscar_productos(), calcular_facetas()
   esquema interno   : márgenes, producto_verdad               (sin permisos para el agente, G3)
   esquema servicio  : cache_consultas                         (sin permisos para el agente)
   rol agente_lectura: SELECT en diccionario, EXECUTE en funciones, statement_timeout (G4)
   ▲
   └─ respuesta: resultados con descripción y motivo (cumple / sin_dato), total, faltantes, facetas, etiquetas con confianza (G5)
```

Reglas del flujo:

- El modelo solo recibe el diccionario de la vertical elegida; nunca el catálogo completo.
- Las acciones estructuradas (`accion`: quitar etiqueta, elegir faceta, `incluir_sin_dato`, agregar etiqueta manual) nunca llaman al modelo (RF-03, RF-10).
- El contexto se modela, no se lee: categoría, `uso_previsto` y `clase_riesgo` deciden antes que cualquier atributo técnico. Ninguna salida del modelo puede fijar un atributo con `define_riesgo`.
- Vocabulario prohibido en cualquier texto que vea el usuario: igual, equivalente, sustituto, intercambiable, recomendado, indicado para, dosis. Hay una prueba de contrato que lo verifica. Se dice: "coincide en 5 de 7 atributos", "difiere en: potencia, garantía", "sin dato en: material", "uso distinto: índice de carga", "riesgo distinto: corrosivo vs ninguno".
- Umbrales iniciales de confianza, a calibrar con el banco de evaluación: alta ≥ 0.85, media 0.60 a 0.85, baja < 0.60.
- Caché exacta: clave = hash(categoría, texto normalizado, filtros vigentes, versión del diccionario). Solo se guardan objetos que pasaron G1. Se invalida al cambiar la versión del diccionario. Apagada durante la evaluación; el acierto de caché se reporta aparte.
- Lenguaje de cara al usuario: "cumple", "sin dato", "no pudo evaluarse". Nunca mostrar SQL.

### 6.1 Contrato del objeto de filtros

```json
{
  "dominio": "belleza",
  "categoria": "cuidado_facial",
  "filtros": [
    { "atributo": "fragancia", "operador": "=", "valor": "sin perfume" },
    { "atributo": "tipo_piel", "operador": "=", "valor": "sensible" },
    { "atributo": "precio", "operador": "<", "valor": 300 }
  ],
  "incluir_sin_dato": false
}
```

- `dominio` es obligatorio y lo fija el usuario al elegir la vertical; el modelo no puede cambiarlo. `categoria` es opcional: la propone el modelo cuando el texto la hace evidente y, si es `null`, la búsqueda cubre las dos categorías de la vertical.
- Operadores, lista cerrada: `=`, `<>`, `<`, `<=`, `>`, `>=`.
- Validación G1: `dominio` existe; `categoria` pertenece al dominio o es `null`; cada `atributo` existe en el diccionario para esa vertical (y categoría, si viene); el operador es compatible con el tipo (texto y booleano solo `=`/`<>`; numérico cualquiera); el valor pertenece al dominio de valores (texto, booleano) o cae dentro del rango (numérico). Los filtros que no pasan se descartan y se devuelven en `descartados` con el motivo (RF-02).
- `precio` y las columnas fijas se tratan como atributos más dentro del contrato; la función sabe cuáles son columnas.
- El esquema Zod de este objeto es la única fuente de verdad: lo usan la validación del núcleo, el cliente y la generación de OpenAPI.

### 6.2 Endpoints

`POST /buscar`

- Entrada: `{ dominio: "farmacia" | "llantas" | "belleza", texto?: string, accion?: { tipo: "quitar" | "faceta" | "incluir_sin_dato" | "reiniciar", ... }, filtros_vigentes: ObjetoFiltros | null, limite?: number }`. Exactamente uno de `texto` o `accion`.
- Salida: `{ filtros: ObjetoFiltros, etiquetas: [{ atributo, operador, valor, confianza, origen: "modelo" | "usuario" | "cache" }], descartados: [...], resultados: [{ id, nombre, marca, precio, descripcion, cumple: string[], sin_dato: string[] }], total, faltantes, facetas: [{ atributo, valores: [{ valor, productos }] }], aclaracion?: { pregunta, opciones: [...] } }`.

`POST /facetas`

- Entrada: `{ filtros: ObjetoFiltros, atributos?: string[] }`. Salida: facetas sobre el conjunto resultante, incluido el grupo sin dato (RF-07).

`POST /comparar` (fase B por nombre, fase C por foto)

- Entrada: `{ dominio, referencia: { producto_id?: number, nombre?: string, imagen?: string (base64, solo fase C) }, limite?: number }`. Exactamente una forma de referencia.
- Resolución de la referencia: `producto_id` → atributos del catálogo; `nombre` → búsqueda tolerante con `pg_trgm` sobre nombre y descripción y, si no hay coincidencia suficiente, extracción de atributos del texto por el modelo (validada por G1, marcada como inferida); `imagen` → extracción por el adaptador de visión (G1, inferida). La imagen se procesa en memoria y no se guarda.
- Salida: `{ referencia: { origen: "catalogo" | "texto" | "imagen", categoria, atributos, inferidos: string[] }, candidatos: [{ id, nombre, marca, precio, descripcion, nivel: 0..1, diferencias: [{ atributo, referencia, candidato, estado: "igual" | "distinto" | "sin_dato" }], uso_distinto: string[], riesgo_distinto: string[] }], no_comparable?: { motivo } }`. Nivel y diferencias calculados por `comparar_productos()` en SQL; solo dentro de la misma categoría.

`POST /asistir` (fase B)

- Entrada: `{ dominio, texto, filtros_vigentes: ObjetoFiltros | null, contexto_usuario: [{ atributo, valor }] | null, resumen_resultados: { total, faltantes } | null }`.
- El modelo devuelve `RespuestaAsistida`: `{ intencion: "buscar" | "comparar" | "aclarar" | "fuera_de_alcance", contexto_usuario: [{ atributo, valor }], filtros_propuestos: ObjetoFiltros | null, preguntas: [{ texto, opciones: string[] }] }`. Todo validado contra el diccionario (G1). Los filtros propuestos se muestran como etiquetas sugeridas; el usuario los aplica.
- La base calcula `alertas: [{ tipo: "uso_distinto" | "riesgo" | "sin_dato" | "no_en_catalogo" | "requiere_receta", atributo?, mensaje }]` tomando `contexto_usuario` como referencia virtual contra los candidatos (misma lógica que `comparar_productos`). El `mensaje` final, de una o dos frases, sale de plantillas por intención y alerta; si ADR-0003 lo permite, lo redacta el modelo bajo el mismo esquema y el vocabulario prohibido.
- Fuera de alcance explícito: diagnosticar por qué algo no funciona, indicaciones de uso, dosis o reparación. En esos casos `intencion = fuera_de_alcance` y la plantilla regresa al usuario a lo que sí se puede: encontrar el producto que le pidieron.

Errores hacia el cliente siempre genéricos; el detalle va al log de la función.

## 7. Modelo de datos

### 7.1 Prototipo del cuarto avance (PostgreSQL 16)

El DDL completo del prototipo (tabla, índices, generador de cinco categorías, `diccionario_atributos`, `buscar_productos`, `calcular_facetas`, rol `agente_lectura`) está en `docs/modelo_datos.md`, transcrito de las capturas de `S8_CPAI_BDE`. Hay que ejecutarlo y confirmarlo antes de convertirlo en migración; la captura de `producto` no muestra la columna `id`, que la función sí devuelve, y el texto del avance menciona una condición de contención `@>` para usar el índice GIN que la captura no muestra. Mediciones registradas: carga de 100,000 productos en 1.1 s; tabla con índices de 21 MB; búsqueda con tres filtros en 183 ms y en 287 ms incluyendo productos sin dato; con `SET ROLE agente_lectura`, lectura directa y UPDATE rechazados. El generador de cinco categorías es histórico: lo reemplaza §7.4.

### 7.2 Cambios obligatorios al pasar el prototipo a migraciones

1. Claves del objeto de filtros con nombre completo (`atributo`, `operador`, `valor`), iguales al contrato de §6.1, en lugar de `a`, `op`, `v`.
2. `calcular_facetas` recibe el objeto de filtros y calcula sobre el conjunto resultante, no sobre toda la categoría (RF-07). Incluye el grupo sin dato.
3. Límite máximo de filas dentro de la función (`LEAST(p_limite, 200)`), no solo en el parámetro (RNF-04).
4. Operadores completos (`<>`, `<=`, `>=`) con la lista cerrada de §6.1.
5. Funciones `SECURITY DEFINER`: `REVOKE EXECUTE ... FROM PUBLIC`, dueño sin privilegios de superusuario, `search_path` fijo (ya está).
6. Esquema `interno` con `producto_verdad` (atributos completos antes de borrar, para medir faltantes y habilitar D-02) y márgenes de ejemplo; sin permisos para `agente_lectura` (RNF-02).
7. Esquema `servicio` con `cache_consultas` (clave, objeto validado, versión del diccionario, fecha, aciertos); sin permisos para el agente.
8. Usuario de conexión para la Edge Function: rol `LOGIN` miembro de `agente_lectura`, contraseña en `supabase secrets`. Nunca `postgres` ni `service_role`.
9. Refresco del diccionario al cargar el catálogo (`REFRESH MATERIALIZED VIEW CONCURRENTLY` exige índice único: dominio + categoría + atributo) y columna `version` para la caché (RF-08).
10. Índice GIN: `jsonb_path_ops` solo acelera `@>`; el operador `?` de la función no lo usa. La clase de operadores se decide midiendo en el documento 2 (`jsonb_ops` vs `jsonb_path_ops`).
11. Columnas `dominio` (con `CHECK` sobre los tres valores) y `descripcion TEXT NOT NULL` en `producto`; índice sobre `(dominio, categoria)`.
12. `buscar_productos(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato, p_limite)` con `p_categoria` opcional (`NULL` cubre la vertical completa) y `descripcion` en la salida; `calcular_facetas` con la misma entrada.
13. El diccionario se calcula por `(dominio, categoria, atributo)`; la función que lo sirve al núcleo filtra por dominio.
14. Tabla `catalogo.vertical (dominio, nombre, texto_ayuda, aviso, atributos_destacados text[])`: la configuración que lee el cliente. Agregar una vertical es insertar aquí y cargar productos.
15. Tabla `catalogo.atributo_meta (dominio, categoria, atributo, tipo, obligatorio bool, define_uso bool, define_riesgo bool, peso numeric, inferible bool)`, curada por el administrador. `inferible = false` en todo atributo con `define_riesgo`: el modelo nunca lo propone. Es la capa de metadatos; el diccionario se cruza con ella.
16. Trigger `BEFORE INSERT OR UPDATE` en `producto` que rechaza el registro si falta cualquier atributo con `obligatorio = true` para su `(dominio, categoria)` (RF-11). La cobertura de esos atributos es 100 % por integridad, no por azar.
17. `comparar_productos(p_dominio, p_categoria, p_atributos_ref jsonb, p_limite)`: candidatos de la misma categoría; por cada uno, diferencias atributo por atributo (igual, distinto, sin dato) y nivel = suma de pesos de los atributos iguales entre la suma de pesos de los atributos presentes en la referencia; si difiere o está sin dato un atributo con `define_riesgo`, nivel 0 y `riesgo_distinto`; si difiere uno con `define_uso`, nivel acotado a 0.5 y `uso_distinto`. Los "sin dato" del candidato se listan, no se cuentan como iguales. Sirve también al modo asistido con el contexto del usuario como referencia virtual.
18. Índices `pg_trgm` (GIN) sobre `nombre` y `descripcion` para la búsqueda tolerante por nombre.

### 7.3 Lo que el documento 2 debe producir

Diagrama entidad-relación formal; DDL comentado; generador con su tabla de verdad; diccionario; comparación medida híbrido vs EAV vs tabla ancha en esquemas separados (`eav`, `ancha`) con funciones de la misma firma, midiendo tamaño con `pg_total_relation_size`, p50 y p95 con 1 a 5 filtros, con y sin `incluir_sin_dato`, planes con `EXPLAIN (ANALYZE, BUFFERS)` y estadísticas extendidas en EAV; elección de la clase de operadores GIN; matriz de trazabilidad hallazgo → requisito → módulo → entidad → prueba. Las mediciones se hacen en Supabase local con el hardware documentado (ADR-0001).

### 7.4 Catálogo de tres verticales (ADR-0004 y ADR-0005)

Reemplaza al generador del prototipo. Del orden de 10⁵ productos repartidos en tres verticales con dos categorías cada una; los nombres son sintéticos y se arman por plantilla (tipo + atributo distintivo + presentación), sin marcas reales; `marca` es `Marca A` a `Marca H`. Las coberturas son metas iniciales dentro del rango 40 a 100 % del objetivo 2; se fijan en `seed.sql` y el diccionario debe reproducirlas (RF-08). Los atributos de contexto son obligatorios en todas las categorías (cobertura 100 % por trigger).

| Vertical | Categorías | Atributos de contexto (obligatorios; `define_uso` / `define_riesgo`) | Atributos técnicos en `atributos` (tipo, cobertura meta) |
|---|---|---|---|
| `farmacia` | `medicamentos`, `suplementos` | `uso_previsto` (texto: alivio sintomático, suplemento; uso), `requiere_receta` (booleano; riesgo), `clase_riesgo` (texto: ninguno, uso bajo supervisión; riesgo), `apto_consumo` (booleano, siempre verdadero en esta vertical; riesgo) | `sustancia_activa` (texto, 100 %), `concentracion_mg` (número, 90 %), `forma_farmaceutica` (texto, 95 %), `via_administracion` (texto, 70 %; uso), `piezas` (número, 85 %), `sin_azucar` (booleano, 40 %) |
| `llantas` | `pasajeros`, `carga_ligera` | `uso_previsto` (texto: urbano, carretera, todo terreno, remolque; uso), `indice_carga` (número; uso), `indice_velocidad` (texto: S, T, H, V, W; uso), `clase_riesgo` (texto: ninguno; riesgo) | `ancho_mm` (número, 100 %), `perfil_pct` (número, 100 %), `rin_pulg` (número, 100 %), `temporada` (texto: verano, todo tiempo, invierno, 70 %), `run_flat` (booleano, 45 %), `garantia_km` (número, 60 %), `anio_fabricacion` (número, 50 %) |
| `belleza` | `cuidado_facial`, `cuidado_corporal` | `uso_previsto` (texto: hidratar, limpiar, proteger, exfoliar; uso), `zona_aplicacion` (texto: rostro, cuerpo, contorno de ojos; uso), `clase_riesgo` (texto: ninguno, evitar contacto con ojos, no aplicar puro; riesgo), `apto_consumo` (booleano, siempre falso; riesgo) | `contenido_ml` (número, 95 %), `fragancia` (texto, 80 %), `tipo_piel` (texto, 60 %), `acabado` (texto, 50 %), `spf` (número, 40 %), `vegano` (booleano, 40 %), `sin_parabenos` (booleano, 50 %) |

Reglas del generador:

- Para cada producto se generan primero los atributos completos y se guardan en `interno.producto_verdad`; después se borran de `atributos` los técnicos que caen fuera de la cobertura meta. Los de contexto nunca se borran. La diferencia entre ambos es la verdad para medir faltantes.
- `descripcion` se redacta por plantilla desde los atributos completos: siempre menciona los técnicos presentes y, con probabilidad 0.3, uno de los borrados. El contexto (uso, riesgo) se menciona solo con probabilidad 0.5, a propósito: el sistema debe funcionar aunque la descripción lo calle.
- Pares trampa: tres por vertical, productos con los mismos atributos técnicos y distinto `uso_previsto` o `clase_riesgo` (aceite corporal vs aceite concentrado "no aplicar puro"; llanta de pasajeros vs de remolque con la misma medida; jarabe sin receta vs con receta de la misma sustancia). Se marcan en `interno.par_trampa` y entran al banco de evaluación: el comparador debe negarse o acotar.
- Los atributos que solo aplican a una categoría se omiten en la otra; el diccionario lo refleja como ausencia.
- Semilla fija del generador (`setseed`) para que la carga sea reproducible entre `db reset` y entre máquinas.
- Farmacia: solo sustancias genéricas (paracetamol, ibuprofeno, loratadina, omeprazol, vitamina C, entre otras) y formas farmacéuticas comunes; `uso_previsto` se limita a categorías amplias y nunca a indicaciones clínicas.
- Llantas: el nombre incluye la medida en formato estándar (`205/55 R16 91V`) para que la búsqueda por nombre y la foto del costado tengan la misma cadena que leer.

## 8. Requisitos y guardas

### 8.1 Requisitos (documento 1, texto literal salvo RF-01)

| Id | Requisito | Problema | Criterio de verificación |
|---|---|---|---|
| RF-01 | Traducción de una petición en lenguaje natural a un objeto de filtros (enunciado literal en `PI1_BDE_CPAI.docx`) | P3 | Porcentaje de consultas del conjunto de evaluación cuyo objeto de filtros coincide con el esperado |
| RF-02 | El objeto de filtros solo contiene categorías, atributos, operadores y valores presentes en el diccionario; los demás se descartan y se informan | P4 | Consultas con atributos o valores inexistentes: el 100 % se descarta y se informa |
| RF-03 | Los filtros aplicados se muestran como etiquetas; quitar una etiqueta recalcula los resultados sin invocar al modelo | P3, P5 | Registro de la Edge Function: la acción genera una llamada a la función de búsqueda y ninguna al modelo |
| RF-04 | Un mensaje nuevo modifica el objeto de filtros vigente sin reemplazarlo, salvo que el usuario indique empezar de nuevo | P3 | Secuencias de dos y tres mensajes: el objeto final coincide con el esperado |
| RF-05 | Cada resultado incluye el motivo de coincidencia calculado en la base de datos: filtros cumplidos y atributos sin dato | P2, P5 | Muestra de resultados: el motivo coincide con el documento `atributos` del producto |
| RF-06 | Por cada búsqueda, el sistema informa cuántos productos quedaron fuera por no tener el dato de un filtro y permite incluirlos | P2 | El conteo coincide con el calculado por una consulta de referencia independiente |
| RF-07 | El sistema sugiere facetas de refinamiento calculadas sobre el conjunto resultante e indica su cobertura | P1, P3 | Cada faceta sugerida tiene al menos dos valores distintos en el conjunto; su cobertura coincide con la consulta de referencia |
| RF-08 | El diccionario de atributos se calcula a partir de los datos y se actualiza al cargar el catálogo | P1 | Tras la carga, tipo, dominio y cobertura coinciden con los parámetros del generador |
| RNF-01 | El rol del agente solo tiene permisos SELECT sobre las vistas permitidas y EXECUTE sobre las funciones de búsqueda | P4 | INSERT, UPDATE y DELETE ejecutados con el rol del agente devuelven error de permisos |
| RNF-02 | Las tablas internas residen en un esquema sin permisos para el rol del agente | P4 | SELECT sobre el esquema interno con el rol del agente devuelve error de permisos |
| RNF-03 | Toda consulta se ejecuta mediante funciones con parámetros; ningún valor producido por el modelo se concatena al texto SQL | P4 | Revisión de código y consultas maliciosas con fragmentos SQL: ninguna altera datos ni estructura |
| RNF-04 | El rol del agente tiene un límite de filas por respuesta y un tiempo máximo por consulta | P4 | Una consulta amplia devuelve como máximo el límite; una consulta costosa se cancela al vencer el tiempo |
| RNF-05 | El recálculo de resultados sin intervención del modelo responde en menos de 1 s en el 95 % de las consultas de evaluación. Meta preliminar, sujeta al volumen definido en el documento 2 | P3 | Medición del tiempo de respuesta sobre el conjunto de evaluación |

Agregados el 2026-10-31 (ADR-0005); el documento 2 los incorpora con la numeración definitiva:

| Id | Requisito | Problema | Criterio de verificación |
|---|---|---|---|
| RF-09 | A partir de un producto de referencia (por identificador, nombre o, en la fase C, fotografía), el sistema devuelve candidatos de la misma categoría con sus diferencias atributo por atributo y un nivel de compatibilidad calculado en la base de datos; nunca describe dos productos como iguales o equivalentes | P1, P5 | Casos de comparación con referencia y nivel esperado; búsqueda de las palabras prohibidas en las respuestas: cero apariciones |
| RF-10 | El usuario puede agregar filtros manualmente eligiendo atributo, operador y valor del diccionario, sin que intervenga el modelo | P3 | Registro de la Edge Function: la acción genera llamadas a la función de búsqueda y ninguna al modelo; el objeto resultante es idéntico al producido por texto libre para el mismo filtro |
| RF-11 | Cada categoría declara atributos de contexto obligatorios (uso previsto y clase de riesgo, al menos); un producto sin ellos es rechazado al cargarse; el modelo no puede proponer atributos de riesgo | P2, P4 | pgTAP: INSERT sin atributo obligatorio falla; prueba de G1: un objeto con atributo `define_riesgo` propuesto por el modelo se descarta e informa |
| RF-12 | En el modo asistido, el sistema extrae del texto del usuario su intención y su contexto, propone filtros como etiquetas sugeridas, formula preguntas con opciones del diccionario y emite alertas calculadas en la base de datos (uso distinto, riesgo, sin dato, no en catálogo, requiere receta); declara fuera de alcance el diagnóstico y las indicaciones de uso | P3, P5 | Escenarios guionados con intención, contexto, filtros y alertas esperados; cero alertas generadas por el modelo (todas provienen de la función SQL) |

### 8.2 Guardas

| Guarda | Riesgo que atiende | Requisitos | Dónde vive | Prueba |
|---|---|---|---|---|
| G1 Salida validada contra el diccionario | Inyección de instrucciones que produce filtros fuera del catálogo (OWASP LLM01) | RF-02 | `packages/core` (Zod + diccionario) | Vitest: objetos con atributos, valores y operadores inválidos se descartan e informan |
| G2 Consultas parametrizadas | Inyección SQL a través de la salida del modelo | RNF-03 | Driver `postgres` con parámetros; funciones SQL | Vitest + pgTAP: fragmentos SQL en valores no alteran datos ni estructura |
| G3 Rol mínimo y esquema interno aislado | Agencia excesiva y exposición de datos fuera de alcance (OWASP LLM06) | RNF-01, RNF-02 | Roles y GRANT en migraciones | pgTAP: INSERT/UPDATE/DELETE y SELECT al esquema interno fallan con el rol del agente |
| G4 Límites de filas y de tiempo | Consumo excesivo de recursos mediante consultas válidas pero costosas | RNF-04 | `statement_timeout` del rol; `LEAST(limite, 200)` en la función | pgTAP: consulta costosa se cancela; consulta amplia respeta el tope |
| G5 Filtros visibles y motivo calculado en SQL | Interpretación errónea no advertida por el usuario | RF-03, RF-05, RF-09, RF-12 | Etiquetas en el cliente; `cumple`/`sin_dato`, diferencias, nivel y alertas en funciones SQL | Vitest (contrato, vocabulario prohibido) + pgTAP (motivo, nivel y alertas coinciden con `atributos` y `atributo_meta`) |

La extensión de G1 y G3 al contexto (RF-11): `inferible = false` en `atributo_meta` bloquea cualquier atributo de riesgo propuesto por el modelo, y el trigger de obligatorios garantiza que la base nunca tenga productos sin contexto. Ambas se prueban con pgTAP y Vitest.

## 9. Plan de evaluación

- Banco: alrededor de 30 consultas en lenguaje natural, 10 por vertical, cada una con objeto de filtros esperado y conjunto de resultados de referencia obtenido con SQL escrito a mano; más 4 o 5 consultas maliciosas (instrucciones para ignorar las reglas, fragmentos SQL, suplantación de un rol con más privilegios), cuyo resultado esperado es el rechazo o la ausencia de efecto. Incluir secuencias de dos y tres mensajes (RF-04) y al menos una consulta por vertical que dependa de un atributo con baja cobertura, para ejercitar los faltantes.
- Métricas: exactitud del objeto de filtros; coincidencia entre resultados devueltos y de referencia; exactitud de los conteos de faltantes; tiempo de respuesta con y sin intervención del modelo (p50 y p95, separando base y modelo).
- Línea base: número de interacciones necesarias para llegar al mismo conjunto de resultados mediante filtrado manual sin IA, usando el modo de etiquetas manuales del propio sistema (RF-10).
- Comparación (fase B): 5 casos por vertical con referencia, candidatos esperados, nivel esperado y diferencias esperadas; los 9 pares trampa, donde el resultado esperado es nivel 0 o acotado con la alerta correspondiente; verificación de vocabulario prohibido en todas las respuestas.
- Modo asistido (fase B): 10 escenarios guionados (técnico que pidió un producto que no aparece, dato faltante decisivo, contexto incompatible, petición fuera de alcance, petición en farmacia que roza indicaciones) con intención, contexto, filtros propuestos y alertas esperados.
- Foto (fase C): 5 imágenes sintéticas por vertical (etiquetas y costados generados) con atributos esperados; se mide la exactitud de extracción antes de G1 y después.
- Condiciones: caché apagada; versión del modelo fija; hardware documentado; cada adaptador de modelo se corre contra el mismo banco (D-01).
- Ubicación: `eval/consultas.json`, `eval/comparaciones.json`, `eval/escenarios.json`, `eval/imagenes/`, `eval/referencia/*.sql`, `eval/correr.ts`, `eval/resultados/<fecha>-<adaptador>.json`.

## 10. Fuentes

La lista completa, las fichas de sistemas de terceros y la cola de verificación están en `docs/marco_teorico.md`. Verificadas y usadas en el documento 1: Dinu y Nadkarni (2007); Shi et al. (2025); Brinkmann, Shraga y Bizer (2025); Lin et al. (2025); Google Cloud (s.f.-a, s.f.-b); OWASP GenAI Security Project (2025a, 2025b); PostgreSQL Global Development Group (2025); ISO/IEC/IEEE 29148:2018; Supabase (s.f.).

No admisibles usadas en el tercer avance y que deben sustituirse por documentación oficial: AI Superior, eesel AI, publicaciones en dev.to. El preprint de Bonn sobre Jev solo admite mención contextual.

## 11. Tareas por fase con criterio de terminado

Cada fase se cierra completa (pruebas, despliegue, nota en el documento que toque) antes de abrir la siguiente. Si se acaba el tiempo, lo pendiente se documenta como trabajo futuro con el diseño de este archivo.

### Fase A: núcleo para la materia (documentos 2 y 3)

| Id | Tarea | Terminado cuando |
|---|---|---|
| T0 | Repo: monorepo pnpm (`apps/web`, `packages/core`, `supabase/`, `eval/`, `docs/`), README, LICENSE (MIT), `.gitignore`, `.editorconfig`, CI esqueleto | `pnpm install` y `supabase start` corren; CI en verde con pruebas vacías |
| T1 | Validar que la Edge Function importa `packages/core` (riesgo principal de ADR-0002) | `supabase functions serve` responde `GET /salud` usando una función del núcleo. Si no se resuelve en una hora: empaquetar el núcleo a `supabase/functions/_shared/` en el build |
| T2 | Migraciones: 0001 esquemas, `producto` con `dominio`, `descripcion` e índices (GIN de atributos, `(dominio, categoria)`, `pg_trgm`); 0002 roles y usuario de conexión; 0003 `vertical` y `atributo_meta` con el trigger de obligatorios; 0004 diccionario por dominio con versión y refresco; 0005 `buscar_productos`, `calcular_facetas` y `comparar_productos` con el contrato de §6 y los cambios de §7.2; 0006 `cache_consultas`; `seed.sql` con el generador de tres verticales (§7.4), `producto_verdad` y `par_trampa` | `supabase db reset` en limpio; pgTAP verde para G3, G4 y el trigger (RF-11); coberturas del diccionario coinciden con las metas del generador (RF-08) |
| T3 | Núcleo: esquema Zod, validación G1 con `inferible`, extractor numérico (precios, cantidades, medidas de llanta, índices), interfaz `interpretar()` con adaptador de fixtures, acceso a datos con driver, prueba de vocabulario prohibido | Vitest verde; cobertura de G1 y G2 |
| T4 | API Hono: `/buscar`, `/facetas`, OpenAPI generado, CORS con lista de orígenes (local y `https://<usuario>.github.io`) | Llamadas de prueba desde `supabase functions serve`; contrato publicado en `docs/api/openapi.json` |
| T5 | Cliente React móvil primero: selector de vertical leído de `vertical`; pantalla principal según maqueta del S06 (campo único, etiquetas, casilla de sin dato, facetas con conteos) con resultados que muestran categoría, uso previsto, descripción y motivo; control "agregar etiqueta" con autocompletado del diccionario (RF-10); pantallas del S7 (detalle, aclaración, sin resultados, menú); aviso en farmacia; manifiesto PWA | Flujo completo en las tres verticales contra Supabase local con el adaptador de fixtures, en texto libre y en modo manual |
| T6 | Banco de evaluación y arnés | 30 consultas (10 por vertical) con referencia SQL; línea base con el modo manual; reporte reproducible |
| T7 | Adaptadores reales: LLM-JSON y Jev; correr evaluación; ADR-0003 | Reporte comparado en `eval/resultados/`; ADR-0003 escrito |
| T8 | Comparación EAV y tabla ancha (documento 2) | Tablas de tamaño, p50/p95 y planes; clase de operadores GIN elegida |
| T9 | Despliegue: `supabase db push`, `functions deploy`, secretos; web en GitHub Pages por Actions (`base` de Vite = `/<repo>/`, `index.html` copiado a `404.html` o rutas con hash); keep-alive semanal de Supabase | Demo pública en `https://<usuario>.github.io/<repo>/` con la base en la nube |

### Fase B: demo

| Id | Tarea | Terminado cuando |
|---|---|---|
| T10 | Comparación por identificador y por nombre: `POST /comparar`, búsqueda tolerante con `pg_trgm`, extracción de atributos desde texto cuando el nombre no está en el catálogo, pantalla de comparación con diferencias y nivel | 15 casos y 9 pares trampa en verde; cero palabras prohibidas en las respuestas |
| T11 | Modo asistido: esquema `RespuestaAsistida`, máquina de estados en el núcleo, `POST /asistir`, alertas por SQL, plantillas de mensaje, panel "¿Necesitas ayuda? Cuéntame qué buscas" | 10 escenarios guionados en verde; ninguna alerta producida por el modelo |

### Fase C: cierre

| Id | Tarea | Terminado cuando |
|---|---|---|
| T12 | Comparación por foto: adaptador de visión en el adaptador LLM, extracción validada por G1 y marcada como inferida, imagen procesada en memoria sin almacenarse, entrada de foto en la pantalla de comparación | 15 imágenes sintéticas en verde; exactitud de extracción reportada antes y después de G1 |

Fuera de alcance salvo que el equipo lo pida: calificación "útil / no útil", caché semántica, app instalable, segundo cliente, diagnóstico de fallas, indicaciones de uso o dosis.

### 11.1 Comandos

```
supabase start | stop | status      # stack local en Docker
supabase db reset                    # aplica migraciones y seed desde cero
supabase test db                     # pruebas pgTAP
supabase functions serve             # Edge Functions locales
supabase migration new <nombre>
supabase db push                     # aplicar migraciones a la nube (solo con pruebas en verde)
supabase functions deploy <nombre>
supabase secrets set NOMBRE=valor    # nunca en el repo
pnpm -r test                         # Vitest en packages/core y apps/web
pnpm --filter web dev
```

### 11.2 Estructura del repo

```
CLAUDE.md
README.md  LICENSE  .gitignore  .editorconfig  pnpm-workspace.yaml  package.json
apps/web/                 React + Vite + TypeScript + Tailwind
packages/core/            validación, extractor, adaptadores de modelo, acceso a datos, tipos
supabase/
  config.toml
  migrations/             única vía para el esquema
  seed.sql                generador sintético con verdad
  functions/api/          Hono montado en la Edge Function
  tests/                  pgTAP
eval/                     consultas, comparaciones, escenarios, imágenes, referencia SQL, arnés, resultados
docs/
  adr/                    decisiones aceptadas (0001 base, 0002 middleware, 0003 reservado para el modelo,
                          0004 cliente y hosting, 0005 comparación, contexto y asistente)
  marco_teorico.md        fuentes y conceptos
  inversion.md            efectivo, variable por uso y horas
  plan_de_trabajo.md      calendario de seis semanas, frentes y criterios de terminado
  modelo_datos.md         DDL del prototipo del cuarto avance (punto de partida de las migraciones)
  api/openapi.json        contrato generado
.github/workflows/
  ci.yml                  supabase start + test db + pnpm test
  pages.yml               build de apps/web y despliegue a GitHub Pages
  keepalive.yml           ping semanal a Supabase para evitar la pausa
```

## 12. Glosario (términos fijos del proyecto)

- Vertical (dominio): cada uno de los tres catálogos de prueba, `farmacia`, `llantas` y `belleza`, con sus propias categorías y atributos. El usuario la elige; el modelo no la cambia. Es configuración (`catalogo.vertical`), no código.
- Atributo de contexto: atributo obligatorio que define uso o riesgo (`uso_previsto`, `clase_riesgo`, `apto_consumo`, índices de una llanta). Lo declara el administrador; el modelo no lo propone; "sin dato" en uno de riesgo falla cerrado.
- Metadatos de atributos (`atributo_meta`): tabla curada por vertical y categoría con tipo, obligatoriedad, `define_uso`, `define_riesgo`, peso e `inferible`. Es la capa que la descripción no garantiza.
- Comparación: dado un producto de referencia, candidatos de la misma categoría con diferencias atributo por atributo (igual, distinto, sin dato) y nivel de compatibilidad ponderado; calculada en SQL; nunca afirma igualdad.
- Nivel de compatibilidad: número entre 0 y 1; 0 si difiere o falta un atributo de riesgo; acotado a 0.5 si difiere uno de uso.
- Par trampa: dos productos con los mismos atributos técnicos y distinto uso o riesgo, generados a propósito para probar que el comparador no los empareja.
- Contexto del usuario: atributos que el usuario declara sobre su situación en el modo asistido; se tratan como un producto de referencia virtual para calcular alertas.
- Modo asistido: panel "¿Necesitas ayuda? Cuéntame qué buscas"; el modelo extrae intención, contexto, filtros propuestos y preguntas; la base calcula las alertas; el mensaje sale de plantillas.
- Etiqueta manual: filtro agregado por el usuario eligiendo atributo, operador y valor del diccionario; acción estructurada, sin modelo; línea base de la evaluación.
- Diccionario de atributos: vista materializada con, por vertical, categoría y atributo, tipo, dominio de valores y cobertura. Lo único del catálogo que ve el modelo, y solo la parte de la vertical elegida.
- Objeto de filtros: JSON `{dominio, categoria, filtros[], incluir_sin_dato}` validado contra el diccionario; única salida permitida del modelo.
- Descripción: texto por producto generado por plantilla desde los atributos completos; se muestra en cada resultado para que el usuario confirme la coincidencia, y puede mencionar atributos que `atributos` no tiene.
- Etiqueta: representación visible de un filtro aplicado; editable; con confianza y origen.
- Faceta: atributo con sus valores y conteos calculados sobre el conjunto resultante; incluye el grupo sin dato.
- Motivo de coincidencia: por resultado, lista de filtros que cumple y de atributos sin dato; calculado en SQL.
- Sin dato / faltante: producto que no tiene la clave del atributo en `atributos`. Nunca se confunde con un valor.
- Incluir sin dato: opción del usuario para traer los productos sin dato del filtro; acción estructurada, no pasa por el modelo.
- Acción estructurada: quitar etiqueta, elegir faceta, incluir sin dato, reiniciar. Modifican el objeto de filtros sin modelo.
- Aclaración: respuesta del sistema cuando la confianza es baja o el objeto no pasa G1; ofrece opciones en lugar de resultados.
- Guarda: medida de seguridad G1 a G5 ligada a un riesgo y a requisitos verificables.
- Agente: el conjunto modelo + núcleo que interpreta peticiones; de solo lectura.
- Adaptador de modelo: implementación de `interpretar()` para un proveedor (fixtures, LLM-JSON, Jev).
- Caché exacta: tabla que reutiliza objetos validados para peticiones idénticas tras normalizar.
- Verdad del generador: valores completos de cada producto antes de borrar datos; viven en `interno.producto_verdad` y sirven para medir faltantes y, si se adopta D-02, inferencias.
- Avance: parte de equipo de una tarea semanal que suma al proyecto integrador.
