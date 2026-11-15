import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './scripts/browser-probe-config.mjs';
const url='http://127.0.0.1:5202/';const build=await (await fetch(url+'build-info.json')).json();const status=await (await fetch(url+'__preview__/status')).json();
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
try{const page=await browser.newPage();await page.goto(url+'?dev=1');const badge=page.getByTestId('game-build-badge');await badge.waitFor();const loaded=await badge.evaluate(e=>({text:e.textContent,title:e.title,dataset:{...e.dataset}}));assert.equal(loaded.dataset.build,build.build);assert.equal(loaded.dataset.version,build.version);const lan=status.mobile.find(x=>x.includes('192.168.'));const html=await (await fetch(lan)).text();assert.ok(html.includes(build.build));const receipt={at:new Date().toISOString(),build,status,loaded,lan,lanEmbeddedIdentity:true};writeFileSync('artifacts/perf-hillclimb/resume-authentication-20261115/preview.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}finally{await browser.close();}
