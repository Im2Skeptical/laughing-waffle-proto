import assert from 'node:assert/strict';
import { ActionKinds } from '../src/model/actions.js';
import { createSettlementVassalFlow } from '../src/views/ui-root/settlement-vassal-flow.js';
import { createNewGameState } from '../src/model/new-game.js';
import { getCurrentLifeMapVassal } from '../src/model/vassal-life-map.js';
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
