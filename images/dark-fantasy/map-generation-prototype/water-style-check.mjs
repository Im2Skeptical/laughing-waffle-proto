import assert from 'node:assert/strict';
import { classifyWaterBodies, extendWaterEnvironment, waterColourAt, WATER_BODY, WATER_RAMPS } from './water-style.js';
import { paintOcean } from './terrain-interactions.js';

const width=50,height=40,size=width*height,land=new Uint8Array(size).fill(1);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<5||x>44||y<4||y>35||(x>15&&x<34&&y>12&&y<28))land[y*width+x]=0;
const bodies=classifyWaterBodies(land,width,height);
assert.equal(bodies[0],WATER_BODY.ocean);
assert.equal(bodies[20*width+25],WATER_BODY.lake,'Enclosed island waters need lake graphics');
const open=land.slice();for(let x=0;x<=20;x++)open[20*width+x]=0;
assert.equal(classifyWaterBodies(open,width,height)[20*width+25],WATER_BODY.ocean,'An actual sea inlet keeps an island marine');
assert.deepEqual(classifyWaterBodies(land,width,height),bodies,'Classification is deterministic');
const seaDistance=new Uint16Array(size),dryDistance=new Uint16Array(size);
for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const i=y*width+x;let d=100;
  for(let q=0;q<size;q++)if(land[q]!==land[i])d=Math.min(d,Math.abs(x-q%width)+Math.abs(y-Math.floor(q/width)));
  if(land[i])dryDistance[i]=d*3;else seaDistance[i]=d*3;
}
extendWaterEnvironment(bodies,land,dryDistance,width,height);
assert.equal(bodies[12*width+25],WATER_BODY.lake,'Lake islands need a matching freshwater bank');
const bank=Array.from({length:256},(_,n)=>(45+n%20)<<16|(65+n%20)<<8|75+n%20);
const mixColour=(a,b,t)=>[16,8,0].reduce((c,s)=>c|Math.round((a>>s&255)*(1-t)+(b>>s&255)*t)<<s,0);
const indices=new Uint8Array(size),base=new Uint32Array(size),strength=new Uint8Array(size),colours=new Uint32Array(size).fill(0x555544);
const stats=paintOcean({map:{seed:1869,regions:[{biome:'islands'}]},width,height,texel:4,bounds:{minX:0,minY:0},land,
  waterIndices:indices,colours,regionIds:new Int16Array(size),seaDistance,dryDistance,shoreTypes:new Uint8Array(size).fill(3),waterBodies:bodies,
  waterBank:bank,groundBank:{},noise:(_s,x,y,scale)=>(Math.sin(x/scale+y/scale)*.5+.5),mixColour,waterBase:base,waterStrength:strength,surfaces:{bank:()=>0x777766}});
assert.ok(stats.lakePixels>0&&stats.oceanPixels>0);
const nearSea=Array.from(indices.keys()).filter(i=>!land[i]&&bodies[i]===WATER_BODY.ocean&&seaDistance[i]/3*2<36);
const foam=nearSea.filter(i=>indices[i]>=160&&indices[i]<192);
assert.ok(foam.length>nearSea.length*.2,'Exposed sea needs substantial foam area for a cycle');
assert.ok(stats.surfPhases.filter(n=>n>0).length>=24,'Foam ribbons need a broad distribution across the 32-step cycle');
for(let i=0;i<size;i++)if(!land[i]&&bodies[i]===WATER_BODY.lake)
  assert.ok(indices[i]>=112&&indices[i]<=127||indices[i]>=240,'Lakes must never use ocean swell or white surf');
const saved=base.slice();let changed=0;
for(let i=0;i<size;i++)if(indices[i]&&waterColourAt(indices[i],base[i],strength[i],bank,mixColour,0)!==waterColourAt(indices[i],base[i],strength[i],bank,mixColour,2))changed++;
assert.ok(changed>0,'Animation test phases must vary surface effects');
assert.deepEqual(base,saved,'Phase sampling must preserve depth and sediment');
assert.equal(waterColourAt(70,0x405560,128,bank,mixColour,0),waterColourAt(70,0x405560,128,bank,mixColour,10),'Depth ramps must remain stationary');
const luminance=c=>(c>>16&255)*.2126+(c>>8&255)*.7152+(c&255)*.0722;
for(const [start,length,minimumRange] of [[128,32,30],[160,32,65],[192,16,50]]) {
  const values=Array.from({length},(_,n)=>luminance(waterColourAt(start+n,0x39636c,180,bank,mixColour,0)));
  assert.ok(Math.max(...values)-Math.min(...values)>minimumRange,'Wave faces, crests and troughs must survive compositing');
  assert.ok(Math.abs(values[0]-values.at(-1))<10,'Palette wrap must not flash at the loop seam');
  const ramp=WATER_RAMPS.find(r=>r.start===start);
  assert.equal(waterColourAt(start+3,0x39636c,180,bank,mixColour,0),waterColourAt(start+3,0x39636c,180,bank,mixColour,length/ramp.stepsPerSecond),'Each surface ramp must loop exactly');
}
// A wide coast exercises the depth field, not only the narrow shoreline fixture.
const w=180,h=32,n=w*h,coastLand=new Uint8Array(n),coastDistance=new Uint16Array(n),coastBodies=new Uint8Array(n).fill(WATER_BODY.ocean);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;coastLand[i]=x<8?1:0;coastDistance[i]=Math.max(0,x-7)*3;}
const coastBase=new Uint32Array(n);
paintOcean({map:{seed:1867,regions:[{biome:'islands'}]},width:w,height:h,texel:2,bounds:{minX:0,minY:0},land:coastLand,
  waterIndices:new Uint8Array(n),colours:new Uint32Array(n),regionIds:new Int16Array(n),seaDistance:coastDistance,dryDistance:new Uint16Array(n),shoreTypes:new Uint8Array(n).fill(3),waterBodies:coastBodies,
  waterBank:bank,groundBank:{},noise:()=>.5,mixColour,waterBase:coastBase,waterStrength:new Uint8Array(n),surfaces:{bank:()=>0x777766}});
const shallow=coastBase[16*w+25],deep=coastBase[16*w+170];
assert.ok(luminance(shallow)-luminance(deep)>15,'Shallow shelf and offshore depth need visibly different values');
assert.ok((shallow>>8&255)-(shallow&255)>(deep>>8&255)-(deep&255)+8,'Shallows must shift green relative to the blue offshore water');
console.log('Water styles: lake/sea connectivity, freshwater banks, full foam phases, distinct wave values, seamless independent cycles, fixed depth and green shelves/blue offshore pass.');
