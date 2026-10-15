import assert from 'node:assert/strict';
import { createInlandRipples } from './water-ripples.js';
// A single wet texel forces the seeded origin onto (10,10), not dry terrain.
const fixture={width:24,height:24,texel:2,bounds:{minX:0,minY:0},seed:1869,isWater:i=>i===250};
const rings=createInlandRipples(fixture),again=createInlandRipples(fixture);
assert.equal(rings.count,1);
const east=rings.sample(20,10),south=rings.sample(10,17.2),far=rings.sample(25,10);
assert.ok(east&&south&&far,'Rings should extend from the actual wet origin');
assert.ok(Math.abs(east.phase-south.phase)<1e-12,'Equal elliptical radii must share a phase');
assert.ok(far.phase<east.phase,'Increasing time must move a crest outward');
assert.ok(far.weight<east.weight,'Rings must soften outward');
assert.deepEqual(east,again.sample(20,10),'Ripple placement must be seeded and repeatable');
assert.notEqual(east.phase,createInlandRipples({...fixture,seed:1870}).sample(20,10).phase);
assert.equal(rings.sample(100,100),null,'Rings must fade to no effect');
assert.equal(createInlandRipples({...fixture,isWater:()=>false}).count,0,'Dry bodies cannot emit rings');
console.log('Inland rings: wet origins, radial phase, outward travel, soft extent and seeded variation pass.');
