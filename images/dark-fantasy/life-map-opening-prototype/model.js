// Disposable adapter around real rules. No player module imports this workbench.
import { createNewGameState, createConfiguredNewGameState } from '../../../src/model/new-game.js';
import { createStarterBootProfile } from '../../../src/model/starter-boot-profile.js';
import { serializeGameState, deserializeGameState } from '../../../src/model/state.js';
import { getCurrentLifeMapVassal, selectLifeMapVassal, enterVassalLifeNode, getVassalNodeDecisionPresentation,
  getVassalAge, getVassalEffectiveStats, getVassalActionPhaseCost, getAdjustedVassalPrestigeCost,
  selectVassalNodeOption, confirmVassalLifeNode, purchaseVassalShopOffer, chooseVassalDevelopmentStat, getVassalStatPresentation, formatVassalPhaseDuration } from '../../../src/model/vassal-life-map.js';
import { getVassalMortalityChance, VASSAL_STAT_IDS } from '../../../src/defs/gamepieces/vassal-life-map-defs.js';
import { classActionOptions } from '../../../src/model/vassal-life-map/class-actions.js';
import { generateShopInventory } from '../../../src/model/vassal-life-map/shop.js';
import { getStockShopGenerationContext } from '../../../src/model/vassal-life-map/stock-shops.js';
import { getOwnedHeirloomDefinitionIds } from '../../../src/model/vassal-life-map/heirlooms.js';
import { VASSAL_HEIRLOOM_DEFS } from '../../../src/defs/gamepieces/vassal-heirloom-defs.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../../../src/model/game-config.js';
import { getDetailedPracticeTierIndex, getNextDetailedPracticeTier } from '../../../src/model/detailed-practice-tiers.js';
import { getResearchUnlockIndex } from '../../../src/model/research-progression.js';
import { getPopulationSummary } from '../../../src/model/detailed-settlements/queries.js';
import { getRetinue, getMartialSupport, adjacentRegionIds } from '../../../src/model/detailed-settlements/external-world.js';
import { specialistCount, stockTotal } from '../../../src/model/detailed-settlements/stock.js';
import { getRegionState, getRegionReference } from '../../../src/model/world-state.js';
import { getMoonPhaseDurationSec } from '../../../src/model/moon-phases.js';
import { createOpeningExperiment, validateOpeningExperiment } from './experiment.js';
import { isOpeningTagShop, createOpeningShopSelection, chooseOpeningShopTag, openingShopPrice } from './shop-experiment.js';
import { applyVassalNodeEffects } from '../../../src/model/vassal-life-map/lifecycle/node-confirm.js';

export function cloneOpeningSession(session) {
  return { ...structuredClone({ ...session, state: null }), state: deserializeGameState(serializeGameState(session.state)) };
}
export function createOpeningSession(document, initialState = null) {
  const experiment = validateOpeningExperiment(document), state = initialState ?? createNewGameState(experiment.seed);
  const index = state.civilization.vassalLineage.pendingCandidates.findIndex(c => c.founderClassId === 'warrior');
  const selected = selectLifeMapVassal(state, index);
  if (!selected.ok) throw new Error(selected.reason);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.lifeMap.availableNodeIds = [];
  return { experiment, state, vassalId: vassal.vassalId, availableIds: [...experiment.entryIds],
    visitedIds: [], activeId: null, runtimeNodeId: null, founded: false, outcomes: [] };
}

