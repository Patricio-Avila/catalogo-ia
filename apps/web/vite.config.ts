import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dirActual = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE ?? "./",
  resolve: {
    alias: {
      postgres: resolve(dirActual, "src/postgres_stub.ts"),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
  },
});
