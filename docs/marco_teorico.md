# Marco teórico — Filtrado asistido por IA sobre catálogos con atributos heterogéneos

Documento vivo. De aquí salen las referencias de todos los entregables (documentos 2 y 3, avances semanales, ADR). Foto al 2026-10-31.

## 1. Reglas de uso

1. Jerarquía de admisión: normas y estándares; literatura arbitrada; libros de editorial reconocida; documentación oficial del fabricante o del proyecto; publicaciones institucionales. No admisibles: blogs, foros, resúmenes, wikis, tutoriales sin autoría, contenido generado por IA. Stack Overflow y GitHub Issues sirven para depurar, no para citar.
2. Vigencia: tecnología y herramientas, máximo 5 años salvo justificación; fundamentos teóricos sin límite si son obras canónicas; documentación oficial siempre en la versión vigente, indicando versión; normas verificadas como no derogadas.
3. Cada fuente pasa por tres estados: candidata (§5), verificada (§4) y usada (se anota en qué entregable). Nada se cita en estado candidata.
4. Sistemas de terceros solo con ficha de análisis (§3) y con al menos 6 de 8 criterios cubiertos; con 4 o 5, mención contextual; con menos, se descarta. El campo "qué no aplica" es obligatorio.
5. Máximo 4 referencias por entregable semanal. Los documentos 2 y 3 pueden usar más, justificándolo. Toda cita en texto tiene entrada en la lista y toda entrada aparece citada.
6. APA 7: (Apellido, año) para paráfrasis; (Apellido, año, p. X) para cita textual; tres o más autores con *et al.* desde la primera mención; DOI como `https://doi.org/...`; software y documentación técnica con autor corporativo, año, título, versión y URL.
7. Se prefiere la paráfrasis. Se distingue siempre lo que afirma la fuente, la inferencia propia y el supuesto de diseño.

## 2. Temas

Cada tema: concepto, fuentes, cómo se usa en el proyecto, y dónde se ha citado.

### 2.1 Modelado de atributos heterogéneos

Concepto. Tres formas de representar entidades cuyos atributos varían: tabla ancha (una columna por atributo, muchos nulos, cambio de esquema por cada atributo nuevo); entidad-atributo-valor (EAV: un renglón por atributo presente, flexible, con consultas por atributo más costosas y dependiente de una capa de metadatos); documento semiestructurado (JSONB en PostgreSQL: almacenamiento binario, índices GIN, operadores de contención `@>` y existencia de clave `?`). El proyecto usa un híbrido: columnas fijas para lo común y JSONB para lo variable. Un dato faltante es una clave ausente, distinguible de un valor.

Fuentes verificadas: Dinu y Nadkarni (2007); PostgreSQL Global Development Group (2025).

Uso en el proyecto: justificación del esquema híbrido (objetivo particular 1); comparación medida contra EAV y tabla ancha (documento 2); semántica de `incluir_sin_dato`.

Citado en: documento 1; S8 (marco teórico, Tabla 1).

### 2.2 Metadatos y diccionario de atributos

Concepto. La flexibilidad de un modelo de atributos variables depende de una capa de metadatos que describa cada atributo, su tipo y sus reglas; Dinu y Nadkarni (2007) la consideran condición del EAV y sugieren vistas materializadas de forma selectiva. En el proyecto esa capa es el diccionario de atributos, una vista materializada calculada desde los propios datos (tipo, dominio, cobertura por categoría), que no puede quedar desfasada del contenido: se refresca al cargar el catálogo.

Fuentes verificadas: Dinu y Nadkarni (2007); PostgreSQL Global Development Group (2025).

Candidata: documentación oficial de PostgreSQL 18 sobre vistas materializadas (`CREATE MATERIALIZED VIEW`, `REFRESH ... CONCURRENTLY`).

Uso: objetivo particular 3; RF-08; es lo único del catálogo que ve el modelo (G1 y G3).

### 2.3 Índices para JSONB

Concepto. GIN indexa las claves y valores de un documento JSONB. La clase de operadores por omisión (`jsonb_ops`) soporta `@>`, `?`, `?|`, `?&`; `jsonb_path_ops` solo `@>`, con índices más pequeños y rápidos para contención. La elección se mide con los patrones reales de consulta del proyecto.

Fuentes verificadas: PostgreSQL Global Development Group (2025), sección de indexación de JSON.

