import { specialistCount, structureQualityMultiplier } from './detailed-settlements/stock.js';

const title = value => value ? value[0].toUpperCase() + value.slice(1) : '';
const fmt = value => String(Math.round(value * 100) / 100);
const FLAVOUR = {
  mudHouses: 'A little earth between the hearth and the storm.',
  timberHouse: 'The forest becomes a roof; the roof becomes a home.',
  longhouse: 'Many fires, one roof. No neighbour winters alone.',
  granary: 'What summer leaves behind, winter will ask for.',
  storehouse: 'Every beam kept dry is a promise of tomorrow.',
  archive: 'A realm remembers only what someone chooses to keep.',
  barracks: 'Even in peace, the watch keeps its place.',
};

function practiceScope(query = {}) {
  const parts = [];
  if (query.traitsAny?.length) parts.push(`with ${query.traitsAny.join(' or ')} Stock`);
  if (query.tagsAny?.length) parts.push(`tagged ${query.tagsAny.join(' or ')}`);
  if (query.consumesAny?.length) parts.push(`consuming ${query.consumesAny.join(' or ')} Stock`);
  if (query.requiresAny?.length) parts.push(`requiring ${query.requiresAny.join(' or ')} Stock`);
  if (query.requiresOrConsumesAny?.length) parts.push(`requiring or consuming ${query.requiresOrConsumesAny.join(' or ')} Stock`);
  if (query.scholarStaffed) parts.push('staffed by Scholars');
  if (query.minimumRequirements) parts.push(`with at least ${query.minimumRequirements} Stock inputs`);
  if (query.effectOpsAny?.length) parts.push(`with ${query.effectOpsAny.map(op => ({train:'training',research:'Research',generateStock:'Stock production'})[op] ?? op).join(' or ')} effects${query.classId ? ` for ${title(query.classId)}s` : ''}`);
  if (query.triggerKindsAny?.length) parts.push(`triggered by ${query.triggerKindsAny.map(kind => ({populationDied:'deaths',settlementLost:'settlement losses',stockGenerated:'Stock production',chaosIncreased:'increasing Chaos',crisisResolved:'resolved Crises',monsterPressure:'Monster pressure'})[kind] ?? kind).join(' or ')}${query.triggerTraitsAny?.length ? ` (${query.triggerTraitsAny.join(' or ')} Stock)` : ''}`);
  return `local Practices${parts.length ? ' ' + parts.join(', ') : ''}`;
}

function conditions(query = {}) {
  const lines = [];
  if (query.minimumSpecialists) lines.push(`with at least ${query.minimumSpecialists} local ${title(query.specialistClass)}s`);
  if (query.stockedTraitsAny?.length) lines.push(`while a local Practice holds ${query.stockedTraitsAny.join(' or ')} Stock`);
  if (query.threatened) lines.push('while Chaos is increasing or an adjacent region has a Monster');
  if (query.historicalBurdens) lines.push(`with at least ${query.historicalBurdens} historical burdens`);
  if (query.scholarScale) lines.push(`per ${query.scholarScale} local Scholars, up to ${query.cap ?? 3} steps`);
  if (query.unique) lines.push('does not stack with the same modifier and scope');
  return lines.length ? `; ${lines.join('; ')}` : '';
}

