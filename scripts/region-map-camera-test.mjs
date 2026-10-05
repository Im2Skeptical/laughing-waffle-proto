import assert from 'node:assert/strict';
import { createMapPanelReveal } from '../src/views/world-map/transitions.js';
import { createMapCamera } from '../src/views/world-map/camera.js';
import { getMapRelationships, getMapRelationship, getRelationshipStyle, drawRelationshipLine } from '../src/views/world-map/relationships.js';
import { createLabFixture } from '../src/model/dev-lab/fixtures.js';
import { getAdjacentRegionIds, getWorldDefinition, getRegionPolygon } from '../src/model/world-state.js';
import { MAP_RECT, GROUP_FRAME_RECT } from '../src/views/world-map/constants.js';
import { getSettlementStockTags, getSettlementStockTagLayout } from '../src/views/world-map/stock-tags.js';

const stockView = {
  population: { mealDemand: 2 },
  practices: [
    { face: { stockTraits: ['Edible', 'Plant'], production: [{ icon: 'stock', value: 1 }] } },
    { face: { stockTraits: ['Metal', 'Metal'], production: [{ icon: 'stock', value: 1 }],
      inputs: [{ kind: 'consume', amount: 1, traits: ['Ore', 'Mineral'] }] } },
    { face: { inputs: [{ kind: 'require', amount: 1, traits: ['Plant', 'Animal'] }],
      chargeTriggers: [{ trait: 'Bone' }] } },
    { face: { stockTraits: ['Record'], production: [{ icon: 'research', value: 2 }] } },
  ],
  structures: [{ face: { inputs: [{ kind: 'consume', amount: 1, traits: ['Unknown'] }] } }],
};
const stockBefore = JSON.stringify(stockView);
const stockTags = getSettlementStockTags(stockView);
assert.deepEqual(stockTags.map(({ trait, outline }) => [trait, outline]), [
  ['Edible', null], ['Metal', 'green'], ['Mineral', 'red'], ['Ore', 'red'], ['Plant', null], ['Unknown', 'red'],
], 'deduplicated recipe roles include meals/Require, resolve alternatives, and exclude Charge triggers/non-Stock outputs');
assert.equal(stockTags.at(-1).iconId, 'stock', 'custom tags use the generic Stock icon');
assert.equal(JSON.stringify(stockView), stockBefore, 'map roles leave their source untouched');
assert.deepEqual(getSettlementStockTags(null), [], 'empty regions have no Stock icons');
const tagLayout = getSettlementStockTagLayout([...stockTags, stockTags[0]], { x: 800, y: 300 });
assert.equal(tagLayout[6].x, 800, 'wrapped rows are centered independently');
assert.equal(tagLayout[6].y - tagLayout[0].y, 36, 'wrapped icons have separate rows above the settlement');
const northernTags = getSettlementStockTagLayout([...stockTags, stockTags[0]], { x: 662, y: 214 });
assert.ok(northernTags.every(tag => tag.y - 18 >= 78), 'northern icons widen their row to stay clear of the header');
assert.ok(northernTags.every(tag => tag.x - 18 >= 580), 'northern icons stay clear of the Chaos drawer');

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
const groupFocus = {x:650,y:260};
camera.frame(groupPoints, groupBounds, groupFocus);
time += 400; camera.update();
for (const point of groupPoints) {
  const projected = camera.project(point);
  assert.ok(projected.x >= groupBounds.x - .001 && projected.x <= groupBounds.x + groupBounds.width + .001);
  assert.ok(projected.y >= groupBounds.y - .001 && projected.y <= groupBounds.y + groupBounds.height + .001);
}
assert.ok(camera.snapshot().zoom < 1, 'large groups can fit beside the detail panel');
const groupCenter = {x:groupBounds.x+groupBounds.width/2,y:groupBounds.y+groupBounds.height/2};
const assertGroupFocused = (point, message) => {
  const projected = camera.project(point);
  assert.ok(Math.abs(projected.x-groupCenter.x)<.001
    && projected.y>=groupBounds.y-.001 && projected.y<=groupBounds.y+groupBounds.height+.001, message);
};
assertGroupFocused(groupFocus, 'selection stays horizontally centered instead of the group bounding box');
camera.frame(groupPoints, groupBounds, groupPoints[1]);
time += 400; camera.update();
assertGroupFocused(groupPoints[1], 'switching keeps a settlement at the group edge in focus');
for (const point of groupPoints) {
  const projected = camera.project(point);
  assert.ok(projected.x >= groupBounds.x - .001 && projected.x <= groupBounds.x + groupBounds.width + .001);
  assert.ok(projected.y >= groupBounds.y - .001 && projected.y <= groupBounds.y + groupBounds.height + .001);
}
assert.ok(camera.snapshot().zoom < .35, 'automatic framing can zoom out enough for a horizontally off-center group');
const fittedZoom = camera.snapshot().zoom;
camera.zoomBy(1.2);
assert.ok(Math.abs(camera.snapshot().zoom - fittedZoom * 1.2) < .001, 'manual zoom remains gradual after a wide group fit');
camera.frame([groupFocus], groupBounds, groupFocus);
time += 400; camera.update();
assertGroupFocused(groupFocus, 'isolated settlements remain centered');
assert.ok(Math.abs(camera.project(groupFocus).y-groupCenter.y)<.001, 'isolated framing keeps vertical center');
assert.equal(camera.snapshot().zoom, 2.5, 'isolated framing respects the maximum zoom');
console.log('[region-map-group-frame] OK: selected settlement stays in focus, whole group fits, edge/isolated selections, gradual manual zoom');

