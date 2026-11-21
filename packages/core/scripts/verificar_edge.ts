// Verifica el núcleo empaquetado para la Edge Function (T1, T9) después de
// `pnpm build:edge`. Comprueba dos cosas:
//   - _core.mjs exporta todo lo que index.ts importa;
//   - cada dependencia externa del paquete está declarada en deno.json.
// Sale con código 1 si algo falta. Lo corre CI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const carpeta = fileURLToPath(new URL("../../../supabase/functions/api/", import.meta.url));
const paquete = readFileSync(`${carpeta}_core.mjs`, "utf8");
const adaptador = readFileSync(`${carpeta}index.ts`, "utf8");
const deno = JSON.parse(readFileSync(`${carpeta}deno.json`, "utf8")) as { imports: Record<string, string> };

const exportados = new Set(
  [...paquete.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap((m) => (m[1] ?? "").split(","))
    .map((s) => s.trim().split(/\s+as\s+/).pop() ?? ""),
);
const importados = [...adaptador.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/_core\.mjs"/g)]
  .flatMap((m) => (m[1] ?? "").split(","))
  .map((s) => s.trim())
  .filter(Boolean);
const externos = [...new Set([...paquete.matchAll(/from\s*"([^".][^"]*)"/g)].map((m) => m[1] ?? ""))];

const faltanExportados = importados.filter((n) => !exportados.has(n));
const faltanEnDeno = externos.filter((e) => !(e in deno.imports));

if (faltanExportados.length > 0) console.error(`_core.mjs no exporta: ${faltanExportados.join(", ")}`);
if (faltanEnDeno.length > 0) console.error(`deno.json no declara: ${faltanEnDeno.join(", ")}`);
if (faltanExportados.length > 0 || faltanEnDeno.length > 0) process.exit(1);
console.log(`Paquete de la Edge Function: ${importados.length} importaciones resueltas; externos ${externos.join(", ")}`);
