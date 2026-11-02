// Fixtures del modelo: lo que un adaptador real debería devolver para textos
// conocidos. Los números no van aquí: los pone el extractor. Sirven a las
// pruebas y al cliente sin proveedor (T5). Se amplían con el banco de T6.

import type { FixturesModelo } from "../modelo/fixtures";

export const FIXTURES_MODELO: FixturesModelo = {
  belleza: {
    "crema sin perfume para piel sensible de menos de 300 pesos": {
      categoria: "cuidado_facial",
      filtros: [
        { atributo: "fragancia", operador: "=", valor: "sin perfume", confianza: 0.95 },
        { atributo: "tipo_piel", operador: "=", valor: "sensible", confianza: 0.9 },
      ],
    },
    "algo para piel delicada": {
      filtros: [{ atributo: "tipo_piel", operador: "=", valor: "sensible", confianza: 0.7 }],
    },
    "protector solar vegano": {
      categoria: "cuidado_facial",
      filtros: [
        { atributo: "uso_previsto", operador: "=", valor: "proteger", confianza: 0.9 },
        { atributo: "vegano", operador: "=", valor: true, confianza: 0.95 },
      ],
    },
    "que sea barato": {
      filtros: [{ atributo: "precio", operador: "<", valor: 150, confianza: 0.4 }],
    },
    "mejor empezamos de nuevo": { reiniciar: true, filtros: [] },
    "que no tenga parabenos": {
      filtros: [{ atributo: "sin_parabenos", operador: "=", valor: true, confianza: 0.9 }],
    },
    "crema que no cause daño": {
      filtros: [{ atributo: "clase_riesgo", operador: "=", valor: "ninguno", confianza: 0.9 }],
    },
  },
  farmacia: {
    "paracetamol en tabletas": {
      categoria: "medicamentos",
      filtros: [
        { atributo: "sustancia_activa", operador: "=", valor: "paracetamol", confianza: 0.98 },
        { atributo: "forma_farmaceutica", operador: "=", valor: "tableta", confianza: 0.9 },
      ],
    },
    "jarabe sin azucar": {
      filtros: [
        { atributo: "forma_farmaceutica", operador: "=", valor: "jarabe", confianza: 0.95 },
        { atributo: "sin_azucar", operador: "=", valor: true, confianza: 0.9 },
      ],
    },
    "algo que no necesite receta": {
      filtros: [{ atributo: "requiere_receta", operador: "=", valor: false, confianza: 0.9 }],
    },
  },
  llantas: {
    "llanta #/# r# para carretera": {
      categoria: "pasajeros",
      filtros: [{ atributo: "uso_previsto", operador: "=", valor: "carretera", confianza: 0.9 }],
    },
    "llantas para la camioneta de carga": {
      categoria: "carga_ligera",
      filtros: [],
    },
    "de invierno con run flat": {
      filtros: [
        { atributo: "temporada", operador: "=", valor: "invierno", confianza: 0.95 },
        { atributo: "run_flat", operador: "=", valor: true, confianza: 0.9 },
      ],
    },
  },
};
