// Shared vocabulary and executable bindings. Pure data: safe for model, worker,
// editor and views. Resolvers remain in the model; prose never grants a capability.
const amountFields = ['op', 'amount', 'seasonAmounts', 'activationAmounts', 'keywordScale'];
const scalingFields = ['populationBand', 'historyScale', 'localDeathScale', 'localDeathCap', 'externalConnectionScale'];
const effect = (op, label, icon, extra = {}) => ({ op, label, icon,
  fields: [...amountFields, ...(extra.fixed ? [] : scalingFields), ...(extra.param ? [extra.param] : [])], ...extra });
const event = (kind, name, icon, { scopes = ['local', 'adjacent', 'connected', 'civilization'], filters = [], ...extra } = {}) =>
  ({ kind, name, icon, scopes, filters: [...(scopes.includes('local') ? ['faction', 'controller'] : []), ...filters], ...extra });

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const MECHANICS = freeze({
  creep: { name: 'Creep', type: 'meter', icon: 'monster', status: 'implemented',
    definition: 'The shared Monster threat meter. At 100 Creep by default, trigger a Monster Spawn and retain excess Creep. Direct Creep gains bypass Resistance.',
    statePath: 'civilization.chaos.monsterPressure', thresholdSetting: 'monsterExpansionThreshold',
    effects: [effect('addMonsterPressure', 'Creep', 'monster', { fixed: true })] },
  monsterSpawn: { name: 'Monster Spawn', type: 'event', icon: 'monster', status: 'implemented',
    definition: 'One Monster threat resolution. It attempts expansion; defenses can intercept it, and blocked fronts may create or strengthen a Monster. A direct Spawn leaves Creep unchanged. Each resolution emits one global event, including interception.',
    effects: [effect('triggerMonsterSpawn', 'Monster Spawn', 'monster', { fixed: true, integer: true, fields: ['op', 'amount'] })],
    events: [event('monsterSpawn', 'Monster Spawn', 'monster', { scopes: ['civilization'], filters: [] })] },
  monsterActivity: { name: 'Monster activity', type: 'event', icon: 'monster', status: 'implemented',
    definition: 'A regional Monster advance, expansion, appearance or strengthening. One Monster Spawn may cause activity in more than one region. This is separate from Creep gain and the once-per-Spawn event.',
    events: [event('monsterPressure', 'Monster activity', 'monster')] },
  synthesis: { name: 'Synthesis', type: 'keyword', icon: 'knowledge', status: 'implemented',
    definition: 'Counts other Scholar-staffed Practices with currently supplied recipes in this settlement. The card gives its additive Output Multiplier contribution.',
    keyword: { classId: 'scholar', className: 'Philosopher' } },
  monsterTrophies: { name: 'Monster Trophies', type: 'keyword', icon: 'monster', status: 'implemented',
    definition: 'Counts Monsters destroyed by this civilisation. Trophies persist across Vassal lives; they are not spendable Stock. The card gives its Output Multiplier contribution.',
    keyword: { classId: 'warrior', className: 'Warlord' } },
  economicRegions: { name: 'Economic Regions', type: 'keyword', icon: 'trade', status: 'implemented',
    definition: 'Counts occupied settlements in the same connected trade zone. The card gives its Output Multiplier contribution.',
    keyword: { classId: 'merchant', className: 'Merchant' } },
  stock: { name: 'Stock', type: 'resource', icon: 'stock', status: 'implemented',
    definition: 'Resources held by a Practice. Each unit carries its host\'s Stock traits. Produce adds units up to capacity; Consume spends matching units.',
    effects: [effect('generateStock', 'Stock', 'stock')],
    events: [event('stockGenerated', 'Stock production', 'stock', { filters: ['traitsAny', 'tagsAny', 'pool', 'scholarStaffed'] }), event('stockConsumed', 'Stock consumption', 'stock', { filters: ['traitsAny', 'tagsAny', 'pool'] })] },
  chaos: { name: 'Chaos', type: 'meter', icon: 'chaos', status: 'implemented',
    definition: 'Accumulated threat. Chaos exceeding Resistance generates passive Creep.',
    effects: [effect('addChaos', 'Chaos', 'chaos', { fixed: true })],
    events: [event('chaosIncreased', 'Chaos increase', 'chaos')] },
  research: { name: 'Research', type: 'resource', icon: 'research', status: 'implemented',
    definition: 'Research gained by the realm, separate from hosted Stock.',
    effects: [effect('research', 'Research', 'research', { editable: true })] },
  training: { name: 'Specialist training', type: 'effect', icon: 'population', status: 'implemented',
    definition: 'Trains the named specialist class. The card specifies the amount and requirements.',
    effects: [effect('train', 'Specialists trained', 'population', { editable: true, param: 'classId', choices: ['scholar', 'warrior'] })] },
  housing: { name: 'Housing', type: 'effect', icon: 'housingCapacity', status: 'implemented',
    definition: 'Room for population. This Practice effect adds Housing for the current phase.',
    effects: [effect('addHousingForPhase', 'Housing', 'housingCapacity', { editable: true })] },
  mealSaving: { name: 'Meal saving', type: 'effect', icon: 'food', status: 'implemented',
    definition: 'Reduces Edible Stock needed at the settlement\'s next meal.',
    effects: [effect('reduceLocalFoodRequirement', 'Edible saved', 'food', { editable: true })] },
  resistance: { name: 'Chaos resistance', type: 'effect', icon: 'faith', status: 'implemented',
    definition: 'Contains accumulated Chaos. Passive Creep stops while Resistance meets or exceeds Chaos. Direct Creep gains bypass it.',
    effects: [effect('addFaithChaosResistance', 'Chaos resistance', 'faith', { editable: true })] },
  development: { name: 'Development', type: 'effect', icon: 'prestige', status: 'implemented',
    definition: 'A bonus to a future Vassal candidate of the named class.',
    effects: [effect('bankCandidateDevelopment', 'Candidate development', 'prestige', { editable: true, param: 'classId', choices: ['scholar', 'warrior'] })],
    events: [event('candidateDevelopment', 'Candidate Development', 'development', { filters: ['classId'] })] },
  shopQuality: { name: 'Shop quality bonus', type: 'effect', icon: 'activation', status: 'implemented',
    definition: 'A banked quality bonus for the next local shop, capped at 3.',
    effects: [effect('bankShopQuality', 'Shop quality bonus', 'activation', { editable: true, param: 'classId', choices: ['scholar'] })] },
  support: { name: 'Support', type: 'effect', icon: 'support', status: 'implemented',
    definition: 'Martial Support or a banked contribution. The card specifies which action can use it.',
    effects: [effect('bankSupport', 'Support banked', 'support', { editable: true, param: 'bank', choices: ['formation', 'siege', 'mobility', 'coordination', 'greatHost'] })],
    events: [event('supportContributed', 'Support contribution', 'support', { filters: ['classId', 'actionKindsAny'] }), event('martialActionResolved', 'Martial action', 'support', { filters: ['classId', 'actionKindsAny', 'minimumSources'] })] },
  preview: { name: 'Preview', type: 'effect', icon: 'hourglass', status: 'implemented',
    definition: 'A banked local preview bonus, capped at 3.',
    effects: [effect('bankPreview', 'Preview bonus', 'hourglass', { editable: true })] },
  seasonalFood: { name: 'Seasonal food boost', type: 'effect', icon: 'food', status: 'implemented',
    definition: 'Extra Stock for one local seasonal Food Practice in its next two seasons this year.',
    effects: [effect('boostSeasonalFood', 'Seasonal food boost', 'food', { editable: true })] },
  conversion: { name: 'Conversion', type: 'effect', icon: 'population', status: 'implemented',
    definition: 'Converts eligible residents to the institution\'s allegiance using its recipe and targeting rules.',
    effects: [effect('convertPopulation', 'Population conversion', 'population', { fields: [...amountFields, ...scalingFields, 'filter', 'reach', 'train'] })] },
  politicalForce: { name: 'Political Force', type: 'effect', icon: 'support', status: 'implemented',
    definition: 'Supplied occupation or defensive Force, with the duration stated on the card.',
    effects: [effect('politicalForce', 'Political Force', 'support', { fields: [...amountFields, ...scalingFields, 'defenseOnly', 'duration'] })] },
  death: { name: 'Death', type: 'event', icon: 'death', status: 'implemented',
    definition: 'A population death. The card specifies scope and qualifying conditions.',
    events: [event('populationDied', 'Population death', 'death', { filters: ['premature'] })] },
  monsterDestruction: { name: 'Monster destruction', type: 'event', icon: 'monster', status: 'implemented',
    definition: 'A Monster actually destroyed, distinct from repelling its attack.',
    events: [event('monsterDestroyed', 'Monster destruction', 'monster', { filters: ['classId'] })] },
  defense: { name: 'Defense', type: 'event', icon: 'defense', status: 'implemented',
    definition: 'A successful defense against an attack. The card specifies the relevant settlement.',
    events: [event('defenseSucceeded', 'Successful Defense', 'defense')] },
  installation: { name: 'Practice installation', type: 'event', icon: 'stock', status: 'implemented',
    definition: 'A Practice installed in a settlement.', events: [event('practiceInstalled', 'Practice installation', 'stock')] },
  danger: { name: 'Danger', type: 'event', icon: 'danger', status: 'implemented',
    definition: 'A survived Danger event.', events: [event('dangerSurvived', 'Survived Danger', 'danger', { filters: ['classId', 'martial'] })] },
  campaign: { name: 'Campaign', type: 'event', icon: 'campaign', status: 'implemented',
    definition: 'A won Campaign.', events: [event('campaignWon', 'Campaign victory', 'campaign', { filters: ['classId'] })] },
  externalTrade: { name: 'External Trade', type: 'event', icon: 'trade', status: 'implemented',
    definition: 'A resolved external Trade.', events: [event('externalTrade', 'External Trade', 'trade')] },
  challenge: { name: 'Challenge', type: 'event', icon: 'challenge', status: 'implemented',
    definition: 'A completed Challenge.', events: [event('challengeCompleted', 'Completed Challenge', 'challenge', { filters: ['classId'] })] },
  settlementLoss: { name: 'Settlement loss', type: 'event', icon: 'death', status: 'implemented',
    definition: 'A settlement lost to Monsters.', events: [event('settlementLost', 'Settlement loss', 'death')] },
  crisis: { name: 'Crisis', type: 'event', icon: 'danger', status: 'implemented',
    definition: 'A resolved Crisis.', events: [event('crisisResolved', 'Resolved Crisis', 'danger')] },
});