// R10 with only R14 connected: the southern neighbour must not force a
// matching empty margin above the selected settlement.
const screenshotDefinition = getWorldDefinition(createLabFixture('defense', 42));
const mapPoint = point => ({x:MAP_RECT.x+point.x*MAP_RECT.width,y:MAP_RECT.y+point.y*MAP_RECT.height});
const screenshotRegions = screenshotDefinition.regions.filter(region => ['east-steppe','obsidian-ridge'].includes(region.id));
const screenshotPoints = screenshotRegions.flatMap(region => getRegionPolygon(screenshotDefinition, region).map(mapPoint));
const screenshotFocus = mapPoint(screenshotRegions.find(region => region.id==='east-steppe').display.labelPoint);
camera.frame(screenshotPoints, GROUP_FRAME_RECT, screenshotFocus);
time += 400; camera.update();
assert.ok(camera.snapshot().zoom > .98, `R10/R14 should fill the usable map height; actual zoom=${camera.snapshot().zoom}`);
for (const point of screenshotPoints) {
  const projected = camera.project(point);
  assert.ok(projected.x >= GROUP_FRAME_RECT.x-.001 && projected.x <= GROUP_FRAME_RECT.x+GROUP_FRAME_RECT.width+.001);
  assert.ok(projected.y >= GROUP_FRAME_RECT.y-.001 && projected.y <= GROUP_FRAME_RECT.y+GROUP_FRAME_RECT.height+.001);
}
assert.ok(Math.abs(camera.project(screenshotFocus).x-(GROUP_FRAME_RECT.x+GROUP_FRAME_RECT.width/2))<.001,
  'R10 remains horizontally centered while its neighbour fills the frame');

const state = createLabFixture('defense', 42);
const beforeRelationships = JSON.stringify(state);
const reach = getMapRelationships(state, 'copper-basin', true);
assert.deepEqual(reach.highlightedRegionIds, ['high-pass', 'east-steppe']);
assert.deepEqual(reach.groupRegionIds, ['copper-basin', 'high-pass', 'east-steppe'],
  'camera frames only the selection and adjacent regions with a direct road');
