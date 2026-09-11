// Vassal candidate portraits, signatures, pool generation, and selection.

import {
  VASSAL_LIFE_TUNING,
  VASSAL_SIGNATURE_NODE_GROUP_IDS,
  VASSAL_SIGNATURE_NODE_VARIANTS,
  VASSAL_SIGNATURE_VARIANT_IDS_BY_GROUP,
  VASSAL_STAT_IDS,
} from "../../../defs/gamepieces/vassal-life-map-defs.js";
import { getDetailedStructureDef } from "../../game-config.js";
import {
  getDetailedPracticeTierIndex,
} from "../../detailed-practice-tiers.js";
import {
  generateVassalLifeMap,
} from "../../vassal-life-map-generator.js";
import {
  getRegionReference,
} from "../../world-state.js";
import {
  candidatePoolHash,
  clone,
  getDetailedSite,
  getPlayerDetailedSites,
  getVassalCandidatePool,
  getVassalLineage,
  shuffle,
} from "../selectors.js";

const VASSAL_PORTRAIT_KEYS = Object.freeze([
  "skinTone", "hairStyle", "hairColor", "faceShape",
  "clothingColor", "accessory", "expression",
]);

export function isValidPortraitDescriptor(portrait) {
  return !!portrait && typeof portrait === "object" && !Array.isArray(portrait)
    && VASSAL_PORTRAIT_KEYS.every((key) => typeof portrait[key] === "string" && portrait[key]);
}

export function isValidSignatureDescriptor(descriptor) {
  const variant = VASSAL_SIGNATURE_NODE_VARIANTS[descriptor?.variantId];
  return !!variant
    && descriptor.id === variant.id
    && descriptor.groupId === variant.groupId
    && descriptor.label === variant.label
    && descriptor.glyph === variant.glyph
    && descriptor.color === variant.color
    && descriptor.description === variant.description
    && descriptor.removalKind === variant.removalKind
    && descriptor.tag === variant.tag;
}

function generateVassalPortrait(state) {
  const pick = (values) => values[state.rngNextVassalPortraitInt(0, values.length - 1)];
  return {
    skinTone: pick(["umber", "sienna", "ochre", "olive", "rose", "ivory"]),
    hairStyle: pick(["crop", "waves", "braids", "coils", "long", "shaved"]),
    hairColor: pick(["black", "brown", "auburn", "gold", "silver"]),
    faceShape: pick(["round", "oval", "angular"]),
    clothingColor: pick(["red", "blue", "green", "gold", "purple", "charcoal"]),
    accessory: pick(["none", "band", "pin", "beads", "earring"]),
    expression: pick(["calm", "bright", "stern"]),
  };
}

function generateSignatureNodes(state) {
  const groups = shuffle(state, VASSAL_SIGNATURE_NODE_GROUP_IDS).slice(0, VASSAL_LIFE_TUNING.candidateCount);
  return groups.map((groupId) => {
    const variants = VASSAL_SIGNATURE_VARIANT_IDS_BY_GROUP[groupId];
    const variantId = variants[state.rngNextVassalInt(0, variants.length - 1)];
    return { ...clone(VASSAL_SIGNATURE_NODE_VARIANTS[variantId]), variantId };
  });
}

export function generateCandidatePool(state) {
  const lineage = getVassalLineage(state);
  const locations = getPlayerDetailedSites(state).map((site) => site.regionId);
  const legacyBonus = Math.max(0, Math.floor(
    state?.civilization?.vassalLegacy?.futureStartingPrestigeBonus ?? 0
  ));
  const candidates = locations.length === 0 ? [] : Array.from(
    { length: VASSAL_LIFE_TUNING.candidateCount },
    (_, index) => {
      const locationRegionId = locations[state.rngNextVassalInt(0, locations.length - 1)];
      const academyBonus = (getDetailedSite(state, locationRegionId)?.detailedState?.structureSlots ?? [])
        .filter((slot) => slot?.structureId === "academy")
        .reduce((sum, slot) => sum + Math.max(0, getDetailedStructureDef(state, "academy")?.candidateIntelligenceBonus ?? 0) * (1 + getDetailedPracticeTierIndex(slot.tier ?? "bronze")), 0);
      return ({
      candidateId: `candidate-${Math.max(1, Math.floor(lineage.nextVassalId ?? 1))}-${index + 1}`,
      age: state.rngNextVassalInt(VASSAL_LIFE_TUNING.candidateAgeMin, VASSAL_LIFE_TUNING.candidateAgeMax),
      locationRegionId, originRegionId: locationRegionId,
      prestige: state.rngNextVassalInt(
        VASSAL_LIFE_TUNING.candidatePrestigeMin,
        VASSAL_LIFE_TUNING.candidatePrestigeMax
      ) + legacyBonus,
      stats: Object.fromEntries(VASSAL_STAT_IDS.map((statId) => [
        statId,
        state.rngNextVassalInt(VASSAL_LIFE_TUNING.candidateStatMin, VASSAL_LIFE_TUNING.candidateStatMax) + (statId === "intelligence" ? academyBonus : 0),
      ])),
      portrait: generateVassalPortrait(state),
    }); }
  );
  const signatureNodes = generateSignatureNodes(state);
  lineage.pendingCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    signatureNode: signatureNodes[index],
  }));
  return lineage.pendingCandidates;
}