function modifierText(mod, amount) {
  const n = fmt(amount), percent = fmt(amount * 100), scope = practiceScope(mod.query);
  const history = { age:'civilization age', records:'stocked Record Practices', losses:'lost settlements', retired:'retired Scholars', commissions:'completed Commissions' };
  const lines = {
    capacity: mod.query?.traitsAny?.length && !mod.query.tagsAny?.length
      ? `+${n} to ${mod.query.traitsAny.join(' / ')} Stock Capacity`
      : `+${n} to Stock Capacity on ${scope}`,
    output: `+${n} Stock output from ${scope}`,
    chargeGain: `+${n} incoming Charge for ${scope}`,
    effectBonus: `+${n} to numeric effects of ${scope}`,
    requireSubstitution: `${mod.from} Stock can satisfy ${mod.to} requirements${mod.providerTagsAny?.length ? ` from Practices tagged ${mod.providerTagsAny.join(' or ')}` : ''}`,
    support: `+${percent}% to local Martial Support`,
    defense: `+${n} local Defense`,
    defenseMultiplier: `+${percent}% to local defensive Martial Support`,
    retinueCap: `+${n} Warrior Retinue capacity`,
    lossDefense: `+${n} Defense per lost settlement, up to 3 losses`,
    currencyWildcard: 'One hosted Currency Stock can replace one missing consumed Stock in a recipe',
    consumeReduction: `${scope} consume ${n} less Record Stock (at least 1 remains required)`,
    flexibleProvider: `One missing required Stock for ${scope} can use any non-Currency Stock`,
    scalingCap: `+${n} to the population-scaling cap of ${scope}`,
    preview: `+${n} local preview bonus`,
    lossResistance: `Reduce population losses by ${percent}% (combined mitigation capped at 75%)`,
    stockDefense: `+${n} Defense per stocked local Practice${mod.query?.traitsAny?.length ? ` with ${mod.query.traitsAny.join(' or ')} Stock` : ''}, up to 3 Practices`,
    networkSupport: `Add ${percent}% of connected player settlements' Martial Support (combined share capped at 50%)`,
    stockSupport: `+${percent}% Martial Support per stocked local Practice${mod.query?.traitsAny?.length ? ` with ${mod.query.traitsAny.join(' or ')} Stock` : ''}, up to 3 Practices`,
    evacuationShare: `Evacuate ${percent}% of population when this settlement is lost (combined share capped at 75%)`,
    historyCandidate: `Additional Scholar candidate bonus from ${(mod.sources ?? []).map(source => history[source] ?? source).join(' and ')}, capped at +${mod.cap ?? 3}`,
  };
  return (lines[mod.kind] ?? `+${n} ${mod.kind} for ${scope}`) + conditions(mod.query);
}

// Read-only descriptions of implemented modifiers, shared by cards and both
// reading surfaces. Authoring hooks and provisional design notes are not rules.
export function getStructureReading(def, { slot = null, settlement = null } = {}) {
  const factor = structureQualityMultiplier(slot), effects = [], bonuses = [];
  if (def.housing) {
    const amount = Math.floor(def.housing * factor);
    effects.push({ timing:'', text:`+${amount} Housing Capacity` });
    bonuses.push({ kind:'housingCapacity', amount, label:'Housing capacity', traits:[] });
  }
  for (const mod of def.modifiers ?? []) {
    const amount = Number.isFinite(mod.amount) ? mod.amount * factor : 0;
    effects.push({ timing:'', text:modifierText(mod, amount) });
    if (mod.kind === 'capacity') bonuses.push({ kind:'stock', amount, label:'Stock capacity', traits:[...(mod.query?.traitsAny ?? [])], scope:practiceScope(mod.query) });
    if (mod.kind === 'support') bonuses.push({ kind:'population', amount:amount * 100, unit:'%', label:'Martial Support', traits:[] });
  }
  if (def.pool !== 'common' && def.candidateBonus) effects.push({ timing:'', text:`+${def.candidateBonus} to future ${title(def.pool)} candidates from this settlement, within the institutional bonus cap` });
  if (!effects.length && def.ui?.rule) effects.push({ timing:'', text:def.ui.rule });
  const requirements = def.specialistGate ? [`Requires ${def.specialistGate} local ${title(def.pool)}${def.specialistGate === 1 ? '' : 's'}.`] : [];
  const active = !def.specialistGate ? true : settlement ? specialistCount(settlement, def.pool) >= def.specialistGate : null;
  return { type:'Structure', classLabel:def.pool === 'common' ? 'Neutral' : title(def.pool), passive:true,
    effects, bonuses, requirements, trigger:null, active,
    flavour:FLAVOUR[def.id] ?? 'Stone and timber hold what a settlement hopes to keep.' };
}