// Explicit UI example, initialized through the normal configured-game path.
// It never writes to the authored draft or the player's New Game setup.
export function createTravelRewardExampleSession() {
  const document = createOpeningExperiment(), profile = createStarterBootProfile();
  const origin = 'river-crown', rewards = { 'upper-floodplain': 3, 'reed-delta': 6, 'lake-country': 9 };
  const regions = [origin, ...Object.keys(rewards)];
  const template = profile.mapLab.regions.find(region => region.detailedState).detailedState;
  profile.launch = { startMode: 'authoredMap', neutralSettlements: false };
  profile.mapLab.regions = profile.mapLab.regions.map(region => ({ ...region,
    controller: regions.includes(region.id) ? 'player' : 'frontier',
    detailedSettlementEnabled: regions.includes(region.id),
    detailedState: regions.includes(region.id) ? structuredClone(template) : null }));
  profile.mapLab.connections = Object.keys(rewards).map(regionBId => ({ regionAId: origin, regionBId }));
  Object.assign(document.nodes.find(node => node.id === 'explore').worldCosts.travelPrestigeByRegion, rewards);
  const state = createConfiguredNewGameState(document.seed, profile);
  const candidate = state.civilization.vassalLineage.pendingCandidates.find(candidate => candidate.founderClassId === 'warrior');
  candidate.locationRegionId = candidate.originRegionId = origin;
  return createOpeningSession(document, state);
}
export function openingVassal(session) {
  return session.state.civilization.vassalLineage.vassalsById[session.vassalId];
}
export function openingSummary(session) {
  const { state } = session, vassal = openingVassal(session), stats = getVassalEffectiveStats(vassal);
  const sites = state.world.sites.filter(s => s.simulationMode === 'detailed' && getRegionState(state, s.regionId)?.controller === 'player');
  const retinue = getRetinue(state, vassal), support = getMartialSupport(state, vassal.locationRegionId);
  return { tSec: state.tSec, age: getVassalAge(state, vassal), prestige: vassal.prestige, classId: vassal.classId,
    location: getRegionReference(state, vassal.locationRegionId), prowess: stats.intelligence, effectiveness: stats.effectiveness,
    cunning: stats.cunning, wisdom: stats.wisdom, retinue: retinue.value, support,
    force: stats.intelligence + retinue.value + support, chaos: state.civilization.chaos?.chaosPower ?? 0,
    monsterPressure: state.civilization.chaos?.monsterPressure ?? 0,
    research: state.civilization.research.total, dead: vassal.isDead, complete: !!state.runStatus?.complete,
    sites: sites.map(site => ({ name: getRegionReference(state, site.regionId),
      population: getPopulationSummary(state, site.regionId).total, housing: getPopulationSummary(state, site.regionId).housingCapacity,
      warriors: specialistCount(site.detailedState, 'warrior'), food: stockTotal(state, site.detailedState, 'Edible'),
      currency: stockTotal(state, site.detailedState, 'Currency'),
      practices: site.detailedState.practiceSlots.map(slot => slot ? { label: getDetailedPracticeDef(state, slot.practiceId).label,
        tier: slot.tier, stock: slot.stock, traits: getDetailedPracticeDef(state, slot.practiceId).stockTraits ?? [] } : null) })),
    threats: adjacentRegionIds(state, vassal.locationRegionId).flatMap(id => {
      const region = getRegionState(state, id), neutral = state.world.sites.find(s => s.regionId === id)?.neutral;
      const defense = region?.monster?.defense ?? neutral?.defense;
      return defense ? [{ name: getRegionReference(state, id), defense, kind: region.monster ? 'Monster' : 'Neutral' }] : [];
    }),
    heirlooms: [...vassal.heirlooms.equipped, ...vassal.heirlooms.carry].filter(Boolean).map(item => VASSAL_HEIRLOOM_DEFS[item.definitionId]?.label ?? item.definitionId) };
}

