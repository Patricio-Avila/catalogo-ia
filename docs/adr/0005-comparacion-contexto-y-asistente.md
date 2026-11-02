# ADR-0005: Comparación de productos, contexto obligatorio, modo asistido y verticales definitivas

- Estado: aceptada, 2026-10-31. Sustituye la vertical de ferretería del ADR-0004 por llantas; lo demás del ADR-0004 sigue vigente.
- Decisores: Patricio Avila por el equipo (Valeria Hernández, Alejandro Gómez).
- Ámbito: qué hace la aplicación además de buscar, cómo se modela el contexto de un producto y en qué orden se construye.

## Contexto

Tras cerrar el cliente web (ADR-0004), el equipo agregó cuatro necesidades:

1. Usuarios inexpertos escriben texto libre; los expertos quieren agregar sus etiquetas a mano.
2. Comparar productos: dado uno de referencia (por nombre o por foto), encontrar los que se le parecen y mostrar diferencias y nivel de compatibilidad por etiquetas, sin decir nunca que son lo mismo y entendiendo que los usos difieren.
3. El contexto de un producto no siempre está en su descripción: un ácido puede no decir que es nocivo y un agua embotellada no dice que es para beber, y ambos son líquidos en un envase de un litro. Un comparador por atributos superficiales los emparejaría.
4. Un modo "¿Necesitas ayuda? Cuéntame qué buscas" donde el usuario explique su situación (el técnico le pidió un producto que no encuentra) y el agente ayude a buscar y a detectar problemas con el producto.

Además, se quería una vertical que exija precisión en lugar de ferretería.

## Decisión

1. Verticales definitivas: `farmacia`, `llantas` y `belleza`, dos categorías cada una. Llantas es la vertical de precisión: una medida mal leída es otro producto; el usuario inexperto puede fotografiar el costado donde la medida está impresa; "uso distinto" tiene definición exacta (índices de carga y velocidad, temporada). Una vertical es configuración (`catalogo.vertical`) más su diccionario, no código.
2. El contexto se modela, no se lee. Tres capas en orden de autoridad:
   - La taxonomía: la categoría es el contexto de primer nivel; la comparación solo ocurre dentro de la misma categoría. Ante texto ambiguo, el modelo devuelve confianza baja y el sistema pregunta la categoría.
   - Atributos de contexto obligatorios por categoría (`uso_previsto`, `clase_riesgo`, `apto_consumo` y los propios de cada vertical), declarados en `atributo_meta` con `obligatorio`, `define_uso`, `define_riesgo`, `peso` e `inferible`, y exigidos por un trigger al cargar el catálogo. Cobertura 100 % por integridad. El riesgo nunca se infiere de texto ni de foto: `inferible = false` y G1 descarta cualquier propuesta del modelo. Para riesgo, "sin dato" se trata como desconocido y falla cerrado.
   - La descripción es complementaria: puede aportar atributos técnicos inferidos, marcados como tales; nunca relaja un uso ni un riesgo.
