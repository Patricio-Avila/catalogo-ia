// Diccionarios de prueba por vertical, fieles a CLAUDE.md §7.4.
// Sirven a las pruebas del núcleo y al adaptador de fixtures (T3.b).
// Las coberturas y rangos son las metas del generador, no mediciones.

import type { Diccionario, EntradaDiccionario } from "../contrato/diccionario";

type Parcial = Partial<EntradaDiccionario> & Pick<EntradaDiccionario, "atributo" | "tipo">;

function entradas(categorias: string[], lista: Parcial[]): EntradaDiccionario[] {
  return categorias.flatMap((categoria) =>
    lista.map((p) => ({
      categoria,
      cobertura_pct: 100,
      obligatorio: false,
      define_uso: false,
      define_riesgo: false,
      inferible: true,
      ...p,
    })),
  );
}

const COLUMNAS_FIJAS: Parcial[] = [
  { atributo: "precio", tipo: "numero", minimo: 50, maximo: 1000 },
  { atributo: "marca", tipo: "texto", valores: ["Marca A", "Marca B", "Marca C", "Marca D", "Marca E", "Marca F", "Marca G", "Marca H"] },
];

export const DICCIONARIO_FARMACIA: Diccionario = {
  dominio: "farmacia",
  version: "prueba-1",
  categorias: ["medicamentos", "suplementos"],
  entradas: [
    ...entradas(["medicamentos", "suplementos"], [
      ...COLUMNAS_FIJAS,
      { atributo: "uso_previsto", tipo: "texto", valores: ["alivio sintomático", "suplemento"], obligatorio: true, define_uso: true },
      { atributo: "requiere_receta", tipo: "booleano", obligatorio: true, define_riesgo: true, inferible: false },
      { atributo: "clase_riesgo", tipo: "texto", valores: ["ninguno", "uso bajo supervisión"], obligatorio: true, define_riesgo: true, inferible: false },
      { atributo: "apto_consumo", tipo: "booleano", obligatorio: true, define_riesgo: true, inferible: false },
      { atributo: "sustancia_activa", tipo: "texto", valores: ["paracetamol", "ibuprofeno", "loratadina", "omeprazol", "vitamina c"], cobertura_pct: 100 },
      { atributo: "concentracion_mg", tipo: "numero", minimo: 10, maximo: 1000, cobertura_pct: 90 },
      { atributo: "forma_farmaceutica", tipo: "texto", valores: ["tableta", "cápsula", "jarabe", "suspensión", "sobre"], cobertura_pct: 95 },
      { atributo: "via_administracion", tipo: "texto", valores: ["oral", "tópica"], cobertura_pct: 70, define_uso: true },
      { atributo: "piezas", tipo: "numero", minimo: 1, maximo: 100, cobertura_pct: 85 },
      { atributo: "sin_azucar", tipo: "booleano", cobertura_pct: 40 },
    ]),
  ],
};

export const DICCIONARIO_LLANTAS: Diccionario = {
  dominio: "llantas",
  version: "prueba-1",
  categorias: ["pasajeros", "carga_ligera"],
  entradas: [
    ...entradas(["pasajeros", "carga_ligera"], [
      ...COLUMNAS_FIJAS,
      { atributo: "uso_previsto", tipo: "texto", valores: ["urbano", "carretera", "todo terreno", "remolque"], obligatorio: true, define_uso: true },
      { atributo: "indice_carga", tipo: "numero", minimo: 75, maximo: 121, obligatorio: true, define_uso: true },
      { atributo: "indice_velocidad", tipo: "texto", valores: ["S", "T", "H", "V", "W"], obligatorio: true, define_uso: true },
      { atributo: "clase_riesgo", tipo: "texto", valores: ["ninguno"], obligatorio: true, define_riesgo: true, inferible: false },
      { atributo: "ancho_mm", tipo: "numero", minimo: 155, maximo: 285 },
      { atributo: "perfil_pct", tipo: "numero", minimo: 30, maximo: 80 },
      { atributo: "rin_pulg", tipo: "numero", minimo: 13, maximo: 20 },
      { atributo: "temporada", tipo: "texto", valores: ["verano", "todo tiempo", "invierno"], cobertura_pct: 70 },
      { atributo: "run_flat", tipo: "booleano", cobertura_pct: 45 },
      { atributo: "garantia_km", tipo: "numero", minimo: 20000, maximo: 100000, cobertura_pct: 60 },
      { atributo: "anio_fabricacion", tipo: "numero", minimo: 2020, maximo: 2026, cobertura_pct: 50 },
    ]),
  ],
};

export const DICCIONARIO_BELLEZA: Diccionario = {
  dominio: "belleza",
  version: "prueba-1",
  categorias: ["cuidado_facial", "cuidado_corporal"],
  entradas: [
    ...entradas(["cuidado_facial", "cuidado_corporal"], [
      ...COLUMNAS_FIJAS,
      { atributo: "uso_previsto", tipo: "texto", valores: ["hidratar", "limpiar", "proteger", "exfoliar"], obligatorio: true, define_uso: true },
      { atributo: "zona_aplicacion", tipo: "texto", valores: ["rostro", "cuerpo", "contorno de ojos"], obligatorio: true, define_uso: true },
      { atributo: "clase_riesgo", tipo: "texto", valores: ["ninguno", "evitar contacto con ojos", "no aplicar puro"], obligatorio: true, define_riesgo: true, inferible: false },
      { atributo: "apto_consumo", tipo: "booleano", obligatorio: true, define_riesgo: true, inferible: false },
      { atributo: "contenido_ml", tipo: "numero", minimo: 15, maximo: 500, cobertura_pct: 95 },
      { atributo: "fragancia", tipo: "texto", valores: ["sin perfume", "floral", "cítrica", "neutra"], cobertura_pct: 80 },
      { atributo: "tipo_piel", tipo: "texto", valores: ["sensible", "seca", "grasa", "mixta", "normal"], cobertura_pct: 60 },
      { atributo: "acabado", tipo: "texto", valores: ["mate", "luminoso", "natural"], cobertura_pct: 50 },
      { atributo: "vegano", tipo: "booleano", cobertura_pct: 40 },
      { atributo: "sin_parabenos", tipo: "booleano", cobertura_pct: 50 },
    ]),
    // spf solo aplica a cuidado facial: en corporal se omite y el diccionario lo refleja como ausencia
    ...entradas(["cuidado_facial"], [{ atributo: "spf", tipo: "numero", minimo: 15, maximo: 70, cobertura_pct: 40 }]),
  ],
};

export const DICCIONARIOS: Record<Diccionario["dominio"], Diccionario> = {
  farmacia: DICCIONARIO_FARMACIA,
  llantas: DICCIONARIO_LLANTAS,
  belleza: DICCIONARIO_BELLEZA,
};
