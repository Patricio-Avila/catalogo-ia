// Genera docs/api/openapi.json desde los esquemas Zod de la API (T4).
// Uso: pnpm --filter @catalogo-ia/core openapi

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_OPENAPI, crearApp } from "../src/api/app";
import { AccesoNulo } from "../src/datos/acceso_nulo";
import { AdaptadorFixtures } from "../src/modelo/fixtures";

const app = crearApp({ acceso: new AccesoNulo(), adaptador: new AdaptadorFixtures({}), origenes: [] });
const documento = app.getOpenAPI31Document(CONFIG_OPENAPI);

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const destino = resolve(raiz, "docs/api/openapi.json");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, JSON.stringify(documento, null, 2) + "\n", "utf8");
console.log(`OpenAPI escrito en ${destino} (${Object.keys(documento.paths ?? {}).length} rutas)`);
