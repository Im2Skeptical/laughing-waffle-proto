// Real WebGL context controls for the shared atlas oracle, not a game benchmark.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {inspectAtlasUploads} from './artwork-oracles.mjs';
const output=`artifacts/perf-hillclimb/artwork-oracle-controls-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
try{
  const page=await browser.newPage();
  await page.setContent('<canvas id="game"></canvas><canvas id="other"></canvas>');
  await page.evaluate(()=>{
    const game=document.querySelector('#game').getContext('webgl2'),other=document.querySelector('#other').getContext('webgl2');
    if(!game||!other)throw new Error('actual WebGL2 contexts required');
    const texture=gl=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));return t;};
    const current=texture(game),foreign=texture(other);
    globalThis.control={game,current,foreign,base:{valid:true,_glTextures:{current:{texture:current}}}};
    const sheet={textures:{one:{valid:true,baseTexture:control.base}}};
    globalThis.PIXI={Assets:{cache:{get:()=>sheet}}};
  });
  const read=()=>page.evaluate(inspectAtlasUploads,['context-control.json']);
  const current=await read();assert.equal(current[0].uploaded,true,'current actual WebGL texture is usable');
  await page.evaluate(()=>{control.base._glTextures={stale:{texture:control.foreign}};});
  const foreign=await read();assert.equal(foreign[0].uploaded,false,'actual foreign-context texture is rejected despite populated dictionary');
  await page.evaluate(()=>{control.base._glTextures={current:{texture:control.current}};control.game.getExtension('WEBGL_lose_context').loseContext();});
  await page.waitForFunction(()=>control.game.isContextLost());
  const lost=await read();assert.equal(lost[0].contextLost,true);assert.equal(lost[0].uploaded,false);
  const source=await readFile('scripts/perf-hillclimb/artwork-oracles.mjs');
  await writeFile(`${output}/controls.json`,JSON.stringify({ok:true,chromium:browser.version(),launch:BROWSER_PROBE_LAUNCH_OPTIONS,
    oracleSha256:createHash('sha256').update(source).digest('hex'),current,foreign,lost,
    scope:'mechanism contexts only; actual game atlas/control replay and independent audit remain required'},null,2));
  console.log(`[artwork-oracle-controls] PASS current/foreign/lost actual WebGL contexts; ${output}/controls.json`);
}catch(error){await writeFile(`${output}/failure.txt`,error.stack);console.error(`[artwork-oracle-controls] FAIL ${error.message}; ${output}`);process.exitCode=1;}
finally{await browser.close();}
