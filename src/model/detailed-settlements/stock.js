// Hosted Stock is the only material inventory. Plans are pure, ordered and atomic.
import { getDetailedPracticeDef, getDetailedStructureDef } from '../game-config.js';
import { ageCohortTotal, emptySpecialists } from './cohorts.js';
import { emitPracticeEvent, practiceEventJournal } from './practice-events.js';
import { getConnectedRegionIds, getRegionState, getAdjacentRegionIds } from '../world-state.js';

export const CIV_CONTENT_TUNING = Object.freeze({ populationPerEdible: 30, prestigePerRetinue: 10, warriorsPerRetinue: 10, warriorsPerSupport: 5, monsterSpawnChaos: 1000, monsterExpansionMoons: 100, monsterDefense: 3 });
export const stockTraits = (state, slot) => getDetailedPracticeDef(state, slot?.practiceId)?.stockTraits ?? [];
export const stockTotal = (state, settlement, trait) => (settlement?.practiceSlots ?? []).reduce((sum, slot) => sum + (stockTraits(state, slot).includes(trait) ? Math.max(0, slot.stock ?? 0) : 0), 0);
export const specialistCount = (settlement, classId) => Object.values(settlement?.populationByClass ?? {}).reduce((sum, cohort) => sum + ageCohortTotal(cohort.specialists?.[classId]), 0);
export const structureQualityMultiplier = slot => 1 + .25 * Math.max(0,slot?.qualityBonus??0);

export function structureModifiers(state, settlement) {
  return (settlement?.structureSlots ?? []).flatMap(slot => {
    const def = getDetailedStructureDef(state, slot?.structureId);
    if (def?.specialistGate && specialistCount(settlement, def.pool) < def.specialistGate) return [];
    return (def?.modifiers ?? []).filter(mod => modifierCondition(state, settlement, mod.query)).map(mod => {
      let amount = mod.amount;
      if (mod.query?.scholarScale) amount *= Math.min(mod.query.cap ?? 3, Math.floor(specialistCount(settlement, 'scholar') / mod.query.scholarScale));
      return Number.isFinite(amount) ? {...mod,amount:amount*structureQualityMultiplier(slot)} : mod;
    });
  }).filter((mod,index,all) => !mod.query?.unique || all.findIndex(m => m.kind === mod.kind && JSON.stringify(m.query) === JSON.stringify(mod.query)) === index);
}

function modifierCondition(state, settlement, query = {}) {
  if (query.minimumSpecialists && specialistCount(settlement,query.specialistClass)<query.minimumSpecialists) return false;
  if (query.stockedTraitsAny && !settlement.practiceSlots.some(s => s?.stock > 0 && query.stockedTraitsAny.some(t => stockTraits(state,s).includes(t)))) return false;
  if (query.threatened) {
    const regionId = state.world.sites.find(s => s.detailedState === settlement)?.regionId;
    const adjacent = getAdjacentRegionIds(state, regionId);
    if (!(state.civilization.chaos.lastMoonIncome?.totalIncome > 0) && !adjacent.some(id => getRegionState(state,id)?.monster)) return false;
  }
  if (query.historicalBurdens) {
    const burdens = [state.year > 10, state.civilization.chaos.chaosPower > 0, state.civilization.history?.lostSettlements > 0, state.civilization.retiredVassals?.some(v => v.classId === 'scholar')].filter(Boolean).length;
    if (burdens < query.historicalBurdens) return false;
  }
  return true;
}

export function matchesPractice(state, slot, query = {}, staffed = false) {
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  const tags = [...(def?.tags ?? []), ...(staffed ? ['Knowledge'] : [])];
  return !!def && (!query.traitsAny || query.traitsAny.some(t => stockTraits(state, slot).includes(t)))
    && (!query.tagsAny || query.tagsAny.some(t => tags.includes(t)))
    && (!query.consumesAny || query.consumesAny.some(t => (def.consume ?? []).some(c => c.traits.includes(t))))
    && (!query.scholarStaffed || staffed)
    && (!query.requiresAny || query.requiresAny.some(t => def.require.some(c => c.traits.includes(t))))
    && (!query.requiresOrConsumesAny || query.requiresOrConsumesAny.some(t => [...def.require,...def.consume].some(c => c.traits.includes(t))))
    && (!query.minimumRequirements || [...def.require,...def.consume].length >= query.minimumRequirements)
    && (!query.effectOpsAny || def.effects.some(e => query.effectOpsAny.includes(e.op) && (!query.classId || e.classId === query.classId)))
    && (!query.triggerKindsAny || def.charge?.trigger.any.some(c => query.triggerKindsAny.includes(c.kind) && (!query.triggerTraitsAny || c.kind !== 'stockGenerated' || c.traitsAny?.some(t => query.triggerTraitsAny.includes(t)))));
}

