import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Playwright's webServer ("docker compose ... up --build") doesn't always
// receive/propagate the shutdown signal reliably (seen on Windows: the
// containers were still "Up" after the suite finished). This explicit
// teardown guarantees that games-e2e-* are always stopped at the end,
// whatever happens with the webServer process's signal.
export default async function globalTeardown(): Promise<void> {
  try {
    await execFileAsync("docker", [
      "compose",
      "-f",
      "docker-compose.yml",
      "-f",
      "docker-compose.nextcloud.yml",
      "-f",
      "docker-compose.e2e.yml",
      "--env-file",
      ".env.e2e",
      "-p",
      "games-e2e",
      "down",
    ]);
  } catch (error) {
    console.error("Could not stop the e2e stack automatically:", error);
    console.error("Run it manually: npm run test:e2e:down");
  }
}
