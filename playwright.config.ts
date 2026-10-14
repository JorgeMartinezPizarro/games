import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { STORAGE_STATE } from "./e2e/nextcloud";

// Always the variables from .env.e2e, never those from the shell/dev .env: that
// way the e2e port/infra stays deterministic whatever happens outside.
dotenv.config({ path: ".env.e2e", override: true });

const PORT = process.env.PORT ?? "3101";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false, // the 4 games share the same container infra; running serially is more reliable
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
    // Real login to the stack's Nextcloud (there is no no-login mode): saves
    // the session that all specs use.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  // Brings up the real stack (games + Nextcloud 34 + stockfish + wordlist),
  // dockerized and isolated from dev (see docker-compose.e2e.yml and
  // docker-compose.nextcloud.yml). `up --build` rebuilds the games image
  // with the local code on every run; when done, Playwright kills this
  // process and compose stops the containers. games doesn't start until
  // Nextcloud is installed and configured (healthcheck), so by the time the
  // URL below responds, logging in is already possible.
  webServer: {
    // All docker compose output (the 4 services + compose itself) is
    // redirected to cache/e2e-docker.log instead of the process stdout: with
    // stdout/stderr:"pipe" it got interleaved in real time with Playwright's
    // results table, so a test finishing in the middle of a burst of
    // Stockfish/MariaDB logs got lost in between.
    // The logs aren't lost (they remain complete in the file, useful for
    // debugging a hung startup) — they just stop competing for the same
    // stdout while the tests run, so the final table comes out in one piece.
    command:
      "docker compose -f docker-compose.yml -f docker-compose.nextcloud.yml -f docker-compose.e2e.yml --env-file .env.e2e -p games-e2e up --build > cache/e2e-docker.log 2>&1",
    url: `${BASE_URL}/bookmarks`,
    // Always false, even locally: every run must start from an empty
    // leaderboard (see global-setup.ts), so "reusing" a stack from a
    // previous run (with stale data, or with cache/e2e already deleted out
    // from under it) is never correct here. With this set to false, if a
    // previous stack is still up, Playwright fails fast and explicitly
    // ("already used") instead of reusing it or half-overwriting it — the fix
    // is to tear it down first (`npm run test:e2e` already does that, see
    // package.json).
    reuseExistingServer: false,
    timeout: 5 * 60_000,
    stdout: "ignore",
    stderr: "ignore",
  },
});
