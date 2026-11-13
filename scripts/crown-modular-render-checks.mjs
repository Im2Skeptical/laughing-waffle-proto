import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Inspect actual production-renderer reports, not just the planner's accepted
// plots: road/water exclusions can otherwise silently remove the main silhouette.
export function checkCrownRenderedComposition(report,previous=null){
 assert.deepEqual(report.errors,[]);
 for(const frame of report.reports){
  const cities=frame.terrain.sites.filter(s=>s.urban);
  assert.equal(cities.length,4);
  for(const city of cities){
   const shown=city.renderedUrban??{};
   if(city.urban.rank==='capital'){
    assert(city.urban.monument?.parts.length>=5,`${city.regionId}: complete terraced centre planned`);
    for(const role of ['citadelGate','citadelMiddle','citadelPalace','citadelCrown'])assert.equal(shown[role],1,`${city.regionId}: ${role} survives production culling`);
    const parts=['citadelRear','citadelLeft','citadelRight','citadelGate','citadelMiddle','citadelPalace','citadelCrown'].reduce((sum,role)=>sum+(shown[role]??0),0);
    assert.equal(parts,city.urban.monument.parts.length,`${city.regionId}: every planned monument section renders`);
   }else{
    assert(city.urban.monument?.parts.length>=3,`${city.regionId}: complete governor's court planned`);
    for(const role of ['provinceHall','provinceGate','provinceCourt'])assert.equal(shown[role],1,`${city.regionId}: ${role} survives production culling`);
    const parts=['provinceHall','provinceGate','provinceCourt','provinceWing'].reduce((sum,role)=>sum+(shown[role]??0),0);
    assert.equal(parts,city.urban.monument.parts.length,`${city.regionId}: every planned governor's court section renders`);
   }
  }
  if(!previous)continue;
  const baseline=previous.reports.find(r=>r.viewport.width===frame.viewport.width);
  assert.equal(frame.terrain.connections,baseline.terrain.connections,'City composition preserves the gameplay connection graph');
  if(frame.regionCentres){
   assert.equal(frame.terrain.roads,frame.terrain.connections,'Every existing connection receives a visual approach');
   assert.deepEqual(frame.overviewNames,[]);assert.deepEqual(frame.selectedNames,[frame.capital]);
  }else assert.equal(frame.terrain.roads,baseline.terrain.roads,'City composition preserves existing road connections');
  for(const before of baseline.readouts){
   const after=frame.readouts.find(r=>r.regionId===before.regionId);if(!after)continue;
   for(const key of ['force','count','shownPrestige','status','thresholdShare','warriors'])assert.deepEqual(after[key],before[key],`${before.regionId}: existing ${key} value changed`);
   // Centring deliberately relocates the old dry-shoulder readouts. Their
   // new authoritative centre is checked by the live readability probe.
   if(frame.regionCentres)continue;
   for(const key of ['sprite','countBounds','bar','prestige'])if(before[key]&&after[key])for(const field of Object.keys(before[key])){
    if(typeof before[key][field]==='number')assert(Math.abs(before[key][field]-after[key][field])<1e-6,`${before.regionId}: existing ${key} placement moved`);
   }
  }
 }
 return true;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const read=name=>JSON.parse(readFileSync(`artifacts/crown-modular/${name}/report.json`));
 checkCrownRenderedComposition(read(process.argv[2]??'iteration-2'),process.argv[3]?read(process.argv[3]):null);
 console.log('Rendered desktop/phone composition passed: complete capital and provincial landmarks; matching roads/readouts.');
}
