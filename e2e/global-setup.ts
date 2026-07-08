import fs from "node:fs";
import path from "node:path";

// Se ejecuta antes de levantar el webServer (docker compose). Borra el
// cache/e2e/ (audio + datos de MariaDB) del run anterior para que cada
// corrida de la suite E2E empiece con un leaderboard vacío y determinista.
// No toca cache/ (dev) ni el volumen de MariaDB de dev, solo el
// subdirectorio aislado que usa docker-compose.e2e.yml.
export default async function globalSetup(): Promise<void> {
  const e2eCacheDir = path.join(process.cwd(), "cache", "e2e");
  fs.rmSync(e2eCacheDir, { recursive: true, force: true });

  // Docker Desktop en Windows no siempre auto-crea de forma fiable el
  // directorio host de un bind mount que no existe todavía: el contenedor
  // arrancaba con /var/lib/mysql "montado" pero MariaDB fallaba al
  // inicializar. Creando los directorios aquí (en el host, antes de
  // "docker compose up") el bind mount siempre apunta a algo que ya existe
  // de verdad.
  fs.mkdirSync(path.join(e2eCacheDir, "audio"), { recursive: true });
  fs.mkdirSync(path.join(e2eCacheDir, "mariadb-data"), { recursive: true });
}
