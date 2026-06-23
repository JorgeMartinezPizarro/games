const fs = require("fs");
const dotenv = require("dotenv");
const { execSync } = require("child_process");

function loadEnvFile() {
  const files = [".env.local", ".env"];

  for (const file of files) {
    if (fs.existsSync(file)) {
      return dotenv.parse(fs.readFileSync(file));
    }
  }

  return {};
}

function getPort(mode, envFromFile) {
  // prioridad: env runtime > env file > default

  if (mode === "dev") {
    if (process.env.DEV_PORT) return process.env.DEV_PORT;
    if (envFromFile.DEV_PORT) return envFromFile.DEV_PORT;
  }

  if (mode === "start") {
    if (process.env.PORT) return process.env.PORT;
    if (envFromFile.PORT) return envFromFile.PORT;
  }

  return 3000;
}

const command = process.argv[2];

if (!command || !["dev", "start"].includes(command)) {
  console.error("Usage: node script.js [dev|start]");
  process.exit(1);
}

const envFromFile = loadEnvFile();
const port = getPort(command, envFromFile);

console.log(`Starting Next.js (${command}) on port ${port}`);

execSync(`next ${command} -p ${port}`, {
  stdio: "inherit",
  shell: true,
});