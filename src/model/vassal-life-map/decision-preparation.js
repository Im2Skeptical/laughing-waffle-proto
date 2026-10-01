import { applyAction, ActionKinds } from '../actions.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { canonicalizeSnapshot } from '../canonicalize.js';
import { createProjectionChunkSession } from '../projection-chunk.js';
import { getCurrentLifeMapVassal, getVassalPendingResolution, getVassalNodeDecisionPresentation } from '../vassal-life-map.js';

export const LIFE_DRAFT_ACTIONS = new Set([
  ActionKinds.VASSAL_SELECT_LIFE_OPTION, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,
  ActionKinds.VASSAL_UNDO_SHOP_PURCHASE, ActionKinds.VASSAL_REORDER_SHOP_PURCHASE,
  ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE,
]);

// Used in a dedicated worker. All speculative branches own isolated RNG/state.
export async function prepareLifeChoices(stateData, yieldTask = async () => {}) {
  const base = deserializeGameState(stateData);
  const vassal = getCurrentLifeMapVassal(base);
  const nodes = {};
  if (!vassal || vassal.developmentChoiceQueue?.length || base.runStatus?.complete) return nodes;
  const ids = vassal.lifeMap.currentNodeId ? [vassal.lifeMap.currentNodeId] : vassal.lifeMap.availableNodeIds ?? [];
  for (const nodeId of ids) {
    await yieldTask();
    const state = deserializeGameState(stateData);
    const actions = vassal.lifeMap.currentNodeId ? [] : [{kind: ActionKinds.VASSAL_ENTER_LIFE_NODE, payload: {nodeId}}];
    if (actions.length && !applyAction(state, actions[0], {isReplay:true}).ok) continue;
    const entered = serializeGameState(state);
    const item = {actions, stateData: entered, presentation: getVassalNodeDecisionPresentation(state, nodeId)};
    const reroll = {kind: ActionKinds.VASSAL_REROLL_SHOP, payload: {nodeId}};
    const rerolled = deserializeGameState(entered);
    if (applyAction(rerolled, reroll, {isReplay:true}).ok) {
      item.reroll = {actions:[reroll], stateData:serializeGameState(rerolled), presentation:getVassalNodeDecisionPresentation(rerolled,nodeId)};
    }
    nodes[nodeId] = item;
  }
  return nodes;
}

export async function runLifeDecisionJob({stateData, actions = [], prepareOnly = false}, emit, yieldTask = async () => {}) {
  const state = deserializeGameState(stateData);
  for (const action of actions) {
    const result = applyAction(state, action, {isReplay:true});
    if (!result.ok) throw new Error(result.reason ?? 'invalidDecision');
  }
  canonicalizeSnapshot(state);
  const acceptedState = serializeGameState(state);
  if (!prepareOnly) emit({kind:'accepted', stateData:acceptedState});
  let finalState = acceptedState;
  const pending = getVassalPendingResolution(state);
  if (pending) {
    const startSec = state.tSec;
    let targetSec = Math.max(startSec + 1, pending.resolveSec);
    const session = createProjectionChunkSession(acceptedState, startSec, targetSec + 1, {stepSec:1, stateAnchorStrideSec:16});
    if (!session.ok) throw new Error(session.reason);
    let currentSec = startSec;
    while (currentSec < targetSec) {
      await yieldTask();
      const chunk = session.next(Math.min(targetSec, currentSec + 16));
      if (!chunk.ok) throw new Error(chunk.reason);
      currentSec = chunk.endSec;
      finalState = chunk.lastStateData;
      const atEnd = deserializeGameState(finalState);
      if (currentSec === targetSec && getVassalPendingResolution(atEnd) && !chunk.terminal) {
        if (targetSec >= Math.max(startSec + 1, pending.resolveSec + 1)) throw new Error('resolutionDidNotFinish');
        targetSec++;
      }
      emit({kind:'chunk', targetSec, chunk:{...chunk,
        stateDataBySecond:Array.from(chunk.stateDataBySecond), summaryBySecond:Array.from(chunk.summaryBySecond)}});
      if (chunk.terminal) break;
    }
  }
  emit({kind:'preparing', stateData:finalState});
  const nodes = await prepareLifeChoices(finalState, yieldTask);
  emit({kind:'ready', stateData:finalState, nodes});
}