export function stockCapacity(state, settlement, slot, staffed = false) {
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  if (!(def?.stockCapacity > 0)) return 0;
  const quality = Math.max(0, ['bronze', 'silver', 'gold', 'diamond'].indexOf(slot.tier));
  return Math.floor(def.stockCapacity + quality + (staffed ? def.scholarCapacityBonus ?? 0 : 0)
    + structureModifiers(state, settlement).reduce((sum, mod) => sum + (mod.kind === 'capacity' && matchesPractice(state, slot, mod.query, staffed) ? mod.amount : 0), 0));
}

export function generateStock(state, settlement, slot, amount, staffed = false) {
  const before = Math.max(0, slot.stock ?? 0);
  slot.stock = Math.max(before,Math.min(stockCapacity(state, settlement, slot, staffed), before + Math.max(0, Math.floor(amount))));
  const generated = Math.max(0, slot.stock - before);
  if (generated > 0) {
    const def = getDetailedPracticeDef(state,slot.practiceId);
    emitPracticeEvent(state,{kind:'stockGenerated',regionId:state.world.sites.find(s => s.detailedState === settlement)?.regionId,
      practiceId:slot.practiceId,slotIndex:settlement.practiceSlots.indexOf(slot),amount:generated,traits:def.stockTraits,
      tags:[...new Set([...def.tags,...(staffed?['Knowledge']:[])])],pool:def.pool,scholarStaffed:staffed});
  }
  return generated;
}

// Local board first, then allied shared-edge neighbours in authored region order.
// Physical adjacency and a live connection are independently required.
export function stockProviderSlots(state, settlement, localOnly = false) {
  const host = state.world.sites.find(site => site.detailedState === settlement);
  const sources = [{ regionId: host?.regionId ?? null, settlement }];
  if (!localOnly && host && getRegionState(state, host.regionId)?.controller === 'player') {
    const connected = getConnectedRegionIds(state, host.regionId);
    for (const regionId of getAdjacentRegionIds(state, host.regionId)) {
      if (!connected.includes(regionId) || getRegionState(state, regionId)?.controller !== 'player') continue;
      const site = state.world.sites.find(site => site.regionId === regionId && site.simulationMode === 'detailed');
      if (site?.detailedState) sources.push({ regionId, settlement: site.detailedState });
    }
  }
  return sources.flatMap(source => (source.settlement?.practiceSlots ?? []).map((slot, slotIndex) =>
    ({ regionId: source.regionId, slotIndex, slot })));
}

export function stockProviderSlot(state, settlement, provider) {
  const hostId = state.world.sites.find(site => site.detailedState === settlement)?.regionId;
  const source = provider.regionId == null || provider.regionId === hostId ? settlement
    : state.world.sites.find(site => site.regionId === provider.regionId)?.detailedState;
  return source?.practiceSlots[provider.slotIndex];
}

function recordStockTransfers(state, settlement, providers, reason) {
  const destinationRegionId = state.world.sites.find(site => site.detailedState === settlement)?.regionId;
  if (!destinationRegionId) return;
  const remote = providers.filter(provider => provider.regionId && provider.regionId !== destinationRegionId);
  if (!remote.length) return;
  const journal = practiceEventJournal(state);
  if (journal.stockTransfers?.tSec !== state.tSec) journal.stockTransfers = { tSec: state.tSec, transfers: [] };
  for (const provider of remote) {
    const transfers = journal.stockTransfers.transfers;
    const sourceTraits = stockTraits(state, stockProviderSlot(state, settlement, provider));
    const requestedTraits = provider.substitution ?? provider.traits ?? [];
    // Report what this input satisfies, not every other Trait on the donor.
    // Alternatives name the directly matched Trait; substitutions name the
    // requested requirement. This metadata never changes allocation or events.
    const trait = requestedTraits.find(trait => sourceTraits.includes(trait)) ?? requestedTraits[0];
    const traits = trait ? [trait] : [];
    transfers.push({ transferId: `stock:${state.tSec}:${transfers.length}`, boundarySec: state.tSec,
      systemId: 'stock', resourceId: trait === 'Edible' ? 'food' : 'stock',
      reason, kind: provider.kind, sourceRegionId: provider.regionId, destinationRegionId,
      slotIndex: provider.slotIndex, practiceId: provider.practiceId, traits, amount: provider.amount });
  }
}