Candidata: documentación oficial de PostgreSQL 18, capítulo de índices GIN.

Uso: objetivo particular 1; decisión de clase de operadores en el documento 2; nota de §7.2 de `CLAUDE.md` (el operador `?` de la función no usa `jsonb_path_ops`).

### 2.4 Búsqueda por facetas

Concepto. Navegación que ofrece, para el conjunto de resultados vigente, los atributos y valores con sus conteos, de modo que el usuario refine sin conocer el vocabulario completo. En catálogos con datos incompletos, el grupo "sin dato" es una faceta más y su conteo es información para el usuario.

Candidatas (verificar antes de citar): Tunkelang (2009); Hearst (2009); Manning, Raghavan y Schütze (2008) para definiciones de recuperación de información y medidas de evaluación.

Uso: RF-06, RF-07; `calcular_facetas()`; pantalla principal.

### 2.5 Interfaces en lenguaje natural para bases de datos

Concepto. Text-to-SQL traduce preguntas en lenguaje natural a consultas SQL; Shi et al. (2025) organizan los trabajos con modelos de lenguaje en ingeniería de instrucciones y ajuste fino y los evalúan con bancos de prueba sobre esquemas conocidos. Permite consultas arbitrarias, pero entrega al modelo la redacción de código que se ejecuta en la base, lo que exige verificar corrección y seguridad. El proyecto adopta una variante restringida: el modelo no escribe SQL, sino un objeto de filtros validado contra el diccionario y ejecutado con funciones parametrizadas. Se pierde libertad de formulación; se gana explicabilidad y un espacio de respuestas acotado. AlloyDB AI (Google Cloud, s.f.-a, s.f.-b) es precedente: lenguaje natural sobre PostgreSQL con vistas seguras parametrizadas.

Fuentes verificadas: Shi et al. (2025); Google Cloud (s.f.-a, s.f.-b); ficha AlloyDB 6/8 (§3).

Uso: antecedentes; justificación de "el modelo no escribe SQL"; RF-01, RF-02.

Citado en: documento 1; S8.

### 2.6 Extracción de atributos de producto con modelos de lenguaje

Concepto. Brinkmann, Shraga y Bizer (2025) estudian cómo los modelos de lenguaje extraen valores de atributos a partir de descripciones de producto, con y sin ejemplos. Es la base teórica de la decisión abierta D-02 (inferir atributos faltantes por lote, marcándolos como inferidos con probabilidad). Mientras D-02 no se adopte, el proyecto solo expone los faltantes.

Fuentes verificadas: Brinkmann, Shraga y Bizer (2025); ficha ExtractGPT 8/8 (§3).

Uso: antecedentes; D-02.

### 2.7 Seguridad en aplicaciones con modelos de lenguaje

Concepto. OWASP GenAI Security Project (2025a) clasifica la inyección de instrucciones como el primer riesgo de las aplicaciones con modelos de lenguaje: un texto del usuario puede alterar el comportamiento del modelo. La agencia excesiva (OWASP GenAI Security Project, 2025b) ocurre cuando el modelo tiene más permisos o funciones de las necesarias. Lin et al. (2025) muestran que modelos text-to-SQL pueden portar puertas traseras que inyectan SQL. El proyecto responde con cinco guardas: salida validada (G1), consultas parametrizadas (G2), rol mínimo y esquema aislado (G3), límites de filas y tiempo (G4), filtros visibles y motivo en SQL (G5). En PostgreSQL: roles, `GRANT`/`REVOKE`, funciones `SECURITY DEFINER` con `search_path` fijo, `statement_timeout` por rol; en Supabase, Row Level Security.

Fuentes verificadas: OWASP GenAI Security Project (2025a, 2025b); Lin et al. (2025); Supabase (s.f.); ficha ToxicSQL 8/8 (§3).

Candidata: documentación oficial de PostgreSQL 18 sobre roles de base de datos y parámetros de ejecución (`statement_timeout`).

Uso: RNF-01 a RNF-04; §8.2 de `CLAUDE.md`; ADR-0002.

Citado en: documento 1; S8.

### 2.8 Modelos de decisión tipada

