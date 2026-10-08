import assert from 'node:assert/strict';
import { ActionKinds } from '../src/model/actions.js';
import { createSettlementVassalFlow } from '../src/views/ui-root/settlement-vassal-flow.js';
import { createNewGameState } from '../src/model/new-game.js';
import { getCurrentLifeMapVassal } from '../src/model/vassal-life-map.js';
import { createVassalResolutionRecapView } from '../src/views/vassal-resolution-recap-pixi.js';
import { describeEntryBlockedReason, getEntryConsequences } from '../src/views/life-map-entry-confirm-pixi.js';
import { selectedState, forceEnter, nodeIdForFamily, dispatch, resolvePending }
  from '../src/model/tests/vassal-life-map/helpers.js';

// Opening the chooser after a scrub must clear the preview before navigation
// renders. Otherwise it builds the future map, then rebuilds the present map.
let chooserState = createNewGameState(123);
let previewActive = true, scrubLatched = true;
const chooser = createSettlementVassalFlow({
  getRunner: () => ({ clearPreviewState: () => { previewActive = false; } }),
  getGraphView: () => ({ resetForecastPreviewState: () => { scrubLatched = false; } }),
  playback: { getSettlementFrontierState: () => chooserState,
    getSettlementAuthoritativeState: () => chooserState,
    getSettlementPlaybackTarget: () => 0 },
  setWorldViewMode: () => {
    assert.equal(previewActive, false, 'navigation renders the present, not the scrub preview');
    assert.equal(scrubLatched, false, 'navigation must not restore the old scrub target');
  },
});
assert.equal(chooser.openLifeMapVassalSelection().ok, true);
chooser.closeSettlementVassalSelection();
chooserState = selectedState(108);
const legacy = forceEnter(chooserState, nodeIdForFamily(chooserState, 'legacy'));
dispatch(chooserState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: legacy.nodeId, optionId: 'humbleRemembrance',
});
dispatch(chooserState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: legacy.nodeId });
if (getCurrentLifeMapVassal(chooserState)) resolvePending(chooserState);
assert.equal(getCurrentLifeMapVassal(chooserState), null, 'successor fixture has an ended Vassal');
previewActive = scrubLatched = true;
assert.equal(chooser.openLifeMapVassalSelection().ok, true, 'Next Vassal clears previews before rendering too');

// Entering and editing a pending decision must not synchronously rebuild the
// civilization forecast. Confirmation still takes the full invalidation path.
const dispatched = [];
let refreshed = 0;
let invalidated = 0;
const flow = createSettlementVassalFlow({
  getRunner: () => ({ dispatchActionAtCurrentSecond(kind, payload, options) {
    dispatched.push({ kind, payload, options });
    return { ok: true };
  } }),
  playback: {
    getSettlementViewedSec: () => 0,
    getSettlementFrontierSec: () => 0,
    getSettlementFrontierState: () => null,
  },
  getNodeDecisionView: () => ({ refresh: () => refreshed++ }),
  onInvalidateProjectedLoss: () => invalidated++,
});
for (const kind of [ActionKinds.VASSAL_ENTER_LIFE_NODE, ActionKinds.VASSAL_SELECT_LIFE_OPTION,
  ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, ActionKinds.VASSAL_UNDO_SHOP_PURCHASE]) {
  assert.equal(flow.dispatchLifeMapAction(kind, { nodeId: 'test' }).ok, true);
  assert.equal(dispatched.at(-1).options.viewInvalidationReason, 'vassalDecisionStaged');
}
assert.equal(refreshed, 4);
assert.equal(invalidated, 0);
flow.dispatchLifeMapAction(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: 'test' });
assert.equal(dispatched.at(-1).options.viewInvalidationReason, undefined);
assert.equal(invalidated, 1);
console.log('[life-map-interaction] entry and drafts avoid forecast rebuild; confirmation invalidates');

// The entry dialog states what committing does before the player confirms.
const entryRows = (spec) => getEntryConsequences(spec).map(row => `${row.id}:${row.detail}`);
assert.deepEqual(entryRows({node:{family:'training'}, otherOpenCount:0}), [
  'cost:Free to enter · each choice lists its own cost',
  'path:Locks in this path · it is the only open node',
]);
assert.match(entryRows({node:{family:'training'}, otherOpenCount:1})[1], /1 other open node closes$/u);
assert.match(entryRows({node:{family:'training'}, otherOpenCount:2})[1], /2 other open nodes close$/u);
for (const node of [{family:'crisis'}, {family:'relic'}, {family:'signature', signatureNode:{variantId:'monsterHunt'}}]) {
  assert.ok(getEntryConsequences({node}).some(row => row.id === 'risk'), `${node.family} warns about death risk`);
}
assert.equal(getEntryConsequences({node:{family:'travel'}}).some(row => row.id === 'risk'), false);
assert.equal(getEntryConsequences({node:{family:'travel'}, blockedReason:'heirloomLoadoutRequired'}).at(-1).detail,
  'Finish equipping Heirlooms first.');
assert.equal(describeEntryBlockedReason('somethingNew'), "This node can't be entered right now.");
assert.equal(describeEntryBlockedReason(null), null);
console.log('[life-map-interaction] entry confirmation lists cost, commitment, risk and blocked reasons');

// A Vassal may die while the player is viewing the civilization map.
// Exercise the real recap view with a minimal display surface.
class Display {
  constructor() {
    this.children = []; this.visible = true;
    this.position = this.scale = this.anchor = {set() {}};
  }
  addChild(...nodes) { this.children.push(...nodes); for (const node of nodes) node.parent = this; }
  removeChild(node) { this.children = this.children.filter(child => child !== node); }
  on() {} once() {} off() {} destroy() {}
}
class Graphics extends Display {}
for (const method of ['clear','beginFill','beginTextureFill','lineStyle','drawRect','drawPolygon','drawCircle','endFill','moveTo','lineTo']) {
  Graphics.prototype[method] = function() { return this; };
}
globalThis.document = {createElement: () => ({getContext: () => ({fillRect() {}})})};
globalThis.PIXI = {Container:Display, Graphics, Text:Display, Rectangle:class {},
  Texture:{from:() => ({baseTexture:{}})}, SCALE_MODES:{NEAREST:0}};
const deathRecap = createVassalResolutionRecapView({
  app:{screen:{width:2424,height:1080}}, layer:new Display(),
  isLifegraphVisible:() => false,
  getRecap:() => ({endedReason:'died',deathCause:'naturalMortality'}),
});
deathRecap.init();
assert.equal(deathRecap.isOpen(), true, 'death screen opens before inheritance even outside Lifegraph');
