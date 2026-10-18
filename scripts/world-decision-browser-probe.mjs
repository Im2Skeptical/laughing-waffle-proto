import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const output = 'artifacts/world-decision';
await mkdir(output, { recursive: true });
const root = path.resolve('.');
const types = { '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><body style="margin:0;background:#171713"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script>');
      return;
    }
    const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(root + path.sep)) throw new Error('Outside checkout');
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport:{width:1280,height:800}, hasTouch:true });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const { createNewGameState } = await import('/src/model/new-game.js');
    const life = await import('/src/model/vassal-life-map.js');
    const { createVassalNodeDecisionModalView } = await import('/src/views/vassal-node-decision-modal-pixi.js');
    const { prepareChronicleArt } = await import('/src/views/chronicle-art.js');
    const app = new PIXI.Application({width:2424,height:1080,backgroundColor:0x171713});
    app.stop();
    app.view.style.width='100vw'; app.view.style.height='auto'; document.body.append(app.view);
    await prepareChronicleArt(app.renderer);
    const state = createNewGameState(1867);
    const candidate = {...life.getVassalCandidatePool(state).candidates[0],classId:'warrior',founderClassId:null,prestige:100};
    const result = life.selectLifeMapVassal(state,0,null,candidate);
    if (!result.ok) throw new Error(result.reason);
    const vassal = life.getCurrentLifeMapVassal(state);
    if(vassal.commissionOffers?.length) life.chooseVassalCommission(state,vassal.commissionOffers[0].offerId);
    let failConfirm=false;
    const modal = createVassalNodeDecisionModalView({app,layer:app.stage,getState:()=>state,
      getPresentation:()=>({vassal,readOnly:false,viewedSec:state.tSec,frontierSec:state.tSec}),
      getDecisionPresentation:(...args)=>life.getVassalNodeDecisionPresentation(state,...args),
      onSelectOption:(...args)=>life.selectVassalNodeOption(state,...args),
      onConfirmNode:(...args)=>failConfirm?{ok:false,reason:'probe rejection'}:life.confirmVassalLifeNode(state,...args),
    });
    // The same preparation entry point as the live game's loading stage.
    await modal.prepare?.(app.renderer);
    app.ticker.add(()=>modal.update());
    app.start();
    globalThis.probe = {app,modal,state,vassal,failConfirm:value=>{failConfirm=value;},
      enter(family) {
        modal.close({immediate:true});
        vassal.lifeMap.pendingResolution=null;
        let node=vassal.lifeMap.graph.nodes.find(n=>n.family===family);
        if(!node){node=vassal.lifeMap.graph.nodes.find(n=>!n.signatureNode);node.family=family;}
        delete vassal.lifeMap.nodeStates[node.id];
        vassal.lifeMap.currentNodeId=null;vassal.lifeMap.availableNodeIds=[node.id];
        const result=life.enterVassalLifeNode(state,node.id);if(!result.ok)throw new Error(result.reason);
        modal.open(node.id);return node.id;
      },
    };
  });
  const snapshot = () => page.evaluate(()=>probe.modal.getSemanticSnapshot());
  async function click(kind,id) {
    const point = await page.evaluate(({kind,id})=>probe.modal.getWorldDecisionPoint(kind,id),{kind,id});
    assert.ok(point, `${kind} control exists`);
    const bounds=await page.locator('canvas').boundingBox();
    await page.mouse.click(bounds.x+point.x*bounds.width/2424,bounds.y+point.y*bounds.height/1080);
    await page.waitForTimeout(180);
  }
  for (const family of ['travel','campaign','legacy']) {
    await page.evaluate(family=>probe.enter(family),family);
    await page.waitForTimeout(200);
    let s=await snapshot();
    assert.ok(s.worldDecision, `${family} uses the real world decision screen`);
    if(!process.argv.includes('--confirm-only')) {
      assert.equal(s.worldDecision.map.illustratedTerrain.ready,true,`${family} displays prepared illustrated terrain`);
      assert.equal(s.worldDecision.map.illustratedTerrain.bakes,1,`${family} reuses prepared terrain`);
    }
    await page.screenshot({path:`${output}/${family}-desktop.png`});
    await page.setViewportSize({width:844,height:390});
    await page.screenshot({path:`${output}/${family}-phone.png`});
    await page.setViewportSize({width:1280,height:800});
    if(family==='travel') {
      const target=s.worldDecision.targets.find(t=>!t.blocked);
      assert.ok(target,'reachable travel target');
      await click('worldTarget',target.regionId);
      await page.evaluate(()=>probe.failConfirm(true));
      await click('confirm');
      assert.equal((await snapshot()).open,true,'rejected confirmation stays open');
      await page.evaluate(()=>probe.failConfirm(false));
      await click('confirm');
      assert.equal((await snapshot()).open,false,'Crossroads minimises immediately on accepted confirmation');
      await page.waitForTimeout(200);
      assert.equal((await snapshot()).worldDecision,null,'Crossroads stays minimised during resolution');
      await page.evaluate(()=>probe.modal.open(probe.vassal.lifeMap.currentNodeId));
      assert.equal((await snapshot()).worldDecision?.open,true,'minimised Crossroads can be reopened to review its resolution');
    }
    if(family==='campaign') {
      await click('option',1);
      await click('confirm');
      assert.equal((await snapshot()).open,true,'continuous Campaign encounter keeps its screen open');
    }
    if(family==='legacy') {
      await click('option',1);
      await click('confirm');
      assert.equal((await snapshot()).open,false,'ordinary Legacy minimises after confirmation');
    }
    checks.push(family);
  }
  assert.deepEqual(errors,[],'no browser errors');
  await writeFile(`${output}/result.json`,JSON.stringify({ok:true,checks},null,2));
  console.log(`[world-decision] ${checks.join(', ')} map preparation and confirm behaviour OK`);
} catch(error) {
  await writeFile(`${output}/result.json`,JSON.stringify({ok:false,error:error.message,errors,checks},null,2));
  console.error(`[world-decision] ${error.message}; artifact: ${output}/result.json`);
  process.exitCode=1;
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
