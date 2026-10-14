import fs from "node:fs";
import path from "node:path";

// Runs before the webServer (docker compose) is brought up. Deletes
// cache/e2e/audio from the previous run so every run of the E2E suite starts
// with an empty, deterministic leaderboard. It doesn't touch cache/ (dev) or
// the dev MariaDB volume, only the isolated subdirectory used by
// docker-compose.e2e.yml.
//
// The e2e MariaDB data is NO LONGER a bind mount to cache/e2e/ (see the
// comment in docker-compose.e2e.yml about why), so wiping it to get a
// deterministic run is the job of `docker compose down -v` (see
// "test:e2e:down" in package.json), not of this file.
//
// IMPORTANT: tearing down an e2e stack that might be left over from a
// previous run is NOT done here. Playwright doesn't guarantee that this hook
// finishes before it launches `webServer.command` (this file's `docker
// compose down` has been seen starting in parallel with that command's own
// `up --build`, killing the containers that same run had just created).
// That's why the "down -v" lives in a strictly sequential step outside
// Playwright: `npm run test:e2e` (see package.json) tears down the previous
// stack (and its MariaDB volume) as a separate process before invoking
// `playwright test`. If you run `npx playwright test` directly (a single
// spec), you have to run `npm run test:e2e:down` by hand first.
export default async function globalSetup(): Promise<void> {
  const e2eAudioDir = path.join(process.cwd(), "cache", "e2e", "audio");
  fs.rmSync(e2eAudioDir, { recursive: true, force: true });
  fs.mkdirSync(e2eAudioDir, { recursive: true });
}
