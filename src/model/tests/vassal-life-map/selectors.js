import assert from "node:assert/strict";
import { ActionKinds } from "../../actions.js";
import { createInitialState } from "../../init.js";
import {
  VASSAL_LEGACY_OPTIONS,
  VASSAL_NODE_FAMILIES,
  VASSAL_LIFE_TUNING,
} from "../../../defs/gamepieces/vassal-life-map-defs.js";
import {
  getAdjustedVassalPrestigeCost,
  getAdjustedVassalPhaseCost,
  formatVassalPhaseDuration,
  getVassalPhaseDurationParts,
  getCurrentLifeMapVassal,
  getLifeMapVassalAtSecond,
  getSettlementCurrentVassal,
  getSettlementFirstSelectedVassal,
  getSettlementSelectedVassals,
  getVassalCandidatePool,
  getVassalDevelopmentIncome,
  getVassalLifeMapNodes,
  getVassalPrestigeIncome,
} from "../../vassal-life-map.js";
import {
  dispatch,
  selectedState,
  selectedStateForSignature,
} from "./helpers.js";

const historicalSelectionState = {
  tSec: 30,
  civilization: {
    vassalLineage: {
      selectedVassalIds: ["v1", "v2", "v3"],
      vassalsById: {
        v1: { vassalId: "v1", selectedSec: 10 },
        v2: { vassalId: "v2", selectedSec: 20 },
        v3: { vassalId: "v3", selectedSec: 20 },
      },
    },
  },
};
assert.equal(getLifeMapVassalAtSecond(historicalSelectionState, 9), null);
assert.equal(getLifeMapVassalAtSecond(historicalSelectionState, 19)?.vassalId, "v1");
assert.equal(getLifeMapVassalAtSecond(historicalSelectionState, 20)?.vassalId, "v3",
  "the newest Vassal wins when selections share a timeline second");
assert.equal(getLifeMapVassalAtSecond(historicalSelectionState, 30)?.vassalId, "v3",
  "the latest Vassal remains selected through a gap after their life");
assert.equal(getCurrentLifeMapVassal(historicalSelectionState), null,
  "id-only current reads ignore selected ids");
assert.equal(getSettlementCurrentVassal(historicalSelectionState), null,
  "live current reads do not fall back through selected ids when vassalsById exists");
assert.deepEqual(
  getSettlementSelectedVassals(historicalSelectionState).map((vassal) => vassal.vassalId),
  ["v1", "v2", "v3"],
);
assert.equal(getSettlementFirstSelectedVassal(historicalSelectionState)?.vassalId, "v1");

const liveObjectState = {
  civilization: {
    vassalLineage: {
      currentVassal: { vassalId: "live" },
      currentVassalId: "idOnly",
      selectedVassals: [{ vassalId: "selectedObject" }],
      selectedVassalIds: ["idOnly"],
      vassalsById: { idOnly: { vassalId: "idOnly" } },
    },
  },
};
assert.equal(getCurrentLifeMapVassal(liveObjectState)?.vassalId, "idOnly");
assert.equal(getSettlementCurrentVassal(liveObjectState)?.vassalId, "live");
assert.equal(getSettlementFirstSelectedVassal(liveObjectState)?.vassalId, "selectedObject");

const selectedIdFallbackState = {
  civilization: {
    vassalLineage: {
      selectedVassalIds: ["v1", "v2"],
      vassalsById: undefined,
    },
  },
};
assert.equal(getSettlementCurrentVassal(selectedIdFallbackState), null);

const selectedArrayFallbackState = {
  civilization: {
    vassalLineage: {
      selectedVassalIds: ["v1"],
    },
  },
};
assert.equal(getSettlementCurrentVassal(selectedArrayFallbackState), null);
assert.deepEqual(getSettlementSelectedVassals(selectedArrayFallbackState), []);
assert.equal(VASSAL_NODE_FAMILIES.development.label, "Development");

