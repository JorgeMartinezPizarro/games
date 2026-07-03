import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// El webServer de Playwright ("docker compose ... up --build") no siempre
// recibe/propaga la señal de apagado de forma fiable (visto en Windows: los
// contenedores seguían "Up" después de terminar la suite). Este teardown
// explícito garantiza que games-e2e-* siempre se paran al terminar, pase lo
// que pase con la señal del proceso del webServer.
export default async function globalTeardown(): Promise<void> {
  try {
    await execFileAsync("docker", [
      "compose",
      "-f",
      "docker-compose.yml",
      "-f",
      "docker-compose.e2e.yml",
      "--env-file",
      ".env.e2e",
      "-p",
      "games-e2e",
      "down",
    ]);
  } catch (error) {
    console.error("No se pudo parar el stack de e2e automáticamente:", error);
    console.error("Ejecuta manualmente: npm run test:e2e:down");
  }
}