assert.ok(!reach.groupRegionIds.includes('obsidian-ridge'), 'indirect connections do not widen the camera frame');
assert.equal(getMapRelationship(reach, 'copper-basin'), 'selected');
assert.equal(getMapRelationship(reach, 'east-steppe'), 'connected');
assert.equal(getMapRelationship(reach, 'obsidian-ridge'), null, 'indirect connectivity alone does not qualify');
assert.equal(getMapRelationship(reach, 'cedar-woods'), null, 'unrelated regions stay outside the highlighted group');
assert.equal(getMapRelationships(state, 'copper-basin', false), null, 'dismissal clears every relationship cue');
assert.equal(JSON.stringify(state), beforeRelationships, 'reach queries leave simulation state and RNG untouched');
const unconnectedNeighbour = getAdjacentRegionIds(state, 'copper-basin').find(id => !reach.highlightedRegionIds.includes(id));
assert.ok(unconnectedNeighbour, 'fixture includes a physical neighbour without a road');
assert.equal(getMapRelationship(reach, unconnectedNeighbour), null, 'physical adjacency alone does not qualify');
assert.ok(!reach.groupRegionIds.includes(unconnectedNeighbour), 'adjacency without a road does not widen the camera frame');
state.world.connections.push({regionAId:'copper-basin',regionBId:'cedar-woods'});
const roadOnly = getMapRelationships(state, 'copper-basin', true);
assert.equal(getMapRelationship(roadOnly, 'cedar-woods'), null, 'a road alone cannot bypass physical adjacency');
assert.ok(!roadOnly.groupRegionIds.includes('cedar-woods'), 'a road without adjacency does not widen the camera frame');
state.world.connections = state.world.connections.filter(edge => edge.regionAId !== 'copper-basin' && edge.regionBId !== 'copper-basin');
const isolated = getMapRelationships(state, 'copper-basin', true);
assert.deepEqual(isolated.highlightedRegionIds, [], 'road removal immediately removes the highlight');
assert.deepEqual(isolated.groupRegionIds, ['copper-basin'], 'isolated selections frame their own territory');
console.log('[region-map-relationships] OK: adjacency AND direct connection, indirect exclusion, dismissal, live roads, unchanged state');

const allied = getRelationshipStyle({controller:'player',hasDetailedSettlement:true});
const neutral = getRelationshipStyle({controller:'external-a',neutral:{defense:1},hasDetailedSettlement:true});
const empty = getRelationshipStyle({controller:'frontier',hasDetailedSettlement:false});
const hostile = getRelationshipStyle({controller:'player',hasDetailedSettlement:true,monster:{defense:3}});
assert.equal(allied.kind, 'allied');
assert.equal(neutral.kind, 'neutral');
assert.equal(empty.kind, 'empty');
assert.equal(hostile.kind, 'hostile', 'Monster occupation overrides former ownership');
assert.equal(getRelationshipStyle({controller:'player',hasDetailedSettlement:false}).kind, 'empty', 'owned empty land is not an allied settlement');
assert.ok(allied.width > neutral.width && neutral.width > empty.width, 'settlement hierarchy is reflected in stroke weight');
assert.ok(hostile.colour !== allied.colour, 'hostile regions remain visually distinct');
const inkCoverage = style => {
  let x = 0, y = 0, coverage = 0;
  const graphics = {lineStyle(){return this;}, moveTo(px,py){x=px;y=py;return this;},
    lineTo(px,py){coverage+=Math.hypot(px-x,py-y);x=px;y=py;return this;}};
  drawRelationshipLine(graphics, {x:0,y:0}, {x:120,y:0}, style);
  return coverage;
};
assert.equal(inkCoverage(allied), 120, 'allied roads and borders are continuous');
assert.ok(inkCoverage(allied) > inkCoverage(neutral) && inkCoverage(neutral) > inkCoverage(empty), 'neutral dashes have more visual presence than empty-region dots');
console.log('[region-map-hierarchy] OK: allied/neutral/empty hierarchy, owned empty land, Monster precedence, actual stroke coverage');