export function initializeVassalLifeMapCivilization(state) {
  state.civilization.vassalLegacy = { futureStartingPrestigeBonus: 0 };
  state.civilization.vassalLineage = {
    nextVassalId: 1,
    currentVassalId: null,
    selectedVassalIds: [],
    vassalsById: {},
    pendingCandidates: [],
    candidateRerollCount: 0,
  };
  generateCandidatePool(state);
}

export function rerollVassalCandidates(state) {
  const lineage = getVassalLineage(state);
  if (!lineage || lineage.currentVassalId) return { ok: false, reason: "currentVassalAlive" };
  lineage.candidateRerollCount = Math.max(0, Math.floor(lineage.candidateRerollCount ?? 0)) + 1;
  generateCandidatePool(state);
  return { ok: true, pool: getVassalCandidatePool(state) };
}

function createLifeMapState(state, vassalId, signatureNode = null) {
  const generationSeed = Math.floor(state?.rng?.vassalLifeMapSeed ?? 0);
  const generated = generateVassalLifeMap(state?.gameConfig?.lifeMapGenerator, {
    nextFloat: () => state.rngNextVassalLifeMapFloat(),
    nextInt: (min, max) => state.rngNextVassalLifeMapInt(min, max),
  }, {
    graphId: `${vassalId}-life-map`,
    generationSeed,
    signatureNode,
  });
  if (!generated.ok) {
    throw new Error(`Could not generate Vassal Life Map: ${generated.errors?.join("; ") ?? generated.reason}`);
  }
  return {
    graph: generated.graph,
    currentNodeId: null,
    completedNodeIds: [],
    availableNodeIds: [...generated.graph.entryNodeIds],
    nodeStates: {},
    pendingResolution: null,
  };
}

export function selectLifeMapVassal(state, candidateIndex, expectedPoolHash = null, override = null) {
  const lineage = getVassalLineage(state);
  if (!lineage || lineage.currentVassalId) return { ok: false, reason: "currentVassalAlive" };
  const safeIndex = Number.isFinite(candidateIndex) ? Math.floor(candidateIndex) : -1;
  const candidates = (lineage.pendingCandidates ?? []).map((candidate, index) => {
    const source = index === safeIndex && override ? override : candidate;
    const copy = clone(source);
    delete copy.candidateIndex;
    return copy;
  });
  const actualHash = candidatePoolHash(candidates);
  if (expectedPoolHash && expectedPoolHash !== actualHash) {
    return { ok: false, reason: "selectionPoolMismatch", actualPoolHash: actualHash };
  }
  const source = candidates[safeIndex];
  if (!source) return { ok: false, reason: "invalidCandidate" };
  const idNumber = Math.max(1, Math.floor(lineage.nextVassalId ?? 1));
  const vassalId = `vassal-${idNumber}`;
  const record = {
    ...clone(source),
    vassalId,
    initialAge: Math.max(0, Math.floor(source.age ?? 0)),
    selectedSec: Math.max(0, Math.floor(state.tSec ?? 0)),
    selectedYear: Math.max(1, Math.floor(state.year ?? 1)),
    developmentProgress: 0,
    developmentChoiceQueue: [],
    nextDevelopmentChoiceId: 1,
    lifeMap: createLifeMapState(state, vassalId, source.signatureNode),
    lifeEvents: [{
      eventId: `${vassalId}:selected`, kind: "selected", tSec: state.tSec,
      text: `Selected at ${getRegionReference(state, source.locationRegionId) ?? source.locationRegionId}`,
    }],
    isDead: false,
    endedReason: null,
    deathCause: null,
    endSec: null,
  };
  delete record.age;
  lineage.nextVassalId = idNumber + 1;
  lineage.currentVassalId = vassalId;
  lineage.selectedVassalIds.push(vassalId);
  lineage.vassalsById[vassalId] = record;
  lineage.pendingCandidates = [];
  lineage.candidateRerollCount = 0;
  return { ok: true, vassal: record };
}
