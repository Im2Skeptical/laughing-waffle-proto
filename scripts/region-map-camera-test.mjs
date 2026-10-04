import assert from 'node:assert/strict';
import { createMapPanelReveal } from '../src/views/world-map/transitions.js';
import { createMapCamera } from '../src/views/world-map/camera.js';
import { getMapRelationships, getMapRelationship } from '../src/views/world-map/relationships.js';
import { createLabFixture } from '../src/model/dev-lab/fixtures.js';

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

// Closing restores a saved overview smoothly and remains interruptible.
const zoomed = camera.snapshot();
camera.restore(initial);
assert.deepEqual(camera.snapshot(),zoomed,'dismissal starts without a camera jump');
time += 100; camera.update();
assert.ok(camera.snapshot().zoom<zoomed.zoom && camera.snapshot().zoom>initial.zoom,'dismissal zooms out gradually');
time += 400; camera.update(); assert.deepEqual(camera.snapshot(),initial,'dismissal reaches saved overview');
reveal.open(origin); time += 400; reveal.update();
const full = {x:panel.position.x,y:panel.position.y,scale:panel.scale.x};
const destination = {x:900,y:450};
reveal.close(destination);
assert.deepEqual({x:panel.position.x,y:panel.position.y,scale:panel.scale.x},full,'closing begins from current panel pose');
assert.equal(panel.visible,true,'closing keeps the panel visible');
assert.equal(panel.eventMode,'none','shrinking panel cannot consume map input');
time += 100; reveal.update();
assert.ok(panel.scale.x<1 && panel.scale.x>.06,'panel shrinks during dismissal');
const partial = {x:panel.position.x,y:panel.position.y,scale:panel.scale.x};
reveal.open(origin);
assert.deepEqual({x:panel.position.x,y:panel.position.y,scale:panel.scale.x},partial,'reopening reverses dismissal without jumping');
time += 400; reveal.update();
reveal.close(destination); time += 400; reveal.update();
assert.equal(panel.visible,false,'panel hides only once shrinking finishes');
assert.ok(Math.abs(panel.position.x+panelRect.width*panel.scale.x/2-destination.x)<.001);
assert.ok(Math.abs(panel.position.y+panelRect.height*panel.scale.x/2-destination.y)<.001);
// Dismiss before the opening transition finishes.
reveal.open(origin); time += 60; reveal.update();
const openingScale=panel.scale.x;
reveal.close(destination); assert.equal(panel.scale.x,openingScale);
time += 400; reveal.update(); assert.equal(panel.visible,false);
quiet.open(origin); quiet.close(destination);
assert.equal(panel.visible,false,'reduced motion dismisses immediately');
console.log('[region-map-dismissal] OK: animated overview return, shrink, interrupted opening, reopen, reduced motion');

const groupPoints = [{x:488,y:104},{x:1936,y:792}];
const groupBounds = {x:48,y:236,width:864,height:280};
camera.frame(groupPoints, groupBounds);
time += 400; camera.update();
for (const point of groupPoints) {
  const projected = camera.project(point);
  assert.ok(projected.x >= groupBounds.x - .001 && projected.x <= groupBounds.x + groupBounds.width + .001);
  assert.ok(projected.y >= groupBounds.y - .001 && projected.y <= groupBounds.y + groupBounds.height + .001);
}
assert.ok(camera.snapshot().zoom < 1, 'large groups can fit beside the detail panel');
console.log('[region-map-group-frame] OK: the whole group fits inside its unobstructed map area');

const state = createLabFixture('defense', 42);
const beforeRelationships = JSON.stringify(state);
const reach = getMapRelationships(state, 'copper-basin', true);
assert.deepEqual(reach.adjacentRegionIds, ['high-pass', 'east-steppe']);
assert.deepEqual(reach.connectedRegionIds, ['iron-hills', 'obsidian-ridge']);
assert.deepEqual(reach.stockProviderRegionIds, ['east-steppe'], 'neutral or indirect neighbours cannot supply Stock');
assert.equal(getMapRelationship(reach, 'copper-basin'), 'selected');
assert.equal(getMapRelationship(reach, 'east-steppe'), 'adjacent');
assert.equal(getMapRelationship(reach, 'obsidian-ridge'), 'connected');
assert.equal(getMapRelationship(reach, 'cedar-woods'), null, 'unrelated regions stay outside the highlighted group');
assert.equal(getMapRelationships(state, 'copper-basin', false), null, 'dismissal clears every relationship cue');
assert.equal(JSON.stringify(state), beforeRelationships, 'reach queries leave simulation state and RNG untouched');
state.world.connections = state.world.connections.filter(edge => edge.regionAId !== 'copper-basin' && edge.regionBId !== 'copper-basin');
const isolated = getMapRelationships(state, 'copper-basin', true);
assert.deepEqual(isolated.adjacentRegionIds, []);
assert.deepEqual(isolated.connectedRegionIds, []);
assert.deepEqual(isolated.stockProviderRegionIds, [], 'road removal immediately removes supply eligibility');
console.log('[region-map-relationships] OK: direct versus indirect reach, Stock eligibility, dismissal, live roads, unchanged state');
