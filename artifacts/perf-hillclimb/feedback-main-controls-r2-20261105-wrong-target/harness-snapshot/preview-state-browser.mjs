import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {SAVE_DATABASE_NAME} from '../../src/controllers/sim-runner/save-storage.js';
import {loadFrozenCorpus} from './freeze-corpus.mjs';
import {installSave} from './browser-runtime.mjs';
import {digest} from './fixtures.mjs';
import {expectedOpeningKnowledge} from './save-state-oracle.mjs';
import {expectedPreviewStates,assertPreviewStates} from './preview-state-oracle.mjs';
import {previewControlBundle,controlToken} from './preview-state-controls.mjs';
import {installScrubInputObservation} from './main-job-oracles.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return [k,v.join('=')];}));
assert.ok(args.id,'unique --id required');
const output=path.resolve(`artifacts/perf-hillclimb/${args.id}`);await mkdir(output);
const manifest={id:args.id,created:new Date().toISOString(),phaseA:'NOT SOUND',comparisonEligible:false,
  purpose:'full-state functional diagnostics only; no latency/frame/memory results; every full-state read after input completion',
  machine:{hostname:os.hostname(),release:os.release(),cpu:os.cpus()[0].model,node:process.version},
  head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),
  fixtureManifestId:'406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000',sdk:'8c163025e51f71818016c358c1f10055beaf343dfc249f3db6713965d5fc40b0',sources:{},assets:{}};
const sourceFiles=['src/controllers/sim-runner.js','src/views/ui-root/settlement-debug-api.js','src/views/ui-root-settlement-pixi.js',
  'src/model/timegraph/state-restorer.js','src/model/timegraph/controller-core.js','src/model/timegraph/projection-cache.js','src/views/timegraphs-pixi.js',
  'scripts/preview-state-inspection-test.mjs','scripts/perf-hillclimb/preview-state-browser.mjs','scripts/perf-hillclimb/preview-state-controls.mjs','scripts/perf-hillclimb/preview-state-oracle.mjs',
  'scripts/perf-hillclimb/run.mjs','scripts/perf-hillclimb/browser-runtime.mjs','scripts/perf-hillclimb/main-job-oracles.mjs','scripts/perf-hillclimb/save-state-oracle.mjs'];
