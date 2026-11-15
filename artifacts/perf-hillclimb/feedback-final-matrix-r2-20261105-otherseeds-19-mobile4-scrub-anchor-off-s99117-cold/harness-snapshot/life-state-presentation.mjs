import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './frozen-life-oracle.mjs';
// The strict frozen loader must run first. This executes its authenticated,
// zero-import extension bytes in a separate Chromium realm to avoid cross-V8
// transcendental rounding differences in complete regional-map DTOs. Inputs
// come only from frozen Node replay/deserialization, never the product page.
export async function createFrozenBrowserPresentation(browser,frozen,{record=async()=>{}}={}){
 const directory='artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/addendum';
 const bytes=await readFile(path.join(directory,frozen.manifest.sdk));assert.equal(sha256(bytes),frozen.manifest.files[frozen.manifest.sdk].sha256);
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto('about:blank');await page.evaluate(async url=>{globalThis.__FROZEN_LIFE__=await import(url);},'data:text/javascript;base64,'+bytes.toString('base64'));
 let index=0;
 return {identity:{sdkSha256:sha256(bytes),engine:browser.version(),realm:'separate isolated about:blank Chromium context; zero product imports'},
 async presentation(state,args){
  const stateBefore=sha256(state),argsBefore=sha256(args);
  const input=JSON.parse(JSON.stringify(frozen.oracle.deserializeGameState(structuredClone(state))));
  const result=await page.evaluate(({input,args})=>{const before=JSON.stringify(input),dto=__FROZEN_LIFE__.getVassalNodeDecisionPresentation(input,args.nodeId,args.preview);if(JSON.stringify(input)!==before)throw Error('frozen presentation input mutation');return JSON.parse(JSON.stringify(dto));},{input,args});
  assert.equal(sha256(state),stateBefore);assert.equal(sha256(args),argsBefore);await record('frozen-browser-presentation-'+index++,{inputState:state,args,expected:result,sdkSha256:sha256(bytes)});return result;
 },close:()=>context.close()};
}
