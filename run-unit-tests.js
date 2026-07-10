const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// npm run test pasaba por vitest directamente: la salida en vivo mezclaba
// una línea por test con los console.log/error del código bajo prueba. El
// reporter "default" + silent: "passed-only" (vitest.config.ts) ya resuelven
// eso: por fichero se ve solo un resumen (nombre + nº de tests), y los logs
// de un test solo se imprimen si ese test falla. Aquí se hace streaming en
// vivo de esa salida (línea a línea, según van terminando los ficheros) en
// vez de esperar a que vitest acabe, y a la vez se va archivando en
// cache/unit-tests.log para poder revisarla luego.
fs.mkdirSync("cache", { recursive: true });
const logPath = path.join("cache", "unit-tests.log");
const logStream = fs.createWriteStream(logPath);

const child = spawn("npx", ["vitest", "run", ...process.argv.slice(2)], {
  shell: true,
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  logStream.write(chunk);
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  logStream.write(chunk);
});

child.on("close", (code) => {
  logStream.end();
  process.exit(code ?? 1);
});
