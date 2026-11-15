import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {createTestCapture} from '../src/controllers/agent-test-links.js';
import {deserializeGameState,serializeGameState} from '../src/model/state.js';
import {createNewGameState} from '../src/model/new-game.js';
import {createSimRunner} from '../src/controllers/sim-runner.js';

const base=process.argv[2]??'http://localhost:5197/?dev=1';
const out='artifacts/agent-test-links/display';await mkdir(out,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const checks=[],errors=[];let stage='capture source';
try {
  const context=await browser.newContext({viewport:{width:1440,height:810}});
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  const source=await context.newPage();await source.goto(base);
  await source.waitForFunction(()=>!!globalThis.__AGENT_TEST_LINKS__);
  await source.evaluate(()=>__SETTLEMENT_DEBUG__.enterBootTestRun());
  const packet=await source.evaluate(async()=>{const c=await __AGENT_TEST_LINKS__.capture();return c.packet;});
  const normal=createNewGameState(735);normal.paused=true;normal.phase='planning';packet.state=serializeGameState(normal);
  packet.view.navigation={mode:'settlement',regionId:normal.civilization.capitalRegionId,regionSelectionActive:true,graphScope:'settlement'};
  packet.view.panels.vassalFlow={selection:null,selectedIndex:null,recap:null};packet.view.panels.tooltip=null;packet.view.panels.menu=null;
  packet.view.panels.settlement.activeTab='demographics';packet.view.panels.graphSeries.contextId='settlement';
  const capture=await createTestCapture({state:deserializeGameState(packet.state),view:packet.view,source:packet.source,baseUrl:base});
  await writeFile(`${out}/phone-capture.json`,capture.text);
  const runner=createSimRunner({});runner.resetToState(deserializeGameState(packet.state),'display-probe');const saved=runner.exportCurrentSave().text;
  await source.close();

  async function entry({portrait=true,mode='success',native=false,file=false,graphics='performance',linkDev=true}={}){
    const phone=await browser.newContext({viewport:portrait?{width:390,height:844}:{width:844,height:390},hasTouch:true,isMobile:true});
    phone.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    const page=await phone.newPage();
    if(graphics==='full')page.setDefaultTimeout(120000);
    const artworkRequests=[];page.on('request',request=>{if(/\/(?:artwork\/|images\/sprite-sheets\/)/.test(request.url()))artworkRequests.push(request.url());});
    await page.addInitScript(({mode,native})=>{
      globalThis.__displayCalls=[];
      const realRequest=Element.prototype.requestFullscreen;
      let full=null;
      if(!native)Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>full});
      Element.prototype.requestFullscreen=function(){
        __displayCalls.push({operation:'fullscreen',active:navigator.userActivation.isActive});
        if(native)return realRequest.call(this);
        if(mode==='denied')return Promise.reject(Error('Unavailable'));
        full=this;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();
      };
      screen.orientation.lock=value=>{
        __displayCalls.push({operation:value});
        return mode==='success'?new Promise(()=>{}):Promise.reject(Error('Unsupported'));
      };
    },{mode,native});
    await page.goto(base);await page.waitForFunction(()=>!!globalThis.__AGENT_TEST_LINKS__);
    await page.evaluate(async text=>{const {importSaveToSlot}=await import('/src/controllers/sim-runner/save-slots.js');for(const slot of [1,'performance-dev']){const r=await importSaveToSlot(slot,text);if(!r.ok)throw Error(r.reason);}},saved);
    const slots=()=>page.evaluate(async()=>{const {readSaveSlot}=await import('/src/controllers/sim-runner/save-slots.js');return JSON.stringify(await Promise.all([1,'performance-dev'].map(async slot=>(await readSaveSlot(slot)).data)));});
    const before=await slots();
    await page.goto('about:blank');artworkRequests.length=0;
    const target=new URL(capture.url);if(!linkDev)target.searchParams.delete('dev');
    await page.goto(target.href);await page.getByTestId('test-link-display').waitFor();
    assert.equal(await page.evaluate(()=>!!globalThis.__AGENT_TEST_LINKS__),false,'game views wait for the graphics choice');
    assert.equal(artworkRequests.length,0,'neither URL mode preloads artwork before the choice');
    assert.equal(await page.evaluate(()=>__displayCalls.length),0,'link navigation never attempts fullscreen without a gesture');
    assert.equal(await page.getByTestId('test-link-display-continue').isVisible(),false);
    if(portrait&&mode==='success')await page.screenshot({path:`${out}/portrait-entry.png`,animations:'disabled'});
    if(file){
      // Import uses a separate route, so also check its new document needs a tap.
      await page.goto(base);
      await page.waitForFunction(()=>!!globalThis.__AGENT_TEST_LINKS__);
      const [imported]=await Promise.all([page.waitForEvent('popup'),page.evaluate(text=>__AGENT_TEST_LINKS__.openFile(text),capture.text)]);
      await page.close();await imported.bringToFront();
      await imported.getByTestId('test-link-display').waitFor();
      await imported.getByTestId('test-link-display-open').tap();
      await imported.waitForFunction(()=>globalThis.__AGENT_TEST_LINKS__?.getStatus().loaded);
      const recaptured=await imported.evaluate(async()=>{const c=await __AGENT_TEST_LINKS__.capture();return c.packet;});
      assert.equal(recaptured.view.panels.settlement.activeTab,'demographics');assert.deepEqual(recaptured.state.rng,packet.state.rng);
      await phone.close();return;
    }
    await page.getByTestId(graphics==='full'?'test-link-display-full':'test-link-display-open').tap();
    await page.waitForFunction(()=>__displayCalls.some(call=>call.operation==='landscape'));
    const calls=await page.evaluate(()=>__displayCalls);assert.equal(calls[0].active,true,'fullscreen is requested in the entry tap activation');
    assert.deepEqual(calls.map(call=>call.operation),['fullscreen','landscape']);
    if(portrait){
      await page.waitForFunction(()=>!document.querySelector('[data-testid="test-link-display-open"]').disabled);
      assert.equal(await page.evaluate(()=>!!globalThis.__AGENT_TEST_LINKS__),false);
      assert.equal(await page.getByTestId('test-link-display-continue').isVisible(),false);
      await page.screenshot({path:`${out}/${mode}-rotate-prompt.png`,animations:'disabled'});
      await page.setViewportSize({width:844,height:390});
    }
    if(mode==='denied'){
      await page.getByTestId('test-link-display-continue').waitFor({state:'visible'});
      await page.screenshot({path:`${out}/landscape-fallback.png`,animations:'disabled'});
      await page.getByTestId('test-link-display-continue').tap();
    }
    await page.waitForFunction(()=>globalThis.__AGENT_TEST_LINKS__?.getStatus().loaded);
    const restored=await page.evaluate(async()=>{const c=await __AGENT_TEST_LINKS__.capture();const mode=await import('/src/views/minimal-graphics.js');return {packet:c.packet,fullscreen:!!document.fullscreenElement,minimal:mode.minimalGraphics,progressive:mode.progressiveGraphics};});
    assert.deepEqual(restored.packet.state.rng,packet.state.rng);assert.equal(restored.packet.state.tSec,packet.state.tSec);
    assert.equal(restored.packet.view.panels.settlement.activeTab,'demographics');
    assert.equal(restored.minimal,graphics!=='full');assert.equal(restored.progressive,false);
    assert.equal(await page.evaluate(()=>new URLSearchParams(location.search).get('dev')==='1'),graphics!=='full');
    assert.equal(await page.evaluate(()=>new URLSearchParams(location.search).has('perf')),false);
    if(graphics==='full')assert.ok(artworkRequests.some(url=>/chronicle-illustrations/.test(url)),'full choice loads illustrations');
    else assert.ok(!artworkRequests.some(url=>/chronicle-illustrations/.test(url)),'performance choice avoids illustration atlases');
    assert.equal(await slots(),before,'display entry never writes occupied slots');
    if(native)assert.equal(restored.fullscreen,true);
    if(!portrait){
      await page.screenshot({path:`${out}/fullscreen-landscape.png`,animations:'disabled'});
      await page.screenshot({path:`${out}/fullscreen-${graphics}.png`,animations:'disabled'});
      const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(async()=>{const r=await __AGENT_TEST_LINKS__.download();return {needsFile:r.needsFile};})]);
      await download.saveAs(`${out}/phone-capture.json`);
    }
    if(!native&&mode==='success'){
      await page.reload();await page.getByTestId('test-link-display').waitFor();
      assert.equal(await page.evaluate(()=>!!globalThis.__AGENT_TEST_LINKS__),false,'refresh restores the display gate before the game');
    }
    await phone.close();
  }
  stage='portrait choice before artwork and pending orientation promise';await entry({linkDev:false});checks.push(stage);
  stage='denied APIs and manual landscape fallback';await entry({mode:'denied'});checks.push(stage);
  stage='native fullscreen from a landscape touch tap';await entry({portrait:false,native:true,mode:'unsupported'});checks.push(stage);
  stage='full graphics from a performance URL';await entry({portrait:false,native:true,mode:'unsupported',graphics:'full'});checks.push(stage);
  stage='file handoff display entry';await entry({portrait:false,native:true,mode:'unsupported',file:true});checks.push(stage);
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/checks.json`,JSON.stringify({ok:true,source:packet.source,checks,slotsUnchanged:true},null,2));
  console.log(JSON.stringify({ok:true,checks:checks.length,source:packet.source,artifacts:out}));
}catch(error){await writeFile(`${out}/failure.txt`,`${stage}\n${error.stack}\n${JSON.stringify(errors)}`);console.error(`Test-link display probe failed: ${stage}; ${out}/failure.txt`);process.exitCode=1;}
finally{await browser.close();}
