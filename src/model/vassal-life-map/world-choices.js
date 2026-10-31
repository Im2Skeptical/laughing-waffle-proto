import { prestigeAccount } from './treasury.js';
import { VASSAL_WORKSHOP_RULES as RULES } from '../../defs/vassal-workshop-rules.js';
import { VASSAL_STAT_IDS } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { VASSAL_HEIRLOOM_DEFS } from '../../defs/gamepieces/vassal-heirloom-defs.js';
import { MOON_PHASE_COUNT } from '../../defs/gamesettings/moon-phase-defs.js';
import { getGameSetting } from '../game-config.js';
import { getWorldConnectionCandidates, getWorldConnectionKey, getWorldDefinition, getRegionReference, getRegionState } from '../world-state.js';
import { getPlayerDetailedSites, getVassalEffectiveStats, getVassalStatPresentation } from './selectors.js';
import { getOwnedHeirloomDefinitionIds } from './heirlooms.js';

const phasesPerYear = state => getGameSetting(state, 'seasonDurationSec') * 4 / getGameSetting(state, 'phaseDurationSec');

export function connectedDistance(state, origin, destination, potential = false) {
  if (origin === destination) return 0;
  const edges = potential ? getWorldConnectionCandidates(getWorldDefinition(state)) : state.world.connections;
  const queue = [[origin, 0]], seen = new Set([origin]);
  for (const [id, distance] of queue) for (const edge of edges) {
    const next = edge.regionAId === id ? edge.regionBId : edge.regionBId === id ? edge.regionAId : null;
    if (!next || seen.has(next)) continue;
    if (next === destination) return distance + 1;
    seen.add(next); queue.push([next, distance + 1]);
  }
  if (!potential) return null;
  const regions = getWorldDefinition(state).regions;
  const a = regions.find(r => r.id === origin)?.display?.labelPoint;
  const b = regions.find(r => r.id === destination)?.display?.labelPoint;
  return a && b ? Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) * Math.sqrt(regions.length))) : regions.length;
}

export function buildCrossroadsOptions(state, vassal) {
  const definition = getWorldDefinition(state), current = vassal.locationRegionId;
  const moves = (state.rulesetId?state.world.sites.filter(s=>s.simulationMode==='detailed'):getPlayerDetailedSites(state)).filter(site => site.regionId !== current
    && (state.rulesetId || connectedDistance(state, current, site.regionId) != null)).map(site => ({
    id: `travel-${site.regionId}`, label: `Move to ${getRegionReference(state, site.regionId)}`,
    graphDistance:connectedDistance(state,current,site.regionId),
    expedition:!!state.rulesetId&&connectedDistance(state,current,site.regionId)==null,
    locationRegionId: site.regionId, phaseCost: state.rulesetId&&connectedDistance(state,current,site.regionId)==null?2*connectedDistance(state,current,site.regionId,true)*phasesPerYear(state):RULES.moveMoons * MOON_PHASE_COUNT,
    prestigeDelta: RULES.travelRewards[definition.regions.findIndex(r => r.id === site.regionId) % RULES.travelRewards.length],
  }));
  const existing = new Set(state.world.connections.map(edge => getWorldConnectionKey(edge.regionAId, edge.regionBId)));
  const routes = getWorldConnectionCandidates(definition).filter(edge => (edge.regionAId === current || edge.regionBId === current)
    && !existing.has(getWorldConnectionKey(edge.regionAId, edge.regionBId))).map(edge => ({
    id: `crossroads-route:${getWorldConnectionKey(edge.regionAId, edge.regionBId)}`,
    label: `Build a route to ${getRegionReference(state, edge.regionAId === current ? edge.regionBId : edge.regionAId)}`,
    prestigeCost: RULES.routePrestige, phaseCost: RULES.routeYears * phasesPerYear(state),
    intervention: {kind:'connection',mode:'add',regionAId:edge.regionAId,regionBId:edge.regionBId},
  }));
  return [...moves, ...routes, {id:'tour',label:'Tour this region',phaseCost:RULES.tourYears * phasesPerYear(state),
    randomReward:{relicChance:RULES.tourRelicChance,statDelta:1}}];
}

// Commit-time only. Inspecting a Tour never advances any RNG stream.
export function rollTourReward(state, vassal, option) {
  const owned = getOwnedHeirloomDefinitionIds(state, vassal);
  const pool = Object.values(VASSAL_HEIRLOOM_DEFS).filter(def => def.quality === 'bronze' && !owned.has(def.id));
  if (state.rngNextVassalFloat() < option.randomReward.relicChance && pool.length) {
    const def = pool[state.rngNextVassalInt(0, pool.length - 1)];
    return {...option,randomReward:null,definitionId:def.id,label:def.label,quality:def.quality,description:def.description,immediateDeathChance:option.immediateDeathChance??0};
  }
  const statId = VASSAL_STAT_IDS[state.rngNextVassalInt(0, VASSAL_STAT_IDS.length - 1)];
  return {...option,randomReward:null,statId,statDelta:option.randomReward.statDelta};
}

export function buildLegacyOptions(state, vassal) {
  const stats = getVassalEffectiveStats(vassal);
  const highest = VASSAL_STAT_IDS.reduce((best, id) => stats[id] > stats[best] ? id : best, VASSAL_STAT_IDS[0]);
  const label = getVassalStatPresentation(vassal, highest).label;
  return [
    {id:'found-settlement',label:'Found a settlement',description:'Establish a frontier settlement with 10 adult Villagers.',prestigeCost:0,phaseCost:0},
    {id:'highest-stat',label:`Teach ${label}`,description:`Future Vassals start with +${Math.floor(stats[highest]/RULES.legacyStatDivisor)} ${label}.`,
      prestigeCost:0,phaseCost:0,legacyReward:{kind:'stat',statId:highest,amount:Math.floor(stats[highest]/RULES.legacyStatDivisor)}},
    {id:'accumulated-prestige',label:'Leave renown',description:state.rulesetId?`Endow the civilization with ${Math.floor(state.civilization.prestige/RULES.legacyPrestigeDivisor)} Prestige.`:`Future Vassals start with +${Math.floor(vassal.prestige/RULES.legacyPrestigeDivisor)} Prestige.`,
      prestigeCost:0,phaseCost:0,legacyReward:{kind:'prestige',amount:Math.floor(prestigeAccount(state,vassal).prestige/RULES.legacyPrestigeDivisor)}},
  ];
}

export function isEmptyFrontierDestination(state, regionId) {
  const region = getRegionState(state, regionId);
  return region?.controller === 'frontier' && !region.monster && region.structureCapacity >= 1
    && region.detailedSettlementEnabled !== true
    && !state.world.sites.some(site => site.regionId === regionId);
}

export function legacySettlementTargets(state, vassal) {
  return state.world.connections.flatMap(edge => {
    const id = edge.regionAId === vassal.locationRegionId ? edge.regionBId : edge.regionBId === vassal.locationRegionId ? edge.regionAId : null;
    return id && isEmptyFrontierDestination(state,id) ? [id] : [];
  });
}