function requireOk(result) { if (!result.ok) throw new Error(result.reason); return result; }
function toOption(item, fallbackId) {
  const { chaos = 0, weightedOutcomes, ...option } = structuredClone(item);
  return { id: fallbackId, ...option, effects: chaos ? [{ op: 'addChaos', amount: chaos }] : [] };
}
function nodeState(session) { return openingVassal(session).lifeMap.nodeStates[session.runtimeNodeId]; }
function legacyOptions(session, spec) {
  const vassal=openingVassal(session), stats=getVassalEffectiveStats(vassal), tuning=spec.legacy;
  const highest=VASSAL_STAT_IDS.reduce((best,id)=>stats[id]>stats[best]?id:best,VASSAL_STAT_IDS[0]);
  const statQuantity=Math.max(1,Math.floor(stats[highest]*tuning.statMultiplier));
  const prestigeQuantity=Math.max(1,Math.floor(vassal.prestige/tuning.prestigeDivisor));
  return [
    {id:'found-settlement',label:'Found a settlement',prestigeCost:tuning.settlementPrestigeCost,phaseCost:0,
      description:'Found a new settlement · Choose its location next'},
    {id:'highest-stat',label:'Highest stat',prestigeCost:0,phaseCost:0,
      description:`${getVassalStatPresentation(vassal,highest).label} ${stats[highest]} × ${tuning.statMultiplier} · Minimum 1 · ${tuning.statReward}: ${statQuantity}`,
      legacyReward:{basis:highest,value:stats[highest],quantity:statQuantity,label:tuning.statReward}},
    {id:'accumulated-prestige',label:'Prestige',prestigeCost:0,phaseCost:0,
      description:`${vassal.prestige} Prestige ÷ ${tuning.prestigeDivisor} · Minimum 1 · ${tuning.prestigeReward}: ${prestigeQuantity}`,
      legacyReward:{basis:'prestige',value:vassal.prestige,quantity:prestigeQuantity,label:tuning.prestigeReward}},
  ];
}
function curatedOffers(state, vassal, current, cards) {
  const settlement = state.world.sites.find(s => s.regionId === vassal.locationRegionId).detailedState;
  return cards.flatMap((card, index) => {
    const kind = card.kind ?? 'practice', def = kind === 'practice' ? getDetailedPracticeDef(state, card.definitionId) : getDetailedStructureDef(state, card.definitionId);
    if (!def) throw new Error(`Unknown ${kind}: ${card.definitionId}`);
    if (def.locked === true || !['common', vassal.classId ?? vassal.founderClassId].includes(def.pool)
        || getDetailedPracticeTierIndex(def.minimumQuality ?? 'bronze') > getResearchUnlockIndex(state)) return [];
    const installed = kind === 'practice' ? settlement.practiceSlots.find(p => p?.practiceId === def.id) : null;
    if (installed?.tier === 'diamond') return [];
    return [{ offerId: `${current.nodeId}:authored:${index}`, label: `${installed ? 'Upgrade' : kind === 'practice' ? 'Learn' : 'Build'} ${def.label}`,
      basePrestigeCost: card.prestigeCost ?? def.vassalPrestigeCost ?? 0, basePhaseCost: card.phaseCost ?? def.vassalPhaseCost ?? 0,
      intervention: kind === 'practice' ? { kind, targetRegionId: vassal.locationRegionId, practiceId: def.id,
        mode: installed ? 'upgrade' : 'learn', tier: installed?.tier ?? 'bronze', resultingTier: installed ? getNextDetailedPracticeTier(installed.tier) : 'bronze' }
        : { kind, targetRegionId: vassal.locationRegionId, structureId: def.id, mode: 'add', tier: 'bronze' },
      baseCurrencyCost: kind === 'structure' ? def.localCurrencyCost ?? 0 : 0 }];
  });
}

