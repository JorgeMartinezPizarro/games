const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// npm run test used to go straight through vitest: the live output mixed
// one line per test with the console.log/error of the code under test. The
// "default" reporter + silent: "passed-only" (vitest.config.ts) already fix
// that: per file you only see a summary (name + number of tests), and a
// test's logs are only printed if that test fails. Here that output is
// streamed live (line by line, as files finish) instead of waiting for
// vitest to end, and at the same time it's archived to
// cache/unit-tests.log so it can be reviewed later.
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
