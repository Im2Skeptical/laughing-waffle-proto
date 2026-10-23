import { VASSAL_CLASS_RULES } from '../../defs/vassal-class-rules.js';
import { resolveLifeMapOptionCosts } from '../life-map-balance.js';
import { getVassalEffectiveStats, getVassalActionPhaseCost, getVassalStatDefinition } from './selectors.js';
import { getGameSetting } from '../game-config.js';
import { getMoonPhaseDurationSec } from '../moon-phases.js';

export function getVassalRiskDeathChance(vassal, baseDeathChance) {
  const base = Math.max(0, Math.min(1, Number(baseDeathChance) || 0));
  if (getVassalStatDefinition(vassal, 'intelligence').id !== 'prowess') return base;
  return Math.max(0, 1 - (1 - base) * (1
    + VASSAL_CLASS_RULES.warrior.riskSuccessPerPoint * getVassalEffectiveStats(vassal).intelligence));
}

export function rollScholarQualityBonus(state, vassal, availableTiers) {
  if (getVassalStatDefinition(vassal, 'cunning').id !== 'ingenuity' || availableTiers <= 0) return 0;
  const chance = getVassalEffectiveStats(vassal).cunning * VASSAL_CLASS_RULES.scholar.qualityChancePerPoint;
  const guaranteed = Math.floor(chance);
  if (guaranteed >= availableTiers) return availableTiers;
  const extra = chance % 1 > 0 && state.rngNextVassalFloat() < chance % 1 ? 1 : 0;
  return Math.min(availableTiers, guaranteed + extra);
}

export function getVassalDelvePhaseCost(state, vassal, nodeState) {
  const phases = VASSAL_CLASS_RULES.scholar.delveYears * getGameSetting(state, 'seasonDurationSec') * 4
    / getMoonPhaseDurationSec(state);
  const option=resolveLifeMapOptionCosts(state,nodeState,{id:'delve',phaseCost:phases});
  return getVassalActionPhaseCost(vassal, option.phaseCost, { nodeState });
}
