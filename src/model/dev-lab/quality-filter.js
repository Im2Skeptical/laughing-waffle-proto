import { DETAILED_QUALITY_IDS } from '../detailed-practice-tiers.js';

// Bounds use the shared Bronze < Silver < Gold < Diamond order. A missing
// quality matches only when no quality filter is active.
export function matchesQualityFilter(quality, {maturity, maturityFrom, maturityTo} = {}) {
  if (!maturity && !maturityFrom && !maturityTo) return true;
  const index = DETAILED_QUALITY_IDS.indexOf(quality);
  if (index < 0 || (maturity && quality !== maturity)) return false;
  for (const bound of [maturityFrom, maturityTo]) {
    if (!bound) continue;
    const [op, tier] = bound.split(':');
    const threshold = DETAILED_QUALITY_IDS.indexOf(tier);
    if (threshold < 0) return false;
    if (op === 'gte' ? index < threshold : op === 'gt' ? index <= threshold
      : op === 'lte' ? index > threshold : op === 'lt' ? index >= threshold : true) return false;
  }
  return true;
}
