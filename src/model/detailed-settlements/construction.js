import { getDetailedStructureDef } from '../game-config.js';
import { getDetailedSettlementSites } from './queries.js';
import { planStock, applyStockPlan, stockProviderSlot, stockTraits } from './stock.js';
import { emitPracticeEvent } from './practice-events.js';

// A shared declarative recipe: each successful payment advances one cycle.
// Local sites have first claim on their materials before any neighbour draws.
export function runConstructionCycles(state, trigger) {
  const pending = getDetailedSettlementSites(state, { playerOnly: true }).flatMap(site =>
    site.detailedState.structureSlots.filter(slot => slot?.construction
      && getDetailedStructureDef(state, slot.structureId)?.construction.activation.type === trigger)
      .map(slot => ({ site, slot })));
  const paid = new Set();
  for (const localOnly of [true, false]) {
    for (const { site, slot } of pending) {
      if (paid.has(slot)) continue;
      const recipe = getDetailedStructureDef(state, slot.structureId).construction;
      const plan = planStock(state, site.detailedState, recipe.consume, [], null, false, localOnly);
      if (!plan.ok) continue;
      applyStockPlan(state, site.detailedState, plan);
      paid.add(slot);
      slot.construction.completedCycles++;
      emitPracticeEvent(state, {
        kind: 'stockConsumed', regionId: site.regionId, structureId: slot.structureId,
        traits: [...new Set(plan.providers.flatMap(provider => stockTraits(state, stockProviderSlot(state, site.detailedState, provider))))],
        providers: plan.providers,
      });
      if (slot.construction.completedCycles >= recipe.cycles) delete slot.construction;
    }
  }
}