await mkdir(`${output}/sources`);
for(const file of sourceFiles){const bytes=await readFile(file);manifest.sources[file]=digest(bytes);await writeFile(`${output}/sources/${file.replaceAll('/','__')}`,bytes);}
const build=JSON.parse(await readFile('dist/build-manifest.json','utf8'));manifest.build=build;
await writeFile(`${output}/build-info.json`,await readFile('dist/build-info.json'));
for(const key of ['bundle','worker','saveLoadWorker','stylesheet'])manifest.assets[key]={file:build[key],sha256:digest(await readFile(path.join('dist',build[key])))};
manifest.preparedPacket=digest(await readFile('dist/images/dev-fixtures/performance-start.json.gz'));
const cells=[];
for(const seed of String(args.seeds??'123,424242,99117').split(',').map(Number))for(const population of String(args.populations??'desktop,mobile4').split(','))for(const second of [16,17])cells.push({seed,population,second,entry:'regular-continue',control:false});
if(args.extra!=='off')for(const population of String(args.populations??'desktop,mobile4').split(','))for(const second of [16,17]){
  cells.push({seed:123,population,second,entry:'performance-new',control:false});
  cells.push({seed:123,population,second,entry:'regular-continue',control:true});
}
if(args.groups){const groups=args.groups.split(',');for(let i=cells.length-1;i>=0;i--){const c=cells[i],group=c.control?'control':c.entry==='performance-new'?'performance':'regular';if(!groups.includes(group))cells.splice(i,1);}}
manifest.schedule=cells;await writeFile(`${output}/manifest.json`,JSON.stringify(manifest,null,2));
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','18245','--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
const url='http://127.0.0.1:18245/';let activeBrowser;const results=[];
try{
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  assert.deepEqual(await (await fetch(url+'build-manifest.json')).json(),build);
  for(const {file,sha256}of Object.values(manifest.assets))assert.equal(digest(Buffer.from(await (await fetch(new URL(file,url))).arrayBuffer())),sha256);
  for(const [index,cell]of cells.entries()){
    const dir=`${output}/${index}-${cell.seed}-${cell.population}-${cell.entry}-${cell.second}${cell.control?'-control':''}`;await mkdir(dir);
    console.log(`[preview-browser] ${index+1}/${cells.length} ${cell.seed}/${cell.population}/${cell.entry}/${cell.second}${cell.control?' CONTROL':''}`);
    const costs=[],errors=[];let page;
    try{
      const {oracle,fixtures,manifest:frozenManifest}=await loadFrozenCorpus('artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json',{expectedIdentity:manifest.fixtureManifestId,seed:cell.seed});
      assert.equal(frozenManifest.sdk.sha256,manifest.sdk);
      const fixture=cell.entry==='performance-new'?fixtures.ordinary:fixtures.selected,inputBefore=digest(fixture.text);
      const terminal=expectedOpeningKnowledge(oracle,fixture.expectedState);
      const expected=expectedPreviewStates(oracle,fixture,cell.second,terminal);
      await writeFile(`${dir}/expected.json`,JSON.stringify({identity:{fixture:fixture.sha256,sourceState:digest(fixture.expectedState),sdk:manifest.sdk,terminal},expected}));
      activeBrowser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);manifest.chromium=activeBrowser.version();
      const context=await activeBrowser.newContext({viewport:cell.population==='desktop'?{width:1280,height:800}:{width:844,height:390},hasTouch:cell.population!=='desktop',isMobile:cell.population!=='desktop',deviceScaleFactor:1});
      page=await context.newPage();page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));
      if(cell.control){
        const controlled=previewControlBundle(await readFile(path.join('dist',build.bundle),'utf8'));
        await writeFile(`${dir}/control-bundle.js`,controlled.mutant);await writeFile(`${dir}/control-identity.json`,JSON.stringify(controlled.identity,null,2));
        await page.route(new URL(build.bundle,url).href,route=>route.fulfill({status:200,contentType:'text/javascript',body:controlled.mutant}));
        await page.addInitScript(token=>{globalThis.__HC_PREVIEW_STATE_CONTROL__={token,armed:false,target:null,mutations:0,purity:[],sources:[]};},controlToken);
      }
      await page.addInitScript(()=>localStorage.setItem('dev.progressiveArtwork','off'));
      const cdp=await context.newCDPSession(page);if(cell.population==='mobile4')await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      if(cell.entry==='regular-continue'){
        await page.goto(url+'__harness_fixture_setup__');await page.evaluate(installSave,{database:SAVE_DATABASE_NAME,slot:1,text:fixture.text,meta:fixture.meta});
      }
      await page.goto(cell.entry==='performance-new'?url:url+'?dev=1&art=0');
      await page.getByTestId('game-new').waitFor();await page.waitForFunction(()=>document.querySelector('[data-testid=game-new]')?.disabled===false);
      const activate=id=>cell.population==='desktop'?page.getByTestId(id).click():page.getByTestId(id).tap();
      if(cell.entry==='performance-new'){
        await page.getByTestId('game-developer-tools').locator('summary').click();
        await page.getByTestId('game-progressive-artwork').setChecked(false);await activate('game-new-performance');
      }else await activate('game-continue');
      await page.waitForFunction(({loss,performanceEntry})=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot();return document.querySelector('[data-testid=game-menu]')?.hidden===true&&s?.mode==='map'&&s.graph.computedSec>=loss&&s.graph.maxSec===loss&&s.graph.revealedSec>=17
        &&(performanceEntry?s.opening.phase==='completed'&&s.opening.coverageSec>=loss:s.graph.targetSec>s.graph.revealedSec);},{loss:terminal.lossSec,performanceEntry:cell.entry==='performance-new'});
      const canvas=await page.locator('canvas').boundingBox();assert.ok(canvas);
      const timing=()=>page.evaluate(second=>__SETTLEMENT_DEBUG__.getTimingSnapshot({anchorSec:second,includeProjectionSource:true}),cell.second);
      let inputWitness;
      async function scrub(second,{initial=false}={}){
        const before=await timing(),g=before.graph;
        if(initial){
          if(cell.entry==='performance-new')assert.equal(before.opening.phase,'completed','opening input lock must finish naturally before scrub');
          else assert.ok(g.targetSec>g.revealedSec,'natural reveal active before input');
          assert.equal(g.hasRetainedAnchor||g.projection.hasRetainedAnchor,second===16);
          assert.equal(g.projection.signatureMatches,true);assert.equal(g.projection.timelineToken,g.asyncToken);assert.equal(g.asyncHistoryEndSec,0);
        }
        await page.evaluate(installScrubInputObservation);
        const at=(s)=>({x:canvas.x+(s.graph.plotRect.x+s.graph.plotRect.width*(second-s.graph.minSec)/(s.graph.maxSec-s.graph.minSec))*canvas.width/2424,
          y:canvas.y+(s.graph.plotRect.y+s.graph.plotRect.height*.5)*canvas.height/1080});
        const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{id:1,...p,radiusX:1,radiusY:1}]});
        let p=at(before);if(cell.population==='desktop'){await page.mouse.move(p.x,p.y);await page.mouse.down();}else await touch('touchStart',p);
        for(let i=0;i<6;i++){p=at(await timing());if(cell.population==='desktop')await page.mouse.move(p.x,p.y);else await touch('touchMove',p);}
        if(cell.population==='desktop')await page.mouse.up();else await touch('touchEnd',p);
        await page.waitForFunction(second=>{const s=__SETTLEMENT_DEBUG__.getTimingSnapshot();return s.runner.viewedSec===second&&s.runner.forecastPreview&&s.graph.latchedForecastScrubSec===second;},second);
        const input=await page.evaluate(()=>{__HC_SCRUB_INPUT__.stop();return __HC_SCRUB_INPUT__.events;});
        assert.ok(input.some(e=>e.type==='pointerdown'),'real trusted public input delivered');
        if(initial&&cell.entry!=='performance-new')assert.ok(input.find(e=>e.type==='pointerdown').targetSec>input.find(e=>e.type==='pointerdown').revealedSec,'active reveal at actual trusted input');
        assert.ok(input.every(e=>e.viewedSec<=e.browseCapSec),'every observed input respects reveal clamp');
        const after=await timing();assert.equal(after.runner.frontierSec,fixture.seconds);assert.equal(after.runner.revision,before.runner.revision);assert.equal(after.runner.actionCount,fixture.actions);
        if(initial){if(cell.entry!=='performance-new')assert.ok(after.graph.revealedSec>g.revealedSec,'natural reveal advances through real scrub');
          inputWitness={policy:cell.entry==='performance-new'?'normal completed opening; real scrub after input lock, distinct from active-reveal J5':'natural reveal advances during trusted input',before,after,input};await writeFile(`${dir}/input.json`,JSON.stringify(inputWitness,null,2));}
      }
      async function inspect(tag){
        const hostStart=performance.now();const actual=await page.evaluate(()=>{const start=performance.now(),actual=__SETTLEMENT_DEBUG__.inspectRetainedStates();return {actual,startMs:start,endMs:performance.now()};});
        costs.push({tag,hostElapsedMs:performance.now()-hostStart,startMs:actual.startMs,endMs:actual.endMs,readerCpuMs:actual.endMs-actual.startMs,
          outside:'all latency/frame/memory observation windows; diagnostic script publishes none'});
        await writeFile(`${dir}/${tag}.json`,JSON.stringify(actual.actual));return actual.actual;
      }
      await scrub(cell.second,{initial:true});
      const actual=await inspect('actual-installed');assertPreviewStates(actual,expected,cell.second);
      // Caller-copy isolation is a separate check, not the installed-state proof.
      const copyStart=performance.now();
      const copied=await page.evaluate(()=>{const startMs=performance.now(),x=__SETTLEMENT_DEBUG__.inspectRetainedStates();x.preview.stateData.rng.seed=-1;x.cursor.stateData.rng.seed=-1;const actual=__SETTLEMENT_DEBUG__.inspectRetainedStates();return {actual,startMs,endMs:performance.now()};});
      costs.push({tag:'two-copy-isolation-reads',hostElapsedMs:performance.now()-copyStart,startMs:copied.startMs,endMs:copied.endMs,
        readerAndMutationCpuMs:copied.endMs-copied.startMs,outside:'all latency/frame/memory observation windows'});
      assertPreviewStates(copied.actual,expected,cell.second);
      if(cell.control){
        await page.evaluate(target=>{__HC_PREVIEW_STATE_CONTROL__.target=target;__HC_PREVIEW_STATE_CONTROL__.armed=true;},cell.second);
        const mutant=await inspect('real-installed-mutant');assert.throws(()=>assertPreviewStates(mutant,expected,cell.second),'real nested/RNG mutation rejects');
        assert.deepEqual(mutant.cursor,actual.cursor,'real installed fault leaves authoritative raw cursor unchanged');
        assert.deepEqual(mutant.timelineKnowledge,actual.timelineKnowledge);
        const other=cell.second===16?17:16;await scrub(other);
        assertPreviewStates(await inspect('other-independent-preview'),expectedPreviewStates(oracle,fixture,other,terminal),other);
        await scrub(cell.second);assertPreviewStates(await inspect('revisited-independent-preview'),expected,cell.second);
        const control=await page.evaluate(()=>__HC_PREVIEW_STATE_CONTROL__);await writeFile(`${dir}/control-evidence.json`,JSON.stringify(control));
        assert.equal(control.mutations,1);assert.ok(control.purity.length>=4);assert.ok(control.purity.every(x=>x.before===x.after));
        assert.ok(control.sources.length>=3,'real restore sources witnessed before and after fault');
        assert.ok(control.sources.some(x=>x.targetSec===other));
        assert.equal(new Set(control.sources.map(x=>x.raw)).size,1,'exact cached serialized source remains unchanged across input/restoration');
        assert.notEqual(control.originalRaw,control.mutantRaw);assert.deepEqual(JSON.parse(control.originalRaw),JSON.parse(actual.preview.rawJson));
      }
      assert.equal(digest(fixture.text),inputBefore);assert.deepEqual(errors,[]);
      results.push({...cell,index,pass:true,fixture:fixture.sha256,costs});
    }catch(error){
      const failure={message:error.message,stack:error.stack,actual:error.actual,expected:error.expected,errors,costs};
      if(page)try{failure.passive=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot({includeProjectionSource:true}));await page.screenshot({path:`${dir}/failure.png`});}catch{}
      await writeFile(`${dir}/failure.json`,JSON.stringify(failure));results.push({...cell,index,pass:false,error:error.message.split('\n')[0],costs});
      console.error(`[preview-browser] FAIL ${index}: ${error.message.split('\n')[0]}; ${dir}/failure.json`);
    }finally{await activeBrowser?.close();activeBrowser=null;}
    await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  }
  for(const file of sourceFiles)assert.equal(digest(await readFile(file)),manifest.sources[file],'source held fixed during diagnostic schedule');
  manifest.completed=new Date().toISOString();await writeFile(`${output}/manifest.json`,JSON.stringify(manifest,null,2));
}finally{await activeBrowser?.close();server.kill();}
console.log(`[preview-browser] ${results.filter(r=>r.pass).length}/${cells.length} PASS; ${output}/results.json`);
if(results.some(r=>!r.pass))process.exitCode=1;
