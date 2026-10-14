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
    // Production code calls console.error/warn on purpose in its error
    // paths (app/helpers.ts#errorMessage, the hooks' catch blocks), and
    // many tests trigger those paths deliberately to check them.
    // "passed-only" hides those console.log/error while the test passes and
    // shows them only if the test fails, instead of always silencing stderr.
    silent: "passed-only",
    reporters: ["default"],
  },
});
