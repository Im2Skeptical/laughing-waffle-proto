import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import './feedback-bindings-passive-test.mjs';

const poison=()=>{throw Error('forbidden active call');};
const sources={};
async function source(file){const s=await readFile(file,'utf8');sources[file]=createHash('sha256').update(s).digest('hex');return s;}
async function getter(file,name,env){
 const s=await source(file),m=s.match(new RegExp(`${name}: (\\(\\) => \\(\\{[\\s\\S]*?\\}\\))[,]`));assert.ok(m,name);
 return vm.runInNewContext(`(${m[1]})`,{getState:poison,getSnapshot:poison,getCursorState:poison,getBounds:poison,render:poison,...env});
}
const timeLever={visible:true},leverLabel={visible:true,text:'HOLD'},leverHandle={y:84};
const lever=await getter('src/views/time-lever-pixi.js','getRetainedFeedbackSnapshot',{timeLever,leverLabel,leverHandle});
const controlsRoot={visible:true};
const controls=await getter('src/views/time-controls-pixi.js','getRetainedFeedbackSnapshot',{root:controlsRoot,timeLeverView:{getRetainedFeedbackSnapshot:lever}});
const dragSession={coasting:true,velocity:12.5,diskId:'moon',visualTargetSec:25.5};
const momentum=await getter('src/views/sunandmoon-disks-pixi.js','getRetainedMomentumSnapshot',{dragSession});
const playback=await getter('src/views/ui-root/settlement-playback.js','getRetainedPlaybackSnapshot',{
 settlementPlaybackSpeedTarget:-1,settlementPlaybackSpeedCurrent:-1,settlementPlaybackViewSecFloat:25.5});
const originals=JSON.stringify({timeLever,leverLabel,leverHandle,controlsRoot,dragSession});
function primitive(dto){for(const value of Object.values(dto)){if(value!==null&&typeof value==='object')primitive(value);else assert.ok(value===null||['boolean','number','string'].includes(typeof value),'raw primitive type');}}
for(let i=0;i<500;i++){
 const a=controls(),b=momentum(),c=playback();primitive(a);primitive(b);primitive(c);
 assert.equal(typeof a.lever.handleY,'number');assert.equal(typeof a.lever.label,'string');
 assert.equal(typeof b.velocity,'number');assert.equal(typeof b.coasting,'boolean');
 assert.equal(c.target,-1);a.lever.label='mutated';b.velocity=999;c.current=999;
}
assert.equal(JSON.stringify({timeLever,leverLabel,leverHandle,controlsRoot,dragSession}),originals);

// Execute exact installed callback text and root pause function in isolation.
// Product bytes are authenticated above/below; only dependencies are test doubles.
const graph=await source('src/views/timegraphs-pixi.js'),root=await source('src/views/ui-root-settlement-pixi.js');
const handler=graph.match(/plotHit\.on\("pointerdown", (\(e\) => \{[\s\S]*?\n  \})\);/);assert.ok(handler);
const pause=root.match(/function requestPauseBeforeDrag\(\) \{[\s\S]*?\n\}/);assert.ok(pause);
assert.match(root,/onScrubStart: requestPauseBeforeDrag,/,'actual graph wiring');
function check(callback){
 const calls=[],state={target:1,current:1,coasting:true};
 const held=()=>{assert.equal(state.target,0);assert.equal(state.current,0);assert.equal(state.coasting,false);};
 const env={sunMoonDisksView:{stopMomentum:()=>{calls.push('stop');state.coasting=false;}},
 settlementGraphView:{suspendForecastRevealPlayheadFollow:()=>calls.push('root-follow')},
 setSettlementPlaybackTarget:v=>{state.target=v;state.current=v;calls.push('hold');},ensureSettlementRunnerPaused:()=>calls.push('paused'),
 scrub:{},beginScrubSession:()=>{held();calls.push('begin');},suspendForecastRevealPlayheadFollow:()=>calls.push('graph-follow'),
 updateScrubFromPointer:()=>{held();calls.push('pointer');},applyPreviewThrottled:()=>{held();calls.push('preview');}};
 const context=vm.createContext(env);vm.runInContext(`${pause[0]};globalThis.onScrubStart=requestPauseBeforeDrag;`,context);
 vm.runInContext(`(${callback})({global:{x:1,y:2}})`,context);
 assert.deepEqual(calls,['stop','root-follow','hold','paused','begin','graph-follow','pointer','preview']);
}
check(handler[1]);
assert.throws(()=>check(handler[1].replace('onScrubStart?.();','')),'bypassed Hold rejected');
assert.throws(()=>check(handler[1].replace('onScrubStart?.();','').replace('beginScrubSession(scrub);','beginScrubSession(scrub); onScrubStart?.();')),'late Hold rejected');
console.log('[hold-source] PASS: actual getters500 raw typed/copy/poison reads; exact source callback order; bypass/late Hold rejected');
export {sources};
