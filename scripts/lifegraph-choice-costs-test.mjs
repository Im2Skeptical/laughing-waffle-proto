import assert from 'node:assert/strict';
import {createLifegraphController} from '../src/controllers/lifegraph-controller.js';
import {getCurrentLifeMapVassal, getVassalNodeDecisionPresentation} from '../src/model/vassal-life-map.js';
import {generateShopInventory} from '../src/model/vassal-life-map/shop.js';
import {getVassalActionPhaseCost} from '../src/model/vassal-life-map/selectors.js';
import {resolveLifeMapOptionCosts,resolveLifeMapShopPrice,lifeMapPhasesPerYear} from '../src/model/life-map-balance.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {createTimelineFromInitialState,appendActionAtCursor,rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {ActionKinds,applyAction} from '../src/model/actions.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';

const memory=new Map(),store={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const c=createLifegraphController({store});c.update(['preview','stats'],0);
const before=c.getChoiceReview('development');
assert.equal(before.choices.length,3);
assert.ok(before.choices.every(o=>o.effects.length>0),'each Development choice shows its actual rolled effects');
const beforeRules=JSON.stringify(c.getSnapshot().draft.generatorConfig.design.optionCosts.development.hardLesson);
c.setOptionCost('development','deepStudy','time',3);
c.setOptionCost('development','deepStudy','prestige',9);
c.setOptionCost('development','deepStudy','risk',.25);
const edited=c.getChoiceReview('development');
assert.equal(edited.choices[0].base.time,3);assert.equal(edited.choices[0].base.prestige,9);assert.equal(edited.choices[0].base.risk,.25);
assert.ok(JSON.stringify(c.getSnapshot().draft.generatorConfig.design.optionCosts.development.hardLesson)===beforeRules,'one choice edit does not change a sibling’s assignment');
assert.ok(JSON.stringify(edited.choices.map(o=>o.effects))===JSON.stringify(before.choices.map(o=>o.effects)),'reading and tuning costs preserve seeded stat/reward rolls');
c.openType('development');let s=c.sandbox.getSnapshot(),node=s.vassal.lifeMap.nodeStates[s.nodeId],deep=node.options.find(o=>o.id==='deepStudy');
assert.equal(deep.phaseCost,3*lifeMapPhasesPerYear(s.state));assert.equal(deep.prestigeCost,9);assert.equal(deep.immediateDeathChance,.25);
assert.equal(node.options.find(o=>o.id==='hardLesson').prestigeCost,0);
c.setOptionCost('development','deepStudy','time','cheap');c.update(['generatorConfig','design','costBands','time','cheap'],5);
assert.equal(c.getChoiceReview('development').choices[0].base.time,5);
assert.equal(c.getChoiceReview('development').choices[2].base.time,5,'a shared preset changes every assigned choice');
c.setOptionCost('development','deepStudy','time',3);c.update(['generatorConfig','design','costBands','time','cheap'],6);
assert.equal(c.getChoiceReview('development').choices[0].base.time,3,'custom base values do not inherit later preset edits');
assert.equal(c.setOptionCost('development','deepStudy','risk',1.1).ok,false,'risk percentages above 100 are rejected');
assert.equal(c.getChoiceReview('development').choices[0].base.risk,.25,'rejected values preserve the last valid cost');
const exported=c.exportJson();assert.equal(c.importJson(exported).ok,true);
const restored=createLifegraphController({store});assert.equal(restored.getChoiceReview('development').choices[0].base.time,3);
const obsolete=JSON.parse(exported);obsolete.generatorConfig.schemaVersion=9;obsolete.reviews.development={notes:'Keep this review across cost-schema changes.',status:'open'};
const oldStore={getItem:key=>key==='civsurvivor.lifegraph-workbench.v1'?JSON.stringify(obsolete):null,setItem:()=>{}};
const fresh=createLifegraphController({store:oldStore});
assert.equal(fresh.getSnapshot().draft.reviews.development.notes,obsolete.reviews.development.notes,'independent notes survive replacement of obsolete cost rules');
assert.equal(fresh.getSnapshot().draft.generatorConfig.schemaVersion,11);assert.equal(fresh.getChoiceReview('development').choices[0].rule.time,'expensive');

// Preview and payment use the resolved option, not a node-wide multiplier or a
// different selected option. Stop at t=0 to inspect the committed reservation.
c.setOptionCost('development','deepStudy','risk','free');c.openType('development');s=c.sandbox.getSnapshot();
const tiny=deserializeGameState(serializeGameState(s.state));tiny.gameConfig.lifeMapGenerator.design.optionCosts.development.deepStudy.time=.001;
assert.equal(resolveLifeMapOptionCosts(tiny,{family:'development'},{id:'deepStudy'}).phaseCost,1,'a positive fractional base still spends at least one phase');
const phaseYears=lifeMapPhasesPerYear(s.state),state=s.state,timeline=createTimelineFromInitialState(state),prestige=s.vassal.prestige;
const act=(kind,payload)=>{assert.equal(appendActionAtCursor(timeline,{kind,payload,tSec:state.tSec},state).ok,true);const r=applyAction(state,{kind,payload},{isReplay:true});assert.equal(r.ok,true,r.reason);};
act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId:s.nodeId,optionId:'deepStudy'});
const decision=getVassalNodeDecisionPresentation(state,s.nodeId);
assert.equal(decision.projectedPrestige,prestige-9);
assert.equal(decision.mortalityEstimate.totalPhaseCost,3*phaseYears);
act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:s.nodeId});
assert.equal(getCurrentLifeMapVassal(state).prestige,prestige-9,'checkout charges the choice’s authored base');
initializeReplayClock(state,state.tSec);assert.equal(advanceReplayStateToSecond(state,getCurrentLifeMapVassal(state).lifeMap.pendingResolution.resolveSec).ok,true);
const replay=rebuildStateAtSecond(timeline,state.tSec);assert.equal(replay.ok,true);
const snapshot=x=>JSON.stringify({tSec:x.tSec,rng:x.rng,civilization:x.civilization,world:x.world});assert.ok(snapshot(replay.state)===snapshot(state),'edited choice costs and effects match authoritative tick replay');

