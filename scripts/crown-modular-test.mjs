import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planCrownUrbanSites,crownCityIdentities} from '../src/views/world-map/crown-urban-prototype.js';
import {createNewGameState} from '../src/model/new-game.js';
import {settlementGroundWeight,paintSettlementSites} from '../images/dark-fantasy/map-generation-prototype/settlement-sites.js';

const width=300,height=180,land=new Uint8Array(width*height).fill(1),waterIndices=new Uint8Array(width*height),regionIds=new Uint8Array(width*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 regionIds[y*width+x]=x<150?0:1;
 if(y<12||y>165||x<8||x>290||x>90&&x<106&&y>40&&y<105)waterIndices[y*width+x]=128;
}
const map={seed:1867,regions:[0,1].map(i=>({id:`R0${i+1}`,biome:'plains',outline:[{x:i*150,y:0},{x:(i+1)*150,y:0},{x:(i+1)*150,y:180},{x:i*150,y:180}]}))};
const anchors=[0,1].map(i=>({regionId:`R0${i+1}`,biome:'plains',x:60+i*150,y:80,rx:23,ry:16,point:{x:60+i*150,y:80},court:{x:68+i*150,y:83},entrance:{x:70+i*150,y:90},buildings:[{x:60+i*150,y:80,w:17,h:10,role:'hall'}],streets:[],enclosure:[]}));
const manifest=JSON.parse(readFileSync('images/dark-fantasy/map-generation-prototype/assets/runtime/crown-modular-v1.json'));
assert.equal(manifest.frames.length,36);assert(manifest.frames.every(f=>Object.keys(f.cutRuns).length===0));
const moduleSizes=Object.fromEntries(manifest.frames.map(f=>[f.role,{width:f.rect[2],height:f.rect[3]}]));
const args={map,pixel:p=>p,world:(x,y)=>({x,y}),width,height,land,waterIndices,regionIds,detail:2,identities:[{regionId:'R01',rank:'capital'}],roads:[Array.from({length:300},(_,x)=>({x,y:130}))],moduleSizes};
const before=JSON.stringify(anchors),wet=waterIndices.slice();
const result=planCrownUrbanSites(anchors,args),city=result[0];
assert.deepEqual(result,planCrownUrbanSites(anchors,args),'Repeated worlds get identical architecture');
assert.equal(JSON.stringify(anchors),before,'Do not mutate original anchor/road layout');
assert.deepEqual(waterIndices,wet,'Water remains authoritative');
assert.deepEqual(result[1],anchors[1],'Other settlement plans stay unchanged');
assert(city.buildings.length>80,'Capital covers its region with small plots');
assert(city.buildings.some(b=>b.landRegionId==='R02'),'Dry capital fringe may cross regional borders');
assert(city.buildings.every(b=>b.w<=15),'Extent never comes from oversized buildings');
assert(city.buildings.some(b=>b.role.startsWith('ruined')),'Outer fabric includes ruin fragments');
assert.equal(city.urban.spines.length,3,'A fitting capital has three separate blade towers');
assert(city.urban.links.length>=12,'Connected galleries organise the larger city form');
for(const [a,b]of city.urban.links){
 const left=city.buildings[a],right=city.buildings[b];
 assert.equal(left.group,right.group,'A gallery joins its own compound');
 assert(Math.hypot(left.x-right.x,left.y-right.y)<17,'Joined modules meet at nearby ports, without stretching');
}
assert(city.buildings.filter(b=>b.group?.includes(':ward:')).length>=6,'Multiple connected courts structure the fabric');
for(const b of city.buildings){
 for(let y=Math.floor(b.renderBounds.minY);y<=b.renderBounds.maxY;y++)for(let x=Math.floor(b.renderBounds.minX);x<=b.renderBounds.maxX;x++)assert(!waterIndices[y*width+x],'Complete drawn footprint avoids water');
 assert(Math.abs(b.y-130)>=b.w*.45+2,'Road corridor remains open');
}
const far=city.buildings.find(b=>Math.hypot(b.x-city.x,b.y-city.y)>60);
assert(settlementGroundWeight(city,far.x,far.y)>.9,'Worked ground follows remote city plots');
const colours=new Uint32Array(width*height).fill(0x667744);
paintSettlementSites([city],{width,height,colours,waterIndices,regionIds,map,detail:2,surfaces:{ground:()=>0x667744},mixColour:(a,b,t)=>t>0?b:a,dot:()=>{}});
assert.notEqual(colours[Math.floor(far.y)*width+Math.floor(far.x)],0x667744,'Painting reaches remote district ground');
for(let i=0;i<wet.length;i++)if(wet[i])assert.equal(colours[i],0x667744,'Urban ground cannot overwrite water');
for(const seed of [7,123,1867]){
 const state=createNewGameState(seed),identities=crownCityIdentities(state),original=JSON.stringify(state);
 assert.equal(identities.length,4);
 const captured=JSON.parse(JSON.stringify(state));for(const id of identities)captured.world.regions.find(r=>r.id===id.regionId).controller='player';
 assert.deepEqual(crownCityIdentities(captured),identities,'Capture cannot replace architectural identity');
 assert.equal(JSON.stringify(state),original,'View queries do not mutate simulation state');
}
console.log('Crown modular: complete atlas; dense fixed-scale plots; dry border spill; unchanged roads/water/anchors; distant clearings; capture identity across three starts.');
