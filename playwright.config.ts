import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Siempre las variables de .env.e2e, nunca las del shell/.env de dev: así
// el puerto/infra de e2e queda determinista pase lo que pase fuera.
dotenv.config({ path: ".env.e2e", override: true });

const PORT = process.env.PORT ?? "3101";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false, // los 4 juegos comparten la misma infra de contenedores; en serie es más fiable
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Levanta el stack real (games + stockfish + wordlist) dockerizado y
  // aislado de dev (ver docker-compose.e2e.yml). `up --build` reconstruye
  // la imagen de games con el código local en cada corrida; al terminar,
  // Playwright mata este proceso y compose para los contenedores.
  webServer: {
    command:
      "docker compose -f docker-compose.yml -f docker-compose.e2e.yml --env-file .env.e2e -p games-e2e up --build",
    url: `${BASE_URL}/bookmarks`,
    // Siempre false, incluso en local: cada corrida debe partir de un
    // leaderboard vacío (ver global-setup.ts), así que "reutilizar" un stack
    // de un run anterior (con datos viejos, o con cache/e2e ya borrado bajo
    // sus pies) nunca es correcto aquí. Con esto en false, si un stack previo
    // sigue arriba, Playwright falla rápido y explícito ("already used") en
    // vez de reusarlo o pisarlo a medias — la solución es bajarlo antes
    // (`npm run test:e2e` ya lo hace solo, ver package.json).
    reuseExistingServer: false,
    timeout: 5 * 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