// Require reads the activation-start stock. Consume reservations cannot double-spend.
export function planStock(state, settlement, consume = [], require = [], consumer = null, staffed = false, localOnly = false) {
  if (!consume.length && !require.length) return { ok: true, providers: [] };
  const sources = stockProviderSlots(state, settlement, localOnly);
  const slots = sources.map(source => source.slot);
  const remaining = slots.map(s => Math.max(0, s?.stock ?? 0));
  const providers = [];
  const modifiers = structureModifiers(state, settlement);
  let flexibleUsed = false, wildcardUsed = false;
  const flexible = consumer && modifiers.some(m => m.kind === 'flexibleProvider' && matchesPractice(state, consumer, m.query, staffed));
  const wildcard = modifiers.some(m => m.kind === 'currencyWildcard');
  const compatible = (slot, traits, requiring) => traits.some(trait => stockTraits(state, slot).includes(trait)
    || (requiring && modifiers.some(m => m.kind === 'requireSubstitution' && m.to === trait && stockTraits(state, slot).includes(m.from)
      && (!m.providerTagsAny || getDetailedPracticeDef(state,slot?.practiceId)?.tags.some(t => m.providerTagsAny.includes(t))))));
  for (const [kind, costs] of [['require', require], ['consume', consume]]) {
    for (const cost of costs) {
      let needed = cost.amount ?? 1;
      if (kind === 'consume' && consumer) needed = Math.max(needed>0?1:0, Math.ceil(needed - modifiers.reduce((n,m) => n + (m.kind === 'consumeReduction' && cost.traits.includes('Record') && matchesPractice(state,consumer,m.query,staffed) ? m.amount : 0),0)));
      for (let i = 0; i < slots.length && needed > 0; i++) {
        if (!compatible(slots[i], cost.traits, kind === 'require')) continue;
        const amount = Math.min(needed, kind === 'require' ? slots[i]?.stock ?? 0 : remaining[i]);
        if (amount <= 0) continue;
        providers.push({ kind, regionId: sources[i].regionId, slotIndex: sources[i].slotIndex, practiceId: slots[i].practiceId, amount, traits: cost.traits });
        if (kind === 'consume') remaining[i] -= amount;
        needed -= amount;
      }
      if (needed > 0 && (wildcard && !wildcardUsed || flexible && !flexibleUsed)) {
        const index = slots.findIndex((s,i) => remaining[i] > 0 && (wildcard && !wildcardUsed && stockTraits(state,s).includes('Currency') || flexible && !flexibleUsed));
        if (index >= 0) {
          const useCurrency=wildcard&&!wildcardUsed&&stockTraits(state,slots[index]).includes('Currency');
          const providerKind=useCurrency?'consume':kind;
          providers.push({kind:providerKind,regionId:sources[index].regionId,slotIndex:sources[index].slotIndex,practiceId:slots[index].practiceId,amount:1,traits:stockTraits(state,slots[index]),substitution:cost.traits});
          if (providerKind==='consume') remaining[index]--;
          needed--;if (useCurrency) wildcardUsed=true;else flexibleUsed=true;
        }
      }
      if (needed > 0) return { ok: false, missing: { kind, traits: cost.traits, amount: needed }, providers: [] };
    }
  }
  return { ok: true, providers };
}

export function applyStockPlan(state, settlement, plan) {
  if (!plan.ok) return false;
  for (const p of plan.providers) if (p.kind === 'consume') stockProviderSlot(state, settlement, p).stock -= p.amount;
  recordStockTransfers(state, settlement, plan.providers, 'practice');
  return true;
}

// Meals can be partially supplied; recipes above remain all-or-nothing.
export function consumeAvailableStock(state, settlement, trait, amount) {
  let remaining = Math.max(0, amount);
  const providers = [];
  for (const source of stockProviderSlots(state, settlement)) {
    if (remaining <= 0) break;
    if (!stockTraits(state, source.slot).includes(trait)) continue;
    const taken = Math.min(remaining, Math.max(0, source.slot?.stock ?? 0));
    if (taken <= 0) continue;
    source.slot.stock -= taken;
    remaining -= taken;
    providers.push({ kind: 'consume', regionId: source.regionId, slotIndex: source.slotIndex,
      practiceId: source.slot.practiceId, amount: taken, traits: [trait] });
  }
  recordStockTransfers(state, settlement, providers, 'food');
  return amount - remaining;
}

export function consumeStock(state, settlement, trait, amount) {
  let remaining = Math.max(0, amount);
  for (const slot of settlement?.practiceSlots ?? []) {
    if (!stockTraits(state, slot).includes(trait)) continue;
    const taken = Math.min(remaining, Math.max(0, slot.stock ?? 0));
    slot.stock = Math.max(0, (slot.stock ?? 0) - taken);
    remaining -= taken;
  }
  return amount - remaining;
}

export function trainSpecialists(settlement, classId, amount) {
  let remaining = Math.max(0, Math.floor(amount));
  for (const cohort of Object.values(settlement.populationByClass)) {
    cohort.specialists ??= emptySpecialists();
    const free = Math.max(0, cohort.adults - cohort.specialists.scholar.adults - cohort.specialists.warrior.adults);
    const added = Math.min(free, remaining);
    cohort.specialists[classId].adults += added;
    remaining -= added;
  }
  return amount - remaining;
}
