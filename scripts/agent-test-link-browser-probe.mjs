import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {createSimRunner} from '../src/controllers/sim-runner.js';
import {createTestCapture} from '../src/controllers/agent-test-links.js';
import {createLabFixture} from '../src/model/dev-lab/fixtures.js';
import {selectedState,nodeIdForFamily,forceEnter} from '../src/model/tests/vassal-life-map/helpers.js';
import {prepareLifeChoices} from '../src/model/vassal-life-map/decision-preparation.js';
import {getVassalNodeDecisionPresentation,getCurrentLifeMapVassal} from '../src/model/vassal-life-map.js';
import {buildDetailedVassalSelectionPool,getDetailedSettlementViewModel} from '../src/model/detailed-settlements.js';
import {ensureCommissionOffers} from '../src/model/vassal-life-map/commissions.js';
import {getClockTimePassage} from '../src/views/sunandmoon-disks-pixi.js';
import {ActionKinds} from '../src/model/actions.js';
import {VASSAL_HEIRLOOM_DEFINITION_IDS} from '../src/defs/gamepieces/vassal-heirloom-defs.js';
import {multiplierTooltip,poolContributions} from '../src/views/multiplier-breakdown.js';

const base=new URL(process.argv[2]??'http://localhost:5197/');base.search='?dev=1';
const out='artifacts/agent-test-links/integrated';await mkdir(out,{recursive:true});
const clone=value=>JSON.parse(JSON.stringify(value));
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const checks=[],errors=[];let stage='boot';
try {
 const context=await browser.newContext({viewport:{width:1440,height:810}});
 context.on('page',page=>page.on('pageerror',error=>errors.push({stage,message:error.message})));
 const sourcePage=await context.newPage();await sourcePage.goto(base.href);
 await sourcePage.waitForFunction(()=>!!globalThis.__AGENT_TEST_LINKS__);
 await sourcePage.evaluate(()=>__SETTLEMENT_DEBUG__.enterBootTestRun());
 const initial=await sourcePage.evaluate(async()=>{const c=await __AGENT_TEST_LINKS__.capture();return {packet:c.packet,inventory:__AGENT_TEST_LINKS__.getPanelInventory()};});
 const normal=createNewGameState(735);normal.paused=true;normal.phase='planning';
 const packet=clone(initial.packet);packet.state=serializeGameState(normal);
 packet.view.navigation={mode:'map',regionId:normal.civilization.capitalRegionId,regionSelectionActive:false,graphScope:'civilization'};
 packet.view.panels.vassalFlow={selection:null,selectedIndex:null,recap:null};packet.view.panels.tooltip=null;packet.view.panels.menu=null;
 packet.view.panels.graphSeries={open:false,contextId:'civilization',visibleSeriesIds:[]};
 const runner=createSimRunner({});runner.resetToState(normal,'test');const saved=runner.exportCurrentSave().text;
 await sourcePage.evaluate(async text=>{const {importSaveToSlot}=await import('/src/controllers/sim-runner/save-slots.js');for(const slot of [1,'performance-dev']){const result=await importSaveToSlot(slot,text);if(!result.ok)throw Error(result.reason);}},saved);
 const slotBefore=await sourcePage.evaluate(async()=>{const {readSaveSlot}=await import('/src/controllers/sim-runner/save-slots.js');return JSON.stringify(await Promise.all([1,'performance-dev'].map(async slot=>(await readSaveSlot(slot)).data)));});
 assert.ok(slotBefore);
 const make=(name,mutate,state=normal)=>{const p=clone(packet);p.state=serializeGameState(state);p.view.navigation.regionId=state.civilization.capitalRegionId;mutate?.(p);return {name,packet:p};};
 const life=selectedState(1);const vassal=getCurrentLifeMapVassal(life);const nodeId=vassal.lifeMap.availableNodeIds[0];
 const prepared=await prepareLifeChoices(serializeGameState(life));const entered=deserializeGameState(prepared[nodeId].stateData);
 const decision=getVassalNodeDecisionPresentation(entered,nodeId);const option=decision.nodeState.options.find(item=>item.enabled!==false);
 const nodePanel={nodeId,offerPage:0,replacementOfferId:null,pinnedInspectionId:null,quickInspectionId:null,acquirePicker:null,reference:null,scroll:0,glossaryScroll:0,world:{mode:'move',selection:null,dismissed:true}};
 const lifeView=p=>{p.view.navigation.mode='vassalLife';p.view.navigation.graphScope='civilization';};
 const heirloom={instanceId:'probe-ring',definitionId:'signetRing',inheritanceState:'unmarked',protectionSpent:false};
 const loadout=deserializeGameState(serializeGameState(life));loadout.civilization.vassalLineage.pendingHeirloomLoadout=true;
 const overflow=deserializeGameState(serializeGameState(life));overflow.civilization.vassalLineage.pendingVaultOverflow=Array.from({length:7},(_,i)=>({...heirloom,definitionId:VASSAL_HEIRLOOM_DEFINITION_IDS[i],instanceId:`probe-${i}`}));
 const inheritance=deserializeGameState(serializeGameState(life));inheritance.civilization.vassalLineage.lastInheritanceReport={vassalId:'prior-vassal',entries:[{...heirloom,outcome:'survived',toState:'unmarked'}]};
 const level=deserializeGameState(serializeGameState(life));getCurrentLifeMapVassal(level).developmentChoiceQueue=[{choiceId:'probe-level',offeredStatIds:['wisdom','cunning','effectiveness']}];
 const scholar=createLabFixture('scholar',735);ensureCommissionOffers(scholar,getCurrentLifeMapVassal(scholar));
 const ledgerPractice=getDetailedSettlementViewModel(scholar,scholar.civilization.capitalRegionId).practices.find(practice=>practice?.face.outputMultiplierBreakdown?.sources.length);
 assert.ok(ledgerPractice);
 const ledgerSpec=multiplierTooltip({name:ledgerPractice.label,practiceId:ledgerPractice.practiceId,output:ledgerPractice.face.outputMultiplierBreakdown,
   baseOutput:ledgerPractice.face.production.map(row=>({timing:row.season,amount:row.value}))},'output');
 const ledgerKey=poolContributions(ledgerSpec.poolBreakdown.pool)[0].key;
 const complete=deserializeGameState(serializeGameState(normal));complete.runStatus={complete:true,reason:'tenuresExhausted',tSec:0,year:1};
 const recap={vassalId:vassal.vassalId,kind:'node',timeLabel:'0 years',clock:getClockTimePassage(life,life),prestigeIncome:0,developmentIncome:0,ageBefore:18,ageAfter:18,prestigeBefore:0,prestigeAfter:0,expBefore:0,expAfter:0,expThreshold:5,earnedLevelCount:0,endedReason:null,deathCause:null,queuedLevelUp:false,readOnly:false};
 const worlds=['crossroads','campaign','legacy'].map(family=>{
   const state=family==='campaign'?createLabFixture('warrior',735):selectedState(3);
   const id=nodeIdForFamily(state,family);forceEnter(state,id);
   return {family,state,id};
 });
 const shop=selectedState(8);getCurrentLifeMapVassal(shop).prestige=500;
 const shopId=nodeIdForFamily(shop,'publicWorks');forceEnter(shop,shopId);
 const shopOffer=getVassalNodeDecisionPresentation(shop,shopId).offers.find(offer=>offer.canStage);
 assert.ok(shopOffer);
 const cases=[
  make('map'),make('region-and-chaos',p=>{p.view.navigation.regionSelectionActive=true;p.view.navigation.graphScope='settlement';p.view.panels.graphSeries.contextId='settlement';p.view.panels.map.chaosExpanded=true;}),
  make('settlement-demographics',p=>{p.view.navigation.mode='settlement';p.view.navigation.graphScope='settlement';p.view.navigation.regionSelectionActive=true;p.view.panels.graphSeries.contextId='settlement';p.view.panels.settlement.activeTab='demographics';}),
  make('moon-reference-and-series',p=>{p.view.panels.phaseReference={phaseId:'food'};p.view.panels.graphSeries.open=true;}),
  make('candidate-drawer',p=>{p.view.panels.vassalFlow.selection=buildDetailedVassalSelectionPool(normal);p.view.panels.vassalFlow.selectedIndex=0;}),
  make('life-node-entry',p=>{lifeView(p);p.view.panels.lifeMap={inspectedNodeId:nodeId,candidateNodeId:nodeId,pinnedNodeIds:[],entryConfirmationOpen:true};},life),
  make('node-decision',p=>{lifeView(p);p.view.panels.nodeDecision=clone(nodePanel);p.view.panels.nodeDecision.pinnedInspectionId=option.id;},entered),
  make('staged-choice',p=>{lifeView(p);p.view.panels.nodeDecision=clone(nodePanel);p.view.panels.decisionDraft={actions:[{kind:ActionKinds.VASSAL_SELECT_LIFE_OPTION,payload:{nodeId,optionId:option.id}}]};},entered),
  make('shop-staging-and-inspection',p=>{lifeView(p);p.view.panels.nodeDecision={...clone(nodePanel),nodeId:shopId,pinnedInspectionId:shopOffer.offerId};p.view.panels.decisionDraft={actions:[{kind:ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,payload:{nodeId:shopId,offerId:shopOffer.offerId}}]};},shop),
  ...worlds.map(world=>make('world-'+world.family,p=>{lifeView(p);p.view.panels.nodeDecision={...clone(nodePanel),nodeId:world.id,world:{mode:world.family==='campaign'?'attack':world.family==='legacy'?'legacy':'move',selection:null,dismissed:false}};},world.state)),
  make('heirloom-inventory',p=>{lifeView(p);p.view.panels.heirlooms.browsing=true;p.view.panels.heirlooms.tab='vault';},life),
  make('heirloom-loadout',lifeView,loadout),make('heirloom-overflow',p=>{lifeView(p);p.view.panels.heirlooms.selectedIds=overflow.civilization.vassalLineage.pendingVaultOverflow.slice(0,6).map(item=>item.instanceId);},overflow),
  make('inheritance-summary',lifeView,inheritance),make('level-up',p=>{lifeView(p);p.view.panels.levelUp.selectedStatId='wisdom';},level),
  make('commission',lifeView,scholar),make('resolution-recap',p=>{lifeView(p);p.view.panels.vassalFlow.recap=recap;p.view.panels.recap.open=true;},life),
  make('contribution-sources',p=>{p.view.navigation.regionSelectionActive=true;p.view.navigation.graphScope='settlement';p.view.panels.graphSeries.contextId='settlement';p.view.panels.tooltip={spec:ledgerSpec,anchor:{x:900,y:420,width:100,height:80,coordinateSpace:'screen'},pinned:true,dismissOnExit:false,key:ledgerSpec.poolKey,quick:false,scroll:0,glossaryScroll:0,reference:null,sourceKey:ledgerKey,sourceScroll:0};},scholar),
  make('run-complete',p=>{p.view.panels.runComplete.open=true;},complete),
  make('research-filter-and-menu',p=>{p.view.panels.research={filters:{search:'',pool:'common',kind:'practice',availability:'',trait:''},scroll:180,activeMenu:'kind',menuPage:0};}),
  ...['home','new','load','diagnostics'].map(mode=>make('game-menu-'+mode,p=>{p.view.panels.menu={mode,overwriteSlot:null,developerTools:true,scroll:0};})),
  ...['vassalLab','graphics','saveDiagnostics'].map(page=>make('workshop-'+page,p=>{p.view.panels.workshop={page,scroll:0};if(page==='graphics')p.view.panels.appearance={fog:false,clouds:false,shadows:false,wisps:false,water:false};})),
 ];
 for(const test of cases){stage='preflight '+test.name;deserializeGameState(test.packet.state);}
 let finalCapture;
 for(const test of cases.filter(test=>!process.argv[3]||process.argv[3].split(',').some(filter=>test.name.includes(filter)))){
  stage=test.name;
  const encoded=await createTestCapture({state:deserializeGameState(test.packet.state),view:test.packet.view,source:test.packet.source,baseUrl:base.href});
  assert.ok(encoded.url);
  const page=await context.newPage();await page.goto(encoded.url);await page.bringToFront();
  await page.waitForFunction(()=>{const s=globalThis.__AGENT_TEST_LINKS__?.getStatus();return s?.loaded||s?.lastError;});
  const status=await page.evaluate(()=>__AGENT_TEST_LINKS__.getStatus());assert.equal(status.lastError,null);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const recaptured=await page.evaluate(async()=>{const result=await __AGENT_TEST_LINKS__.capture();return {packet:result.packet,url:result.url};});
  const observed=recaptured.packet.view;
  for(const id of initial.inventory){
   // State-driven automatic panels can acquire valid default selection IDs;
   // compare the explicit non-default fields of the panel under test below.
   assert.ok(Object.hasOwn(observed.panels,id),`missing panel adapter: ${id}`);
  }
  assert.equal(observed.navigation.mode,test.packet.view.navigation.mode);
  if(recaptured.packet.state.tSec!==test.packet.state.tSec||JSON.stringify(recaptured.packet.state.rng)!==JSON.stringify(test.packet.state.rng)){
    const debug=await page.evaluate(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return {viewedSec:s.viewedSec,frontierSec:s.frontierSec,playbackTarget:s.playbackTarget,playbackCurrent:s.playbackCurrent,graph:s.graph,forecastStatus:s.forecastStatus};});
    await writeFile(`${out}/state-mismatch.json`,JSON.stringify({stage,expected:{tSec:test.packet.state.tSec,paused:test.packet.state.paused,rng:test.packet.state.rng},actual:{tSec:recaptured.packet.state.tSec,paused:recaptured.packet.state.paused,rng:recaptured.packet.state.rng},debug},null,2));
  }
  assert.equal(recaptured.packet.state.tSec,test.packet.state.tSec,'restoration must stay at the captured second');
  assert.deepEqual(recaptured.packet.state.rng,test.packet.state.rng,'restoration must not consume simulation RNG');
  if(stage==='settlement-demographics')assert.equal(observed.panels.settlement.activeTab,'demographics');
  if(stage==='region-and-chaos')assert.equal(observed.panels.map.chaosExpanded,true);
  if(stage==='moon-reference-and-series'){assert.equal(observed.panels.phaseReference.phaseId,'food');assert.equal(observed.panels.graphSeries.open,true);}
  if(stage==='candidate-drawer')assert.deepEqual(observed.panels.vassalFlow.selection,test.packet.view.panels.vassalFlow.selection);
  if(stage==='life-node-entry')assert.equal(observed.panels.lifeMap.entryConfirmationOpen,true);
  if(stage==='node-decision')assert.equal(observed.panels.nodeDecision.pinnedInspectionId,option.id);
  if(stage==='staged-choice')assert.deepEqual(observed.panels.decisionDraft,test.packet.view.panels.decisionDraft);
  if(stage==='shop-staging-and-inspection'){
    assert.deepEqual(observed.panels.decisionDraft,test.packet.view.panels.decisionDraft);assert.equal(observed.panels.nodeDecision.pinnedInspectionId,shopOffer.offerId);
    const staged=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder);assert.ok(staged.includes(shopOffer.offerId));
  }
  if(stage.startsWith('world-'))assert.equal(observed.panels.nodeDecision.world.dismissed,false);
  if(stage==='heirloom-inventory')assert.equal(observed.panels.heirlooms.browsing,true);
  if(stage==='level-up')assert.equal(observed.panels.levelUp.selectedStatId,'wisdom');
  if(stage==='commission')assert.equal(observed.panels.commission.open,true);
  if(stage==='resolution-recap')assert.deepEqual(observed.panels.vassalFlow.recap,recap);
  if(stage==='contribution-sources'){assert.equal(observed.panels.tooltip.sourceKey,ledgerKey);assert.ok(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolSources?.sources.length));}
  if(stage==='run-complete')assert.equal(observed.panels.runComplete.open,true);
  if(stage==='research-filter-and-menu'){assert.deepEqual(observed.panels.research.filters,test.packet.view.panels.research.filters);assert.equal(observed.panels.research.activeMenu,'kind');}
  if(stage.startsWith('game-menu-'))assert.equal(observed.panels.menu.mode,test.packet.view.panels.menu.mode);
  if(stage.startsWith('workshop-'))assert.equal(observed.panels.workshop.page,test.packet.view.panels.workshop.page);
  if(stage==='workshop-graphics')assert.deepEqual(observed.panels.appearance,test.packet.view.panels.appearance);
  if(stage==='settlement-demographics'){
    await page.setViewportSize({width:960,height:540});await page.screenshot({path:`${out}/restored-settlement-phone.png`,animations:'disabled'});
    finalCapture=recaptured;
    const [captureDownload]=await Promise.all([page.waitForEvent('download'),page.evaluate(async()=>{const c=await __AGENT_TEST_LINKS__.download();return {needsFile:c.needsFile};})]);
    await captureDownload.saveAs(`${out}/agent-command-capture.json`);
    const downloaded=JSON.parse(await readFile(`${out}/agent-command-capture.json`,'utf8'));
    assert.deepEqual(downloaded.view,recaptured.packet.view);assert.deepEqual(downloaded.state.rng,recaptured.packet.state.rng);
    const [diagnosticDownload]=await Promise.all([page.waitForEvent('download'),page.evaluate(()=>__AGENT_TEST_LINKS__.downloadDiagnostics())]);
    await diagnosticDownload.saveAs(`${out}/agent-command-diagnostics.json`);
    const diagnostic=JSON.parse(await readFile(`${out}/agent-command-diagnostics.json`,'utf8'));assert.equal(diagnostic.trace.format,1);assert.equal(diagnostic.replay.ok,true);
    checks.push('agent capture and diagnostic download commands');
  }
  if(stage==='research-filter-and-menu'){
    // Open a real card, then follow an actual linked keyword before capturing.
    await page.keyboard.press('Escape');
    const library=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.researchLibrary);
    const card=library.visibleCards[0];assert.ok(card);
    const box=await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x+card.point.x/2424*box.width,box.y+card.point.y/1080*box.height);
    await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().visible);
    const tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    const keyword=tooltip.keywords?.targets.find(target=>target.action.startsWith('term:'));
    assert.ok(keyword,'the card exposes a real keyword reference');
    await page.mouse.click(box.x+(keyword.x+keyword.width/2)/2424*box.width,box.y+(keyword.y+keyword.height/2)/1080*box.height);
    const expanded=await page.evaluate(async()=>{const result=await __AGENT_TEST_LINKS__.capture();return {packet:result.packet,url:result.url};});
    assert.ok(expanded.packet.view.panels.tooltip);
    assert.ok(expanded.packet.view.panels.tooltip.reference?.path.length);
    await writeFile(`${out}/research-capture.json`,JSON.stringify(expanded.packet));await writeFile(`${out}/research-link.txt`,expanded.url);
    // Close the source before following the self-contained URL. This proves
    // independence and keeps software-WebGL contexts within the probe budget.
    await page.close();
    const target=await context.newPage();await target.goto(expanded.url);await target.bringToFront();
    try {await target.waitForFunction(()=>{const status=globalThis.__AGENT_TEST_LINKS__?.getStatus();return status?.loaded||status?.lastError;});}
    catch(error){await writeFile(`${out}/research-entry-status.json`,JSON.stringify(await target.evaluate(()=>({ready:document.readyState,title:document.title,api:!!globalThis.__AGENT_TEST_LINKS__,status:globalThis.__AGENT_TEST_LINKS__?.getStatus(),body:document.body.innerText.slice(0,1800),urlLength:location.href.length})),null,2));throw error;}
    assert.equal((await target.evaluate(()=>__AGENT_TEST_LINKS__.getStatus())).lastError,null);
    const restored=await target.evaluate(async()=>{const c=await __AGENT_TEST_LINKS__.capture();return c.packet.view.panels.tooltip;});
    assert.equal(restored.spec.title,expanded.packet.view.panels.tooltip.spec.title);
    assert.deepEqual(restored.reference?.path,expanded.packet.view.panels.tooltip.reference?.path);
    checks.push('research-card-and-nested-keyword');await target.close();
  }
  checks.push(stage);if(!page.isClosed())await page.close();
 }
 if(!process.argv[3]||process.argv[3]==='entry-preview'){
  stage='startup forecast preview isolation';
  const page=await context.newPage();
  await page.route('**/src/views/ui-root-settlement-pixi.js',async route=>{
    const response=await route.fetch();let body=await response.text();
    const marker="report('decision-map');await vassalNodeDecisionModalView.prepare(app.renderer);}";
    assert.ok(body.includes(marker));
    // Force a forecast view to latch while entry is preparing, before the
    // final hold. This must not replace the captured authoritative cursor.
    const injected="const {serializeGameState,deserializeGameState}=await import('/src/model/state.js');const {updateGame,setPaused}=await import('/src/model/game-model.js');const preview=deserializeGameState(serializeGameState(runner.getCursorState()));setPaused(preview,false);for(let tick=0;tick<60;tick++)updateGame(1/60,preview);setPaused(preview,true);runner.setPreviewState(preview);globalThis.__TEST_ENTRY_PREVIEW__={tSec:preview.tSec,seed:preview.rng.seed};";
    body=body.replace(marker,marker.slice(0,-1)+injected+'}');await route.fulfill({response,body});
  });
  const encoded=await createTestCapture({state:normal,view:packet.view,source:packet.source,baseUrl:base.href});
  await page.goto(encoded.url);await page.bringToFront();await page.waitForFunction(()=>globalThis.__AGENT_TEST_LINKS__?.getStatus().loaded);
  const result=await page.evaluate(async()=>{const c=await __AGENT_TEST_LINKS__.capture();return {tSec:c.packet.state.tSec,rng:c.packet.state.rng,injected:globalThis.__TEST_ENTRY_PREVIEW__};});
  await writeFile(`${out}/startup-preview-check.json`,JSON.stringify({expected:{tSec:normal.tSec,rng:serializeGameState(normal).rng},...result},null,2));
  assert.equal(result.injected.tSec,normal.tSec+1);assert.equal(result.tSec,normal.tSec,'startup forecasts must not move the captured view');assert.deepEqual(result.rng,serializeGameState(normal).rng);
  await page.close();checks.push(stage);
 }
 if(!process.argv[3]||process.argv[3]==='file'){
  stage='file fallback';
  const large=clone(packet);large.view.annotation='file-fallback-probe '.repeat(280000);
  const [filePage]=await Promise.all([sourcePage.waitForEvent('popup'),sourcePage.evaluate(text=>__AGENT_TEST_LINKS__.openFile(text),JSON.stringify(large))]);
  await filePage.bringToFront();
  await filePage.waitForFunction(()=>{const s=globalThis.__AGENT_TEST_LINKS__?.getStatus();return s?.loaded||s?.lastError;});
  assert.equal((await filePage.evaluate(()=>__AGENT_TEST_LINKS__.getStatus())).lastError,null);
  await filePage.reload();await filePage.waitForFunction(()=>globalThis.__AGENT_TEST_LINKS__?.getStatus().loaded);await filePage.close();checks.push('large file import and refresh');
  stage='unknown panel rejection';const wrong=clone(packet);delete wrong.view.panels.map;wrong.view.panels.unrecognized={open:true};
  const invalid=await createTestCapture({state:deserializeGameState(wrong.state),view:wrong.view,source:wrong.source,baseUrl:base.href});
  const bad=await context.newPage();await bad.goto(invalid.url);await bad.bringToFront();await bad.waitForFunction(()=>globalThis.__AGENT_TEST_LINKS__?.getStatus().lastError);assert.equal(await bad.locator('[data-testid="agent-test-link-badge"]').count(),0);await bad.close();checks.push('unknown panel rejected before entry');
  stage='performance autolaunch isolation';
  const safe=await createTestCapture({state:normal,view:packet.view,source:packet.source,baseUrl:base.href});const attack=new URL(safe.url);attack.searchParams.set('perf','1');attack.searchParams.set('launch','new');
  const isolated=await context.newPage();await isolated.goto(attack.href);await isolated.bringToFront();await isolated.waitForFunction(()=>globalThis.__AGENT_TEST_LINKS__?.getStatus().loaded);
  assert.equal(await isolated.evaluate(()=>new URL(location.href).searchParams.has('perf')),false);await isolated.close();checks.push('performance autolaunch removed before entry');
 }
 const slotAfter=await sourcePage.evaluate(async()=>{const {readSaveSlot}=await import('/src/controllers/sim-runner/save-slots.js');return JSON.stringify(await Promise.all([1,'performance-dev'].map(async slot=>(await readSaveSlot(slot)).data)));});assert.equal(slotAfter,slotBefore,'occupied player and performance slots must remain unchanged');
 assert.deepEqual(errors,[]);
 if(finalCapture)await writeFile(`${out}/phone-capture.json`,JSON.stringify(finalCapture.packet));
 await writeFile(`${out}/checks.json`,JSON.stringify({ok:true,inventory:initial.inventory,checks,playerSlotUnchanged:true},null,2));
 console.log(JSON.stringify({ok:true,cases:checks.length,panels:initial.inventory.length,playerSlotUnchanged:true,artifacts:out}));
}catch(error){await writeFile(`${out}/failure.txt`,`${stage}\n${error.stack}\n${JSON.stringify(errors,null,2)}`);console.error(`Agent test-link browser probe failed: ${stage}; ${out}/failure.txt`);process.exitCode=1;}
finally{await browser.close();}
