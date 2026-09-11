import { normalizeStructureLayout } from "../../structure-layout.js";
import { settlementStructureDefs } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { createInitialState } from "../../init.js";
import { DETAILED_PRACTICE_SLOT_COUNT } from "../../../defs/gamepieces/detailed-settlement-defs.js";

export function putStructure(settlement, structureId, origin = 2, tier = 'bronze') {
  const entries = [...settlement.structureSlots];
  entries[origin] = { structureId, tier, origin, width: settlementStructureDefs[structureId].footprint, placementId: 'fixture:' + origin };
  settlement.structureSlots = normalizeStructureLayout(entries, entries.length, id => settlementStructureDefs[id]);
}

export function fresh(seed = 12345) {
  return createInitialState("devPlaytesting01", seed);
}

export function clearDetailedPopulationAndFood(state) {
  for (const site of state.world.sites) {
    const settlement = site.detailedState;
    settlement.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
    settlement.storedFood = 0;
    settlement.looseFood = 0;
    for (const classState of Object.values(settlement.populationByClass)) {
      classState.children = 0;
      classState.adults = 0;
      classState.eldersByAge = [];
      classState.faith = { tier: "gold" };
      classState.happiness = {
        status: "neutral",
        fullFeedStreak: 0,
        missedFeedStreak: 0,
        partialFeedRatios: [],
      };
    }
  }
  return state;
}

export function disableMonthlyDemographics(state) {
  for (const id of [
    "birthRateBronze", "birthRateSilver", "birthRateGold", "birthRateDiamond",
    "childToAdultRate", "adultToElderRate",
  ]) {
    state.gameConfig.settings.values[id] = 0;
  }
  return state;
}
