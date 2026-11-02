# ADR-0004: Cliente web en GitHub Pages y catálogo de tres verticales

- Estado: aceptada, 2026-10-31. Reemplaza el punto 9 (hosting web) del ADR-0002. ADR-0003 queda reservado para la decisión del modelo. La vertical de ferretería del punto 4 queda sustituida por llantas en ADR-0005 el mismo día; el resto sigue vigente.
- Decisores: Patricio Avila por el equipo (Valeria Hernández, Alejandro Gómez).
- Ámbito: la aplicación con la que se prueba el sistema, dónde se sirve y qué catálogo muestra.

## Contexto

El equipo quiere una aplicación pequeña para probar el sistema con tres casos de uso (búsqueda de medicamentos en farmacia, de herramientas en ferretería y de productos de belleza y cuidado de la piel), que cualquiera pueda abrir sin instalar nada, gratuita y fácil de desplegar, y cuyos productos tengan una descripción con la que el usuario confirme por sí mismo cada resultado. Se mencionó Flutter como opción; una app Flutter se instala, que es lo contrario de lo que se busca. El requisito real es un enlace que funcione en cualquier teléfono o computadora.

## Decisión

1. Un solo cliente: React + Vite + TypeScript + Tailwind compilado a archivos estáticos, móvil primero, con manifiesto PWA para que quien quiera lo agregue a su pantalla de inicio desde el navegador, sin tiendas.
2. Hosting: GitHub Pages, desplegado por GitHub Actions en cada push a `main` (`pages.yml`). Gratis para repositorios públicos, sin cuentas adicionales, HTTPS incluido, URL `https://<usuario>.github.io/<repo>/`. Cloudflare Pages queda como respaldo únicamente si hace falta dominio propio o vistas previas por rama.
3. Requisitos técnicos del despliegue: `base` de Vite igual a `/<repo>/`; rutas con hash o copia de `index.html` a `404.html` para que una recarga en una ruta profunda no falle; el origen de Pages en la lista CORS de la Edge Function; la clave anónima de Supabase es la única que viaja al cliente.
4. Catálogo de tres verticales (dominios) con dos categorías cada una:

| Vertical | Categorías | Atributos distintivos |
|---|---|---|
| `farmacia` | `medicamentos`, `suplementos` | sustancia activa, concentración, forma farmacéutica, vía, piezas, requiere receta, sin azúcar |
| `ferreteria` | `herramientas_electricas`, `herramientas_manuales` | tipo de alimentación, voltaje, potencia, material, medida, garantía, estuche |
| `belleza` | `cuidado_facial`, `cuidado_corporal` | contenido, fragancia, tipo de piel, acabado, SPF, vegano, sin parabenos |

   Coberturas, tipos y reglas del generador en `CLAUDE.md` §7.4. Cada producto lleva `descripcion` generada por plantilla desde sus atributos completos; la verdad completa se guarda en `interno.producto_verdad`.
5. Flujo: el usuario elige la vertical al entrar; el modelo recibe solo el diccionario de esa vertical; el objeto de filtros lleva `dominio` obligatorio y `categoria` opcional.
6. Farmacia es búsqueda de catálogo: nombre, sustancia, forma, presentación y precio. Sin recomendaciones de uso ni sustituciones, con aviso en pantalla. Sustancias genéricas y nombres sintéticos; nunca marcas reales.
7. Evaluación: el banco de 30 consultas se reparte en 10 por vertical.

## Alternativas consideradas

- Flutter (una app para web, Android e iOS). Descartada: se instala; segundo lenguaje (Dart) y toolchain nuevo para los tres integrantes; compilar iOS exige una Mac con Xcode y una cuenta de Apple; de 30 a 45 horas frente a 20 a 30 del cliente web. Si el Premio Idea llegara a pedir una app nativa, el cliente Flutter se genera después desde el contrato OpenAPI sin tocar el backend.
- Cloudflare Pages como principal. Mismo costo y más funciones (dominio propio, vistas previas por rama), pero exige otra cuenta y otra configuración. Queda como respaldo.
- Dos clientes (web y nativo). Descartado por duplicar trabajo.
- Calificación "útil / no útil" por búsqueda. Fuera de alcance; si se pide, es una tabla en el esquema de servicio y un botón.

## Consecuencias

- Tres verticales con atributos que no se parecen entre sí son la demostración más fuerte del problema P1 (atributos heterogéneos) que el proyecto puede dar.
- El contrato cambia: `dominio` obligatorio, `categoria` opcional, `descripcion` en cada resultado. Las funciones `buscar_productos` y `calcular_facetas` reciben dominio y categoría; el diccionario se calcula por dominio, categoría y atributo.
- El generador del prototipo (cinco categorías) se reemplaza; el documento 2 declara el cambio.
- Las descripciones que mencionan atributos borrados dejan lista la inferencia desde texto (D-02) sin rehacer el generador.
- Límites de GitHub Pages según su documentación: sitio de hasta 1 GB, ancho de banda blando de 100 GB al mes y 10 compilaciones por hora. La aplicación compilada pesa unos cuantos MB; ningún límite es un riesgo para una demo.
- Una app en GitHub Pages es pública por definición; el repo ya lo es. No se publica nada que no deba verse.

## Datos verificados (2026-10-31)

| Elemento | Dato |
|---|---|
| GitHub Pages | Gratuito en repositorios públicos; despliegue desde GitHub Actions; HTTPS incluido |
| GitHub Actions | Gratuito en repositorios públicos con ejecutores estándar |
| Flutter, costos solo si se publica en tiendas | Apple Developer Program 99 USD al año; Google Play 25 USD una sola vez; Mac con Xcode para iOS |

## Fuentes

- GitHub, documentación de GitHub Pages (límites de uso y despliegue con Actions): https://docs.github.com/en/pages
- GitHub, facturación de GitHub Actions (uso gratuito en repositorios públicos): https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- Vite, opción `base` para despliegue en subruta: https://vite.dev/guide/static-deploy
- Tarifas de App Store y Google Play (referencia de terceros, 2025): https://splitmetrics.com/blog/google-play-apple-app-store-fees/
