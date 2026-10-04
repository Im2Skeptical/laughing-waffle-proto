import { spawn } from 'node:child_process';
console.log('Structure workbench: http://localhost:5183/images/dark-fantasy/structure-chrome-prototype/');
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', '5183', '--no-clipboard', '.'], { stdio: 'inherit' });
server.on('exit', code => { process.exitCode = code ?? 0; });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