Concepto. Un modelo que no genera texto: recibe un estado (el texto del usuario, un JSON) y preguntas con respuestas cerradas (elección entre opciones, calificación, sí/no) y devuelve una distribución de probabilidad por pregunta. Para el proyecto importa porque la salida queda acotada por construcción al diccionario de atributos (refuerza G1), cada filtro trae confianza (habilita los niveles alta/media/baja) y la latencia es baja. Limitaciones reportadas por el fabricante: débil con números, conteos y fechas; idioma principal inglés; máximo de opciones por pregunta; proveedor único en la nube.

Candidatas: documentación oficial de TypeSafe AI (docs.typesafe.ai: API, modelos, recetarios de function calling, extracción de valores pre-detectados, clasificación jerárquica, enrutamiento por confianza). El preprint de la Universidad de Bonn (arXiv 2609.37647) solo admite mención contextual. Las publicaciones en dev.to (Google, AlloyDB con Jev), AI Superior y eesel AI no son admisibles.

Uso: D-01 y ADR-0003; tercer avance (sustituir fuentes).

### 2.9 Requisitos verificables y trazabilidad

Concepto. Cada requisito es único, verificable, no ambiguo y trazable (ISO/IEC/IEEE 29148:2018). La cadena del proyecto es hallazgo → requisito → módulo → entidad de datos → prueba; cada guarda se ata a requisitos y cada requisito a una prueba automatizada.

Fuentes verificadas: ISO/IEC/IEEE (2018).

Uso: §8 de `CLAUDE.md`; matriz de trazabilidad del documento 2.

### 2.10 Evaluación de sistemas de búsqueda

Concepto. Comparar lo devuelto contra un conjunto de referencia obtenido por una vía independiente (SQL a mano), con medidas de exactitud del objeto de filtros, coincidencia de resultados, exactitud de conteos y tiempos p50 y p95; línea base de filtrado manual sin IA. La evaluación corre con caché apagada y versión de modelo fija.

Candidatas: Manning, Raghavan y Schütze (2008), capítulo de evaluación.

Uso: objetivo particular 6; §9 de `CLAUDE.md`; documento 3.

### 2.11 Caché de consultas y normalización

Concepto. Reutilizar la interpretación de peticiones idénticas tras normalizar el texto (números sustituidos por un marcador, filtros vigentes y versión del diccionario en la clave). La caché semántica (similitud de embeddings) queda como trabajo futuro por el riesgo de confundir peticiones parecidas pero opuestas.

Candidatas: documentación oficial de pgvector (repositorio del proyecto) si se adopta D-05.

Uso: §6 de `CLAUDE.md`; tercer avance.

### 2.12 Emparejamiento de productos y similitud ponderada

Concepto. Decidir si dos registros describen productos parecidos es un problema de emparejamiento de registros (data matching, entity resolution): comparar atributo por atributo con funciones de similitud, ponderar, y clasificar el par. El proyecto lo acota de dos formas: solo compara dentro de la misma categoría, y el resultado nunca es "coinciden" sino una lista de diferencias (igual, distinto, sin dato) con un nivel ponderado por metadatos; los atributos de riesgo y de uso dominan al resto. La búsqueda tolerante por nombre usa similitud de trigramas (`pg_trgm`).

Candidatas: Christen (2012); documentación oficial de PostgreSQL 18 sobre `pg_trgm`.

Uso: RF-09; `comparar_productos()`; alertas del modo asistido (RF-12); ADR-0005.

### 2.13 Clasificaciones de producto y de riesgo

Concepto. El contexto de un producto (para qué sirve, qué riesgo tiene) no está garantizado en su descripción; lo aportan clasificaciones externas y atributos declarados. Las clasificaciones de producto (GS1 GPC, UNSPSC) separan por uso lo que los atributos físicos confunden; la clasificación de peligros químicos del GHS de la ONU, adoptada en México por la NOM-018-STPS-2015, define clases de riesgo declarables; el etiquetado de alimentos y bebidas se rige por la NOM-051-SCFI/SSA1-2010; en farmacia, la clasificación ATC de la OMS agrupa sustancias por uso terapéutico sin constituir indicación. El proyecto convierte esto en atributos obligatorios (`uso_previsto`, `clase_riesgo`, `apto_consumo`) exigidos por integridad y en una regla: el riesgo nunca se infiere.

Candidatas (todas por verificar, las NOM también en vigencia): GS1 GPC; UNSPSC; ONU, GHS (edición vigente); NOM-018-STPS-2015; NOM-051-SCFI/SSA1-2010 y su modificación de 2020; OMS, índice ATC/DDD.

