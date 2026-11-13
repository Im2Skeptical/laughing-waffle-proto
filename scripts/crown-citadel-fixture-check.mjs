// Reproduce the missing live-capital centre at the pure planning seam. The
// captured real terrain catches clearance failures the synthetic map missed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {planCrownUrbanSites} from '../src/views/world-map/crown-urban-prototype.js';

const path=process.argv[2]??'scripts/fixtures/crown-capital-123-layout.json.gz';
const bytes=readFileSync(path),data=JSON.parse((path.endsWith('.gz')?gunzipSync(bytes):bytes).toString());
const masks=Object.fromEntries(Object.entries(data.masks).map(([key,value])=>{
 const bytes=Uint8Array.from(Buffer.from(value.base64,'base64'));
 return [key,new globalThis[value.type](bytes.buffer)];
}));
const args={...data,...masks,
 moduleSizes:Object.fromEntries(JSON.parse(readFileSync('images/dark-fantasy/map-generation-prototype/assets/runtime/crown-modular-v1.json')).frames.map(f=>[f.role,{width:f.rect[2],height:f.rect[3],groundContacts:f.groundContacts}])),
 world:(x,y)=>({x:data.worldZero.x+x*(data.worldStep.x-data.worldZero.x),y:data.worldZero.y+y*(data.worldStep.y-data.worldZero.y)}),
 pixel:p=>({x:data.pixelZero.x+p.x*(data.pixelStep.x-data.pixelZero.x),y:data.pixelZero.y+p.y*(data.pixelStep.y-data.pixelZero.y)})};
const before=JSON.stringify(data.anchors),start=performance.now();
const plans=planCrownUrbanSites(data.anchors,args),capital=plans.find(s=>s.urban?.rank==='capital');
assert(capital?.urban.monument?.parts.length>=5,'The real capital must receive a complete terraced centre');
assert(capital.buildings.some(b=>b.role==='citadelLeft')&&capital.buildings.some(b=>b.role==='citadelRight'),'The live capital has room for both joined terrace wings');
assert(capital.buildings.some(b=>b.role==='citadelCrown'),'The complete summit remains part of the centre');
assert.deepEqual(capital.urban.monument.centrePoint,data.map.regions.find(r=>r.id===capital.regionId).centre,'The palace stays at the authoritative regional centre');
assert.equal(JSON.stringify(data.anchors),before,'Planning does not move the underlying settlement/road anchors');
assert.deepEqual(planCrownUrbanSites(data.anchors,args),plans,'The centre is repeatable on the captured world');
console.log(`Live capital: complete centre (${capital.urban.monument.layout}), fixed anchors and repeatable geometry (${Math.round(performance.now()-start)} ms).`);
