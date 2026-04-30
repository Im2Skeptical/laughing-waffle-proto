import { normalizeEffectSpec } from "./core/normalize.js";
import {
  handleAddToSystemState,
  handleClampSystemState,
  handleAccumulateRatio,
  handleResetSystemState,
  handleAdjustSystemState,
  handleAdjustSettlementFood,
  handleAdjustSettlementTileStore,
  handleAdjustSettlementChaosGodState,
} from "./ops/system/state-ops.js";
import {
  handleReservePopulation,
  handleShiftPopulationClassHappiness,
  handleTransferPopulationClass,
} from "./ops/system/population-ops.js";
import { handleAdvanceSettlementStructureUpgrade } from "./ops/system/settlement-upgrade-ops.js";
import { handleRemoveSettlementPractice } from "./ops/system/settlement-practice-ops.js";
import { handleSetProp, handleAddProp } from "./ops/prop-ops.js";

const handlers = {
  AddToSystemState: handleAddToSystemState,
  ClampSystemState: handleClampSystemState,
  AccumulateRatio: handleAccumulateRatio,
  ResetSystemState: handleResetSystemState,
  AdjustSystemState: handleAdjustSystemState,
  AdjustSettlementFood: handleAdjustSettlementFood,
  AdjustSettlementTileStore: handleAdjustSettlementTileStore,
  AdjustSettlementChaosGodState: handleAdjustSettlementChaosGodState,
  ReservePopulation: handleReservePopulation,
  ShiftPopulationClassHappiness: handleShiftPopulationClassHappiness,
  TransferPopulationClass: handleTransferPopulationClass,
  AdvanceSettlementStructureUpgrade: handleAdvanceSettlementStructureUpgrade,
  RemoveSettlementPractice: handleRemoveSettlementPractice,
  SetProp: handleSetProp,
  AddProp: handleAddProp,
};

export { normalizeEffectSpec };

export function runEffect(state, rawEffect, context) {
  if (!rawEffect) return false;

  if (Array.isArray(rawEffect)) {
    let changed = false;
    for (const eff of rawEffect)
      changed = runEffect(state, eff, context) || changed;
    return changed;
  }

  const effect = normalizeEffectSpec(rawEffect);
  if (!effect) return false;

  const handler = handlers[effect.op];
  if (!handler) return false;
  return handler(state, effect, context);
}

