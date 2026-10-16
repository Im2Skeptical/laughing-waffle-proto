import assert from 'node:assert/strict';
import { cloudBanks,cloudFrame,CLOUD_FAMILIES } from './cloud-weather.js';
import { cloudOpening,cloudWeatherTime } from './cloud-cover.js';

for(const count of [4,8])for(const seed of [0,1867,-74123])for(let bag=-3;bag<20;bag++) {
  const frames=Array.from({length:count},(_,i)=>cloudFrame(seed,bag*count+i,count));
  assert.equal(new Set(frames).size,count,'Every local episode bag uses every silhouette');
  assert.notEqual(frames[0],cloudFrame(seed,bag*count-1,count),'No adjacent repeated silhouettes, including bag boundaries');
}

const world=[-1182,-387,3152,1032],small=[0,0,300,200];
const variants=CLOUD_FAMILIES.map(()=>new Set()),counts=[],area=[];
for(let t=0;t<=9600;t+=80) {
  const banks=cloudBanks(world,t,1867),next=new Map(cloudBanks(world,t+.001,1867).map(b=>[b.id,b]));
  assert.deepEqual(cloudBanks(world,t,1867),banks,'Absolute-time restore');
  const centre=banks.filter(b=>b.x>=world[0]&&b.x<=world[0]+world[2]&&b.y>=world[1]&&b.y<=world[1]+world[3]);
  counts.push(centre.filter(b=>!b.sparse&&b.life>.35).length);
  area.push(centre.filter(b=>!b.sparse).reduce((n,b)=>n+b.width*b.height*b.alpha*b.life,0));
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
for(const [i,frames] of variants.entries())assert.equal(frames.size,CLOUD_FAMILIES[i].frames,`${CLOUD_FAMILIES[i].id}: all variants used`);
const meanArea=area.reduce((a,b)=>a+b)/area.length;
assert.ok(meanArea>2200000&&meanArea<5000000,'Broad bank footprint restored, not isolated v130 pieces');
assert.ok(counts.reduce((a,b)=>a+b)/counts.length<32,'Bounded population of substantial banks');
const oldIds=new Set(cloudBanks(world,0,1867).map(b=>b.id));
assert.ok(cloudBanks(world,96000,1867).every(b=>!oldIds.has(b.id)),'Cloud episodes turn over across longer history, without requiring turnover every 300 years');
assert.notDeepEqual(cloudBanks(world,320,1867),cloudBanks(world,320,1868),'Seed changes weather');
for(const t of [0,1599,4800,9600]) {
  const cropped=new Map(cloudBanks(small,t,1867).map(b=>[b.id,b]));
  for(const b of cloudBanks(world,t,1867)) {
    const r=Math.hypot(b.width,b.height)/2;
    if(b.x+r>=0&&b.x-r<=300&&b.y+r>=0&&b.y-r<=200)
      assert.deepEqual(cropped.get(b.id),b,'Culling must preserve every overlapping cloud');
  }
  const next=new Map(cloudBanks(world,t+600,1867).map(b=>[b.id,b]));
  const drift=cloudBanks(world,t,1867).filter(b=>next.has(b.id)).map(b=>({x:next.get(b.id).x-b.x,y:next.get(b.id).y-b.y}));
  assert.ok(Math.max(...drift.map(d=>d.x))-Math.min(...drift.map(d=>d.x))>10,'Independent bank speed');
  assert.ok(Math.max(...drift.map(d=>d.y))-Math.min(...drift.map(d=>d.y))>5,'Independent bank heading');
}
// 1% of a 300-year drag used to change a bank's life by 95% (v131).
let maxScrubLife=0,maxOpeningChange=0;
for(let t=0;t<9600;t+=48){
  const next=new Map(cloudBanks(world,t+96,1867).map(b=>[b.id,b]));
  for(const b of cloudBanks(world,t,1867))if(next.has(b.id))
    maxScrubLife=Math.max(maxScrubLife,Math.abs(b.life-next.get(b.id).life));
  for(let x=-1000;x<2000;x+=120)
    maxOpeningChange=Math.max(maxOpeningChange,Math.abs(cloudOpening(x,100,cloudWeatherTime(t),1867)-cloudOpening(x,100,cloudWeatherTime(t+96),1867)));
}
assert.ok(maxScrubLife<.22,'A small long-span scrub must not create/remove an entire bank');
assert.ok(maxOpeningChange<.08,'World-sized openings must drift calmly during a long scrub');
let open=0,dense=0,nearby=0;
for(let y=-500;y<1500;y+=50)for(let x=-1500;x<2500;x+=50){
  const a=cloudOpening(x,y,cloudWeatherTime(60),1867);
  if(a>.85){open++;if(cloudOpening(x+300,y,cloudWeatherTime(60),1867)>.7)nearby++;}
  if(a<.15)dense++;
}
assert.ok(open>100&&dense>100&&nearby>50,'Large coherent sparse openings coexist with dense cover');
assert.ok(cloudBanks(world,60,1867).some(b=>b.sparse&&cloudOpening(b.x,b.y,b.weatherTime,1867)>.65),'Small cumulus lives inside the large openings');
console.log(JSON.stringify({pass:true,familyVariants:variants.map(v=>v.size),
  maxScrubLife,maxOpeningChange,meanDevelopedBanks:+(counts.reduce((a,b)=>a+b)/counts.length).toFixed(1),
  meanWeightedArea:Math.round(area.reduce((a,b)=>a+b)/area.length),noImmortalClouds:true}));
