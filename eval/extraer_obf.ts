// Extracción, preprocesamiento y validación de muestra real desde Open Beauty Facts
// (Tarea opcional C7 de docs/plan_de_trabajo.md; fuente pública gratuita sin API key).
//
// Uso: pnpm --filter @catalogo-ia/core exec tsx ../../eval/extraer_obf.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface ProductoOBFCrudo {
  code?: string;
  product_name?: string;
  product_name_es?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  labels_tags?: string[];
  ingredients_text?: string;
  ingredients_text_es?: string;
  countries_tags?: string[];
}

interface ProductoEstandarizado {
  codigo: string;
  nombre: string;
  marca: string | null;
  categoria: "cuidado_facial" | "cuidado_corporal";
  atributos: {
    contenido_ml?: number;
    vegano?: boolean;
    sin_parabenos?: boolean;
    fragancia?: string;
    tipo_piel?: string;
    spf?: number;
  };
  campos_faltantes: string[];
}

const ATRIBUTOS_META = [
  "contenido_ml",
  "vegano",
  "sin_parabenos",
  "fragancia",
  "tipo_piel",
  "spf",
] as const;

function limpiarTexto(valor?: string): string {
  if (!valor) return "";
  return valor
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extraerContenidoMl(quantity?: string, nombre?: string): number | undefined {
  const fuente = `${quantity ?? ""} ${nombre ?? ""}`;
  const coincidenciaMl = fuente.match(/(\d+(?:[.,]\d+)?)\s*(ml|mL|ML)\b/);
  if (coincidenciaMl) {
    const val = Number((coincidenciaMl[1] ?? "").replace(",", "."));
    if (Number.isFinite(val) && val > 0 && val <= 10000) return Math.round(val);
  }
  const coincidenciaL = fuente.match(/(\d+(?:[.,]\d+)?)\s*(l|L)\b/);
  if (coincidenciaL) {
    const val = Number((coincidenciaL[1] ?? "").replace(",", ".")) * 1000;
    if (Number.isFinite(val) && val > 0 && val <= 10000) return Math.round(val);
  }
  return undefined;
}

function extraerSpf(nombre: string, categorias: string[]): number | undefined {
  const fuente = `${nombre} ${categorias.join(" ")}`;
  const match = fuente.match(/\b(?:spf|fps)\s*[:\-]?\s*(\d{1,3})\+?\b/i);
  if (!match) return undefined;
  const val = Number(match[1]);
  if (Number.isFinite(val) && val >= 5 && val <= 100) return val;
  return undefined;
}

function detectarFragancia(nombre: string, ingredientes: string, etiquetas: string[]): string | undefined {
  const texto = `${nombre} ${etiquetas.join(" ")}`.toLowerCase();
  if (/(sin perfume|fragrance[- ]free|unscented|sans parfum|sin fragancia)/i.test(texto)) {
    return "sin perfume";
  }
  if (/(c[ií]tric|lim[oó]n|naranja|lemon|orange|citrus)/i.test(texto)) return "cítrica";
  if (/(floral|rosa|lavanda|jazm[ií]n|rose|lavender|jasmine)/i.test(texto)) return "floral";
  if (ingredientes && /\b(parfum|fragrance)\b/i.test(ingredientes)) return "con fragancia";
  return undefined;
}

function detectarTipoPiel(nombre: string, categorias: string[]): string | undefined {
  const texto = `${nombre} ${categorias.join(" ")}`.toLowerCase();
  if (/(sensible|sensitive)/i.test(texto)) return "sensible";
  if (/(seca|dry\s+skin|peaux?\s+s[eè]ches?)/i.test(texto)) return "seca";
  if (/(grasa|oily|peaux?\s+grasses?)/i.test(texto)) return "grasa";
  if (/(mixta|combination)/i.test(texto)) return "mixta";
  if (/(normal)/i.test(texto)) return "normal";
  return undefined;
}

function clasificarCategoria(nombre: string, categorias: string[]): "cuidado_facial" | "cuidado_corporal" {
  const texto = `${nombre} ${categorias.join(" ")}`.toLowerCase();
  if (/(face|facial|rostro|visage|serum|sérum|contorno|ojos|eye)/i.test(texto)) {
    return "cuidado_facial";
  }
  return "cuidado_corporal";
}

async function descargarPagina(page: number, pageSize: number): Promise<ProductoOBFCrudo[]> {
  const campos = [
    "code",
    "product_name",
    "product_name_es",
    "brands",
    "quantity",
    "categories_tags",
    "labels_tags",
    "ingredients_text",
    "ingredients_text_es",
    "countries_tags",
  ].join(",");

  const url =
    `https://world.openbeautyfacts.org/api/v2/search?` +
    `page=${page}&page_size=${pageSize}&fields=${encodeURIComponent(campos)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "CatalogoIA-BDE-UNILUX/1.0 (proyecto academico)",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al consultar Open Beauty Facts (pagina ${page})`);
  }
  const data = (await res.json()) as { products?: ProductoOBFCrudo[] };
  return data.products ?? [];
}

