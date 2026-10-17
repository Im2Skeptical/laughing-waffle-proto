// The cloud frame memo must be invisible: identical silhouettes, and identical
// cloudBanks output to the unmemoised implementation (golden hash recorded from
// the original code across seeds, windows and times, including reverse and huge).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cloudBanks,cloudFrame,computeCloudFrame } from './cloud-weather.js';

// Memoised frames equal fresh computation, on first use and from the memo.
let compared=0;
for(const count of [4,8])for(const seed of [0,1,1867,-74123,2147483647,-2147483648]) {
  for(let pass=0;pass<2;pass++)for(let generation=-60;generation<240;generation++) {
    assert.equal(cloudFrame(seed,generation,count),computeCloudFrame(seed,generation,count));compared++;
  }
}
// Eviction (the memo clears when full) never changes answers.
for(let i=0;i<20000;i++)assert.equal(cloudFrame(i*7919,i%50,8),computeCloudFrame(i*7919,i%50,8));
for(const seed of [1867,-74123])for(let generation=0;generation<40;generation++)assert.equal(cloudFrame(seed,generation,8),computeCloudFrame(seed,generation,8));
// Different counts never share an entry.
assert.deepEqual(Array.from({length:16},(_,g)=>cloudFrame(1867,g,4)),Array.from({length:16},(_,g)=>computeCloudFrame(1867,g,4)));

const worlds=[[-400,-100,3152,1032],[200,150,640,480]];
const times=[];for(let i=0;i<90;i++)times.push(i*173.3+(i%7)*.013);
for(const t of [0,.001,-300,1e6,123456.789,96000])times.push(t);
const hash=createHash('sha256');let banks=0;
for(const seed of [1867,1,4294967295,20260101])for(const world of worlds)for(const t of times) {
  const out=cloudBanks(world,t,seed);banks+=out.length;hash.update(JSON.stringify(out));
}
const GOLDEN='f272c55d2e60597a64929d6124a58407ee6ed24f5de0d6a6f8bbbc887fda9d17';
assert.equal(banks,41369,'bank count');
assert.equal(hash.digest('hex'),GOLDEN,'cloudBanks output changed (hash recorded before the frame memo existed)');
// Repeating a query after the memo is warm gives the same bytes.
const a=JSON.stringify(cloudBanks(worlds[0],4321.5,1867)),b=JSON.stringify(cloudBanks(worlds[0],4321.5,1867));
assert.equal(a,b);
console.log(JSON.stringify({pass:true,framesCompared:compared,cloudBanksHashed:banks}));
