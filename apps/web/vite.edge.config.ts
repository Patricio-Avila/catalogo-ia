import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dirActual = dirname(fileURLToPath(import.meta.url));
const raizRepo = resolve(dirActual, "../..");

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(raizRepo, "supabase/functions/api"),
    emptyOutDir: false,
    minify: true,
    target: "es2022",
    lib: {
      entry: resolve(raizRepo, "packages/core/src/index.ts"),
      formats: ["es"],
      fileName: () => "_core.mjs",
    },
    rollupOptions: {
      external: ["postgres", "zod", "hono", /^hono\//, "@hono/zod-openapi"],
    },
  },
});
