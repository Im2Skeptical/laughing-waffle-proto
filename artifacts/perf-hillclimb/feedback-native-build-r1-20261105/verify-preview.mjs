import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';

const output='artifacts/perf-hillclimb/feedback-native-build-r1-20261105';
const sha=v=>createHash('sha256').update(v).digest('hex');
const status=await (await fetch('http://127.0.0.1:5184/__preview__/status')).json();
const url=status.mobile.find(u=>new URL(u).hostname.startsWith('192.168.'))??status.mobile[0];
assert.ok(url,'actual reported LAN URL');
const htmlResponse=await fetch(url,{cache:'no-store'});assert.equal(htmlResponse.status,200);
const html=await htmlResponse.text();
await writeFile(`${output}/preview-lan.html`,html);
const embedded=JSON.parse(html.match(/<script id="game-build-info" type="application\/json">([^<]+)<\/script>/)[1]);
const info=await (await fetch(new URL('build-info.json',url),{cache:'no-store'})).json();
assert.deepEqual(embedded,info,'actual LAN HTML stamp matches served metadata');
const sources={};
for(const file of ['src/views/world-map-pixi.js','src/views/timegraphs-pixi.js',
 'src/views/vassal-node-decision-modal-pixi.js','src/views/ui-root/settlement-debug-api.js',
 'src/views/ui-root-settlement-pixi.js']){
 const response=await fetch(new URL(file,url),{cache:'no-store'});assert.equal(response.status,200);
 const served=Buffer.from(await response.arrayBuffer()),local=await readFile(file);
 assert.equal(sha(served),sha(local),`updated served source ${file}`);
 sources[file]={servedSha256:sha(served),localSha256:sha(local),bytes:served.length};
}
const {BROWSER_PROBE_LAUNCH_OPTIONS}=await import(pathToFileURL(process.cwd()+'/scripts/browser-probe-config.mjs'));
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
let badge,debugApi;
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.goto(new URL('?dev=1&art=0',url).href);
 await page.getByTestId('game-build-badge').waitFor({timeout:30000});
 await page.waitForFunction(()=>typeof globalThis.__SETTLEMENT_DEBUG__?.getRetainedFeedbackSnapshot==='function',null,{timeout:30000});
 const actual=await page.evaluate(()=>({info:JSON.parse(document.getElementById('game-build-info').textContent),
   badge:{text:document.querySelector('[data-testid=game-build-badge]').textContent,
     title:document.querySelector('[data-testid=game-build-badge]').title},
   debugApi:typeof __SETTLEMENT_DEBUG__.getRetainedFeedbackSnapshot}));
 assert.deepEqual(actual.info,info);badge=actual.badge;debugApi=actual.debugApi;
 assert.ok(badge.text.includes(info.version));assert.ok(badge.text.includes('5184'));
}finally{await browser.close();}
const result={verifiedAt:new Date().toISOString(),status,metadata:info,url,htmlSha256:sha(html),
 sources,badge,debugApi,browserClosed:!browser.isConnected(),
 integration:'dirty/local/unintegrated; no commit/push/PR/merge/Pages',
 scope:'actual LAN HTTP source/HTML identity and loaded badge; no physical mobile evidence'};
await writeFile(`${output}/preview.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({verifiedAt:result.verifiedAt,metadata:info,url,badge,browserClosed:result.browserClosed}));
