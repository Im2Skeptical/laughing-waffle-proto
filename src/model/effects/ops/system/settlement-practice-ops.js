import {
  removePracticeFromElderAgendas,
  removePracticeFromPersistentPracticeBoards,
} from "../../../settlement-order-exec.js";
import { removePracticeFromVassalAgendas } from "../../../settlement-vassal-exec.js";

function resolvePracticeDefId(effect, context) {
  if (typeof effect?.practiceDefId === "string" && effect.practiceDefId.length > 0) {
    return effect.practiceDefId;
  }
  if (typeof context?.practiceSourceId === "string" && context.practiceSourceId.length > 0) {
    return context.practiceSourceId;
  }
  if (typeof context?.commitment?.sourceId === "string" && context.commitment.sourceId.length > 0) {
    return context.commitment.sourceId;
  }
  if (typeof context?.practiceDef?.id === "string" && context.practiceDef.id.length > 0) {
    return context.practiceDef.id;
  }
  return null;
}

function resolvePracticeClassId(effect, context) {
  if (typeof effect?.classId === "string" && effect.classId.length > 0) {
    return effect.classId;
  }
  if (typeof context?.populationClassId === "string" && context.populationClassId.length > 0) {
    return context.populationClassId;
  }
  return null;
}

export function handleRemoveSettlementPractice(state, effect, context) {
  const practiceDefId = resolvePracticeDefId(effect, context);
  if (!practiceDefId) return false;

  const classId = resolvePracticeClassId(effect, context);
  const suppressForCurrentYear = effect?.suppressForCurrentYear === true;

  let changed = false;
  changed =
    removePracticeFromElderAgendas(state, practiceDefId, classId, {
      suppressForCurrentYear,
    }) || changed;
  changed = removePracticeFromVassalAgendas(state, practiceDefId, classId) || changed;
  changed = removePracticeFromPersistentPracticeBoards(state, practiceDefId, classId) || changed;
  return changed;
}
