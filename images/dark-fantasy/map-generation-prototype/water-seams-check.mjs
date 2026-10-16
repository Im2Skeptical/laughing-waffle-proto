import assert from 'node:assert/strict';
import { paintOcean } from './terrain-interactions.js';
import { waterColourAt, waterPaletteColour } from './water-style.js';

const mix=(a,b,t)=>[16,8,0].reduce((c,s)=>c|Math.round((a>>s&255)*(1-t)+(b>>s&255)*t)<<s,0);
// Exercise the actual bake at both sides of the old family-selection boundaries.
// Only the continuous input crosses a threshold; position/phase remain fixed.
function sample({fine=.5,packet=.5,distance=100,y=30}={}) {
  const seed=1869,indices=new Uint8Array(1),strength=new Uint8Array(1),base=new Uint32Array(1);
  const palette=new Uint32Array(256),overlays=new Uint8Array(4);
  paintOcean({map:{seed},width:1,height:1,texel:2,bounds:{minX:20/1576,minY:y*2/516},land:new Uint8Array(1),
    waterIndices:indices,colours:new Uint32Array(1),regionIds:new Int16Array(1),seaDistance:new Float64Array([distance*3]),
    dryDistance:new Uint16Array(1),shoreTypes:new Uint8Array(1),waterBodies:new Uint8Array([1]),waterBank:palette,groundBank:{},
    noise:s=>s===(seed^977)?fine:s===(seed^4217)?packet:.5,mixColour:mix,waterBase:base,waterStrength:strength,waterOverlays:overlays,surfaces:{}});
  return {indices,strength,overlays,at(t,v) {
    let c=waterColourAt(indices[0],base[0],strength[0],palette,mix,t,v);
    for(let layer=0;layer<4;layer+=2)c=mix(c,waterPaletteColour(overlays[layer],palette,mix,t,v),overlays[layer+1]/255);
    return [16,8,0].map(s=>c>>s&255);
  }};
}
const boundaries=[
  ['fine ripple', 'fine', .64, {}],
  ['surf packet', 'packet', .32, {distance:12}],
  ['whitecap packet', 'packet', .64, {fine:.6}],
  ['whitecap ripple', 'fine', .52, {packet:.75}],
  ['surf reach', 'distance', 33.5, {packet:.75,fine:.6}],
];
let maximumJump=0;
for(const [name,key,value,rest] of boundaries)for(const y of [0,12,30,57]) {
  const a=sample({...rest,y,[key]:value-1e-8}),b=sample({...rest,y,[key]:value+1e-8});
  for(const v of [0,3.5,7])for(const t of [0,.125,1.7,7.875,15,60,320,997,1600]) {
    const before=a.at(t,v),after=b.at(t,v),jump=Math.max(...before.map((x,i)=>Math.abs(x-after[i])));
    maximumJump=Math.max(maximumJump,jump);
    assert.ok(jump<=1,`${name} seam at y=${y}, t=${t}, variant=${v}: RGB jump ${jump}`);
  }
}
const open=sample(),ripples=sample({fine:.85}),foam=sample({packet:.85,fine:.85});
assert.equal(open.indices[0],ripples.indices[0],'Ripples must retain the underlying swell');
assert.equal(open.indices[0],foam.indices[0],'Foam must retain the underlying swell');
assert.ok(ripples.overlays[1]>0&&foam.overlays[3]>0,'Overlapping surface layers must actually render');
console.log(`Water seams: five former boundaries remain continuous through animation and regional phases; maximum RGB jump ${maximumJump}.`);
