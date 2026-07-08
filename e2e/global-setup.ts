import fs from "node:fs";
import path from "node:path";

// Se ejecuta antes de levantar el webServer (docker compose). Borra
// cache/e2e/audio del run anterior para que cada corrida de la suite E2E
// empiece con un leaderboard vacío y determinista. No toca cache/ (dev) ni
// el volumen de MariaDB de dev, solo el subdirectorio aislado que usa
// docker-compose.e2e.yml.
//
// Los datos de MariaDB de e2e YA NO son un bind mount a cache/e2e/ (ver el
// comentario en docker-compose.e2e.yml sobre por qué), así que vaciarlos
// para tener un run determinista es responsabilidad de `docker compose down
// -v` (ver "test:e2e:down" en package.json), no de este archivo.
//
// IMPORTANTE: bajar un stack de e2e que pudiera haber quedado de un run
// anterior NO se hace aquí. Playwright no garantiza que este hook termine
// antes de lanzar `webServer.command` (se ha visto arrancar el `docker
// compose down` de este archivo en paralelo con el `up --build` del propio
// comando, matando los contenedores recién creados por esa misma corrida).
// Por eso el "down -v" vive en un paso estrictamente secuencial fuera de
// Playwright: `npm run test:e2e` (ver package.json) baja el stack anterior
// (y su volumen de MariaDB) como proceso separado antes de invocar
// `playwright test`. Si se lanza `npx playwright test` directamente (spec
// suelto), hay que correr `npm run test:e2e:down` a mano primero.
export default async function globalSetup(): Promise<void> {
  const e2eAudioDir = path.join(process.cwd(), "cache", "e2e", "audio");
  fs.rmSync(e2eAudioDir, { recursive: true, force: true });
  fs.mkdirSync(e2eAudioDir, { recursive: true });
}
