import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';import fs from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState} from '../src/model/state.js';
import {selectLifeMapVassal,getCurrentLifeMapVassal,getVassalCandidatePool,enterVassalLifeNode,selectVassalNodeOption} from '../src/model/vassal-life-map.js';
fs.mkdirSync('artifacts/full-map-implementation',{recursive:true});
const state=createNewGameState(1867),l=state.civilization.vassalLineage;l.establishedClassId=l.founderClassId='warrior';
const candidate={...getVassalCandidatePool(state).candidates[0],classId:'warrior',founderClassId:null,archetype:'Warrior',age:18};assert(selectLifeMapVassal(state,0,null,candidate).ok);
const v=getCurrentLifeMapVassal(state);v.locationRegionId=state.civilization.remnant.capitalRegionId;v.stats.cunning=0;
const node=v.lifeMap.graph.nodes.find(n=>n.family==='practiceReform');v.lifeMap.availableNodeIds=[node.id];assert(enterVassalLifeNode(state,node.id).ok);assert(selectVassalNodeOption(state,node.id,'random').ok);
const ns=v.lifeMap.nodeStates[node.id],d=state.world.sites.find(s=>s.regionId===v.locationRegionId).detailedState;
d.practiceSlots[4]={practiceId:'fe_rationRoll',instanceId:'probe:hostile',allegiance:'external-a',tier:'bronze',charge:0,work:0};
ns.inventory=[{offerId:'probe:install',label:'Oath Supper',basePrestigeCost:10,basePhaseCost:12,baseCurrencyCost:0,intervention:{kind:'practice',mode:'learn',practiceId:'fm_oathSupper',resultingTier:'bronze',targetRegionId:v.locationRegionId}}];state.civilization.prestige=15;
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:5185/');const token='11111111-1111-4111-8111-111111111111';await page.evaluate(({data,token})=>localStorage.setItem('full-map-redesign-v1.development-lab.handoff.'+token,JSON.stringify(data)),{data:serializeGameState(state),token});await page.goto('http://localhost:5185/#/dev/play?state='+token);await page.reload();
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__,null,{timeout:120000});
 const tap=async(method,arg)=>{const p=await page.evaluate(([m,a])=>__SETTLEMENT_DEBUG__[m](a),[method,arg]);assert(p,method);const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);};
 const present=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('present'));if(present)await tap('getNavigationClickPoint','present');await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('life'),null,{timeout:120000});await tap('getNavigationClickPoint','life');await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().navigation.mode==='vassalLife');await tap('getLifeMapNodeClickPoint',node.id);
 const ready=()=>page.waitForFunction(()=>{const d=__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision;return d.open&&d.animation.phase==='open'&&!d.interactionPending;},null,{timeout:120000});await ready();
 const decision=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
 const initial=await decision();assert.equal(initial.currentPrestige,15);
 const iron=initial.boardPools.rows.find(r=>r.practiceId==='cp_ironCommunion');assert.equal(iron.output.multiplier,2);assert.equal(iron.capacity.multiplier,2);
 for(const kind of ['output','capacity']){
   const p=initial.boardPoolFittings.find(p=>p.practiceId==='cp_ironCommunion'&&p.kind===kind);assert(p);
   const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);
   await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolMultiplier===2);
   if(kind==='capacity')await page.screenshot({path:'artifacts/full-map-implementation/phone-citadel-multiplier.png'});
   await page.keyboard.press('Escape');await ready();
 }
 await tap('getLifeMapOfferClickPoint',0);await ready();
 let staged=await decision();if(!staged.purchaseOrder.length){await tap('getLifeMapTableauClickPoint',4);await ready();staged=await decision();}
 assert.equal(staged.purchaseOrder.length,1);assert.equal(staged.costPanels[0].prestigeCost,15);assert.equal(staged.costPanels[0].monsterPressureCost,10);assert.equal(staged.projectedPrestige,0);assert(staged.discardedPractices.some(p=>p.instanceId==='probe:hostile'));
 fs.writeFileSync('artifacts/full-map-implementation/draft-ui.json',JSON.stringify({initial,staged,errors},null,2));await page.screenshot({path:'artifacts/full-map-implementation/phone-hostile-draft.png'});
 await tap('getLifeMapUndoClickPoint',0);await ready();assert.equal((await decision()).projectedPrestige,15);assert.deepEqual(errors,[]);console.log('full-map draft touch: separate Citadel multiplier ledgers, hostile replacement, live receipt, discarded institution, undo passed');
}catch(e){fs.writeFileSync('artifacts/full-map-implementation/draft-ui-failure.json',JSON.stringify({error:e.message,errors,snapshot:await page.evaluate(()=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();return {navigation:s?.navigation,decision:s?.lifeMapDecision};})},null,2));console.log(e.stack);process.exitCode=1;}finally{await browser.close();}
