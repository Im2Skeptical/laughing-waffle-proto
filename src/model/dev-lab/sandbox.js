import { serializeGameState, deserializeGameState } from '../state.js';
import { canonicalizeSnapshot } from '../canonicalize.js';
import { getDetailedSettlementViewModel } from '../detailed-settlements.js';
import { getDetailedPracticeDef } from '../game-config.js';
import { planStock } from '../detailed-settlements/stock.js';
import { tryCreateStructure } from '../detailed-settlements/practices.js';
import { getRetinue, NEUTRAL_TEMPLATES, createNeutralSettlement } from '../detailed-settlements/external-world.js';
import { getRegionState, canonicalizeWorldState, addWorldConnection } from '../world-state.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool, selectLifeMapVassal } from '../vassal-life-map.js';
import { generateCandidatePool } from '../vassal-life-map/lifecycle/candidates.js';
import { classActionOptions, validateClassAction, applyClassAction, completeCommission } from '../vassal-life-map/class-actions.js';
import { generateShopInventory } from '../vassal-life-map/shop.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';
import { getMoonPhaseAtSecond, getNextMoonPhaseBoundarySec, getMoonCycleDurationSec } from '../moon-phases.js';
import { buildProjectionChunkFromStateData } from '../projection-chunk.js';
import { setFixturePopulation, practiceSlot } from './fixtures.js';

