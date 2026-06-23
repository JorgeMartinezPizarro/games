require('dotenv').config();
const { execSync } = require('child_process');

console.log("Initializing NODE process ...")

const command = process.argv[2];

if (!command) {
	console.error('Please specify a command: start or dev');
	process.exit(1);
}

const port = process.env.PORT || 3000;

const nextCommand = `next ${command} -p ${port}`;

execSync(nextCommand, {
	stdio: 'inherit',
	env: { ...process.env },
	shell: true,
});
