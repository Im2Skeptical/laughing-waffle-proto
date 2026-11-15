// Harness fixtures are ordinary current-rules games with recorded public actions.
// Nothing here is a timing result. No gameplay settings or tick shortcuts.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNewGameState} from '../../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../../src/model/state.js';
import {ActionKinds as K, applyAction} from '../../src/model/actions.js';
import {getVassalCandidatePool, getCurrentLifeMapVassal, getVassalNodeDecisionPresentation} from '../../src/model/vassal-life-map.js';
import {createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond,maintainCheckpoints} from '../../src/model/timeline/index.js';
import {initializeReplayClock, advanceReplayStateOneSecond} from '../../src/model/replay-second-runner.js';
import {exportSave} from '../../src/controllers/sim-runner/save-slots.js';

export const digest = value => createHash('sha256').update(typeof value === 'string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');

export function createFixtures(seed = 123) {
  const state = createNewGameState(seed);
  const timeline = createTimelineFromInitialState(state);
  const fixtures = {};
  const trace=[];
  const dispatch = (kind,payload) => {
    const action = {kind,payload,tSec:Math.floor(state.tSec)};
    const result = applyAction(state,action,{isReplay:true});
    assert.equal(result.ok,true,`${kind}: ${result.reason}`);
    appendActionAtCursor(timeline,action,state);
    trace.push({second:action.tSec,kind,payload});
    return result;
  };
  const capture = id => {
    timeline.cursorSec = timeline.historyEndSec = Math.floor(state.tSec);
    // Use the public replay to construct the saved state. This also catches bad
    // fixture action recording without inventing a serializer-normalization rule.
    const rebuilt = rebuildStateAtSecond(timeline,timeline.cursorSec);
    assert.equal(rebuilt.ok,true,`fixture replay ${id}`);
    const serialized = serializeGameState(rebuilt.state);
    const saved = exportSave({state:rebuilt.state,timeline,setupId:`hillclimb:${id}`});
    assert.equal(saved.ok,true);
    // Fixture identities must not vary with generation wall time.
    const envelope=JSON.parse(saved.text);
    envelope.meta.savedAt='2026-11-04T00:00:00.000Z';
    saved.meta=envelope.meta; saved.text=JSON.stringify(envelope);
    fixtures[id] = {id,seed,text:saved.text,meta:saved.meta,sha256:digest(saved.text),
      stateSha256:digest(serialized),seconds:timeline.cursorSec,actions:timeline.actions.length,
      checkpoints:timeline.checkpoints.length,characters:saved.text.length,trace:structuredClone(trace),
      expected:{baseSeed:serialized.rng.baseSeed,second:Math.floor(serialized.tSec),
        lineage:serialized.civilization.vassalLineage.currentVassalId,
        practiceSlots:serialized.world.sites.filter(s=>s.detailedState).map(s=>({regionId:s.regionId,count:s.detailedState.practiceSlots.length}))}};
  };
  const advance = target => {
    initializeReplayClock(state,Math.floor(state.tSec));
    while(Math.floor(state.tSec)<target){
      const result=advanceReplayStateOneSecond(state);
      assert.equal(result.ok,true,'fixture uses every official simulation second');
      maintainCheckpoints(timeline,state);
      if(state.runStatus?.complete)break;
    }
  };
  capture('ordinary');
  dispatch(K.SETTLEMENT_SELECT_VASSAL,{candidateIndex:0,expectedPoolHash:getVassalCandidatePool(state).expectedPoolHash});
  capture('selected');
  const nodeId=getCurrentLifeMapVassal(state).lifeMap.availableNodeIds[0];
  dispatch(K.VASSAL_ENTER_LIFE_NODE,{nodeId});
  dispatch(K.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:'random'});
  capture('shop');
  const presentation=getVassalNodeDecisionPresentation(state,nodeId);
  const offer=presentation.offers.find(o=>o.canStage);
  assert.ok(offer,'ordinary first shop has a stageable offer');
  const purchase=dispatch(K.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:offer.offerId});
  assert.equal(purchase.ok,true);
  dispatch(K.VASSAL_CONFIRM_LIFE_NODE,{nodeId});
  const target=getCurrentLifeMapVassal(state).lifeMap.pendingResolution.resolveSec;
  advance(target);
  capture('history');
  // Full state/replay equality including RNG is an oracle, not timing evidence.
  assert.deepEqual(serializeGameState(rebuildStateAtSecond(timeline,target).state),serializeGameState(state),
    'nontrivial fixture live/replay identity');
  let stop='fixed six-node continuation completed';
  // Fixed first-legal itinerary, not a search for unusually fast/safe runs.
  // Ordinary deaths/losses are retained in the corpus and described explicitly.
  try {for(let turn=0;turn<5;turn++) {
    const v=getCurrentLifeMapVassal(state);
    if(state.runStatus?.complete||!v||v.isDead){stop=state.runStatus?.complete?'ordinary civilization loss':`vassal ended: ${v?.endedReason??'absent'}`;break;}
    const level=v.developmentChoiceQueue?.[0];
    if(level)dispatch(K.VASSAL_CHOOSE_DEVELOPMENT_STAT,{choiceId:level.choiceId,statId:level.offeredStatIds[0]});
    if(v.commissionOffers?.length)dispatch(K.VASSAL_CHOOSE_COMMISSION,{offerId:v.commissionOffers[0].offerId});
    const next=v.lifeMap.availableNodeIds[0];
    if(!next){stop='no reachable next node';break;}
    dispatch(K.VASSAL_ENTER_LIFE_NODE,{nodeId:next});
    let d=getVassalNodeDecisionPresentation(state,next);
    if(d.shopTagChoices?.length){
      const choice=d.shopTagChoices.find(c=>c.id==='random'&&c.enabled)??d.shopTagChoices.find(c=>c.enabled);
      if(!choice){stop='no enabled shop category';break;}
      dispatch(K.VASSAL_SELECT_LIFE_OPTION,{nodeId:next,optionId:choice.id});
      d=getVassalNodeDecisionPresentation(state,next);
    }
    if(d.options?.length){
      const option=d.options.find(option=>{
        const trial=deserializeGameState(serializeGameState(state));
        return applyAction(trial,{kind:K.VASSAL_SELECT_LIFE_OPTION,payload:{nodeId:next,optionId:option.id}},{isReplay:true}).ok;
      });
      if(!option){stop='no legal ordinary option';break;}
      dispatch(K.VASSAL_SELECT_LIFE_OPTION,{nodeId:next,optionId:option.id});
    }
    const trial=deserializeGameState(serializeGameState(state));
    const payload={nodeId:next,...(d.node.family==='relic'||d.nodeState.rewardAcquisition?{acquire:{destination:'decline'}}:{})};
    const confirm=applyAction(trial,{kind:K.VASSAL_CONFIRM_LIFE_NODE,payload},{isReplay:true});
    if(!confirm.ok){stop=`ordinary node cannot confirm: ${confirm.reason}`;break;}
    dispatch(K.VASSAL_CONFIRM_LIFE_NODE,payload);
    const pending=getCurrentLifeMapVassal(state)?.lifeMap.pendingResolution;
    if(pending)advance(pending.resolveSec);
  }
  // Include an off-anchor frontier using real elapsed time, subject to normal loss.
  if(!state.runStatus?.complete)advance(Math.floor(state.tSec)+1);
  capture('later-history');fixtures['later-history'].itineraryStop=stop;
  const rebuilt=rebuildStateAtSecond(timeline,timeline.cursorSec);
  assert.deepEqual(serializeGameState(rebuilt.state),serializeGameState(state),'later history exact replay and RNG');
  }catch(error){
    error.fixtureTrace=structuredClone(trace);error.fixtureStateData=serializeGameState(state);
    error.partialFixtures=fixtures;throw error;
  }
  return fixtures;
}

if (process.argv[1]?.replaceAll('\\','/').endsWith('/perf-hillclimb/fixtures.mjs')) {
  const fixtures=createFixtures();
  console.log(JSON.stringify(Object.values(fixtures).map(({text,...meta})=>meta)));
}