function bindings(field, key) {
  const rows = Object.entries(MECHANICS).flatMap(([mechanicId, mechanic]) =>
    (mechanic[field] ?? []).map(binding => [binding[key], { ...binding, mechanicId, status: mechanic.status }]));
  if (new Set(rows.map(([id]) => id)).size !== rows.length) throw new Error(`Duplicate mechanic ${field} binding`);
  return freeze(Object.fromEntries(rows));
}
export const MECHANIC_EFFECTS = bindings('effects', 'op');
export const MECHANIC_EVENTS = bindings('events', 'kind');
export const MECHANIC_KEYWORDS = freeze(Object.fromEntries(Object.entries(MECHANICS)
  .filter(([, value]) => value.keyword && value.status === 'implemented')
  .map(([id, value]) => [id, { name: value.name, ...value.keyword }])));
export const mechanicEffect = op => Object.hasOwn(MECHANIC_EFFECTS, op) ? MECHANIC_EFFECTS[op] : null;
export const mechanicEvent = kind => Object.hasOwn(MECHANIC_EVENTS, kind) ? MECHANIC_EVENTS[kind] : null;

// References are derived from executable DSL data, never a second authored list.
export function gamepieceMechanics(def) {
  const ids = new Set();
  const add = binding => { if (binding) ids.add(binding.mechanicId); };
  for (const value of def?.effects ?? []) add(mechanicEffect(value.op));
  for (const value of def?.charge?.trigger?.any ?? []) add(mechanicEvent(value.kind));
  for (const mod of def?.modifiers ?? []) {
    for (const op of mod.query?.effectOpsAny ?? []) add(mechanicEffect(op));
    for (const kind of mod.query?.triggerKindsAny ?? []) add(mechanicEvent(kind));
  }
  if (Object.hasOwn(MECHANIC_KEYWORDS, def?.keywordOutputScale?.keyword)) ids.add(def.keywordOutputScale.keyword);
  return [...ids].map(id => ({ id, name: MECHANICS[id].name, type: MECHANICS[id].type,
    icon: MECHANICS[id].icon, definition: MECHANICS[id].definition }));
}
