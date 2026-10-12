import { spawn } from 'node:child_process';
console.log('Map workbench: http://localhost:5184/images/dark-fantasy/map-generation-prototype/');
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', '5184', '--no-clipboard', '.'], { stdio: 'inherit' });
server.on('exit', code => { process.exitCode = code ?? 0; });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
