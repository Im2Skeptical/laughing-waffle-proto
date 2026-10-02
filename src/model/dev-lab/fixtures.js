import { createNewGameState } from '../new-game.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { getDetailedSettlementSites } from '../detailed-settlements.js';
import { emptySpecialists } from '../detailed-settlements/cohorts.js';
import { trainSpecialists } from '../detailed-settlements/stock.js';
import { adjacentRegionIds } from '../detailed-settlements/external-world.js';
import { getRegionState, addWorldConnection } from '../world-state.js';
import { getVassalCandidatePool, selectLifeMapVassal, getCurrentLifeMapVassal } from '../vassal-life-map.js';
import { tryCreateStructure } from '../detailed-settlements/practices.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';

export const practiceSlot = (practiceId, stock = 0, tier = 'bronze') => ({ practiceId, stock, tier, charge: 0, work: 0 });
export function fiveSlots(...slots) {
  if (slots.length > 5) throw new Error('Only five Practice slots are available.');
  return [...slots, ...Array(5 - slots.length).fill(null)];
}
export function setFixturePopulation(settlement, population, scholars = 0, warriors = 0) {
  if (![population, scholars, warriors].every(n => Number.isInteger(n) && n >= 0) || scholars + warriors > population) {
    throw new Error('Specialists must fit within the adult population.');
  }
  for (const cohort of Object.values(settlement.populationByClass)) {
    cohort.children = 0; cohort.adults = 0; cohort.eldersByAge = []; cohort.specialists = emptySpecialists();
  }
  settlement.populationByClass.villager.adults = population;
  trainSpecialists(settlement, 'scholar', scholars);
  trainSpecialists(settlement, 'warrior', warriors);
}
export function selectFixtureVassal(state, classId) {
  // Museum/Gym specimens start with an authored, already-established class.
  const lineage = state.civilization.vassalLineage;
  lineage.founderClassId = classId;
  lineage.establishedClassId = classId;
  for (const candidate of lineage.pendingCandidates) {
    candidate.classId = classId;
    candidate.founderClassId = null;
    candidate.archetype = classId === 'scholar' ? 'Scholar' : 'Warrior';
  }
  const pool = getVassalCandidatePool(state);
  const index = pool.candidates.findIndex(c => c.classId === classId);
  state.paused = true;
  const result = selectLifeMapVassal(state, index, pool.expectedPoolHash);
  if (!result.ok) throw new Error(result.reason);
  state.paused = false;
  return getCurrentLifeMapVassal(state);
}

export const LAB_EXHIBITS = Object.freeze([
  { id:'charge',title:'Charge: five-slot metallurgy cascade',description:'Logging / Surface Mining / Charcoal Burning / Smelting / Toolmaking. Advance seasons: Timber winds Charcoal, Ore and Fuel wind Smelting, and Metal immediately wakes Toolmaking. Inspect Charge, blocked recipes and root/parent event IDs. No custom exhibit resolver.' },
  { id: 'stock', title: 'Stock: board-wide providers', description: 'Logging and Ore supply Smelting. Birth activates real production. Matching Stock is chosen from left to right across the board, including a consumer’s own existing Stock. Follow the numbered provider links.' },
  { id: 'require', title: 'Require and missing inputs', description: 'Garrison requires Arms without consuming them. Patrolling also consumes Edible. Move Bowmaking after Garrison in the Gym; its Stock can still satisfy a requirement. Remove Arms Stock to see the missing input.' },
  ...[29,30,31].map(n => ({ id: `food-${n}`, title: `Food: ${n} people`, description: 'Start just before Food in a disconnected settlement. Unstaffed Foraging generates one Stock before feeding; demand rounds up per 30 people. Watch the leftmost Edible provider and last meal.' })),
  { id: 'shortage', title: 'Food: shortage', description: '61 adults and one unstaffed Foraging host in a disconnected settlement cannot feed everyone. Advance to Food repeatedly to inspect happiness and migration evidence.' },
  { id: 'currency', title: 'Currency: spend hosted Stock', description: 'Procure shortage relief for one Currency through the real Crisis effect. Barter pays from its Stock; there is no wallet. Effect controls resolve immediately without Life Map journey or danger.' },
  { id: 'housing', title: 'Common Housing ladder', description: 'Compare population with the real additive Housing capacities. Replace the house with any implemented rung, then advance to Housing.' },
  { id: 'scholar', title: 'Scholar: staffing and institutions', description: 'Three Scholars staff the first three Practices. Foundry boosts Knowledge production. Compare ordinary staffing, Commission, Discovery, seeded shop quality, and next-generation candidate bonuses. Effect controls omit Life Map journey and danger.' },
  { id: 'warrior', title: 'Warrior: Prestige and Retinue', description: '30 Warriors, 24 Prestige. Spend 5 Prestige to cross a Retinue threshold. Martial Support is local; Retinue uses the civilization-wide Warrior population. Prowess contributes to Campaign Force.' },
  { id: 'raid', title: 'Conflict: automatic Raid and Campaign', description: 'A connected neutral supplies a real automatic seasonal Raid. Advance a year to observe it, or resolve an eligible Campaign to conquer. Campaign effect controls omit journey and danger.' },
  { id: 'defense', title: 'Conflict: autonomous defense', description: 'A Monster is one Death away from expanding into the supplied Garrison. Advance to Death; defense spends Edible. Empty Food in the Gym to test failure.' },
  { id: 'loss', title: 'Conflict: territorial loss', description: 'The same expansion with no response Practice produces a ruin and loss history at Death. The active Vassal evacuates if another settlement survives.' },
  { id: 'projection', title: 'Projection and authoritative parity', description: 'Compare complete serialized states from identical RNG and state, using authoritative ticks and the actual forecast chunk builder. A field diff identifies any mismatch.' },
  { id: 'five', title: 'Five-Practice hybrid engine', description: 'Logging → Mining → Smelting → Weaponsmithing → Garrison occupies all five slots. There is no Edible host: the composition can make Arms but cannot feed or intercept sustainably.' },
]);

