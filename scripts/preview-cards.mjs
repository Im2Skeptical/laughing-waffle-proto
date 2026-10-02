import { spawn } from 'node:child_process';
console.log('Card workbench: http://localhost:5181/images/dark-fantasy/card-chrome-prototype/');
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', '5181', '--no-clipboard', '.'], { stdio: 'inherit' });
server.on('exit', code => { process.exitCode = code ?? 0; });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
