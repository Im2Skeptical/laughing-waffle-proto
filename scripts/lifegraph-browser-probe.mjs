import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {checkLifegraphWorkspace} from './lifegraph-browser-checks.mjs';

mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS),errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(`${process.argv[2]??'http://localhost:5184'}/#/dev/lifegraph`);
  await page.getByTestId('lab-lifegraph').waitFor();await checkLifegraphWorkspace(page,context,{reload:true});
  if(errors.length)throw new Error(errors.join('; '));
  writeFileSync('artifacts/lifegraph-browser-probe.json',JSON.stringify({ok:true,errors},null,2));
  console.log('[lifegraph-browser] class switching, node edits, disabled-node play, staging/undo/inspection/reset, notes/presets/export/import, 100-seed diagnostics, profile capture and mobile OK');
}catch(error){
  await page.screenshot({path:'artifacts/lifegraph-browser-failure.png',fullPage:true});
  writeFileSync('artifacts/lifegraph-browser-probe.json',JSON.stringify({ok:false,error:error.message,errors},null,2));
  console.error(`[lifegraph-browser] ${error.message}; artifacts/lifegraph-browser-probe.json`);process.exitCode=1;
}finally{await browser.close();}