export const cloneLabState = state => deserializeGameState(serializeGameState(state));
const integer = (value, label, max = 100000) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${label} must be an integer from 0 to ${max}.`);
  return n;
};
export function editLabState(source, regionId, edit) {
  const state = cloneLabState(source);
  const site = state.world.sites.find(s => s.regionId === regionId);
  const local = site?.detailedState;
  const vassal = getCurrentLifeMapVassal(state);
  const p = edit.payload ?? {};
  switch (edit.kind) {
    case 'population': setFixturePopulation(local, integer(p.population,'Population'), integer(p.scholars,'Scholars'), integer(p.warriors,'Warriors')); break;
    case 'practice': {
      const index = integer(p.index,'Slot',4);
      const def = getDetailedPracticeDef(state,p.id);
      if (!p.id) { local.practiceSlots[index] = null; break; }
      if (!def) throw new Error('Unknown Practice');
      if (local.practiceSlots.some((s,i) => i !== index && s?.practiceId === p.id)) throw new Error('A Practice can be installed only once.');
      if (!['bronze','silver','gold','diamond'].includes(p.tier)) throw new Error('Unknown quality');
      const slot = practiceSlot(p.id,integer(p.stock,'Stock'),p.tier);
      // Worker-derived capacity is validated below using the real view model.
      local.practiceSlots[index] = slot;
      break;
    }
    case 'move': {
      const from = integer(p.from,'From',4), to = integer(p.to,'To',4);
      const [moved] = local.practiceSlots.splice(from,1);
      local.practiceSlots.splice(to,0,moved);
      break;
    }
    case 'structure': {
      if (!tryCreateStructure(state,regionId,p.id)) throw new Error('No contiguous construction space available.');
      const added = local.structureSlots.find(s => s && !source.world.sites.find(s => s.regionId === regionId).detailedState.structureSlots.some(old => old?.placementId === s.placementId));
      if (added) added.qualityBonus = integer(p.quality ?? 0,'Quality bonus',3);
      break;
    }
    case 'removeStructure': local.structureSlots = local.structureSlots.map(s => s?.placementId === p.id ? null : s); break;
    case 'house': local.structureSlots.fill(null); if (!tryCreateStructure(state,regionId,p.id)) throw new Error('House does not fit'); break;
    case 'vassal':
      if (!vassal) throw new Error('Select a candidate first.');
      vassal.prestige = integer(p.prestige,'Prestige');
      vassal.stats.cunning = integer(p.ingenuity,'Ingenuity',100);
      vassal.stats.intelligence = integer(p.prowess,'Prowess',100);
      break;
    case 'spendPrestige':
      if (!vassal || vassal.prestige < 5) throw new Error('Need a Vassal with 5 Prestige.');
      vassal.prestige -= 5; break;
    case 'chaos': state.civilization.chaos.chaosPower = integer(p.value,'Chaos'); break;
    case 'connection': {
      const result = addWorldConnection(state,regionId,p.regionId);
      if (!result.ok) throw new Error(result.reason);
      break;
    }
    case 'monster': {
      const region = getRegionState(state,p.regionId);
      if (!region) throw new Error('Unknown region');
      if (p.remove) delete region.monster;
      else region.monster = { defense: integer(p.defense,'Defense',1000), ageMoons: integer(p.age,'Monster age') };
      state.civilization.chaos.monsterCount = state.world.regions.filter(r => r.monster).length;
      break;
    }
    case 'ruin': {
      if (!site) throw new Error('Select a settlement');
      const survivors = state.world.sites.filter(s => s !== site && s.simulationMode === 'detailed' && getRegionState(state,s.regionId).controller === 'player');
      if (!survivors.length) throw new Error('Keep one surviving player settlement. Use simulation to test extinction.');
      site.simulationMode = 'ruin'; delete site.neutral;
      Object.assign(getRegionState(state,regionId),{ controller:'frontier', detailedSettlementEnabled:false, lostAtSec:state.tSec });
      state.civilization.history.lostSettlements++;
      if (vassal?.locationRegionId === regionId) vassal.locationRegionId = survivors[0].regionId;
      break;
    }
    case 'neutral': {
      const result = createNeutralSettlement(state,p.regionId,integer(p.template,'Template',NEUTRAL_TEMPLATES.length-1));
      if (!result.ok) throw new Error('Choose an empty, unoccupied frontier region.');
      break;
    }
    case 'candidates': generateCandidatePool(state); break;
    case 'candidate': {
      if (vassal) throw new Error('A Vassal is already active. Start a fresh fixture to select another.');
      const pool = getVassalCandidatePool(state); state.paused = true;
      const result = selectLifeMapVassal(state,integer(p.index,'Candidate',pool.candidates.length-1),pool.expectedPoolHash);
      if (!result.ok) throw new Error(result.reason);
      state.paused = false; break;
    }
    case 'classEffect': {
      if (!vassal) throw new Error('Select a candidate first.');
      const option = classActionOptions(state,vassal,p.family)?.find(o => o.id === p.id);
      if (!option) throw new Error('This option is no longer available.');
      const valid = validateClassAction(state,vassal,option.classAction);
      if (!valid.ok) throw new Error(valid.reason);
      applyClassAction(state,vassal,option.classAction);
      break;
    }
    case 'commissionCheck': if (vassal) completeCommission(state,vassal); break;
    default: throw new Error('Unknown Lab edit');
  }
  canonicalizeWorldState(state);
  // Reject invalid edits atomically; capacity changes may legitimately leave older Stock
  // above the new capacity, so only explicit Stock authoring is bounded here.
  if (edit.kind === 'practice' && p.id) {
    const face = getDetailedSettlementViewModel(state,regionId).practices[p.index].face;
    if (Number(p.stock) > face.stockCapacity) throw new Error(`This host can hold at most ${face.stockCapacity} Stock.`);
  }
  return cloneLabState(state);
}

export function advanceLabState(source, mode = 'phase', phaseIndex = 0) {
  const state = cloneLabState(source);
  if (state.runStatus?.complete) throw new Error('Run complete. Reset the fixture to continue.');
  state.paused = false;
  const next = getMoonPhaseAtSecond(state).phaseIndex;
  const target = mode === 'moon' ? state.tSec + getMoonCycleDurationSec(state)
    : mode === 'year' ? state.tSec + state.seasonDurationSec * 4
    : mode === 'second' ? state.tSec + 1
    : getNextMoonPhaseBoundarySec(state,state.tSec + 1,mode === 'selected' ? phaseIndex : state.tSec === 0 ? 0 : (next+1)%6);
  const result = advanceReplayStateToSecond(state,target);
  if (!result.ok && !state.runStatus?.complete) throw new Error(result.reason);
  return cloneLabState(state);
}

export function compareLabProjection(source, seconds = 60) {
  const state = cloneLabState(source); state.paused = false;
  const projection = buildProjectionChunkFromStateData(serializeGameState(state),state.tSec,state.tSec + seconds);
  if (!projection.ok) throw new Error(projection.reason);
  advanceReplayStateToSecond(state,projection.endSec); canonicalizeSnapshot(state);
  const actual = serializeGameState(state), expected = projection.lastStateData, differences = [];
  function compare(a,b,path='state') {
    if (a && b && typeof a === 'object' && typeof b === 'object') for (const key of new Set([...Object.keys(a),...Object.keys(b)])) compare(a[key],b[key],`${path}.${key}`);
    else if (a !== b && differences.length < 20) differences.push({path, authoritative:a, projection:b});
  }
  compare(actual,expected);
  return { equal:!differences.length, endSec:projection.endSec, differences, authoritative:actual, projection:expected };
}

export function getLabObservation(state, regionId) {
  const vm = getDetailedSettlementViewModel(state,regionId), vassal = getCurrentLifeMapVassal(state);
  const local = state.world.sites.find(s => s.regionId === regionId)?.detailedState;
  return { tSec:state.tSec, phase:getMoonPhaseAtSecond(state).label, population:vm?.population.total, housing:vm?.population.housingCapacity, demand:vm?.population.mealDemand,
    edible:vm?.storedFood,currency:vm?.currency,scholars:vm?.specialists.scholar,warriors:vm?.specialists.warrior,support:vm?.martialSupport,defense:vm?.defensiveSupport,
    prestige:vassal?.prestige ?? 0,retinue:getRetinue(state,vassal),ingenuity:vassal?.stats.cunning,prowess:vassal?.stats.intelligence,research:state.civilization.research.total,
    chaos:state.civilization.chaos.chaosPower,monsters:state.civilization.chaos.monsterCount,history:state.civilization.history,
    stocks:local?.practiceSlots.map(p=>p ? {id:p.practiceId,stock:p.stock}:null),meal:vm?.lastMeal ?? local?.lastMeal, lastDefense:vm?.lastDefense ?? local?.lastDefense,
    commission:vassal?.commission ?? null, discoveryAccess:vassal?.discoveryAccess ?? false,
    selfFunding:local?.practiceSlots.flatMap((slot,index)=>slot ? [{slot:index+1,...planStock(state,local,index,[{traits:getDetailedPracticeDef(state,slot.practiceId).stockTraits,amount:1}])}] : []).filter(p=>!p.ok),
  };
}

export function previewLabShop(source) {
  const state = cloneLabState(source), vassal = getCurrentLifeMapVassal(state);
  if (!vassal) throw new Error('Select a Vassal first.');
  const node = {nodeId:'lab-shop-preview',family:'practiceReform',purchasedOffers:[]};
  node.offers = generateShopInventory(state,vassal,node);
  return node;
}

export function previewLabInstitutions(source) {
  const withInstitutions = cloneLabState(source), withoutInstitutions = cloneLabState(source);
  for (const site of withoutInstitutions.world.sites) site.detailedState.structureSlots.fill(null);
  const before = generateCandidatePool(withoutInstitutions), after = generateCandidatePool(withInstitutions);
  return after.map((candidate,index) => ({classId:candidate.classId,regionId:candidate.locationRegionId,
    baseIngenuity:before[index].stats.cunning,ingenuity:candidate.stats.cunning,
    baseProwess:before[index].stats.intelligence,prowess:candidate.stats.intelligence}));
}
