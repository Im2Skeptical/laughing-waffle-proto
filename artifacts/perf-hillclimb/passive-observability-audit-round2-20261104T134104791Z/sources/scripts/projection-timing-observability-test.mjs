import assert from 'node:assert/strict';
import {createProjectionCache} from '../src/model/timegraph/projection-cache.js';

// Storage-only purity fixture, not a playable workload or replay/timing proof.
const timeline={baseStateData:{},actions:[],historyEndSec:0,_actionContentVersion:0};
const cache=createProjectionCache();
assert.deepEqual(cache.getTimingSnapshot(),{signatureVersion:0,timelineToken:null,signatureMatches:null});
assert.equal(cache.getTimingSnapshot({timeline}).signatureMatches,false);
cache.ensureSignature(timeline);
cache.setStateData(16,{tSec:16,gameConfig:null});
const token=cache.getTimelineToken(timeline);
const before={size:cache.getSize(),bytes:cache.getApproxBytes(),keys:cache.getDebugSecondKeys(),meta:cache.getForecastMeta()};
const inspect=()=>cache.getTimingSnapshot({timeline,anchorSec:16});
assert.equal(inspect().timelineToken,token);assert.equal(inspect().signatureMatches,true);
assert.equal(inspect().hasRetainedAnchor,true);assert.equal(cache.getTimingSnapshot({timeline,anchorSec:17}).hasRetainedAnchor,false);
assert.equal(Object.hasOwn(cache.getTimingSnapshot({timeline}),'hasRetainedAnchor'),false);
const original=inspect();original.signatureVersion=-1;assert.notEqual(inspect().signatureVersion,-1);
const methods=['get','set','delete','clear','keys','values','entries','forEach',Symbol.iterator];
const saved=methods.map(name=>[name,Map.prototype[name]]);let underPoison;
try{
  for(const [name]of saved)Map.prototype[name]=()=>{throw new Error(`forbidden Map method ${String(name)}`);};
  underPoison=inspect();
}finally{for(const [name,method]of saved)Map.prototype[name]=method;}
assert.equal(underPoison.hasRetainedAnchor,true,'membership uses has without LRU reads or enumeration');
for(let i=0;i<1000;i++)inspect();
assert.deepEqual({size:cache.getSize(),bytes:cache.getApproxBytes(),keys:cache.getDebugSecondKeys(),meta:cache.getForecastMeta()},before);
timeline.actions.push({kind:'test-only-source-change',tSec:0});
assert.equal(inspect().signatureMatches,false);assert.equal(inspect().timelineToken,token,'stale token is reported without advancing signature');
assert.equal(inspect().hasRetainedAnchor,true,'querying a stale source does not clear retained storage');
cache.getTimelineToken(timeline);
assert.notEqual(inspect().timelineToken,token,'normal synchronizing accessor demonstrates the stale-source contrast');
assert.equal(inspect().hasRetainedAnchor,false,'normal signature invalidation really clears these anchors');
cache.setStateData(16,{tSec:16,gameConfig:null});timeline._actionContentVersion++;
assert.equal(inspect().signatureMatches,false,'official content-version edits invalidate source correspondence');
assert.equal(cache.getTimingSnapshot({timeline:null}).signatureMatches,null);
console.log('[projection-timing] passive signature/anchor membership, no LRU/enumeration, stale-source preservation and mutation-isolation controls passed');
