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
    // Eso es correcto para producción pero solo ensucia la terminal aquí:
    // silenciamos stderr sin tocar console en el código ni en los tests.
    onConsoleLog(_log, type) {
      if (type === "stderr") return false;
    },
  },
});
