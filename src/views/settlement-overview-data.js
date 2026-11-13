import {stockProviderSlots, stockTraits} from '../model/detailed-settlements/stock.js';
import {getRegionDefinition} from '../model/world-state.js';
import {getDetailedPracticeDef} from '../model/game-config.js';

// Read the recipe resolver's actual reach. Priced storefronts are offers, not
// shared inventory. Group whole trait sets so multi-trait Stock is counted once.
export function getRegionalStockOverview(state, regionId) {
  const settlement = state.world.sites.find(site => site.regionId === regionId)?.detailedState;
  if (!settlement) return {rows: [], markets: [], linkedRegionIds: [], total: 0};
  const groups = new Map(), markets = [], linked = new Set();
  for (const source of stockProviderSlots(state, settlement)) {
    if (!source.local && !source.market) linked.add(source.regionId);
    const traits = [...stockTraits(state, source.slot)].sort();
    if (!traits.length) continue;
    const amount = Math.max(0, source.slot?.stock ?? 0);
    const detail = {
      regionId: source.regionId,
      regionName: getRegionDefinition(state, source.regionId)?.name ?? source.regionId,
      practice: getDetailedPracticeDef(state, source.slot?.practiceId)?.label ?? 'Stock',
      traits, amount, local: source.local,
    };
    if (source.market) {
      markets.push({...detail, price: source.slot.price});
      continue;
    }
    const key = traits.join('|');
    if (!groups.has(key)) groups.set(key, {key, traits, local: 0, linked: 0, total: 0, sources: []});
    const row = groups.get(key);
    row[source.local ? 'local' : 'linked'] += amount;
    row.total += amount;
    row.sources.push(detail);
  }
  const priority = traits => traits.includes('Edible') ? 0 : traits.includes('Currency') ? 1 : 2;
  const rows = [...groups.values()].sort((a,b) => priority(a.traits)-priority(b.traits) || a.key.localeCompare(b.key));
  return {rows, markets, linkedRegionIds: [...linked], total: rows.reduce((sum,row) => sum+row.total,0)};
}

export function getControlledSettlementIds(state) {
  const sites = new Set((state?.world?.sites ?? []).filter(site => site.detailedState && site.simulationMode === 'detailed').map(site => site.regionId));
  return (state?.world?.regions ?? []).filter(region => region.controller === 'player' && sites.has(region.id)).map(region => region.id);
}

export function cycleControlledSettlement(state, regionId, direction) {
  const ids = getControlledSettlementIds(state);
  if (!ids.length) return null;
  const index = ids.indexOf(regionId);
  if (index < 0) return direction < 0 ? ids.at(-1) : ids[0];
  return ids[(index + (direction < 0 ? -1 : 1) + ids.length) % ids.length];
}
