const fs = require("fs");
const dotenv = require("dotenv");
const { execSync } = require("child_process");

// Same priority order Next uses to load each mode's .env files:
// in dev, .env.development (the `make dev` environment) wins, not the prod .env.
function loadEnvFile(mode) {
  const files = mode === "dev"
    ? [".env.development.local", ".env.local", ".env.development", ".env"]
    : [".env.production.local", ".env.local", ".env.production", ".env"];

  return files
    .filter((file) => fs.existsSync(file))
    .reverse()
    .reduce((env, file) => ({ ...env, ...dotenv.parse(fs.readFileSync(file)) }), {});
}

function getPort(mode, envFromFile) {
  if (mode === "dev") {
    return process.env.DEV_PORT
      || envFromFile.DEV_PORT
      || 3000;
  }

  if (mode === "start") {
    return process.env.PORT
      || envFromFile.PORT
      || 3000;
  }

  return 3000;
}

console.log("COMMAND:", process.argv[2]);
console.log("DEV_PORT:", process.env.DEV_PORT);
console.log("PORT:", process.env.PORT);

const command = process.argv[2];

if (!command || !["dev", "start"].includes(command)) {
  console.error("Usage: node script.js [dev|start]");
  process.exit(1);
}

const envFromFile = loadEnvFile(command);
const port = getPort(command, envFromFile);

console.log(`Starting Next.js (${command}) on port ${port}`);

execSync(`next ${command} -p ${port}`, {
  stdio: "inherit",
  shell: true,
});