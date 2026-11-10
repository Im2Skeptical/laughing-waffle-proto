// Timed political disorder. These helpers never infer a new population allegiance.
import { getGameSetting } from '../game-config.js';

export const secondsPerYear = state => 4 * getGameSetting(state, 'seasonDurationSec');

export function unrestSummary(state, settlement) {
  const episode = settlement?.control?.unrest;
  if (!episode) return null;
  return {...episode, remainingYears: Math.max(0, episode.untilSec - state.tSec) / secondsPerYear(state),
    chaosPerYear: getGameSetting(state, 'unrestChaosPerYear')};
}

export function validateUnrest(settlement, region) {
  const episode = settlement?.control?.unrest;
  if (episode == null) return [];
  return typeof episode === 'object' && Number.isInteger(episode.startedSec) && episode.startedSec >= 0
    && Number.isInteger(episode.untilSec) && episode.untilSec > episode.startedSec
    && ['player', 'external-a', 'external-b'].includes(episode.previousController) && region?.controller === 'frontier'
    ? [] : ['invalid Unrest episode'];
}
