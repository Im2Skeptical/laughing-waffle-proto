import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {settlementCentreReservations,rasterizeSettlementCentres} from '../images/dark-fantasy/map-generation-prototype/settlement-centres.js';
import {paintWetlandPools} from '../images/dark-fantasy/map-generation-prototype/wetland-ground.js';
import {planSettlementSites,layOutSettlements} from '../images/dark-fantasy/map-generation-prototype/settlement-sites.js';
import {planCrownUrbanSites,crownBiomeRole} from '../src/views/world-map/crown-urban-prototype.js';
import {routeSampleRoads} from '../images/dark-fantasy/map-generation-prototype/roads.js';

const biomes=['plains','forest','islands','swamp','mountains'],width=500,height=120,size=width*height;
const map={seed:123,regions:biomes.map((biome,i)=>({id:`R0${i+1}`,biome,centre:{x:i*100+50,y:60},outline:[{x:i*100,y:0},{x:i*100+100,y:0},{x:i*100+100,y:120},{x:i*100,y:120}]}))};
const regionIds=Int16Array.from({length:size},(_,i)=>Math.floor(i%width/100)),land=new Uint8Array(size).fill(1),waterIndices=new Uint8Array(size),colours=new Uint32Array(size).fill(0x667766);
const original=JSON.stringify(map),pixel=p=>p,world=(x,y)=>({x,y}),centres=settlementCentreReservations(map,pixel,2);
const reservationMask=rasterizeSettlementCentres(centres,{map,width,height,regionIds});
const waterBefore=waterIndices.slice();
const wet=paintWetlandPools({map,pixel,width,height,detail:2,regionIds,land,dryDistance:new Uint16Array(size).fill(80),colours,waterIndices,
 waterBase:new Uint32Array(size),waterStrength:new Uint8Array(size),noise:()=>.95,mixColour:(a,b)=>b,protectedCentres:centres});
assert(wet.pools>0,'Wetland pools remain outside the central town reservation');
for(let i=0;i<size;i++)if(reservationMask[i])assert.equal(waterIndices[i],waterBefore[i],'Water cannot displace the centre');
const sites=planSettlementSites({map,pixel,world,width,height,land,waterIndices,regionIds,detail:2,perRegion:true});
assert.equal(sites.length,5);
const dry=(x,y,id)=>x>=0&&y>=0&&x<width&&y<height&&land[Math.floor(y)*width+Math.floor(x)]&&!waterIndices[Math.floor(y)*width+Math.floor(x)]&&map.regions[regionIds[Math.floor(y)*width+Math.floor(x)]]?.id===id;
layOutSettlements(sites,{detail:2,world,seed:map.seed,dry});
for(const site of sites){const region=map.regions.find(r=>r.id===site.regionId);assert.deepEqual(site.point,region.centre);assert.deepEqual(site.buildings.find(b=>['hall','market'].includes(b.role)).point,region.centre);}
assert.equal(JSON.stringify(map),original,'View reservations do not mutate authoritative regions');

const w=300,h=180,ids=Int16Array.from({length:w*h},(_,i)=>i%w<150?0:1),dryLand=new Uint8Array(w*h).fill(1),water=new Uint8Array(w*h);
const edge=(regions,a,b)=>({regions,points:[a,b]});
const urbanMap={seed:123,regions:[0,1].map(i=>({id:`R0${i+1}`,biome:'plains',centre:{x:75+i*150,y:90},outline:[{x:i*150,y:0},{x:i*150+150,y:0},{x:i*150+150,y:180},{x:i*150,y:180}]})),
 edges:[edge(['R01'],{x:0,y:0},{x:0,y:180}),edge(['R02'],{x:300,y:0},{x:300,y:180}),edge(['R01','R02'],{x:150,y:0},{x:150,y:180}),
  ...[0,1].flatMap(i=>[edge([`R0${i+1}`],{x:i*150,y:0},{x:i*150+150,y:0}),edge([`R0${i+1}`],{x:i*150,y:180},{x:i*150+150,y:180})])]};
const anchors=urbanMap.regions.map(r=>({regionId:r.id,biome:r.biome,x:r.centre.x,y:r.centre.y,point:r.centre,rx:23,ry:16,court:{x:r.centre.x+9,y:93},entrance:{x:r.centre.x+20,y:90},buildings:[],streets:[],enclosure:[]}));
const frames=JSON.parse(readFileSync('images/dark-fantasy/map-generation-prototype/assets/runtime/crown-modular-v1.json')).frames;
const moduleSizes=Object.fromEntries(frames.map(f=>[f.role,{width:f.rect[2],height:f.rect[3],groundContacts:f.groundContacts}]));
const args={map:urbanMap,pixel,world,width:w,height:h,land:dryLand,waterIndices:water,regionIds:ids,detail:2,moduleSizes};
const identity={regionId:'R01',rank:'province'};
const isolated=planCrownUrbanSites(anchors,{...args,identities:[identity]})[0];
const contiguous=planCrownUrbanSites(anchors,{...args,identities:[identity,{regionId:'R02',rank:'province'}]})[0];
assert(isolated.buildings.filter(b=>!b.core).every(b=>b.x<140),'Exposed urban boundaries retain native terrain');
assert(contiguous.buildings.some(b=>!b.core&&b.x>140),'Shared urban borders remain continuous');
for(const biome of biomes){
 const biomeMap={...urbanMap,regions:urbanMap.regions.map(r=>({...r,biome}))},biomeAnchors=anchors.map(a=>({...a,biome}));
 const planned=planCrownUrbanSites(biomeAnchors,{...args,map:biomeMap,identities:[identity]})[0],hall=planned.buildings.find(b=>b.role==='provinceHall');
 assert(hall,`Complete ${biome} governor's court`);assert.deepEqual(hall.point,biomeMap.regions[0].centre);assert.equal(hall.artRole,crownBiomeRole('provinceHall',biome));
 const capital=planCrownUrbanSites(biomeAnchors,{...args,map:biomeMap,identities:[{regionId:'R01',rank:'capital'}]})[0];
 assert(capital.urban.monument?.parts.length>=5,`Complete ${biome} capital`);assert.deepEqual(capital.urban.monument.centrePoint,biomeMap.regions[0].centre);
 for(const role of ['provinceHall','citadelPalace','citadelRear'])assert(moduleSizes[crownBiomeRole(role,biome)],`${biome} ${role} art imported`);
}

const contacts=Array.from({length:41},(_,i)=>({x:200+i,y:50}));
const paths=routeSampleRoads([{x:30,y:50},{x:470,y:50}],{width,height,regionIds:new Int16Array(size),land,waterIndices:new Uint8Array(size),materialAt:()=> 'plains',bounds:{minX:0,minY:0,maxX:width,maxY:height},scale:2,
 exclusions:[{x:220,y:85,rx:23,ry:16,buildings:[{monument:true,roadContacts:contacts}]}],pairs:[{a:0,b:1,id:'a:b'}]});
assert.equal(paths.length,1,'Road connection survives the fixed landmark');
for(const p of paths[0])assert(!contacts.some(c=>Math.hypot(c.x-p.x,c.y-p.y)<2),'Roads go around foundations outside the ordinary town ellipse');
assert.deepEqual(paths[0][0],{x:30,y:50});assert.deepEqual(paths[0].at(-1),{x:470,y:50});
console.log('Map readability: exact civic centres, retained wetland pools, biome fringes, contiguous urban edges, five biome kits and foundation-safe roads.');