Uso: RF-11; `atributo_meta`; trigger de obligatorios; pares trampa; ADR-0005.

### 2.14 Diálogo guiado con salida estructurada

Concepto. Un asistente acotado no genera respuestas libres: clasifica la intención, extrae datos del texto a un esquema, formula preguntas cerradas con opciones tomadas del propio catálogo y deja los juicios (alertas) a la base de datos. Es la misma arquitectura de G1 aplicada a una conversación: toda salida del modelo es un objeto validable. Los modelos de decisión tipada (2.8) encajan de forma natural; un LLM con JSON acotado cumple el mismo contrato.

Fuentes: las de 2.5, 2.7 y 2.8. Sin fuente adicional necesaria mientras el asistente se describa como aplicación de esos principios.

Uso: RF-12; `POST /asistir`; ADR-0005.

## 3. Fichas de análisis de sistemas de terceros

Formato obligatorio (sección 5.2 de las reglas del espacio). Las fichas completas están en el documento 1; aquí el resumen y los criterios cubiertos. Completar los campos marcados desde `PI1_BDE_CPAI.docx` al consolidar el repo.

### 3.1 ExtractGPT (Brinkmann, Shraga y Bizer, 2025) — 8 de 8

- Tipo de fuente: artículo arbitrado (LNCS 15342, Springer); preprint arXiv:2310.12537.
- Problema que resuelve: extracción de valores de atributos de producto con modelos de lenguaje.
- Qué se retoma: evidencia de que un modelo de lenguaje puede inferir atributos desde descripciones (D-02); vocabulario de atributos como entrada del modelo.
- Qué no aplica: completar desde el documento 1.

### 3.2 ToxicSQL (Lin et al., 2025) — 8 de 8

- Tipo de fuente: artículo arbitrado (Proceedings of the ACM on Management of Data, 3(6), art. 297); preprint arXiv:2503.05445.
- Problema: puertas traseras en modelos text-to-SQL que inyectan SQL.
- Qué se retoma: justificación de que el modelo no escriba SQL (G1, G2).
- Qué no aplica: completar desde el documento 1.

### 3.3 AlloyDB AI, lenguaje natural y vistas seguras parametrizadas (Google Cloud, s.f.-a, s.f.-b) — 6 de 8

- Tipo de fuente: documentación oficial del fabricante. Le faltan fecha de publicación y resultados medidos.
- Qué se retoma: precedente de lenguaje natural sobre PostgreSQL con acceso acotado por vistas parametrizadas.
- Qué no aplica: producto administrado y propietario; el proyecto lo logra sobre PostgreSQL estándar.

## 4. Referencias verificadas (APA 7)

Usadas en el documento 1 (verificadas en septiembre de 2026) o en avances posteriores. Los campos marcados se completan desde `PI1_BDE_CPAI.docx`.

- Brinkmann, A., Shraga, R. y Bizer, C. (2025). ExtractGPT: Exploring the potential of large language models for product attribute value extraction. En *Lecture Notes in Computer Science* (Vol. 15342, pp. 38–52). Springer. [DOI y título del volumen: tomar del documento 1]
- Dinu, V. y Nadkarni, P. (2007). Guidelines for the effective use of entity-attribute-value modeling for biomedical databases. *International Journal of Medical Informatics, 76*(11–12), 769–779. https://doi.org/10.1016/j.ijmedinf.2006.09.023
- Google Cloud. (s.f.-a). *AlloyDB AI: consultas en lenguaje natural* [documentación]. [Título exacto y URL: tomar del documento 1]
- Google Cloud. (s.f.-b). *AlloyDB AI: parameterized secure views* [documentación]. [Título exacto y URL: tomar del documento 1]
- ISO/IEC/IEEE. (2018). *ISO/IEC/IEEE 29148:2018. Systems and software engineering — Life cycle processes — Requirements engineering*.
- Lin, M., et al. (2025). ToxicSQL: Migrating SQL injection threats into text-to-SQL models via backdoor attack. *Proceedings of the ACM on Management of Data, 3*(6), Artículo 297. [Autores completos y DOI: tomar del documento 1]
- OWASP GenAI Security Project. (2025a). *LLM01:2025 Prompt injection*. https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- OWASP GenAI Security Project. (2025b). *LLM06:2025 Excessive agency*. [URL exacta: confirmar en genai.owasp.org]
- PostgreSQL Global Development Group. (2025). *PostgreSQL 18 documentation: JSON types*. https://www.postgresql.org/docs/18/datatype-json.html
- Shi, L., Tang, Z., Zhang, N., Zhang, X. y Yang, Z. (2025). A survey on employing large language models for text-to-SQL tasks. *ACM Computing Surveys, 58*(2), Artículo 54. https://doi.org/10.1145/3737873
- Supabase. (s.f.). *Row Level Security* [documentación]. https://supabase.com/docs/guides/database/postgres/row-level-security