async function main() {
  const paginas = [1, 2, 3];
  const tamPagina = 100;
  const crudos: ProductoOBFCrudo[] = [];

  for (const p of paginas) {
    const lote = await descargarPagina(p, tamPagina);
    crudos.push(...lote);
  }

  let descartadosSinNombre = 0;
  let descartadosSinCodigo = 0;
  let duplicadosCodigo = 0;
  let duplicadosNombreMarca = 0;

  const codigosVistos = new Set<string>();
  const nombresMarcaVistos = new Set<string>();
  const limpios: ProductoEstandarizado[] = [];

  for (const item of crudos) {
    const codigo = limpiarTexto(item.code);
    if (!codigo) {
      descartadosSinCodigo++;
      continue;
    }
    if (codigosVistos.has(codigo)) {
      duplicadosCodigo++;
      continue;
    }

    const nombre = limpiarTexto(item.product_name_es || item.product_name);
    if (!nombre || nombre.length < 2) {
      descartadosSinNombre++;
      continue;
    }

    const marcaRaw = limpiarTexto(item.brands);
    const marca = marcaRaw ? (marcaRaw.split(",")[0] ?? "").trim() : null;
    const claveNombreMarca = `${nombre.toLowerCase()}|${(marca ?? "").toLowerCase()}`;
    if (nombresMarcaVistos.has(claveNombreMarca)) {
      duplicadosNombreMarca++;
      continue;
    }

    codigosVistos.add(codigo);
    nombresMarcaVistos.add(claveNombreMarca);

    const categorias = item.categories_tags ?? [];
    const etiquetas = item.labels_tags ?? [];
    const ingredientes = limpiarTexto(item.ingredients_text_es || item.ingredients_text);

    const atributos: ProductoEstandarizado["atributos"] = {};

    const contenidoMl = extraerContenidoMl(item.quantity, nombre);
    if (contenidoMl !== undefined) atributos.contenido_ml = contenidoMl;

    if (etiquetas.some((t) => /vegan/i.test(t))) {
      atributos.vegano = true;
    }

    if (
      etiquetas.some((t) => /paraben[- ]free|sans[- ]parab/i.test(t)) ||
      /sin parabenos|paraben[- ]free/i.test(nombre)
    ) {
      atributos.sin_parabenos = true;
    } else if (ingredientes && /paraben\b/i.test(ingredientes)) {
      atributos.sin_parabenos = false;
    }

    const fragancia = detectarFragancia(nombre, ingredientes, etiquetas);
    if (fragancia !== undefined) atributos.fragancia = fragancia;

    const tipoPiel = detectarTipoPiel(nombre, categorias);
    if (tipoPiel !== undefined) atributos.tipo_piel = tipoPiel;

    const spf = extraerSpf(nombre, categorias);
    if (spf !== undefined) atributos.spf = spf;

    const camposFaltantes = ATRIBUTOS_META.filter((a) => atributos[a] === undefined);

    limpios.push({
      codigo,
      nombre,
      marca,
      categoria: clasificarCategoria(nombre, categorias),
      atributos,
      campos_faltantes: [...camposFaltantes],
    });
  }

  const totalCrudos = crudos.length;
  const totalValidos = limpios.length;

  const coberturaAtributos: Record<string, { presentes: number; nulos: number; cobertura_pct: number }> = {};
  for (const attr of ATRIBUTOS_META) {
    const presentes = limpios.filter((p) => p.atributos[attr] !== undefined).length;
    const nulos = totalValidos - presentes;
    coberturaAtributos[attr] = {
      presentes,
      nulos,
      cobertura_pct: totalValidos > 0 ? Number(((presentes / totalValidos) * 100).toFixed(2)) : 0,
    };
  }

  const conMarca = limpios.filter((p) => p.marca !== null).length;
  const promedioAtributosPorProducto =
    totalValidos > 0
      ? Number(
          (
            limpios.reduce((acc, p) => acc + Object.keys(p.atributos).length, 0) / totalValidos
          ).toFixed(2),
        )
      : 0;

  const reporte = {
    fecha_extraccion: new Date().toISOString(),
    fuente: "Open Beauty Facts API v2 (https://world.openbeautyfacts.org/api/v2/search)",
    licencia_fuente: "Open Database License (ODbL) v1.0",
    resumen_extraccion: {
      registros_crudos: totalCrudos,
      descartados_sin_codigo: descartadosSinCodigo,
      descartados_sin_nombre: descartadosSinNombre,
      duplicados_por_codigo: duplicadosCodigo,
      duplicados_por_nombre_marca: duplicadosNombreMarca,
      registros_validos_estandarizados: totalValidos,
      tasa_retencion_pct: totalCrudos > 0 ? Number(((totalValidos / totalCrudos) * 100).toFixed(2)) : 0,
      productos_con_marca: conMarca,
      cobertura_marca_pct: totalValidos > 0 ? Number(((conMarca / totalValidos) * 100).toFixed(2)) : 0,
      promedio_atributos_extraidos: promedioAtributosPorProducto,
    },
    cobertura_por_atributo: coberturaAtributos,
    muestra_ejemplos: limpios.slice(0, 10),
  };

  const dirActual = dirname(fileURLToPath(import.meta.url));
  const rutaSalida = resolve(dirActual, "resultados", "obf-muestra.json");
  mkdirSync(dirname(rutaSalida), { recursive: true });
  writeFileSync(rutaSalida, JSON.stringify(reporte, null, 2), "utf8");

  console.log(JSON.stringify(reporte.resumen_extraccion, null, 2));
  console.log("Cobertura por atributo:", JSON.stringify(reporte.cobertura_por_atributo, null, 2));
  console.log(`Reporte guardado en: ${rutaSalida}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
