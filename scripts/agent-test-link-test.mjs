import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {createTestCapture,readTestCapture,parseTestCaptureFile,TEST_LINK_MAX_ENCODED,TEST_LINK_MAX_DECODED} from '../src/controllers/agent-test-links.js';
import {attachPlayerActionTrace} from '../src/controllers/player-action-trace.js';
import {createSimRunner} from '../src/controllers/sim-runner.js';
import {ActionKinds} from '../src/model/actions.js';
import {getVassalCandidatePool} from '../src/model/vassal-life-map.js';
import {createLifeDecisionController} from '../src/controllers/life-decision-controller.js';
import {selectedState} from '../src/model/tests/vassal-life-map/helpers.js';
import {prepareLifeChoices} from '../src/model/vassal-life-map/decision-preparation.js';

const source={version:'prototype-test',build:'fixed-test-source'};
const state=createNewGameState(735),before=serializeGameState(state);
const view={format:1,navigation:{mode:'map'},panels:{phase:{phaseId:'food'}}};
const capture=await createTestCapture({state,view,source,baseUrl:'http://example.test/?dev=1&perf=1&launch=new&seed=random'});
const target=new URL(capture.url);
assert.equal(target.searchParams.get('dev'),'1');assert.equal(target.searchParams.has('perf'),false);assert.equal(target.searchParams.has('launch'),false);
const loaded=await readTestCapture(target.hash,source);
assert.deepEqual(loaded.state,before);assert.deepEqual(loaded.view,view);
assert.deepEqual(serializeGameState(state),before,'capture must not mutate the source, RNG, or clock');
assert.deepEqual(parseTestCaptureFile(capture.text,source),loaded);
const entropy=Array.from({length:18000},(_,i)=>createHash('sha256').update(String(i)).digest('hex')).join('');
const fileOnly=await createTestCapture({state,view:{...view,annotation:entropy},source,baseUrl:'http://example.test/'});
assert.equal(fileOnly.needsFile,true);assert.equal(fileOnly.url,null);assert.ok(parseTestCaptureFile(fileOnly.text,source).view.annotation.length);
const nativeCompression=globalThis.CompressionStream;
try {globalThis.CompressionStream=undefined;const fallback=await createTestCapture({state,view,source,baseUrl:'http://example.test/'});assert.equal(fallback.needsFile,true);assert.ok(fallback.text);}
finally {globalThis.CompressionStream=nativeCompression;}
assert.equal(await readTestCapture('#/dev/play?state=ordinary-token',source),null);
await assert.rejects(readTestCapture(target.hash,{...source,build:'other'}),/different build/);
await assert.rejects(readTestCapture('#/dev/play?test=!!!!',source),/Invalid/);
await assert.rejects(readTestCapture(target.hash.slice(0,-12),source));
await assert.rejects(readTestCapture('#/dev/play?test='+'A'.repeat(TEST_LINK_MAX_ENCODED+1),source),/oversized/);
const bomb=gzipSync(' '.repeat(TEST_LINK_MAX_DECODED+1)).toString('base64url');
await assert.rejects(readTestCapture('#/dev/play?test='+bomb,source),/size limit/);
assert.throws(()=>parseTestCaptureFile(JSON.stringify({...loaded,state:{...before,gameStateSchemaVersion:50}}),source),/schema/);
await assert.rejects(createTestCapture({state:{...state,simStepIndex:1},view,source,baseUrl:'http://example.test/'}),/boundary/);

const plain=createSimRunner({}),traced=attachPlayerActionTrace(createSimRunner({}));
for(const runner of [plain,traced]){
  assert.equal(runner.resetToState(deserializeGameState(before),'test').ok,true);
  const pool=getVassalCandidatePool(runner.getState());
  assert.equal(runner.dispatchActionAtCurrentSecond(ActionKinds.SETTLEMENT_SELECT_VASSAL,{candidateIndex:0,expectedPoolHash:pool.expectedPoolHash}).ok,true);
}
assert.deepEqual(serializeGameState(traced.getState()),serializeGameState(plain.getState()),'journal must preserve state and every RNG stream');
assert.deepEqual(traced.getTimeline().actions,plain.getTimeline().actions);
const journal=traced.exportPlayerActionTrace();
assert.ok(journal.events.some(event=>event.operation==='dispatchActionAtCurrentSecond'));
assert.equal(traced.dispatchActionAtCurrentSecond('notAnAction',{}).ok,false);
assert.equal(traced.exportPlayerActionTrace().events.length,journal.events.length,'failed commands are not accepted player actions');
assert.equal(traced.resetToState(deserializeGameState(before),'another-run').ok,true);
assert.deepEqual(traced.exportPlayerActionTrace().events.slice(0,journal.events.length),journal.events,'reset never erases accepted command evidence');
assert.equal(traced.exportPlayerActionTrace().runs.length,2);

const initial=selectedState(1);const choices=await prepareLifeChoices(serializeGameState(initial));
const nodeId=Object.keys(choices)[0],entered=deserializeGameState(choices[nodeId].stateData);
const timeline={revision:1,historyEndSec:entered.tSec};
const makeController=()=>createLifeDecisionController({getRunner:()=>({getTimeline:()=>timeline}),getState:()=>entered});
const first=makeController();const decision=first.getPresentation(nodeId);const option=decision.nodeState.options.find(item=>item.enabled!==false);
assert.ok(option);
const result=first.dispatch(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:option.id});assert.equal(result.ok,true);
const draft=first.capturePanelState();assert.equal(draft.actions.length,1);
const second=makeController();second.restorePanelState(draft);
assert.deepEqual(serializeGameState(second.getState()),serializeGameState(first.getState()),'staged choice and RNG restore without committing to the runner');
console.log('[agent-test-links] OK: snapshot/panel transport, bounds, build pin, mutation isolation, trace parity and staged decision restoration');
