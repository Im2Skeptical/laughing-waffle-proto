import { resolveAmount } from "../../core/amount.js";
import { resolveEffectDef } from "../../core/registry.js";
import { resolveEffectTargets } from "./targets.js";
import {
  advanceSettlementStructureUpgrade,
  findSettlementStructureByDefId,
} from "../../../settlement-upgrades.js";
import { settlementPracticeDefs } from "../../../../defs/gamepieces/settlement-practice-defs.js";
import { removePracticeFromElderAgendas } from "../../../settlement-order-exec.js";
import { removePracticeFromVassalAgendas } from "../../../settlement-vassal-exec.js";

export function handleAdvanceSettlementStructureUpgrade(state, effect, context) {
  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  let changed = false;
  for (const target of targets) {
    if (!target?.systemState?.populationClasses) continue;
    const structureDefId =
      typeof effect.structureDefId === "string" && effect.structureDefId.length > 0
        ? effect.structureDefId
        : typeof context?.structureDefId === "string" && context.structureDefId.length > 0
          ? context.structureDefId
          : null;
    if (!structureDefId) continue;
    const structure = findSettlementStructureByDefId(state, structureDefId);
    if (!structure) continue;

    const { def } = resolveEffectDef(effect, target, context);
    const amountRaw = resolveAmount(effect, structure, def, context);
    const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.floor(amountRaw)) : 0;
    if (amount <= 0) continue;

    const upgradeResult = advanceSettlementStructureUpgrade(structure, amount);
    if (upgradeResult.changed) {
      for (const practiceDef of Object.values(settlementPracticeDefs)) {
        if (practiceDef?.upgradeTargetStructureDefId !== structureDefId) continue;
        const eligibleClassIds = Array.isArray(practiceDef.orderEligibleClassIds)
          ? practiceDef.orderEligibleClassIds
          : [];
        if (eligibleClassIds.length <= 0) {
          changed =
            removePracticeFromElderAgendas(state, practiceDef.id, null, {
              suppressForCurrentYear: true,
            }) || changed;
          changed = removePracticeFromVassalAgendas(state, practiceDef.id, null) || changed;
          continue;
        }
        for (const classId of eligibleClassIds) {
          changed =
            removePracticeFromElderAgendas(state, practiceDef.id, classId, {
              suppressForCurrentYear: true,
            }) || changed;
          changed = removePracticeFromVassalAgendas(state, practiceDef.id, classId) || changed;
        }
      }
    }
    changed = upgradeResult.changed || changed;
  }

  return changed;
}