const formulaState = selectedState(100);
const formulaVassal = getCurrentLifeMapVassal(formulaState);
formulaVassal.stats = { cunning: 4, wisdom: 5, effectiveness: 20, intelligence: 20 };
assert.equal(getVassalPrestigeIncome(formulaVassal), 7);
assert.equal(getVassalDevelopmentIncome(formulaVassal), 7);
assert.equal(getAdjustedVassalPrestigeCost(formulaVassal, 20), 8, "Intelligence caps at 60%");
assert.equal(getAdjustedVassalPhaseCost(formulaVassal, 120), 48, "Phase costs round upward");
assert.equal(getAdjustedVassalPhaseCost(formulaVassal, 1), 1, "nonzero Phase costs keep a minimum of one");
assert.equal(formatVassalPhaseDuration(0), "0 phases");
assert.equal(formatVassalPhaseDuration(32), "1 year");
assert.equal(formatVassalPhaseDuration(80), "2 years, 2 moons, 4 phases");
for (const phaseDurationSec of [1, 2, 3, 5, 20]) {
  for (const seasonDurationSec of [1, 8, 17, 120]) {
    const calendarState = { gameConfig: { settings: { values: { phaseDurationSec, seasonDurationSec } } } };
    const untouched = JSON.stringify(calendarState);
    for (const phaseCost of [0, 1, 5, 6, 30, 31, 32, 33, 80, 216, 432, 9999]) {
      const parts = getVassalPhaseDurationParts(phaseCost, calendarState);
      assert.equal(parts.years * seasonDurationSec * 4 + (parts.moons * 6 + parts.phases) * phaseDurationSec,
        phaseCost * phaseDurationSec, 'Cost units reconstruct the exact configured elapsed time');
      if ((seasonDurationSec * 4) % phaseDurationSec !== 0) assert.equal(parts.years, 0);
    }
    assert.equal(JSON.stringify(calendarState), untouched, 'Formatting cannot change a run');
  }
}
assert.deepEqual(VASSAL_LEGACY_OPTIONS.map((option) => option.id), [
  "foundDynasty", "enduringOffice", "humbleRemembrance",
]);
assert.equal(VASSAL_LEGACY_OPTIONS[0].prestigeCost, VASSAL_LIFE_TUNING.legacyPrestigeCost * 2);
assert.equal(VASSAL_LEGACY_OPTIONS[0].legacyStartingPrestigeBonus,
  VASSAL_LIFE_TUNING.legacyStartingPrestigeBonus * 2);

const signaturePoolState = createInitialState("devPlaytesting01", 2201);
const signaturePool = getVassalCandidatePool(signaturePoolState);
assert.equal(new Set(signaturePool.candidates.map((candidate) => candidate.signatureNode.groupId)).size, 3,
  "a candidate pool contains three distinct signature groups");
assert.ok(signaturePool.candidates.every((candidate) => candidate.portrait
  && Object.values(candidate.portrait).every((value) => typeof value === "string")),
"every candidate has a JSON-only procedural portrait descriptor");

const portraitIsolationA = createInitialState("devPlaytesting01", 2202);
const portraitIsolationB = createInitialState("devPlaytesting01", 2202);
for (let index = 0; index < 12; index += 1) portraitIsolationB.rngNextVassalPortraitInt(0, 99);
dispatch(portraitIsolationA, ActionKinds.SETTLEMENT_REROLL_VASSALS);
dispatch(portraitIsolationB, ActionKinds.SETTLEMENT_REROLL_VASSALS);
const mechanicalCandidate = (candidate) => {
  const copy = structuredClone(candidate);
  delete copy.portrait;
  delete copy.candidateIndex;
  return copy;
};
assert.deepEqual(getVassalCandidatePool(portraitIsolationA).candidates.map(mechanicalCandidate),
  getVassalCandidatePool(portraitIsolationB).candidates.map(mechanicalCandidate),
  "portrait RNG changes do not perturb candidate mechanics or signature rolls");

for (const variantId of ["settlement", "monsterHunt", "removePractice", "foodShop"]) {
  const signatureState = selectedStateForSignature(variantId);
  const signatureNode = getVassalLifeMapNodes(getCurrentLifeMapVassal(signatureState))
    .find((node) => node.signatureNode?.variantId === variantId);
  assert.equal(signatureNode.band, "mid", `${variantId} replaces a mid-band node`);
  assert.equal(signatureNode.family, "signature");
}
const ordinaryFamilyState = selectedState(2203);
assert.ok(getVassalLifeMapNodes(getCurrentLifeMapVassal(ordinaryFamilyState))
  .every((node) => node.family !== "settlement"), "Settlement is absent from ordinary family rolls");