export function enterOpeningEncounter(session, id) {
  if (!session.availableIds.includes(id) || session.activeId) throw new Error('Choose an available encounter.');
  session.randomOutcome = null;
  session.shopSelection = null;
  const note = session.experiment.nodes.find(n => n.id === id);
  if (note.kind === 'customNote') { session.activeId = id; session.availableIds = []; session.runtimeNodeId = null; return session; }
  const { state } = session, vassal = getCurrentLifeMapVassal(state);
  if (!vassal || state.runStatus?.complete) throw new Error('This run has ended. Rewind or restart.');
  const spec = session.experiment.nodes.find(n => n.id === id), graph = vassal.lifeMap.graph;
  const family = { world: 'travel', founding: 'warlordFounding', shop: 'practiceReform', structureShop: 'publicWorks', martial: 'challenge', supply: 'stockShop', specialRelic: 'relic' }[spec.kind] ?? spec.kind;
  const specimens = graph.nodes.filter(n => n.depth > 0 && !n.signatureNode && !['legacy', 'signature'].includes(n.family));
  const runtime = spec.kind === 'founding' ? graph.nodes.find(n => n.id === graph.foundingNodeId)
    : spec.kind==='legacy'?graph.nodes.find(node=>node.family==='legacy')
    : specimens.find(n => !vassal.lifeMap.completedNodeIds.includes(n.id)) ?? specimens[0];
  if (!runtime) throw new Error('No disposable encounter slot is available.');
  // Longer edited openings reuse a specimen; the outer experiment retains all
  // past outcomes and complete rewind checkpoints independently of this slot.
  if (vassal.lifeMap.completedNodeIds.includes(runtime.id)) {
    vassal.lifeMap.completedNodeIds = vassal.lifeMap.completedNodeIds.filter(id => id !== runtime.id);
    delete vassal.lifeMap.nodeStates[runtime.id];
  }
  runtime.family = family; delete runtime.stockOutput;
  if (family === 'stockShop') {
    const context = getStockShopGenerationContext(state, vassal);
    const outputs = context.unmetStockOutputs.filter(output => context.stockOutputs.includes(output));
    const pool = outputs.length ? outputs : context.stockOutputs;
    runtime.stockOutput = spec.stockOutput && spec.stockOutput !== 'auto' ? spec.stockOutput
      : pool.length ? pool[state.rngNextVassalInt(0, pool.length - 1)] : 'Edible';
  }
  vassal.lifeMap.availableNodeIds = [runtime.id];
  requireOk(enterVassalLifeNode(state, runtime.id));
  session.activeId = id; session.runtimeNodeId = runtime.id; session.availableIds = [];
  const current = nodeState(session);
  if (spec.kind === 'world') {
    current.options.forEach(option => {
      option.phaseCost = spec.worldCosts?.movePhaseCost ?? spec.phaseCost ?? option.phaseCost;
      if (spec.worldCosts) option.prestigeDelta = spec.worldCosts.travelPrestigeByRegion[option.locationRegionId] ?? 0;
    });
    const routes = generateShopInventory(state, vassal, { ...current, family: 'routes' });
    current.options.push(...routes.map(offer => ({ id: offer.offerId, label: offer.label, phaseCost: spec.worldCosts?.routePhaseCost ?? spec.phaseCost ?? offer.basePhaseCost,
      prestigeCost: spec.worldCosts?.routePrestigeCost ?? offer.basePrestigeCost, intervention: offer.intervention, experimentFamily: 'routes' })));
    current.options.push(...(spec.options ?? []).map(o => toOption(o, o.id)));
  } else if (spec.kind === 'martial') {
    current.options = [...classActionOptions(state, vassal, 'campaign').filter(o => o.classAction.kind !== 'prepare'),
      ...classActionOptions(state, vassal, 'crisis').filter(o => o.classAction.kind !== 'observe'),
      ...(spec.options ?? []).map(o => toOption(o, o.id))];
  } else if (['relic', 'specialRelic'].includes(spec.kind) && spec.relics) {
    const owned = getOwnedHeirloomDefinitionIds(state, vassal);
    current.options = spec.relics.filter(item => !owned.has(item.definitionId)).map((item, index) => {
      const def = VASSAL_HEIRLOOM_DEFS[item.definitionId];
      if (!def) throw new Error(`Unknown relic: ${item.definitionId}`);
      return { ...toOption(item, `relic-${index}`), label: def.label, description: def.description, quality: def.quality,
        immediateDeathChance: spec.kind === 'relic' ? 0 : item.immediateDeathChance ?? 0.35 };
    });
  } else if (spec.kind === 'legacy') {
    current.options=legacyOptions(session,spec);
  } else if (['development', 'patronage'].includes(spec.kind) && spec.options) {
    current.options = spec.options.map(o => toOption(o, o.id));
  }
  if (spec.kind === 'relic') current.options.forEach(o => { o.immediateDeathChance = 0; });
  if (isOpeningTagShop(spec)) {
    session.shopSelection = createOpeningShopSelection(state, vassal, spec);
    current.inventory = [];current.options = [];current.contentMode = 'shop';
  } else if (current.contentMode === 'shop') {
    session.shopSelection = {kind:'practice',selectedTag:runtime.stockOutput??spec.kind,tags:[],monsterPressurePerPurchase:spec.monsterPressurePerPurchase??10};
  }
  if (spec.phaseCost != null && spec.kind !== 'world') {
    current.options.forEach(o => { o.phaseCost = spec.phaseCost; });
    current.inventory.forEach(o => { o.basePhaseCost = spec.phaseCost; });
  }
  if (!current.options.length && !current.inventory.length) current.contentMode = 'shop';
  return session;
}

