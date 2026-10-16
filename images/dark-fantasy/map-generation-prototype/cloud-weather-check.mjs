import assert from 'node:assert/strict';
import { cloudBanks,cloudFrame,CLOUD_FAMILIES } from './cloud-weather.js';

for(const seed of [0,1867,-74123])for(let bag=-3;bag<20;bag++) {
  const frames=Array.from({length:8},(_,i)=>cloudFrame(seed,bag*8+i));
  assert.equal(new Set(frames).size,8,'Every local eight-episode bag uses every silhouette');
  assert.notEqual(frames[0],cloudFrame(seed,bag*8-1),'No adjacent repeated silhouettes, including bag boundaries');
}

const world=[-1182,-387,3152,1032],small=[0,0,300,200];
const variants=CLOUD_FAMILIES.map(()=>new Set()),counts=[],area=[];
for(let t=0;t<=9600;t+=80) {
  const banks=cloudBanks(world,t,1867),next=new Map(cloudBanks(world,t+.001,1867).map(b=>[b.id,b]));
  assert.deepEqual(cloudBanks(world,t,1867),banks,'Absolute-time restore');
  const centre=banks.filter(b=>b.x>=world[0]&&b.x<=world[0]+world[2]&&b.y>=world[1]&&b.y<=world[1]+world[3]);
  counts.push(centre.filter(b=>b.life>.35).length);
  area.push(centre.reduce((n,b)=>n+b.width*b.height*b.alpha*b.life,0));
  for(const bank of banks) {
    variants[bank.family].add(bank.frame);
    assert.ok(bank.life>=0&&bank.life<=1&&bank.alpha>0&&bank.alpha<.8);
    assert.ok(bank.width>100&&bank.width<750&&bank.height>0);
    const b=next.get(bank.id);if(!b)continue;
    assert.ok(Math.hypot(b.x-bank.x,b.y-bank.y)<.001,'Continuous motion');
    assert.ok(Math.abs(b.life-bank.life)<.0001,'Continuous episode development');
    assert.ok(Math.abs(b.width-bank.width)<.002,'Continuous size changes');
  }
}
for(const [i,frames] of variants.entries())assert.equal(frames.size,8,`${CLOUD_FAMILIES[i].id}: all eight variants used`);
assert.ok(counts.reduce((a,b)=>a+b)/counts.length<15,'Sparse cloud cover (v129 averaged about 18 full banks)');
const oldIds=new Set(cloudBanks(world,0,1867).map(b=>b.id));
assert.ok(cloudBanks(world,9600,1867).every(b=>!oldIds.has(b.id)),'Clouds are finite episodes, not immortal looping sprites');
assert.notDeepEqual(cloudBanks(world,320,1867),cloudBanks(world,320,1868),'Seed changes weather');
for(const t of [0,1599,4800,9600]) {
  const cropped=new Map(cloudBanks(small,t,1867).map(b=>[b.id,b]));
  for(const b of cloudBanks(world,t,1867)) {
    const r=Math.hypot(b.width,b.height)/2;
    if(b.x+r>=0&&b.x-r<=300&&b.y+r>=0&&b.y-r<=200)
      assert.deepEqual(cropped.get(b.id),b,'Culling must preserve every overlapping cloud');
  }
  const next=new Map(cloudBanks(world,t+100,1867).map(b=>[b.id,b]));
  const drift=cloudBanks(world,t,1867).filter(b=>next.has(b.id)).map(b=>({x:next.get(b.id).x-b.x,y:next.get(b.id).y-b.y}));
  assert.ok(Math.max(...drift.map(d=>d.x))-Math.min(...drift.map(d=>d.x))>10,'Independent bank speed');
  assert.ok(Math.max(...drift.map(d=>d.y))-Math.min(...drift.map(d=>d.y))>5,'Independent bank heading');
}
console.log(JSON.stringify({pass:true,familyVariants:variants.map(v=>v.size),
  meanDevelopedBanks:+(counts.reduce((a,b)=>a+b)/counts.length).toFixed(1),
  meanWeightedArea:Math.round(area.reduce((a,b)=>a+b)/area.length),noImmortalClouds:true}));
