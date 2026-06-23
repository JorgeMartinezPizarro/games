const { execSync } = require("child_process");

const command = process.argv[2];

const port = process.env.PORT || 3000;

execSync(`next ${command} -p ${port}`, {
  stdio: "inherit",
  shell: true,
});