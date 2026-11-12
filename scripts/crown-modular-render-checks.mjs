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
   const shown=city.renderedUrban??{},blades=(shown.blade??0)+(shown.bladeLow??0);
   assert.equal(blades,city.urban.rank==='capital'?3:2,`${city.regionId}: the intended blade silhouette must actually render`);
   assert((shown.galleryNE??0)+(shown.galleryNW??0)>=4,`${city.regionId}: joined gallery wings must actually render`);
  }
  if(!previous)continue;
  const baseline=previous.reports.find(r=>r.viewport.width===frame.viewport.width);
  assert.equal(frame.terrain.roads,baseline.terrain.roads,'City composition preserves existing road connections');
  for(const before of baseline.readouts){
   const after=frame.readouts.find(r=>r.regionId===before.regionId);if(!after)continue;
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
 console.log('Rendered desktop/phone composition passed: visible blades and wings; matching roads/readouts.');
}
