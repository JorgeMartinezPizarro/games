const fs = require("fs");
const dotenv = require("dotenv");
const { execSync } = require("child_process");

function getPort() {
  if (process.env.DEV_PORT) return process.env.DEV_PORT;

  const files = [
    ".env.local",
    ".env",
  ];

  for (const file of files) {
    if (fs.existsSync(file)) {
      const env = dotenv.parse(fs.readFileSync(file));
      if (env.DEV_PORT) return env.DEV_PORT;
    }
  }

  return 3000;
}

const command = process.argv[2];

if (!command) {
  console.error("Please specify a command: start or dev");
  process.exit(1);
}

const port = getPort();

console.log(`Starting Next.js on port ${port}`);

execSync(`next ${command} -p ${port}`, {
  stdio: "inherit",
  shell: true,
});