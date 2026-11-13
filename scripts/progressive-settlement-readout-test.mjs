import assert from 'node:assert/strict';
import {readoutRectInsideRegion,expandedCrestRect,expandedCrestFits,expandedCrestFootprints,expandedCrestFitZoom,sharedCrestDisclosure} from '../src/views/world-map/settlement-readout-layout.js';
import {TIGHT_CREST_OUTLINE,settlementCrestGeometry} from '../src/views/world-map/settlement-readout-frame.js';
import {REGIONAL_READOUT_SCREEN_SCALE} from '../src/views/world-map/constants.js';

const polygon=[{x:0,y:0},{x:240,y:0},{x:240,y:240},{x:0,y:240}],bounds={min:{x:90,y:80},max:{x:150,y:150}};
assert(readoutRectInsideRegion({x:20,y:20,width:20,height:20},polygon));
assert(!readoutRectInsideRegion({x:220,y:20,width:25,height:20},polygon),'Cross-border footprint refused');
const notch=[{x:0,y:0},{x:40,y:0},{x:40,y:80},{x:60,y:80},{x:60,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
assert(!readoutRectInsideRegion({x:20,y:20,width:60,height:70},notch),'Concave border inside a footprint is refused even when all corners fit');
for(const capital of [false,true])for(const unrest of [false,true]){
 const z=expandedCrestFitZoom(bounds,polygon,{capital,unrest});assert(Number.isFinite(z));
 assert(expandedCrestFits(bounds,polygon,z+.001,{capital,unrest}));
 assert(!expandedCrestFits(bounds,polygon,z-.001,{capital,unrest}));
}
const taper=[{x:20,y:0},{x:220,y:0},{x:220,y:150},{x:120,y:210},{x:20,y:150}],near={min:{x:90,y:70},max:{x:150,y:100}};
assert(expandedCrestFits(near,taper,1),'The painted crest fits a tapered regional edge');
assert(!readoutRectInsideRegion(expandedCrestRect(near,1),taper),'Empty bounding-box corners must not delay disclosure');
const painted=Array.from({length:TIGHT_CREST_OUTLINE.length/2},(_,i)=>({x:TIGHT_CREST_OUTLINE[i*2],y:TIGHT_CREST_OUTLINE[i*2+1]}));
for(const capital of [false,true])for(const unrest of [false,true]){
 const g=settlementCrestGeometry({capital,unrest}),s=REGIONAL_READOUT_SCREEN_SCALE,footprints=expandedCrestFootprints(near,1,{capital,unrest});
 for(let i=0;i<painted.length;i++)for(let t=0;t<=1;t+=.05)for(const [dx,dy]of [[0,0],[-1.1,0],[1.1,0],[0,-1.1],[0,1.1]]){
  const a=painted[i],b=painted[(i+1)%painted.length],p={x:120+(a.x+(b.x-a.x)*t+dx)*s,y:100+(6-g.top+a.y+(b.y-a.y)*t+dy)*s};
  assert(footprints.some(r=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height),'Fit envelopes must cover the actual painted outline and its stroke');
 }
}
assert.equal(expandedCrestFitZoom({min:{x:100,y:200},max:{x:140,y:245}},polygon),Infinity);
const needs=[1.1,1.7,2.05],initial=sharedCrestDisclosure(1,needs);
assert.equal(initial.expanded,false);assert.equal(initial.minimum,2.05);
assert.equal(sharedCrestDisclosure(2.08,needs).expanded,false,'Every settlement waits for the shared threshold');
assert.equal(sharedCrestDisclosure(2.2,needs).expanded,true);
assert.equal(sharedCrestDisclosure(2.1,needs,true).expanded,true,'Hysteresis prevents flicker');
assert.equal(sharedCrestDisclosure(2.04,needs,true).expanded,false,'Collapse before any crest crosses a border');
assert.equal(sharedCrestDisclosure(2.5,[1.1,Infinity]).expanded,false,'An impossible region cannot silently leak or disclose alone');
console.log('Progressive readouts: exact border containment including concavities; shared safe threshold, hysteresis and impossible-fit handling passed.');
