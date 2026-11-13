import assert from 'node:assert/strict';
import {COMBINED_READOUT_VARIANTS,combinedReadoutGeometry} from '../src/views/world-map/combined-settlement-readout-prototype.js';

const rect=(r,p)=>({x:r.x+p.x,y:r.y+p.y,width:r.width,height:r.height});
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
for(const variant of [...COMBINED_READOUT_VARIANTS,'tightcrest'])for(const capital of [false,true])for(const unrest of [false,true]){
 const g=combinedReadoutGeometry(variant,{capital,unrest});
 const count=rect(g.countHit,g.counter),prestige=rect(g.prestigeHit,g.prestige);
 const influence={x:g.bar.x-g.bar.width/2-23,y:g.bar.y-60,width:g.bar.width+46,height:86};
 assert(!overlaps(count,prestige),`${variant}: worker and Prestige inspection targets stay separate`);
 assert(!overlaps(count,influence),`${variant}: influence does not intercept worker taps`);
 assert(!overlaps(prestige,influence),`${variant}: influence does not intercept Prestige taps`);
 assert(g.bar.y-(capital?56:unrest?28:26)>=g.top,`${variant}: shield/Crown/Unrest clears the landmark`);
 assert(count.y+count.height<=g.bottom&&prestige.y+prestige.height<=g.bottom,`${variant}: readings remain inside lower extent`);
}
assert.equal(combinedReadoutGeometry(null),null);
assert.equal(combinedReadoutGeometry('not-a-layout'),null);
assert.equal(new Set(COMBINED_READOUT_VARIANTS.map(v=>JSON.stringify(combinedReadoutGeometry(v)))).size,3);
console.log('Combined readout geometry: three distinct layouts, separate inspection targets, Crown/Unrest clearance; default remains split.');
