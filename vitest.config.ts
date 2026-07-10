import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    // El código de producción hace console.error/warn a propósito en sus
    // rutas de error (app/helpers.ts#errorMessage, catch de los hooks), y
    // muchos tests disparan esas rutas deliberadamente para comprobarlas.
    // "passed-only" oculta esos console.log/error mientras el test pasa y
    // los muestra solo si el test falla, en vez de silenciar stderr siempre.
    silent: "passed-only",
    reporters: ["default"],
  },
});
