import { createLabNodeSandbox } from '../model/dev-lab/node-sandbox.js';
import { serializeGameState, deserializeGameState } from '../model/state.js';
import { advanceReplayStateToSecond } from '../model/replay-second-runner.js';
import { getCurrentLifeMapVassal, getVassalNodeDecisionPresentation, enterVassalLifeNode,
  selectVassalNodeOption, purchaseVassalShopOffer, undoVassalShopPurchase,
  reorderVassalShopPurchase, moveVassalShopStructure, rerollVassalShop, confirmVassalLifeNode } from '../model/vassal-life-map.js';

export function createNodeSandboxController() {
  let sandbox = createLabNodeSandbox(), message = 'Dummy ready. Inspect cards, stage offers or select an option, then Confirm.';
  function transact(operation, label) {
    const next = deserializeGameState(serializeGameState(sandbox.state));
    const result = operation(next);
    if (!result.ok) throw new Error(result.reason);
    sandbox = { ...sandbox, state:deserializeGameState(serializeGameState(next)) };
    message = label;
    return result;
  }
  return {
    getSnapshot: () => ({ ...sandbox, message, vassal:getCurrentLifeMapVassal(sandbox.state) }),
    getDecision: (id, preview) => getVassalNodeDecisionPresentation(sandbox.state, id, preview),
    refresh(settings) { const next = createLabNodeSandbox(settings); sandbox = next; message = `Fresh ${next.settings.type} · seed ${next.settings.seed} · dummy and settlement reset`; },
    enter: (...args) => transact(state => enterVassalLifeNode(state, ...args), 'Entered node'),
    select: (...args) => transact(state => selectVassalNodeOption(state, ...args), 'Selected option'),
    purchase: (...args) => transact(state => purchaseVassalShopOffer(state, ...args), 'Offer staged · Confirm applies the draft'),
    undo: (...args) => transact(state => undoVassalShopPurchase(state, ...args), 'Purchase undone'),
    reorder: (...args) => transact(state => reorderVassalShopPurchase(state, ...args), 'Practice order updated'),
    move: (...args) => transact(state => moveVassalShopStructure(state, ...args), 'Structure placement updated'),
    reroll: (...args) => transact(state => rerollVassalShop(state, ...args), 'In-game reroll · normal cost and limit apply'),
    confirm(...args) {
      const result=transact(state => confirmVassalLifeNode(state, ...args), 'Decision committed');
      message=getCurrentLifeMapVassal(sandbox.state)?.lifeMap.pendingResolution
        ? 'Decision committed. Resolve outcome to advance through its real simulation ticks.'
        : 'Decision resolved. Refresh contents to try again.';
      return result;
    },
    resolve() {
      return transact(state => {
        const pending = getCurrentLifeMapVassal(state)?.lifeMap.pendingResolution;
        if (!pending) return { ok:false, reason:'No pending outcome' };
        state.paused = false;
        const result = advanceReplayStateToSecond(state, pending.resolveSec);
        // Game over can stop ticks early; preserve that real outcome.
        return result.ok || state.runStatus?.complete ? { ok:true } : result;
      }, 'Outcome resolved through simulation ticks. Refresh contents to try again.');
    },
  };
}
