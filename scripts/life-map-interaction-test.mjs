import assert from 'node:assert/strict';
import { ActionKinds } from '../src/model/actions.js';
import { createSettlementVassalFlow } from '../src/views/ui-root/settlement-vassal-flow.js';

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
