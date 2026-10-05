import { getGameSetting } from './game-config.js';
import { DETAILED_QUALITY_IDS } from './detailed-practice-tiers.js';

// Shared, read-only research rules. Reading the library must never roll RNG.
export function getResearchUnlockIndex(state) {
  const research = Math.max(0, Number(state?.civilization?.research?.total) || 0);
  if (research >= getGameSetting(state, 'researchDiamondThreshold')) return 3;
  if (research >= getGameSetting(state, 'researchGoldThreshold')) return 2;
  if (research >= getGameSetting(state, 'researchSilverThreshold')) return 1;
  return 0;
}

export function getResearchSilverChance(state) {
  const research = Math.max(0, Number(state?.civilization?.research?.total) || 0);
  const unlock = getGameSetting(state, 'researchSilverThreshold');
  const full = Math.max(unlock, getGameSetting(state, 'researchSilverFullThreshold'));
  const progress = Math.max(0, Math.min(1, (research - unlock) / Math.max(1, full - unlock)));
  return 0.1 + progress * 0.4;
}

export function getResearchProgression(state) {
  const research = Math.max(0, Number(state?.civilization?.research?.total) || 0);
  const unlockedIndex = getResearchUnlockIndex(state);
  const silverChance = getResearchSilverChance(state);
  const thresholds = [0, ...['Silver', 'Gold', 'Diamond'].map(tier => getGameSetting(state, `research${tier}Threshold`))];
  const tiers = DETAILED_QUALITY_IDS.map((id, index) => ({
    id, index, threshold: thresholds[index], unlocked: index <= unlockedIndex,
    chance: index > unlockedIndex ? 0 : unlockedIndex === 1
      ? (index === 1 ? silverChance : 1 - silverChance) : 1 / (unlockedIndex + 1),
  }));
  const silverFullThreshold = Math.max(thresholds[1] + 1, getGameSetting(state, 'researchSilverFullThreshold'));
  const milestones = [
    ...tiers.slice(1).map(tier => ({ research: tier.threshold, label: `${tier.id[0].toUpperCase()}${tier.id.slice(1)} unlocked` })),
    ...(silverFullThreshold < thresholds[2] ? [{ research: silverFullThreshold, label: 'Silver reaches 50% quality chance' }] : []),
  ].sort((a, b) => a.research - b.research);
  return { research, unlockedIndex, tiers, nextMilestone: milestones.find(m => m.research > research) ?? null };
}
