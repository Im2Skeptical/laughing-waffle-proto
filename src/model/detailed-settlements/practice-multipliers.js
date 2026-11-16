import { getDetailedPracticeDef } from '../game-config.js';
import { getWorldDefinition } from '../world-state.js';
import { contiguousBiomeRegions } from './biome-multipliers.js';

// Captured, self-only Practice modifiers. Queries are pure; Stock conditions
// inspect local hosts without consuming, reserving, or counting market inventory.
export function practiceMultiplierSources(state, settlement, def, kind) {
  const site = state?.world?.sites?.find(site => site.detailedState === settlement);
  const region = site && getWorldDefinition(state)?.regions.find(region => region.id === site.regionId);
  return (def?.stockMultipliers ?? []).flatMap((mod, index) => {
    if (mod.kind !== kind || (mod.biome && region?.biome !== mod.biome)
      || (mod.seasonKeys && (!state || !mod.seasonKeys.includes(state.seasons?.[state.currentSeasonIndex])))) return [];
    if (mod.stockedTraitsAny && !(settlement?.practiceSlots ?? []).some(slot => slot?.stock > 0
      && mod.stockedTraitsAny.some(trait => (slot.traits ?? getDetailedPracticeDef(state,slot.practiceId)?.stockTraits ?? []).includes(trait)))) return [];
    const regionIds = mod.perRegion && region ? contiguousBiomeRegions(state, region.id) : [];
    const amount = mod.amount * (mod.perRegion ? regionIds.length : 1);
    return amount ? [{id:`practice:${def.id}:${index}`,label:def.label,amount,query:{},
      ...(regionIds.length ? {regionIds:[...regionIds]} : {})}] : [];
  });
}
