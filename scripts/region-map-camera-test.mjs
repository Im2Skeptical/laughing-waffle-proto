import assert from 'node:assert/strict';
import { createMapPanelReveal } from '../src/views/world-map/transitions.js';
import { createMapCamera } from '../src/views/world-map/camera.js';

// Exercise the real camera with a deterministic UI clock and input surface.
// No renderer or simulation is needed to verify framing and gesture ownership.
globalThis.PIXI = { Rectangle: class { constructor(x,y,width,height) {Object.assign(this,{x,y,width,height});} } };
let time = 0;
const handlers = new Map();
const viewport = {toLocal: point => point, on: (name, handler) => handlers.set(name, handler)};
const world = {position:{set(){}},scale:{set(){}}};
const rect = {x:16,y:78,width:2392,height:748};
const camera = createMapCamera(viewport,world,rect,{now:()=>time,reducedMotion:()=>false});
const first = {x:650,y:260}, second = {x:1100,y:510}, right = 960;
const initial = camera.snapshot();
camera.reveal(first,right);
assert.deepEqual(camera.snapshot(),initial,'opening begins at the existing camera pose instead of jumping');
time = 140; camera.update();
assert.ok(camera.snapshot().zoom > 1 && camera.snapshot().zoom < 1.65,'focus zoom interpolates');
time = 1000; camera.update();
const center = {x:(rect.x+right)/2,y:rect.y+rect.height/2};
const centered = point => {
  const p = camera.project(point);
  assert.ok(Math.abs(p.x-center.x)<.01 && Math.abs(p.y-center.y)<.01,'selected settlement is centered in the left map area');
};
centered(first);
assert.ok(camera.snapshot().zoom >= 1.65,'selection zooms closer');
const beforeSwitch = camera.snapshot();
camera.reveal(second,right);
assert.deepEqual(camera.snapshot(),beforeSwitch,'switching also begins without a jump');
time = 2000; camera.update(); centered(second);
// Input must cancel the focus so a subsequent frame cannot pull the map back.
camera.reveal(first,right);
time = 2080; camera.update();
handlers.get('pointerdown')({button:0,pointerId:1,global:{x:400,y:400}});
handlers.get('globalpointermove')({pointerId:1,global:{x:460,y:430}});
handlers.get('pointerup')({pointerId:1,type:'pointerup',global:{x:460,y:430}});
const dragged = camera.snapshot();
time = 3000; camera.update(); assert.deepEqual(camera.snapshot(),dragged,'drag retains camera control');
camera.reveal(second,right);
handlers.get('wheel')({deltaY:-100,global:{x:460,y:430},preventDefault(){}});
const wheeled = camera.snapshot();
time = 4000; camera.update(); assert.deepEqual(camera.snapshot(),wheeled,'wheel retains camera control');
console.log('[region-map-camera] OK: smooth focus, switched selection, zoom, gesture cancellation');

const vector = () => ({x:0,y:0,set(x,y=x){this.x=x;this.y=y;}});
const panel = {position:vector(),scale:vector(),pivot:vector()};
const panelRect = {x:960,y:78,width:1448,height:748};
const reveal = createMapPanelReveal(panel,panelRect,{now:()=>time,reducedMotion:()=>false});
const origin = {x:700,y:350};
reveal.open(origin);
assert.equal(reveal.snapshot().scale,.06);
assert.equal(panel.position.x+panelRect.width*panel.scale.x/2,origin.x,'panel starts centered on settlement');
time += 80; reveal.update();
assert.ok(panel.scale.x>.06 && panel.scale.x<1,'panel scales between origin and final rectangle');
time += 300; reveal.update();
assert.equal(panel.scale.x,1); assert.equal(panel.position.x,panelRect.x); assert.equal(panel.position.y,panelRect.y);
assert.equal(reveal.snapshot().animating,false);
const quiet = createMapPanelReveal(panel,panelRect,{reducedMotion:()=>true});
quiet.open(origin); assert.equal(quiet.snapshot().scale,1,'reduced motion opens directly');
console.log('[region-map-panel] OK: settlement origin, scale animation, final placement, reduced motion');
