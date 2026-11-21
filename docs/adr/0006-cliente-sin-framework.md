# ADR-0006: Cliente web en TypeScript sin framework

- Estado: propuesta, 2026-11-20. Pendiente del visto bueno del equipo: cambia una decisión cerrada (`CLAUDE.md` §1.7 y §4). Si se acepta, reemplaza la parte de React y Tailwind del punto 1 del ADR-0004. El resto del ADR-0004 sigue vigente: Vite, TypeScript, móvil primero, PWA y GitHub Pages.
- Decisores: el equipo (Patricio Avila, Valeria Hernández, Alejandro Gómez).
- Ámbito: la tecnología del cliente web de `apps/web`.

## Contexto

El ADR-0004 fijó React, Vite, TypeScript y Tailwind. El cliente construido en T5 usa Vite y TypeScript, pero no React ni Tailwind:

- `vista.ts` arma la interfaz con plantillas de texto y delegación de eventos (876 líneas);
- `estilos.css` lleva los estilos escritos a mano (574 líneas);
- la única dependencia de ejecución es `@catalogo-ia/core`.

Con eso cubre el criterio de terminado de T5:

- flujo completo en las tres verticales;
- texto libre y etiquetas manuales;
- facetas, casilla de sin dato, aclaración y descartados por G1;
- aviso de farmacia y manifiesto PWA.

La revisión del 2026-11-20 encontró la diferencia entre la decisión registrada y el código. Hay dos salidas:

1. Migrar el cliente a React y Tailwind.
2. Declarar el cambio.

## Decisión propuesta

Mantener el cliente en TypeScript sin framework y declararlo:

1. Vite y TypeScript se quedan. React y Tailwind no se usan.
2. Toda interpolación de datos en el HTML pasa por `escapar()`, porque sin framework no hay escape automático. La descripción, el nombre y los descartados vienen de la base o del texto del usuario.
3. El contrato con la API es el mismo, tipado desde `@catalogo-ia/core`.

## Alternativas consideradas

- Migrar a React y Tailwind. Reescribe unas 1,450 líneas que ya pasan sus pruebas y suma dependencias, sin cambiar nada de lo que miden los documentos 2 y 3.
- Dejar la diferencia sin declarar. No es aceptable: el documento 1 y el tercer avance (delimitaciones) dicen "interfaz web en React".

## Consecuencias

- El documento 3 declara el cambio en la sección de evolución, igual que el documento 1 revisado declara sus decisiones fechadas.
- Las delimitaciones del tercer avance (`CLAUDE.md` §3.4) y §4 se actualizan cuando el equipo acepte este ADR.
- El escape manual es un riesgo que React cubriría solo. Se mitiga con la regla del punto 2 y con revisión de código.
- La fase B (comparación y modo asistido) agrega pantallas. Si la vista crece hasta volverse difícil de mantener, se puede reabrir esta decisión con otro ADR.