3. Dos entradas, un objeto de filtros: texto libre por el modelo y etiquetas manuales desde el diccionario (acción estructurada, sin modelo). El modo manual es la línea base sin IA de la evaluación.
4. Comparación (`comparar_productos()` en SQL): candidatos de la misma categoría; por cada uno, diferencias atributo por atributo (igual, distinto, sin dato) y nivel = pesos de atributos iguales entre pesos de atributos presentes en la referencia. Diferencia o ausencia en un atributo con `define_riesgo`: nivel 0 y "riesgo distinto". Diferencia en uno con `define_uso`: nivel acotado a 0.5 y "uso distinto". Vocabulario prohibido en la interfaz: igual, equivalente, sustituto, intercambiable, recomendado, indicado para, dosis; una prueba de contrato lo verifica. La referencia se resuelve por identificador, por nombre (búsqueda tolerante con `pg_trgm` y, si no está en el catálogo, extracción de atributos del texto) o, en la fase C, por foto (adaptador de visión; la imagen se procesa en memoria y no se guarda).
5. Modo asistido: el modelo devuelve una respuesta estructurada (intención, contexto del usuario, filtros propuestos como etiquetas sugeridas, preguntas con opciones del diccionario). Las alertas (uso distinto, riesgo, sin dato en atributos obligatorios, producto no en catálogo, requiere receta) las calcula la base tomando el contexto del usuario como referencia virtual, con la misma lógica del comparador. El mensaje sale de plantillas por intención y alerta. Diagnóstico de fallas, indicaciones de uso, dosis y reparación quedan fuera de alcance de forma explícita: la intención `fuera_de_alcance` regresa al usuario a lo que sí puede hacer el sistema.
6. Generador: pares trampa (tres por vertical) con los mismos atributos técnicos y distinto uso o riesgo, y descripciones que a veces callan el contexto. Entran al banco de evaluación.
7. Construcción por fases: A, núcleo para la materia (búsqueda, etiquetas manuales, contexto, adaptadores, evaluación, despliegue); B, comparación por nombre y modo asistido; C, comparación por foto. Cada fase se cierra completa antes de abrir la siguiente; lo que no alcance se documenta como trabajo futuro con su diseño.

## Alternativas consideradas

- Dejar que el modelo infiera el contexto desde la descripción. Descartada: la ausencia de "nocivo" no es evidencia de inocuidad; un error de inferencia en riesgo es inaceptable. Se infiere solo lo técnico, marcado.
- Comparación entre categorías con un umbral. Descartada: el ejemplo del ácido y el agua demuestra que los atributos superficiales no capturan el uso; la categoría es la frontera.
- Modo asistido como chat libre. Descartado: sin salida estructurada no hay G1, no hay trazabilidad y el sistema se vuelve un chatbot general con responsabilidades que no puede asumir (diagnóstico, dosis).
- Conservar ferretería, o usar componentes electrónicos o refacciones automotrices como vertical de precisión. Ferretería no exige precisión; electrónica tiene público reducido; refacciones requiere una matriz de compatibilidad N:M que no cabe en el tiempo. Llantas da precisión, foto y "uso distinto" con datos sintéticos simples.
- Calificación "útil / no útil" por búsqueda. Fuera de alcance.

## Consecuencias

- Nuevos requisitos RF-09 a RF-12 y nuevos endpoints `POST /comparar` y `POST /asistir` (contrato en `CLAUDE.md` §6).
- La comparación por foto obliga a que exista el adaptador LLM con visión; Jev queda solo para texto. Esto acota ADR-0003.
- La construcción sube de 93 a 129 horas a entre 150 y 190; de ahí las fases. La fase A es el mínimo defendible para los documentos 2 y 3.
- Para la materia: integridad semántica por restricciones y triggers, capa de metadatos explícita (lo que Dinu y Nadkarni exigen para modelos de atributos variables), similitud ponderada calculada en la base y explicable. Es material directo para el documento 2.
- Superficie de inyección mayor por textos más largos en el modo asistido; G1 y el esquema de respuesta la cubren, y los escenarios maliciosos de la evaluación se extienden al modo asistido.
- Fuentes a verificar antes de citar en los documentos: clasificaciones de producto (GS1 GPC, UNSPSC), clasificación de riesgo químico (GHS de la ONU y su adopción mexicana en NOM-018-STPS-2015), etiquetado de alimentos y bebidas (NOM-051-SCFI/SSA1-2010), clasificación ATC de la OMS para farmacia, y emparejamiento de registros (Christen, 2012). Están en la cola de `docs/marco_teorico.md`.

## Fuentes

- Dinu, V. y Nadkarni, P. (2007), ya verificada en el marco teórico (capa de metadatos).
- Brinkmann, Shraga y Bizer (2025), ya verificada (extracción de atributos desde texto).
- Resto: candidatas en `docs/marco_teorico.md` §5.
