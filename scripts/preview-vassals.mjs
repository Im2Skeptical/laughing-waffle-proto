import { spawn } from 'node:child_process';
console.log('Vassal workbench: http://localhost:5182/images/dark-fantasy/vassal-chrome-prototype/');
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','5182','--no-clipboard','.'],{stdio:'inherit',windowsHide:true});
server.on('exit',code=>{process.exitCode=code??0;});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
