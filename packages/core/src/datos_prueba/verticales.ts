// Configuración de verticales de prueba: espejo de lo que inserta la migración
// 20261102160200_atributo_meta_y_trigger.sql en catalogo.vertical y catalogo.categoria.

import type { Vertical } from "../contrato/diccionario";

export const VERTICALES_PRUEBA: Vertical[] = [
  {
    dominio: "farmacia",
    nombre: "Farmacia",
    texto_ayuda: "Busca por sustancia, concentración, forma farmacéutica, presentación o precio.",
    aviso:
      "Este catálogo solo permite buscar productos. No recomienda, no sustituye ni indica usos ni dosis. Consulta a un profesional de la salud.",
    atributos_destacados: ["sustancia_activa", "concentracion_mg", "forma_farmaceutica", "piezas"],
    version_diccionario: "prueba-1",
    categorias: [
      { categoria: "medicamentos", nombre: "Medicamentos" },
      { categoria: "suplementos", nombre: "Suplementos" },
    ],
  },
  {
    dominio: "llantas",
    nombre: "Llantas",
    texto_ayuda: "Busca por medida (por ejemplo 205/55 R16), índices de carga y velocidad, temporada o precio.",
    aviso: null,
    atributos_destacados: ["ancho_mm", "perfil_pct", "rin_pulg", "indice_carga", "indice_velocidad"],
    version_diccionario: "prueba-1",
    categorias: [
      { categoria: "pasajeros", nombre: "Pasajeros" },
      { categoria: "carga_ligera", nombre: "Carga ligera" },
    ],
  },
  {
    dominio: "belleza",
    nombre: "Belleza y cuidado de la piel",
    texto_ayuda: "Busca por tipo de piel, fragancia, contenido, SPF o precio.",
    aviso: null,
    atributos_destacados: ["tipo_piel", "fragancia", "contenido_ml", "spf"],
    version_diccionario: "prueba-1",
    categorias: [
      { categoria: "cuidado_facial", nombre: "Cuidado facial" },
      { categoria: "cuidado_corporal", nombre: "Cuidado corporal" },
    ],
  },
];