export function createLabFixture(id = 'stock', seed = 42) {
  if (!LAB_EXHIBITS.some(e => e.id === id)) throw new Error('Unknown exhibit');
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Seed must be an integer from 0 to 4294967295.');
  const state = createNewGameState(seed);
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  const local = site.detailedState;
  local.practiceSlots = fiveSlots(practiceSlot('logging', 2), practiceSlot('surfaceMining', 2), practiceSlot('smelting'), practiceSlot('charcoalBurning'), practiceSlot('barter'));
  setFixturePopulation(local, 30);
  if (id === 'require') local.practiceSlots = fiveSlots(practiceSlot('forage', 2), practiceSlot('bowmaking', 2), practiceSlot('garrisonDuty'), practiceSlot('patrolling'), practiceSlot('smelting'));
  if (id.startsWith('food-') || id === 'shortage') {
    // Reach the pre-Food boundary through ticks, then author the controlled cohort.
    advanceReplayStateToSecond(state, 1);
    // These specimens demonstrate one local Edible without neighbouring supply.
    state.world.connections = state.world.connections.filter(edge =>
      edge.regionAId !== site.regionId && edge.regionBId !== site.regionId);
    setFixturePopulation(local, id === 'shortage' ? 61 : Number(id.slice(5)));
    local.practiceSlots = fiveSlots(practiceSlot('forage'));
    // This exhibit isolates the one-Stock Food boundary from worker tuning.
    state.gameConfig.gamepieces.practices.forage.workerCapacity = 0;
  }
  if (id === 'currency') {
    local.practiceSlots = fiveSlots(practiceSlot('forage'), practiceSlot('logging', 2), practiceSlot('barter', 3));
    selectFixtureVassal(state, 'scholar').locationRegionId = site.regionId;
  }
  if (id === 'housing') {
    setFixturePopulation(local, 61);
    local.practiceSlots = fiveSlots(practiceSlot('forage', 2), practiceSlot('pastoralism', 3));
    local.structureSlots.fill(null);
    tryCreateStructure(state, site.regionId, 'mudHouses');
  }
  if (id==='charge') {
    local.practiceSlots=fiveSlots(practiceSlot('logging'),practiceSlot('surfaceMining'),practiceSlot('charcoalBurning'),practiceSlot('smelting'),practiceSlot('toolmaking'));
    setFixturePopulation(local,5);
    local.structureSlots.fill(null);
    tryCreateStructure(state,site.regionId,'mudHouses');
  }
  if (['scholar', 'five'].includes(id)) {
    local.practiceSlots = fiveSlots(practiceSlot('logging', 2), practiceSlot('surfaceMining', 2), practiceSlot('smelting'), practiceSlot('weaponsmithing'), practiceSlot('garrisonDuty'));
    setFixturePopulation(local, 30, 3, 10);
    local.structureSlots.fill(null);
    tryCreateStructure(state, site.regionId, 'mudHouses');
    tryCreateStructure(state, site.regionId, 'foundry');
    const vassal = selectFixtureVassal(state, 'scholar');
    vassal.locationRegionId = site.regionId; vassal.stats.cunning = 8; vassal.prestige = 24;
    if (id === 'scholar') {
      // Candidate origins are rolled. Give each eligible origin a real institution
      // so an identical-RNG comparison reliably exposes its class-stat bonus.
      for (const origin of getDetailedSettlementSites(state,{playerOnly:true})) {
        if (origin !== site) {
          setFixturePopulation(origin.detailedState,30,2,0);
          origin.detailedState.structureSlots.fill(null);
          tryCreateStructure(state,origin.regionId,'mudHouses');
        }
        tryCreateStructure(state,origin.regionId,'lyceum');
      }
    }
  }
  if (['warrior','raid','defense','loss'].includes(id)) {
    local.practiceSlots = fiveSlots(practiceSlot('forage', 1), practiceSlot('bowmaking', 2), practiceSlot(id === 'raid' ? 'raidingParties' : 'garrisonDuty'));
    if (id === 'raid') local.practiceSlots = fiveSlots(practiceSlot('logging',2),practiceSlot('forage',3),practiceSlot('pastoralism',3),practiceSlot('bowmaking',2),practiceSlot('raidingParties'));
    if (id === 'loss') local.practiceSlots[2] = null;
    setFixturePopulation(local, 30, 0, 30);
    const vassal = selectFixtureVassal(state, 'warrior');
    vassal.locationRegionId = site.regionId; vassal.prestige = 24; vassal.stats.intelligence = 10;
    const neighbor = state.world.sites.find(s => s.neutral && adjacentRegionIds(state, site.regionId).includes(s.regionId));
    if (neighbor) addWorldConnection(state, site.regionId, neighbor.regionId);
    if (id === 'defense' || id === 'loss') {
      local.practiceSlots[0].stock = 3;
      const frontier = adjacentRegionIds(state, site.regionId).find(r => getRegionState(state,r).controller === 'frontier') ?? adjacentRegionIds(state, site.regionId)[0];
      for (const r of adjacentRegionIds(state, frontier)) if (r !== site.regionId) getRegionState(state,r).monster = { defense: 1, ageMoons: 0 };
      getRegionState(state, frontier).monster = { defense: 2, ageMoons: 99 };
      state.civilization.chaos.monsterCount = state.world.regions.filter(r => r.monster).length;
    }
  }
  if (id === 'projection') state.gameConfig.settings.values.primordialBasePressure = 100;
  return deserializeGameState(serializeGameState(state));
}
