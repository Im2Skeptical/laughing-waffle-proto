import assert from 'node:assert/strict';
import { sampleAtmosphere,atmospherePhase } from './atmosphere.js';
import { cloudBanks,cloudClearance } from './cloud-banks.js';
// Approved fog values from v1.0.23: cloud changes must not alter the fog.
for(const [x,y,t,expected] of [[-200,25,0,.3946422743699783],[321,117,60,.6061955230585269],[800,-200,997.125,.6185905813484168]])
  assert.equal(sampleAtmosphere(x,y,t,1867).fog,expected);
const world=[-1182,-387,3152,1032],coverage=[];
for(const t of [0,7.875,60,320,997,1600]) {
  for(let y=-200;y<600;y+=17)for(let x=-500;x<1200;x+=23) {
    const a=sampleAtmosphere(x,y,t,1867),b=sampleAtmosphere(x,y,t+.001,1867);
    assert.ok(a.fog>=0&&a.fog<=1);
    assert.ok(Math.abs(a.fog-b.fog)<.001);
    assert.deepEqual(sampleAtmosphere(x,y,t,1867),a);
  }
  const banks=cloudBanks(world,t,1867),next=new Map(cloudBanks(world,t+.001,1867).map(b=>[b.id,b]));
  assert.deepEqual(cloudBanks(world,t,1867),banks,'Exact absolute-time bank restoration');
  coverage.push(banks.reduce((n,b)=>n+b.alpha*b.width,0));
  for(const bank of banks) {
    assert.ok(bank.width>290&&bank.width<500,'Clouds remain substantial banks');
    assert.ok(bank.alpha>=.38&&bank.alpha<=.8);
    const b=next.get(bank.id);if(!b)continue;
    assert.ok(Math.hypot(b.x-bank.x,b.y-bank.y)<.001,'No motion pop-in');
    assert.ok(Math.abs(b.alpha-bank.alpha)<.001,'No opacity steps');
  }
}
assert.ok(Math.max(...coverage)-Math.min(...coverage)>100,'Long-span coverage varies');
assert.notDeepEqual(atmospherePhase(320,1867),atmospherePhase(320,1868));
assert.notDeepEqual(cloudBanks(world,320,1867),cloudBanks(world,320,1868));
const ids=new Int16Array(180*100).fill(-1);
for(let y=30;y<70;y++)for(let x=60;x<120;x++)ids[y*180+x]=0;
const mask=cloudClearance(ids,180,100,180,100);
assert.equal(mask[50*180+80],0,'Playable centre dissipates clouds');
assert.equal(mask[50*180+120],0,'No sharp opacity edge at region border');
let last=0;
for(let x=120;x<180;x++) {
  const alpha=mask[50*180+x];assert.ok(alpha>=last&&alpha-last<=4,'Broad, gradual fade');last=alpha;
}
assert.ok(last>100,'Clouds recover beyond playable area');
console.log('Atmosphere: approved fog unchanged; large seeded banks, continuous time/coverage, broad playable-area dissipation and exact restoration pass.');