// A stat reward cannot silently discount the same action after its quote.
let effectivenessChoice;
for(let seed=1;seed<=10&&!effectivenessChoice;seed++){
  c.update(['preview','seed'],seed);c.openType('development');s=c.sandbox.getSnapshot();
  effectivenessChoice=s.vassal.lifeMap.nodeStates[s.nodeId].options.find(o=>o.statId==='effectiveness');
}
assert.ok(effectivenessChoice,'seeded Development includes an Effectiveness reward');
const quotedTime=getVassalActionPhaseCost(s.vassal,effectivenessChoice.phaseCost,{nodeState:s.vassal.lifeMap.nodeStates[s.nodeId]});
assert.equal(applyAction(s.state,{kind:ActionKinds.VASSAL_SELECT_LIFE_OPTION,payload:{nodeId:s.nodeId,optionId:effectivenessChoice.id}},{isReplay:true}).ok,true);
assert.equal(applyAction(s.state,{kind:ActionKinds.VASSAL_CONFIRM_LIFE_NODE,payload:{nodeId:s.nodeId}},{isReplay:true}).ok,true);
assert.equal(s.vassal.lifeMap.pendingResolution.phaseCost,quotedTime,'the authored choice pays its quoted time before its own stat reward');

// Pricing uses the bought quality, not minimum maturity, source definition price
// or the old installed tier. A Scholar bonus is included before quoting.
c.setShopPrice('practice','diamond','prestige',37);c.setShopPrice('practice','diamond','time',1.5);
c.openType('stockShop');s=c.sandbox.getSnapshot();s.vassal.stats.cunning=40;s.vassal.stats.intelligence=0;s.vassal.stats.effectiveness=0;
node=s.vassal.lifeMap.nodeStates[s.nodeId];node.inventory=generateShopInventory(s.state,s.vassal,node);
assert.ok(node.inventory.length>0);assert.ok(node.inventory.every(o=>o.priceQuality==='diamond'));
for(const offer of node.inventory){assert.equal(offer.basePrestigeCost,37);assert.equal(offer.basePhaseCost,Math.round(1.5*lifeMapPhasesPerYear(s.state)));}
const shopDecision=getVassalNodeDecisionPresentation(s.state,s.nodeId);assert.ok(shopDecision.offers.every(o=>o.prestigeCost===37));
const shopTimeline=createTimelineFromInitialState(s.state),offer=node.inventory[0],shopPrestige=s.vassal.prestige;
const shopAct=(kind,payload)=>{assert.equal(appendActionAtCursor(shopTimeline,{kind,payload,tSec:s.state.tSec},s.state).ok,true);const r=applyAction(s.state,{kind,payload},{isReplay:true});assert.equal(r.ok,true,r.reason);};
shopAct(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:s.nodeId,offerId:offer.offerId});
assert.equal(node.purchasedOffers[0].prestigeCost,37);shopAct(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:s.nodeId});
assert.equal(s.vassal.prestige,shopPrestige-37);
initializeReplayClock(s.state,s.state.tSec);assert.equal(advanceReplayStateToSecond(s.state,s.vassal.lifeMap.pendingResolution.resolveSec).ok,true);
const shopReplay=rebuildStateAtSecond(shopTimeline,s.state.tSec);assert.equal(shopReplay.ok,true);assert.ok(snapshot(shopReplay.state)===snapshot(s.state),'type/quality shop payment matches replay');