export function getOpeningDecision(session, preview = {}) {
  if (!session.activeId) return null;
  const note = session.experiment.nodes.find(n => n.id === session.activeId);
  if (note.kind === 'customNote') return { node: note, nodeState: { contentMode: 'note' }, options: [], purchases: [] };
  const vassal = openingVassal(session), current = nodeState(session);
  let priceState = session.state;
  if (session.shopSelection?.selectedTag && current.inventory.some(offer => offer.monsterPressureCost > 0 || openingShopPrice(vassal, current, offer, session.shopSelection.monsterPressurePerPurchase).usesMonsterPressure)) {
    priceState = deserializeGameState(serializeGameState(session.state));
    const inventory = priceState.civilization.vassalLineage.vassalsById[session.vassalId].lifeMap.nodeStates[session.runtimeNodeId].inventory;
    inventory.forEach(offer => {
      const price = openingShopPrice(vassal, current, offer, session.shopSelection.monsterPressurePerPurchase);
      offer.monsterPressureCost = price.monsterPressureCost;
      if (price.usesMonsterPressure) offer.basePrestigeCost = 0;
    });
  }
  const presentation = getVassalNodeDecisionPresentation(priceState, session.runtimeNodeId, preview);
  const spec = session.experiment.nodes.find(n => n.id === session.activeId);
  const options = current.options.map(option => {
    const cost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
    const phases = getVassalActionPhaseCost(vassal, option.phaseCost ?? 0, { nodeState: current, isTravel: current.family === 'travel' && !!option.locationRegionId });
    const projectedAge = getVassalAge(session.state, vassal, session.state.tSec + phases * getMoonPhaseDurationSec(session.state));
    const source = spec.options?.find(o => o.id === option.id);
    const buckets = source?.weightedOutcomes ? eligibleOutcomeBuckets(session, source) : [];
    const weight = buckets.reduce((sum, b) => sum + b.weight, 0);
    const relicWeight = buckets.reduce((sum, b) => sum + b.weight * b.options.filter(r => r.definitionId).length / b.options.length, 0);
    const gains = [...new Set(buckets.flatMap(b => b.options.filter(r => r.statId).map(r => r.statDelta)))];
    return { ...option, ...(source?.weightedOutcomes ? { randomReward: { relicChance: weight ? 100 * relicWeight / weight : 0, statDelta: gains.length === 1 ? gains[0] : null } } : {}),
      ...(option.statId ? { statLabel: getVassalStatPresentation(vassal, option.statId).label } : {}), cost, phases, projectedAge, blocked: cost > vassal.prestige ? 'Insufficient Prestige'
      : !session.founded && (projectedAge >= 40 || (option.immediateDeathChance ?? 0) > 0) ? 'Founding must remain before any death risk' : null };
  });
  if (spec.pass && current.contentMode === 'shop' && !presentation.purchases.length) {
    const phases = getVassalActionPhaseCost(vassal, spec.pass.phaseCost ?? 0, { nodeState: current });
    const age = getVassalAge(session.state, vassal, session.state.tSec + phases * getMoonPhaseDurationSec(session.state));
    presentation.mortalityEstimate = { ...presentation.mortalityEstimate, totalPhaseCost: phases,
      timeLabel: formatVassalPhaseDuration(phases, session.state), projectedAge: age,
      naturalDeathChance: getVassalMortalityChance(age), totalDeathChance: getVassalMortalityChance(age) };
  }
  const legacyRequirements=spec.kind==='legacy'?{ 'found-settlement':[{label:'10 adult Villagers relocate',met:(session.state.world.sites.find(site=>site.regionId===vassal.locationRegionId)?.detailedState?.populationByClass?.villager?.adults??0)>=10}] }:null;
  if(legacyRequirements&&!legacyRequirements['found-settlement'][0].met)options.find(option=>option.id==='found-settlement').blocked='Requires 10 adult Villagers';
  return { ...presentation, ...(legacyRequirements?{workshopLegacy:true,contextKind:'none',optionRequirements:legacyRequirements}:{}), ...(session.shopSelection ? { shopTag: session.shopSelection.selectedTag,
    ...(!session.shopSelection.selectedTag ? {shopTagChoices:session.shopSelection.tags.map(({cards,...tag})=>({...tag,enabled:cards.length>0}))} : {}) } : {}),
    node: { ...presentation.node, experimentId: spec.id,
    presentationLabel: spec.title, presentationDescription: spec.description },
    nodeState: { ...presentation.nodeState, options }, options };
}
export function selectOpeningOption(session, optionId) {
  if (session.shopSelection && !session.shopSelection.selectedTag) {
    return chooseOpeningShopTag(session, optionId, cards => curatedOffers(session.state, openingVassal(session), nodeState(session), cards));
  }
  const option = getOpeningDecision(session)?.options.find(o => o.id === optionId);
  if (!option || option.blocked) throw new Error(option?.blocked ?? 'Choose an available action.');
  return requireOk(selectVassalNodeOption(session.state, session.runtimeNodeId, optionId));
}
export function stageOpeningOffer(session, offerId, origin, toIndex, replacePracticeId) {
  const current = nodeState(session), offer = current.inventory.find(offer => offer.offerId === offerId);
  if (!session.shopSelection) return requireOk(purchaseVassalShopOffer(session.state, session.runtimeNodeId, offerId, origin, toIndex, replacePracticeId));
  if (!session.shopSelection.selectedTag || !offer) throw new Error('Choose an available tag and offer.');
  const price = openingShopPrice(openingVassal(session), current, offer, session.shopSelection.monsterPressurePerPurchase);
  const baseCost = offer.basePrestigeCost;
  try {
    if (price.usesMonsterPressure) offer.basePrestigeCost = 0;
    const result = requireOk(purchaseVassalShopOffer(session.state, session.runtimeNodeId, offerId, origin, toIndex, replacePracticeId));
    const purchase = current.purchasedOffers.find(purchase => purchase.offerId === result.offerId);
    purchase.basePrestigeCost = baseCost;purchase.monsterPressureCost = price.monsterPressureCost;
    return result;
  } finally { offer.basePrestigeCost = baseCost; }
}
export function commitOpeningEncounter(session, optionId = null, destination = 'equip', pass = false) {
  const current = nodeState(session), spec = session.experiment.nodes.find(n => n.id === session.activeId);
  if(spec.kind==='legacy')throw new Error('Legacy is a workshop mockup; record its choice through the prototype controller.');
  if (session.shopSelection && !session.shopSelection.selectedTag) throw new Error('Choose a tag first.');
  if (pass) {
    if (!spec.pass || current.purchasedOffers.length) throw new Error('Undo purchases before choosing the alternative.');
    current.contentMode = 'choice'; current.family = 'development'; current.options = [toOption(spec.pass, spec.pass.id)];
    optionId = current.options[0].id;
  }
  if (optionId) {
    const option = current.options.find(o => o.id === optionId);
    if (!option) throw new Error('Choose an available action.');
    // Keep Travel-specific discounts on movement, rather than route building.
    if (spec.kind === 'world' && !session.randomOutcome && (option.intervention || option.classAction || !option.locationRegionId)) current.family = option.classAction ? 'campaign' : 'development';
    const check = getOpeningDecision(session).options.find(o => o.id === optionId);
    if (check.blocked) throw new Error(check.blocked);
    requireOk(selectVassalNodeOption(session.state, session.runtimeNodeId, optionId));
  }
  const result = requireOk(confirmVassalLifeNode(session.state, session.runtimeNodeId, typeof destination === 'object' ? destination : { destination }));
  const effects = current.purchasedOffers.filter(purchase => purchase.monsterPressureCost > 0)
    .map(purchase => ({op:'addMonsterPressure',amount:purchase.monsterPressureCost}));
  requireOk(applyVassalNodeEffects(session.state, effects));
  return result;
}

