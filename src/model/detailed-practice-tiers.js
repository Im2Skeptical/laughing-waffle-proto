export const DETAILED_PRACTICE_TIERS = Object.freeze([
  "bronze",
  "silver",
  "gold",
  "diamond",
]);

// Practices and structures share this vocabulary.  The old export is kept as
// the practice-facing name because a number of view models consume it.
export const DETAILED_QUALITY_IDS = DETAILED_PRACTICE_TIERS;
export const getDetailedQualityIndex = getDetailedPracticeTierIndex;
export const getNextDetailedQuality = getNextDetailedPracticeTier;

export function getQualityMultiplier(tier, perQuality = 0) {
  return Math.max(0, 1 + Math.max(0, getDetailedPracticeTierIndex(tier)) * perQuality);
}

export function isDetailedPracticeTier(tier) {
  return DETAILED_PRACTICE_TIERS.includes(tier);
}

export function getDetailedPracticeTierIndex(tier) {
  return DETAILED_PRACTICE_TIERS.indexOf(tier);
}

export function getNextDetailedPracticeTier(tier) {
  const index = getDetailedPracticeTierIndex(tier);
  return index >= 0 && index < DETAILED_PRACTICE_TIERS.length - 1
    ? DETAILED_PRACTICE_TIERS[index + 1]
    : null;
}

export function getDetailedPracticeWorkerCapacity(definition, tier) {
  const base = Math.max(0, Math.floor(definition?.workerCapacity ?? 0));
  return base + Math.max(0, getDetailedPracticeTierIndex(tier)) * 2;
}

export function createDetailedPracticeSlot(practiceId, tier = "bronze") {
  return { practiceId, tier, charge: 0, work: 0 };
}
