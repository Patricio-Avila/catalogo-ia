// Fixtures del adaptador que se despliega y se evalúa (ADR-0003): el cliente web
// en modo local, la Edge Function sin GEMINI_API_KEY y eval/correr.ts usan
// AdaptadorInteractivo con esta tabla y nada más.
//
// Regla: ninguna frase del banco de evaluación (eval/consultas.json) puede tener
// respuesta fija aquí. Si la tuviera, la exactitud reportada mediría una tabla de
// búsqueda y no la interpretación. fixtures_demo.test.ts lo verifica.
// Estas tres frases muestran en la demo la confianza baja, el reinicio y una
// negación que la coincidencia léxica no resuelve sola.

import type { FixturesModelo } from "../modelo/fixtures";

export const FIXTURES_DEMO: FixturesModelo = {
  belleza: {
    "que sea barato": {
      filtros: [{ atributo: "precio", operador: "<", valor: 150, confianza: 0.4 }],
    },
    "mejor empezamos de nuevo": { reiniciar: true, filtros: [] },
    "que no tenga parabenos": {
      filtros: [{ atributo: "sin_parabenos", operador: "=", valor: true, confianza: 0.9 }],
    },
  },
};