// Prototype outcome grammar: choose a weighted bucket, then one eligible reward.
// The selected reward is executed by the existing ability/Relic node rules.
function eligibleOutcomeBuckets(session, source) {
  const owned = getOwnedHeirloomDefinitionIds(session.state, openingVassal(session));
  const pools = source.weightedOutcomes.map(bucket => ({ ...bucket,
    options: bucket.options.filter(reward => !reward.definitionId || !owned.has(reward.definitionId))
  })).filter(bucket => bucket.options.length);
  const weighted = pools.filter(bucket => bucket.weight > 0);
  return weighted.length ? weighted : pools.filter(bucket => bucket.options.every(r => r.statId)).map(bucket => ({...bucket,weight:1}));
}
export function resolveOpeningOptionOutcome(session, optionId) {
  optionId ??= nodeState(session)?.selectedOptionId;
  const spec = session.experiment.nodes.find(n => n.id === session.activeId);
  const source = spec?.options?.find(o => o.id === optionId);
  if (!source?.weightedOutcomes || session.randomOutcome) return null;
  const { state } = session, vassal = openingVassal(session), buckets = eligibleOutcomeBuckets(session, source);
  if (!buckets.length) throw new Error('No unowned relic or ability reward is available. Edit the reward pools.');
  const total = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
  let roll = state.rngNextVassalInt(0, 999999) / 1000000 * total;
  let bucket = buckets.at(-1);
  for (const candidate of buckets) { if (roll < candidate.weight) { bucket = candidate; break; } roll -= candidate.weight; }
  const reward = bucket.options[state.rngNextVassalInt(0, bucket.options.length - 1)];
  const current = nodeState(session), outcome = { ...toOption(source, source.id), ...reward,
    id: `${source.id}-reward`, immediateDeathChance: 0 };
  const family = reward.definitionId ? 'relic' : 'development';
  const label = reward.definitionId ? `Found ${VASSAL_HEIRLOOM_DEFS[reward.definitionId].label}`
    : `Gained +${reward.statDelta} ${getVassalStatPresentation(vassal, reward.statId).label}`;
  outcome.label = reward.definitionId ? VASSAL_HEIRLOOM_DEFS[reward.definitionId].label : label;
  if (reward.definitionId) Object.assign(outcome, { quality: 'bronze', description: VASSAL_HEIRLOOM_DEFS[reward.definitionId].description });
  current.family = family; current.contentMode = 'choice'; current.options = [outcome]; current.selectedOptionId = outcome.id;
  openingVassal(session).lifeMap.graph.nodes.find(n => n.id === session.runtimeNodeId).family = family;
  session.randomOutcome = { ...reward, sourceOptionId: source.id, optionId: outcome.id, label };
  return { optionId: outcome.id, needsAcquisition: !!reward.definitionId };
}
export function finishOpeningEncounter(session, before) {
  const spec = session.experiment.nodes.find(n => n.id === session.activeId);
  const after = openingSummary(session);
  session.outcomes.push({ id: spec.id, title: spec.title, before, after, ...(session.randomOutcome ? { reward: structuredClone(session.randomOutcome) } : {}) });
  session.visitedIds.push(spec.id);
  session.founded = !!session.state.civilization.vassalLineage.establishedClassId;
  session.availableIds = after.dead || after.complete ? [] : [...spec.next];
  session.activeId = null; session.runtimeNodeId = null;
}
export function chooseOpeningDevelopment(session, statId) {
  const vassal = getCurrentLifeMapVassal(session.state);
  return requireOk(chooseVassalDevelopmentStat(session.state, vassal?.developmentChoiceQueue[0]?.choiceId, statId));
}

