import { VASSAL_INTERVENTION_PRACTICE_IDS } from "../../defs/gamepieces/detailed-settlement-defs.js";
import { isFullMapOfferDefinition, FULL_MAP_SEED_CARD_IDS } from '../../defs/gamepieces/full-map-defs.js';
import { getVassalStockOutputIds, isVassalStockOutputPractice } from "../../defs/gamepieces/vassal-life-map-defs.js";
import { getDetailedPracticeDef, getDetailedStructureDef } from "../game-config.js";
import { getDetailedPracticeTierIndex } from "../detailed-practice-tiers.js";
import { getResearchUnlockIndex } from "../research-progression.js";
import { ageCohortTotal } from "../detailed-settlements/cohorts.js";
import { getPlayerDetailedSites } from "./selectors.js";

// Read the run's definitions and all surviving player settlements without
// consuming RNG. The generator makes the choices on its topology substream.
export function getStockShopGenerationContext(state, candidate) {
  const classId = candidate.founderClassId ?? candidate.classId;
  const practices = VASSAL_INTERVENTION_PRACTICE_IDS.map(id => getDetailedPracticeDef(state, id));
  const eligible = practices.filter(def => def && def.locked!==true && !FULL_MAP_SEED_CARD_IDS.includes(def.id)
    && (!state.rulesetId || isFullMapOfferDefinition(def))
    && ["common", classId].includes(def.pool));
  const availableOutputs = getVassalStockOutputIds(eligible);
  const unlocked = eligible.filter(def =>
    getDetailedPracticeTierIndex(def.minimumQuality ?? "bronze") <= getResearchUnlockIndex(state));
  const stockOutputs = getVassalStockOutputIds(unlocked);
  const unclassedStockOutputs = getVassalStockOutputIds(unlocked.filter(def => def.pool === 'common'));
  const sites = getPlayerDetailedSites(state);
  const installed = sites.flatMap(site =>
    (site.detailedState.practiceSlots ?? []).map(slot => getDetailedPracticeDef(state, slot?.practiceId)).filter(Boolean));
  const supplied = new Set(getVassalStockOutputIds(installed));
  const missing = new Set();
  const constructionRecipes=sites.flatMap(site=>site.detailedState.structureSlots.filter(slot=>slot?.construction)
    .map(slot=>getDetailedStructureDef(state,slot.structureId).construction));
  for (const def of [...installed,...constructionRecipes]) {
    for (const input of [...(def.consume ?? []), ...(def.require ?? [])]) {
      // A recipe's trait list contains alternatives, not multiple requirements.
      if ((input.amount ?? 1) <= 0 || input.traits.some(trait => supplied.has(trait))) continue;
      for (const trait of input.traits) if (availableOutputs.includes(trait)) missing.add(trait);
    }
  }
  // Settlements need Food even when no installed Practice explicitly requests it.
  if (!supplied.has("Edible") && sites.some(site =>
    Object.values(site.detailedState.populationByClass ?? {}).some(cohort => ageCohortTotal(cohort) > 0))) {
    if (eligible.some(def => isVassalStockOutputPractice(def, "Edible"))) missing.add("Edible");
  }
  return { stockOutputs, unclassedStockOutputs, unmetStockOutputs: [...missing].sort() };
}
