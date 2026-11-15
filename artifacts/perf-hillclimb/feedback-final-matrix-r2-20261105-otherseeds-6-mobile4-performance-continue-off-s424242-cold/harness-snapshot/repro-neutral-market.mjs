// Deterministic red-capable public-action/official-tick repro. No direct board,
// class, allegiance or neutral flags are modified; failures retain full evidence.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createNewGameState} from '../../src/model/new-game.js';
import {applyAction} from '../../src/model/actions.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../../src/model/replay-second-runner.js';
import {serializeGameState,deserializeGameState} from '../../src/model/state.js';

const fixturePath=process.argv[2]??'scripts/perf-hillclimb/fixtures/neutral-market-99117.json';
const output=process.argv[3]??'artifacts/perf-hillclimb/neutral-market-repro';
const evidence=JSON.parse(await readFile(fixturePath,'utf8'));
await mkdir(output,{recursive:true});
const state=createNewGameState(99117);initializeReplayClock(state,0);
const omit=new Set(String(process.env.HC_REPRO_OMIT??'').split(',').filter(Boolean).map(Number));
let symptom=null,lastValid=serializeGameState(state),prefix=[];
function validate(stage){
  const data=serializeGameState(state);
  try{deserializeGameState(data);lastValid=data;}
  catch(error){
    if(!/neutral market cannot install gamepieces/.test(error.message))throw error;
    symptom={stage,second:Math.floor(state.tSec),error:error.message,trace:structuredClone(prefix),
      sites:data.world.sites.filter(s=>s.neutral&&s.detailedState.structureSlots.some(Boolean)).map(s=>({id:s.id,neutral:!!s.neutral,
        controller:data.world.regions.find(r=>r.id===s.regionId)?.controller,structures:s.detailedState.structureSlots.filter(Boolean).map(p=>p.structureId)}))};
    return false;
  }
  return true;
}
try{
  for(let index=0;index<evidence.trace.length&&!symptom;index++){
    if(omit.has(index))continue;
    const action=evidence.trace[index];
    if(Math.floor(state.tSec)<action.second){
      const result=advanceReplayStateToSecond(state,action.second);assert.equal(result.ok,true,`official ticks before step ${index}`);
      if(!validate(`advance-before-${index}`))break;
    }
    const result=applyAction(state,{kind:action.kind,payload:action.payload,tSec:action.second},{isReplay:true});
    assert.equal(result.ok,true,`recorded action ${index} must remain legal: ${result.reason}`);
    prefix.push({index,...action});if(!validate(`action-${index}`))break;
  }
  if(!symptom&&Number.isFinite(evidence.targetSec)&&Math.floor(state.tSec)<evidence.targetSec){
    const result=advanceReplayStateToSecond(state,evidence.targetSec);assert.equal(result.ok,true,'final official ticks');validate('final-advance');
  }
  assert.ok(symptom,'expected exact neutral-market serialization symptom (red until fixed)');
  await writeFile(`${output}/before.json`,JSON.stringify(lastValid));
  await writeFile(`${output}/after.json`,JSON.stringify(serializeGameState(state)));
  await writeFile(`${output}/repro.json`,JSON.stringify(symptom,null,2));
  await writeFile(`${output}/minimal-fixture.json`,JSON.stringify({seed:99117,trace:prefix.map(({index,...action})=>action),targetSec:symptom.second}));
  console.error(`[neutral-market-repro] FAIL ${symptom.stage} t=${symptom.second}: ${symptom.error}; ${output}/repro.json`);
  process.exitCode=1;
}catch(error){
  if(!symptom){const invalid=/recorded action|official ticks/.test(error.message);
    await writeFile(`${output}/result.json`,JSON.stringify({symptom:false,invalidItinerary:invalid,error:error.message}));
    console.log(`[neutral-market-repro] ${invalid?'INVALID ITINERARY':'SYMPTOM ABSENT'}: ${error.message.split('\n')[0]}`);process.exitCode=invalid?2:0;}
  else throw error;
}