export function finishOpeningNote(session) {
  const spec = session.experiment.nodes.find(n => n.id === session.activeId);
  if (spec?.kind !== 'customNote') throw new Error('Enter a Custom Note first.');
  const summary = openingSummary(session);
  session.outcomes.push({ id: spec.id, title: spec.title, before: summary, after: structuredClone(summary) });
  session.visitedIds.push(spec.id); session.activeId = null; session.runtimeNodeId = null; session.availableIds = [...spec.next];
}

export function finishOpeningLegacyMock(session, optionId) {
  const spec=session.experiment.nodes.find(node=>node.id===session.activeId);
  if(spec?.kind!=='legacy')throw new Error('Enter Legacy first.');
  const option=getOpeningDecision(session).options.find(option=>option.id===(optionId??nodeState(session).selectedOptionId));
  if(!option||option.blocked)throw new Error(option?.blocked??'Choose a Legacy option.');
  const summary=openingSummary(session);
  session.outcomes.push({id:spec.id,title:spec.title,before:summary,after:structuredClone(summary),
    legacyChoice:{id:option.id,label:option.label,...(option.legacyReward?{reward:structuredClone(option.legacyReward)}:{})},mock:true});
  session.visitedIds.push(spec.id);session.activeId=null;session.runtimeNodeId=null;session.availableIds=[];
}