const quoteA=resolveLifeMapShopPrice(s.state,{basePrestigeCost:999,intervention:{kind:'practice',mode:'learn',practiceId:'forage',resultingTier:'diamond'}});
const quoteB=resolveLifeMapShopPrice(s.state,{basePrestigeCost:1,intervention:{kind:'practice',mode:'upgrade',practiceId:'logging',tier:'bronze',resultingTier:'diamond'}});
assert.equal(quoteA.basePrestigeCost,quoteB.basePrestigeCost,'same type and bought quality always have the same base price');
const structurePrice=s.state.gameConfig.lifeMapGenerator.design.shopPricing.prices.structure.gold;
const structure=resolveLifeMapShopPrice(s.state,{intervention:{kind:'structure',mode:'add',tier:'bronze',qualityBonus:2}});
assert.equal(structure.priceQuality,'gold');assert.equal(structure.basePrestigeCost,structurePrice.prestige);

c.update(['preview','classId'],'warrior');c.setOptionCost('campaign','duel','risk',.2);c.setOptionCost('campaign','duel','time',1);c.openType('campaign');s=c.sandbox.getSnapshot();
const duel=s.vassal.lifeMap.nodeStates[s.nodeId].options.find(o=>o.mode==='duel');assert.equal(duel.risk,20);assert.equal(duel.phaseCost,lifeMapPhasesPerYear(s.state));
c.update(['preview','stats'],10);c.setOptionCost('campaign','duel','risk','free');c.setOptionCost('campaign','duel','prestige',7);c.openType('campaign');s=c.sandbox.getSnapshot();
node=s.vassal.lifeMap.nodeStates[s.nodeId];
const paidDuel=node.options.find(o=>o.mode==='duel'),campaignTime=getVassalActionPhaseCost(s.vassal,paidDuel.phaseCost,{nodeState:node});
assert.ok(campaignTime<paidDuel.phaseCost,'authored Campaign base times receive ordinary discounts');
const campaignTimeline=createTimelineFromInitialState(s.state);
for(const [kind,payload]of [[ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId:s.nodeId,optionId:paidDuel.id}],[ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:s.nodeId}]]){
  assert.equal(appendActionAtCursor(campaignTimeline,{kind,payload,tSec:s.state.tSec},s.state).ok,true);
  assert.equal(applyAction(s.state,{kind,payload},{isReplay:true}).ok,true);
}
assert.equal(s.vassal.lifeMap.pendingResolution.phaseCost,campaignTime,'Campaign resolution uses the same discounted cost as its preview');
initializeReplayClock(s.state,s.state.tSec);assert.equal(advanceReplayStateToSecond(s.state,s.vassal.lifeMap.pendingResolution.resolveSec).ok,true);
const campaignReplay=rebuildStateAtSecond(campaignTimeline,s.state.tSec);assert.equal(campaignReplay.ok,true);assert.ok(snapshot(campaignReplay.state)===snapshot(s.state),'authored Campaign costs match authoritative replay');
c.update(['preview','stats'],0);
c.openType('stockShop');s=c.sandbox.getSnapshot();
const beforeReject=serializeGameState(s.state);
assert.equal(applyAction(s.state,{kind:ActionKinds.VASSAL_REROLL_SHOP,payload:{nodeId:s.nodeId}},{isReplay:true}).reason,'scholarRequired');
assert.deepEqual(serializeGameState(s.state),beforeReject,'rejected non-Scholar rerolls spend no resources or RNG');
const baseline=deserializeGameState(serializeGameState(s.state));baseline.gameConfig.lifeMapGenerator.design.enabled=false;
assert.equal(resolveLifeMapOptionCosts(baseline,{family:'development'},{id:'deepStudy',phaseCost:17}).phaseCost,17,'baseline retains existing authored behavior');
console.log('[lifegraph-choice-costs] independent choice bases/presets, effects, custom values, validation, persistence, shop quality/bonuses, checkout and authoritative replay OK');
