import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const output = 'artifacts/prestige-feedback';
await mkdir(output, {recursive:true});
const root = path.resolve('.');
const mime = {'.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server = createServer(async (request,response) => {
  try {
    const pathname = new URL(request.url,'http://localhost').pathname;
    if (pathname === '/') {
      response.setHeader('Content-Type','text/html');
      response.end('<body style="margin:0;background:#171713"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script>');
      return;
    }
    const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(root+path.sep)) throw new Error('Outside checkout');
    response.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode=404;response.end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const errors=[],checks=[];
try {
  const page = await browser.newPage({viewport:{width:844,height:390},hasTouch:true,reducedMotion:'no-preference'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async()=>{
    const {createNewGameState}=await import('/src/model/new-game.js');
    const life=await import('/src/model/vassal-life-map.js');
    const {serializeGameState}=await import('/src/model/state.js');
    const {createVassalNodeDecisionModalView}=await import('/src/views/vassal-node-decision-modal-pixi.js');
    const {createVassalLifeHudView}=await import('/src/views/vassal-life-hud-pixi.js');
    const {prepareChronicleArt}=await import('/src/views/chronicle-art.js');
    const feedback=await import('/src/views/prestige-feedback-pixi.js');
    const {addCostPanel}=await import('/src/views/resource-cost-pixi.js');
    const app=new PIXI.Application({width:2424,height:1080,backgroundColor:0x171713});
    app.view.style.width='100vw';app.view.style.height='auto';document.body.append(app.view);
    await prepareChronicleArt(app.renderer);
    const state=createNewGameState(1867);
    const candidate={...life.getVassalCandidatePool(state).candidates[0],classId:'warrior',founderClassId:null,prestige:2};
    const chosen=life.selectLifeMapVassal(state,0,null,candidate);if(!chosen.ok)throw Error(chosen.reason);
    const vassal=life.getCurrentLifeMapVassal(state);
    const modal=createVassalNodeDecisionModalView({app,layer:app.stage,getState:()=>state,
      getPresentation:()=>({vassal,readOnly:false,viewedSec:state.tSec,frontierSec:state.tSec}),
      getDecisionPresentation:(...args)=>life.getVassalNodeDecisionPresentation(state,...args),
      onSelectOption:(...args)=>life.selectVassalNodeOption(state,...args),
      onConfirmNode:(...args)=>life.confirmVassalLifeNode(state,...args)});
    const hud=createVassalLifeHudView({layer:app.stage,getPresentation:()=>({state,vassal}),isVisible:()=>true});
    await modal.prepare(app.renderer);hud.init();
    const node=vassal.lifeMap.graph.nodes.find(node=>node.family==='crossroads');
    vassal.lifeMap.availableNodeIds=[node.id];
    const entered=life.enterVassalLifeNode(state,node.id);if(!entered.ok)throw Error(entered.reason);
    modal.open(node.id);
    app.ticker.add(()=>{modal.update();hud.update();});
    window.probe={app,state,vassal,modal,hud,feedback,addCostPanel,serialize:()=>serializeGameState(state),accepted:0};
  });
  const snapshot=()=>page.evaluate(()=>probe.feedback.getPrestigeFeedbackSnapshot());
  async function tap(rect) {
    const box=await page.locator('canvas').boundingBox();
    await page.touchscreen.tap(box.x+(rect.x+rect.width/2)*box.width/2424,box.y+(rect.y+rect.height/2)*box.height/1080);
  }
  function paired(s) {
    assert.ok(s.active && s.cost && s.banks.length,'cost and visible bank highlighted');
    assert.ok(s.banks.every(bank=>bank.alpha===s.cost.alpha),'bank/cost share exact pulse phase');
  }
  const price=await page.evaluate(()=>probe.modal.getSemanticSnapshot().worldDecision.prices.find(price=>price.unaffordable));
  assert.ok(price?.prestigeCost>2,'real generated route is unaffordable');
  const before=await page.evaluate(()=>probe.serialize());
  await tap(price.rect);
  paired(await snapshot());
  await page.waitForFunction(()=>{const s=probe.feedback.getPrestigeFeedbackSnapshot();return s.active&&s.cost.alpha<.9;});
  paired(await snapshot());
  assert.deepEqual(await page.evaluate(()=>probe.serialize()),before,'refusal changes no state or RNG');
  await tap(price.rect);
  await page.waitForTimeout(550);
  paired(await snapshot());
  await page.waitForFunction(()=>!probe.feedback.getPrestigeFeedbackSnapshot().active);
  assert.equal((await snapshot()).banks.length,0);
  checks.push('Real route footer touch; synchronized pulse/restart/expiry; unchanged serialized state');
  await page.emulateMedia({reducedMotion:'reduce'});
  await tap(price.rect);
  paired(await snapshot());
  assert.equal((await snapshot()).cost.alpha,1);
  await page.screenshot({path:`${output}/route-phone.png`});
  await page.evaluate(()=>probe.modal.close({immediate:true}));
  await page.waitForFunction(()=>!probe.feedback.getPrestigeFeedbackSnapshot().active);
  assert.equal((await snapshot()).banks.length,0,'closing screen clears bank feedback');
  checks.push('Reduced motion steady; closing a decision cancels both highlights');

  // Exercise the same shared footer with mixed resources and availability gates.
  const rect=await page.evaluate(()=>{
    const layer=new PIXI.Container();probe.app.stage.addChild(layer);probe.testLayer=layer;
    probe.cost=probe.addCostPanel(layer,{x:300,y:300,width:400,height:240},{prestigeCost:20,foodCost:3,unaffordable:true,disabled:true});
    const texts=probe.cost.children.flatMap(child=>child.children??[]).filter(child=>child instanceof PIXI.Text);
    probe.inks=Object.fromEntries(texts.map(text=>[text.text,text.style.fill]));
    return probe.cost.getBounds();
  });
  const inks=await page.evaluate(()=>probe.inks);
  assert.equal(inks['20'],'#f0ad97','unaffordable Prestige is red');
  assert.notEqual(inks['3'],'#f0ad97','Food keeps its own colour');
  await tap(rect);paired(await snapshot());
  await page.evaluate(()=>probe.cost.destroy({children:true}));
  await page.waitForFunction(()=>!probe.feedback.getPrestigeFeedbackSnapshot().active);
  const exact=await page.evaluate(()=>{
    probe.cost=probe.addCostPanel(probe.testLayer,{x:300,y:300,width:400,height:240},{prestigeCost:20,onActivate:()=>probe.accepted++});
    return probe.cost.getBounds();
  });
  await tap(exact);
  assert.equal(await page.evaluate(()=>probe.accepted),1);
  assert.equal((await snapshot()).active,false,'affordable action has no shortfall flash');
  await page.evaluate(()=>{probe.cost.destroy({children:true});probe.cost=probe.addCostPanel(probe.testLayer,{x:300,y:300,width:400,height:240},{prestigeCost:20,unaffordable:true,disabled:true,prestigeFeedback:false});});
  await tap(exact);
  assert.equal((await snapshot()).active,false,'history/busy gate suppresses feedback');
  checks.push('Only Prestige turns red; affordable activation; destroyed target cleanup; read-only gate');
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/report.json`,JSON.stringify({ok:true,checks},null,2));
  console.log(`PASS: ${checks.length} grouped checks; ${output}/report.json; route-phone.png`);
} catch(error) {
  await writeFile(`${output}/failure.json`,JSON.stringify({message:error.message,errors},null,2));
  console.error(`${error.message.split('\n')[0]}; ${output}/failure.json`);process.exitCode=1;
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
