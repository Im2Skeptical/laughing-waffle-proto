import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root = pathToFileURL(process.cwd()+'/');
const {createProjectionCache}=await import(new URL('src/model/timegraph/projection-cache.js',root));
const {createTimeGraphController}=await import(new URL('src/model/timegraph/controller-core.js',root));
const checks=[];
function fixture(){const timeline={baseStateData:{},actions:[{tSec:2,payload:{value:1}}],historyEndSec:0,revision:1,checkpoints:[],_actionContentVersion:0};const cache=createProjectionCache();cache.ensureSignature(timeline);cache.setStateData(16,{tSec:16,gameConfig:null});return {cache,timeline};}
for(const [name,change] of [
 ['base identity',t=>{t.baseStateData={};}],['actions identity',t=>{t.actions=t.actions.slice();}],
 ['action count',t=>{t.actions.push({tSec:3});}],['last action identity',t=>{t.actions[0]={...t.actions[0]};}],
 ['last action second',t=>{t.actions[0].tSec++;}],['official content version',t=>{t._actionContentVersion++;}],
]) {const {cache,timeline}=fixture();const before=cache.getTimingSnapshot({timeline,anchorSec:16});const keys=cache.getDebugSecondKeys();change(timeline);for(let i=0;i<1000;i++){const observed=cache.getTimingSnapshot({timeline,anchorSec:16});assert.equal(observed.signatureMatches,false);assert.equal(observed.timelineToken,before.timelineToken);assert.equal(observed.hasRetainedAnchor,true);}assert.deepEqual(cache.getDebugSecondKeys(),keys);checks.push(name+': stale token/storage retained');}
{
 const {cache,timeline}=fixture();const before=cache.getTimingSnapshot({timeline,anchorSec:16});timeline.revision++;timeline.historyEndSec++;timeline.checkpoints.push({tSec:1});assert.deepEqual(cache.getTimingSnapshot({timeline,anchorSec:16}),before);checks.push('intentional checkpoint/revision/frontier churn does not change existing signature');
 timeline.actions[0].payload.value++;assert.equal(cache.getTimingSnapshot({timeline}).signatureMatches,true);checks.push('signature is explicitly not an arbitrary in-place-content/state hash');
 for(const anchorSec of [-1,.5,NaN,Infinity,'16',null,undefined])assert.equal(Object.hasOwn(cache.getTimingSnapshot({timeline,anchorSec}),'hasRetainedAnchor'),false);checks.push('invalid anchors are omitted');
}
{
 let calls=0;const {cache,timeline}=fixture();const controller=createTimeGraphController({projectionCache:cache,getTimeline:()=>{calls++;return timeline;},getCursorState:()=>{throw Error('cursor forbidden');}});
 controller.getTimingSnapshot();controller.getTimingSnapshot({anchorSec:16});assert.equal(calls,0);const s=controller.getTimingSnapshot({includeProjectionSource:true,anchorSec:16});assert.equal(calls,1);assert.equal(s.hasRetainedAnchor,null);assert.equal(s.projection.hasRetainedAnchor,true);assert.equal(s.projection.signatureMatches,true);checks.push('actual controller default/anchor-only calls no timeline; explicit query one raw read; cold graph != projection presence');
 const unsupported=createTimeGraphController({projectionCache:{},getTimeline:()=>{throw Error('missing reader must skip timeline');}});assert.equal(unsupported.getTimingSnapshot({includeProjectionSource:true}).projection,null);checks.push('unsupported optional projection reader remains null without timeline access');
 const absent=createTimeGraphController({projectionCache:cache,getTimeline:()=>null});assert.equal(absent.getTimingSnapshot({includeProjectionSource:true}).projection.signatureMatches,null);checks.push('missing timeline correspondence is unknown');
}
const report={verdict:'PASS: supplemental independent signature/passivity controls; Phase A NOT SOUND',checks};writeFileSync(new URL('./additional-projection-controls.json',import.meta.url),JSON.stringify(report,null,2));console.log('[audit-projection] PASS: '+checks.length+' supplemental controls');
