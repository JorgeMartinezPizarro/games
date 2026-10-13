import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { STORAGE_STATE } from "./e2e/nextcloud";

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
    // Login real en el Nextcloud del stack (no hay modo sin login): guarda
    // la sesión que usan todos los specs.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  // Levanta el stack real (games + Nextcloud 34 + stockfish + wordlist)
  // dockerizado y aislado de dev (ver docker-compose.e2e.yml y
  // docker-compose.nextcloud.yml). `up --build` reconstruye la imagen de
  // games con el código local en cada corrida; al terminar, Playwright mata
  // este proceso y compose para los contenedores. games no arranca hasta que
  // Nextcloud está instalado y configurado (healthcheck), así que cuando
  // responde la URL de abajo ya se puede iniciar sesión.
  webServer: {
    // Todo el output de docker compose (los 4 servicios + compose en sí) se
    // redirige a cache/e2e-docker.log en vez de al stdout del proceso: con
    // stdout/stderr:"pipe" quedaba intercalado en tiempo real con la tabla
    // de resultados de Playwright, así que un test que terminaba a mitad de
    // un chorro de logs de Stockfish/MariaDB quedaba invisible entre medias.
    // Los logs no se pierden (siguen enteros en el fichero, útiles para
    // depurar un arranque colgado) — solo dejan de competir por el mismo
    // stdout mientras corren los tests, así la tabla final sale junta.
    command:
      "docker compose -f docker-compose.yml -f docker-compose.nextcloud.yml -f docker-compose.e2e.yml --env-file .env.e2e -p games-e2e up --build > cache/e2e-docker.log 2>&1",
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
    stdout: "ignore",
    stderr: "ignore",
  },
});