## 5. Cola de verificación (candidatas)

Verificar existencia, datos bibliográficos y vigencia antes de citar. Anotar fecha y resultado.

| Candidata | Para qué tema | Estado |
|---|---|---|
| Tunkelang, D. (2009). *Faceted search*. Morgan & Claypool, Synthesis Lectures on Information Concepts, Retrieval, and Services | 2.4 | Existe (registro en DBLP); falta DOI y datos completos |
| Manning, C. D., Raghavan, P. y Schütze, H. (2008). *Introduction to information retrieval*. Cambridge University Press. ISBN 978-0-521-86571-5 | 2.4, 2.10 | Datos confirmados en reseñas; edición en línea en nlp.stanford.edu/IR-book; confirmar capítulo a citar |
| Hearst, M. A. (2009). *Search user interfaces*. Cambridge University Press | 2.4 | Por verificar |
| PostgreSQL 18, capítulo de índices GIN; `CREATE MATERIALIZED VIEW`; roles; `statement_timeout` | 2.2, 2.3, 2.7 | Documentación oficial; tomar URL de la versión 18 |
| pgvector, documentación del proyecto (repositorio) | 2.11 | Solo si se adopta D-05 |
| TypeSafe AI, documentación de Jev (API, modelos, recetarios, patrones) | 2.8 | Documentación del fabricante; registrar versión del modelo y fecha de consulta |
| Universidad de Bonn, preprint "Evaluating and Benchmarking Jev" (arXiv 2609.37647) | 2.8 | Preprint: solo mención contextual |
| Supabase, documentación de Edge Functions (límites, conexión a Postgres) y Hono, documentación oficial | ADR-0002 | Documentación oficial; usada en ADR, no en los documentos de la materia salvo necesidad |
| Christen, P. (2012). *Data matching: Concepts and techniques for record linkage, entity resolution, and duplicate detection*. Springer | 2.12 | Por verificar (editorial y DOI) |
| PostgreSQL 18, módulo `pg_trgm` | 2.12 | Documentación oficial; tomar URL de la versión 18 |
| GS1, Global Product Classification (GPC) | 2.13 | Por verificar (edición vigente y acceso) |
| UNSPSC, United Nations Standard Products and Services Code | 2.13 | Por verificar (edición vigente) |
| ONU, Globally Harmonized System of Classification and Labelling of Chemicals (GHS), edición vigente | 2.13 | Por verificar |
| NOM-018-STPS-2015, sistema armonizado de identificación y comunicación de peligros y riesgos por sustancias químicas peligrosas | 2.13 | Por verificar vigencia en el DOF antes de citar |
| NOM-051-SCFI/SSA1-2010, etiquetado de alimentos y bebidas no alcohólicas preenvasados, y su modificación de 2020 | 2.13 | Por verificar vigencia en el DOF antes de citar |
| OMS, Collaborating Centre for Drug Statistics Methodology, índice ATC/DDD | 2.13 | Por verificar (edición vigente) |

Descartadas (no admisibles): AI Superior (blog); eesel AI (blog); publicaciones en dev.to; notas de prensa de proveedores.

## 6. Registro de uso por entregable

| Entregable | Referencias usadas |
|---|---|
| Documento 1 (2026-09-29) | Las once de §4 |
| S8, marco teórico (2026-10-31) | Dinu y Nadkarni (2007); OWASP GenAI Security Project (2025a); PostgreSQL Global Development Group (2025); Shi et al. (2025) |
| S7, tercer avance (2026-10-24) | AI Superior (2026) y eesel AI (2026): no admisibles, sustituir |
| Documento 2 | Por asignar |
| Documento 3 | Por asignar |
