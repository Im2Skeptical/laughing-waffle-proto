import assert from 'node:assert/strict';
import {settlementCrestGeometry} from '../src/views/world-map/settlement-readout-frame.js';

const rect=(r,p)=>({x:r.x+p.x,y:r.y+p.y,width:r.width,height:r.height});
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
for(const capital of [false,true])for(const unrest of [false,true]){
 const g=settlementCrestGeometry({capital,unrest});
 const count=rect(g.countHit,g.counter),prestige=rect(g.prestigeHit,g.prestige);
 const influence={x:g.bar.x-g.bar.width/2-23,y:g.bar.y-60,width:g.bar.width+46,height:86};
 assert(!overlaps(count,prestige),`worker and Prestige inspection targets stay separate`);
 assert(!overlaps(count,influence),`influence does not intercept worker taps`);
 assert(!overlaps(prestige,influence),`influence does not intercept Prestige taps`);
 assert(g.bar.y-(capital?56:unrest?28:26)>=g.top,`shield/Crown/Unrest clears the landmark`);
 assert(count.y+count.height<=g.bottom&&prestige.y+prestige.height<=g.bottom,`readings remain inside lower extent`);
}
console.log('Settlement crest: separate worker, Prestige and influence targets; Crown and Unrest clearance passed.');
