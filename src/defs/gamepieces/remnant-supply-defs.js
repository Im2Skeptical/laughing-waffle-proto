// Diminished inherited economies: map generation only, never Vassal acquisition.
// Recipes use the ordinary DSL; each card occupies one of the five Practice slots.
const input = (trait, amount = 1) => ({ traits: [trait], amount });
const seasonal = (id, label, degradedFrom, season, traits, consume = [], require = []) => ({
  id, label, degradedFrom, pool: 'common', provenance: 'neutral', minimumQuality: 'bronze',
  category: 'resource', mode: 'scheduled', lane: 'scheduled',
  tags: traits.includes('Edible') ? ['Food'] : traits.includes('Arms') ? ['Mobility'] : ['Knowledge'],
  activation: { type: 'season', seasonKeys: [season] }, source: { icon: 'season', cadence: 'season' },
  workerCapacity: 1, workerBonus: 1, stockTraits: traits, stockCapacity: 2, costs: [],
  consume, require, effects: [{ op: 'generateStock', amount: 1 }],
  vassalPrestigeCost: 10, vassalPhaseCost: 12,
});

export const remnantSupplyPracticeDefs = Object.freeze({
  rm_neglectedFlocks: {
    ...seasonal('rm_neglectedFlocks', 'Neglected Flocks', 'sheepHusbandry', 'autumn', ['Animal', 'Edible', 'Cloth'], [], [input('Edible')]),
    ui: { rule: 'Autumn: Require 1 Edible (kept). Generate 1 Animal / Edible / Cloth Stock. Capacity 2.' },
    flavor: 'Torn fleece and a thinning flock: only the autumn cull reaches the village.',
  },
  rm_saltMonopoly: {
    ...seasonal('rm_saltMonopoly', 'Salt Monopoly', 'saltGathering', 'summer', ['Salt', 'Currency'], [input('Edible', 2)]),
    ui: { rule: 'Summer: Consume 2 Edible. Generate 1 Salt / Currency Stock. Capacity 2.' },
    flavor: 'The overseer eats well while the salt pans fill with weeds.',
  },
  rm_rottingPulpVat: {
    ...seasonal('rm_rottingPulpVat', 'Rotting Pulp Vat', 'papermaking', 'autumn', ['Paper', 'Record'], [input('Timber', 2)], [input('Water')]),
    ui: { rule: 'Autumn: Consume 2 Timber. Require 1 Water (kept). Generate 1 Paper / Record Stock. Capacity 2.' },
    flavor: 'Most of the pulp rots beneath the leaking roof before a sheet can be pressed.',
  },
  rm_falsifiedLedgers: {
    ...seasonal('rm_falsifiedLedgers', 'Falsified Ledgers', 'recordKeeping', 'winter', ['Record'], [input('Currency')]),
    ui: { rule: 'Winter: Consume 1 Currency. Generate 1 Record Stock. Capacity 2.' },
    flavor: 'A paid clerk salvages a few usable accounts from a room full of convenient omissions.',
  },
  rm_splinteredBowWorkshop: {
    ...seasonal('rm_splinteredBowWorkshop', 'Splintered Bow Workshop', 'bowmaking', 'autumn', ['Arms'], [input('Timber', 2)], [input('Tool')]),
    ui: { rule: 'Autumn: Consume 2 Timber. Require 1 Tool (kept). Generate 1 Arms Stock. Capacity 2.' },
    flavor: 'Rejected staves pile high around the last intact workbench.',
  },
  rm_rustedArmoury: {
    ...seasonal('rm_rustedArmoury', 'Rusted Armoury', 'weaponsmithing', 'summer', ['Arms', 'Tool'], [input('Metal', 2), input('Fuel', 2)]),
    ui: { rule: 'Summer: Consume 2 Metal and 2 Fuel. Generate 1 Arms / Tool Stock. Capacity 2.' },
    flavor: 'A summer of reheating and hammering recovers a little from the corroded stores.',
  },
  rm_withheldSpoils: {
    id: 'rm_withheldSpoils', label: 'Withheld Spoils', degradedFrom: 'borderSkirmishing',
    pool: 'common', provenance: 'neutral', minimumQuality: 'bronze', category: 'resource', tags: ['Trade', 'Civic'],
    mode: 'charge', lane: 'charge', activation: { type: 'charge' }, source: { icon: 'charge', cadence: 'charge' },
    workerCapacity: 1, workerBonus: 1, stockTraits: ['Loot'], stockCapacity: 2, costs: [], consume: [], require: [],
    effects: [{ op: 'generateStock', amount: 1 }],
    charge: { gain: 1, threshold: 6, trigger: { any: [{ kind: 'defenseSucceeded' }], anotherPractice: false },
      triggerText: 'When an automated defense or interception involving this settlement succeeds.',
      dischargeText: 'Generate 1 Loot Stock.' },
    vassalPrestigeCost: 10, vassalPhaseCost: 12,
    ui: { rule: 'Successful local defense: gain 1 base Charge. At 6 Charge, Discharge: generate 1 Loot Stock. Capacity 2.' },
    flavor: 'After the officers take their shares, the defenders wait for what remains.',
  },
  rm_siltedChannels: {
    ...seasonal('rm_siltedChannels', 'Silted Channels', 'irrigating', 'spring', ['Water'], [input('Construction')]),
    ui: { rule: 'Spring: Consume 1 Construction. Generate 1 Water Stock. Capacity 2.' },
    flavor: 'One repaired sluice feeds a trickle through an irrigation network choked with silt.',
  },
});

// Basic inherited roles have separate identities from ordinary acquisition.
export const remnantBasicPracticeDefs = Object.freeze({
  rm_scrubForaging: {
    id:'rm_scrubForaging',label:'Scrub Foraging',degradedFrom:'forage',
    pool:'common',provenance:'neutral',minimumQuality:'bronze',category:'resource',tags:['Food'],
    mode:'scheduled',lane:'scheduled',activation:{type:'food',stage:'preRouting'},source:{icon:'food',cadence:'food'},
    workerCapacity:1,workerBonus:1,stockTraits:['Edible'],stockCapacity:1,costs:[],consume:[],require:[],
    effects:[{op:'generateStock',amount:1}],vassalPrestigeCost:10,vassalPhaseCost:12,
    ui:{rule:'Before meals: generate 1 Edible Stock. Capacity 1.'},
    flavor:'A handful of roots from ground picked bare by generations.',
  },
});

export const remnantBasicStructureDefs = Object.freeze({
  rm_saggingStorehouse: {
    id:'rm_saggingStorehouse',label:'Sagging Storehouse',degradedFrom:'storehouse',
    pool:'common',provenance:'neutral',minimumQuality:'bronze',tags:['Storage'],footprint:1,housing:0,
    effects:[],consume:[],require:[],modifiers:[{kind:'capacity',amount:0.5,query:{traitsAny:['Construction']}}],
    construction:{cycles:4,activation:{type:'housing'},consume:[{traits:['Construction'],amount:1}]},
    vassalPrestigeCost:10,vassalPhaseCost:12,localCurrencyCost:0,
    ui:{rule:'Construction Stock Practices have +0.5 Capacity Multiplier.'},
    flavor:'Only half the bays can be trusted to keep timber off the wet ground.',
  },
});