// Render-only projection: the editable graph does not replace GameState's
// generated graph or alter its validation, serialization or replay rules.
export function getOpeningGraphPresentation(session) {
  const vassal = openingVassal(session), depths = {};
  const visit = (id, depth) => {
    if ((depths[id] ?? -1) >= depth) return;
    depths[id] = depth; session.experiment.nodes.find(n => n.id === id).next.forEach(next => visit(next, depth + 1));
  };
  session.experiment.entryIds.forEach(id => visit(id, 0));
  const maxDepth = Math.max(...Object.values(depths));
  const nodes = session.experiment.nodes.map(spec => {
    const peers = session.experiment.nodes.filter(n => depths[n.id] === depths[spec.id]);
    const family = { world: 'travel', founding: 'warlordFounding', shop: 'practiceReform', structureShop: 'publicWorks', martial: 'challenge', supply: 'stockShop', specialRelic: 'relic', customNote: 'patronage' }[spec.kind] ?? spec.kind;
    return { id: spec.id, experimentId: spec.id, presentationLabel: spec.title, presentationDescription: spec.description,
      family, depth: depths[spec.id], lane: peers.indexOf(spec),
      ...(family === 'stockShop' ? { stockOutput: spec.stockOutput === 'auto' ? 'Needed' : spec.stockOutput } : {}),
      position: { x: depths[spec.id] / Math.max(1, maxDepth), y: peers.length === 1 ? .5 : .25 + .5 * peers.indexOf(spec) / (peers.length - 1) } };
  });
  return { ...vassal, lifeMap: { ...vassal.lifeMap, currentNodeId: session.activeId,
    availableNodeIds: session.availableIds, completedNodeIds: session.visitedIds,
    graph: { ...vassal.lifeMap.graph, nodes, entryNodeIds: session.experiment.entryIds,
      edges: session.experiment.nodes.flatMap(n => n.next.map(next => ({ fromNodeId: n.id, toNodeId: next }))) } } };
}
