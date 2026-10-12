// Disposable adapter around real rules. No player module imports this workbench.
import { createNewGameState } from '../../../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../../../src/model/state.js';
import { getCurrentLifeMapVassal, selectLifeMapVassal, enterVassalLifeNode, getVassalNodeDecisionPresentation,
  getVassalAge, getVassalEffectiveStats, getVassalActionPhaseCost, getAdjustedVassalPrestigeCost,
  selectVassalNodeOption, confirmVassalLifeNode, purchaseVassalShopOffer, chooseVassalDevelopmentStat, getVassalStatPresentation, formatVassalPhaseDuration } from '../../../src/model/vassal-life-map.js';
import { getVassalMortalityChance } from '../../../src/defs/gamepieces/vassal-life-map-defs.js';
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
import { validateOpeningExperiment } from './experiment.js';

export function cloneOpeningSession(session) {
  return { ...structuredClone({ ...session, state: null }), state: deserializeGameState(serializeGameState(session.state)) };
}
export function createOpeningSession(document) {
  const experiment = validateOpeningExperiment(document), state = createNewGameState(experiment.seed);
  const index = state.civilization.vassalLineage.pendingCandidates.findIndex(c => c.founderClassId === 'warrior');
  const selected = selectLifeMapVassal(state, index);
  if (!selected.ok) throw new Error(selected.reason);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.lifeMap.availableNodeIds = [];
  return { experiment, state, vassalId: vassal.vassalId, availableIds: [...experiment.entryIds],
    visitedIds: [], activeId: null, runtimeNodeId: null, founded: false, outcomes: [] };
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
    cunning: stats.cunning, wisdom: stats.wisdom, retinue: retinue.value, retinueCap: retinue.cap, support,
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
  const { chaos = 0, ...option } = structuredClone(item);
  return { id: fallbackId, ...option, effects: chaos ? [{ op: 'addChaos', amount: chaos }] : [] };
}
function nodeState(session) { return openingVassal(session).lifeMap.nodeStates[session.runtimeNodeId]; }
function curatedOffers(state, vassal, current, cards) {
  const settlement = state.world.sites.find(s => s.regionId === vassal.locationRegionId).detailedState;
  return cards.flatMap((card, index) => {
    const kind = card.kind ?? 'practice', def = kind === 'practice' ? getDetailedPracticeDef(state, card.definitionId) : getDetailedStructureDef(state, card.definitionId);
    if (!def) throw new Error(`Unknown ${kind}: ${card.definitionId}`);
    if (def.locked === true || !['common', vassal.classId].includes(def.pool)
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
  const { state } = session, vassal = getCurrentLifeMapVassal(state);
  if (!vassal || state.runStatus?.complete) throw new Error('This run has ended. Rewind or restart.');
  const spec = session.experiment.nodes.find(n => n.id === id), graph = vassal.lifeMap.graph;
  const family = { world: 'travel', founding: 'warlordFounding', shop: 'practiceReform', martial: 'challenge', supply: 'stockShop', specialRelic: 'relic' }[spec.kind] ?? spec.kind;
  const specimens = graph.nodes.filter(n => n.depth > 0 && !n.signatureNode && !['legacy', 'signature'].includes(n.family));
  const runtime = spec.kind === 'founding' ? graph.nodes.find(n => n.id === graph.foundingNodeId)
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
    current.options.forEach(option => { option.phaseCost = spec.phaseCost ?? option.phaseCost; });
    const routes = generateShopInventory(state, vassal, { ...current, family: 'routes' });
    current.options.push(...routes.map(offer => ({ id: offer.offerId, label: offer.label, phaseCost: spec.phaseCost ?? offer.basePhaseCost,
      prestigeCost: offer.basePrestigeCost, intervention: offer.intervention, experimentFamily: 'routes' })));
    if (vassal.classId === 'warrior') current.options.push(...classActionOptions(state, vassal, 'campaign').filter(o => o.classAction.kind !== 'prepare'));
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
  } else if (['development', 'patronage'].includes(spec.kind) && spec.options) {
    current.options = spec.options.map(o => toOption(o, o.id));
  }
  if (spec.kind === 'relic') current.options.forEach(o => { o.immediateDeathChance = 0; });
  if (spec.kind === 'shop' && spec.cards) current.inventory = curatedOffers(state, vassal, current, spec.cards);
  if (spec.phaseCost != null && spec.kind !== 'world') {
    current.options.forEach(o => { o.phaseCost = spec.phaseCost; });
    current.inventory.forEach(o => { o.basePhaseCost = spec.phaseCost; });
  }
  if (!current.options.length && !current.inventory.length) current.contentMode = 'shop';
  return session;
}

export function getOpeningDecision(session, preview = {}) {
  if (!session.activeId) return null;
  const presentation = getVassalNodeDecisionPresentation(session.state, session.runtimeNodeId, preview);
  const vassal = openingVassal(session), current = nodeState(session);
  const spec = session.experiment.nodes.find(n => n.id === session.activeId);
  const options = current.options.map(option => {
    const cost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
    const phases = getVassalActionPhaseCost(vassal, option.phaseCost ?? 0, { nodeState: current, isTravel: current.family === 'travel' && !!option.locationRegionId });
    const projectedAge = getVassalAge(session.state, vassal, session.state.tSec + phases * getMoonPhaseDurationSec(session.state));
    return { ...option, ...(option.statId ? { statLabel: getVassalStatPresentation(vassal, option.statId).label } : {}), cost, phases, projectedAge, blocked: cost > vassal.prestige ? 'Insufficient Prestige'
      : !session.founded && (projectedAge >= 40 || (option.immediateDeathChance ?? 0) > 0) ? 'Founding must remain before any death risk' : null };
  });
  if (spec.pass && current.contentMode === 'shop' && !presentation.purchases.length) {
    const phases = getVassalActionPhaseCost(vassal, spec.pass.phaseCost ?? 0, { nodeState: current });
    const age = getVassalAge(session.state, vassal, session.state.tSec + phases * getMoonPhaseDurationSec(session.state));
    presentation.mortalityEstimate = { ...presentation.mortalityEstimate, totalPhaseCost: phases,
      timeLabel: formatVassalPhaseDuration(phases, session.state), projectedAge: age,
      naturalDeathChance: getVassalMortalityChance(age), totalDeathChance: getVassalMortalityChance(age) };
  }
  return { ...presentation, node: { ...presentation.node, experimentId: spec.id,
    presentationLabel: spec.title, presentationDescription: spec.description },
    nodeState: { ...presentation.nodeState, options }, options };
}
export function selectOpeningOption(session, optionId) {
  const option = getOpeningDecision(session)?.options.find(o => o.id === optionId);
  if (!option || option.blocked) throw new Error(option?.blocked ?? 'Choose an available action.');
  return requireOk(selectVassalNodeOption(session.state, session.runtimeNodeId, optionId));
}
export function stageOpeningOffer(session, offerId, origin, toIndex, replacePracticeId) {
  return requireOk(purchaseVassalShopOffer(session.state, session.runtimeNodeId, offerId, origin, toIndex, replacePracticeId));
}
export function commitOpeningEncounter(session, optionId = null, destination = 'equip', pass = false) {
  const current = nodeState(session), spec = session.experiment.nodes.find(n => n.id === session.activeId);
  if (pass) {
    if (!spec.pass || current.purchasedOffers.length) throw new Error('Undo purchases before choosing the alternative.');
    current.contentMode = 'choice'; current.family = 'development'; current.options = [toOption(spec.pass, spec.pass.id)];
    optionId = current.options[0].id;
  }
  if (optionId) {
    const option = current.options.find(o => o.id === optionId);
    if (!option) throw new Error('Choose an available action.');
    // Keep Travel-specific discounts on movement, rather than route building.
    if (spec.kind === 'world' && (option.intervention || option.classAction || !option.locationRegionId)) current.family = option.classAction ? 'campaign' : 'development';
    const check = getOpeningDecision(session).options.find(o => o.id === optionId);
    if (check.blocked) throw new Error(check.blocked);
    requireOk(selectVassalNodeOption(session.state, session.runtimeNodeId, optionId));
  }
  return requireOk(confirmVassalLifeNode(session.state, session.runtimeNodeId, { destination }));
}
export function finishOpeningEncounter(session, before) {
  const spec = session.experiment.nodes.find(n => n.id === session.activeId);
  const after = openingSummary(session);
  session.outcomes.push({ id: spec.id, title: spec.title, before, after });
  session.visitedIds.push(spec.id);
  session.founded = !!session.state.civilization.vassalLineage.establishedClassId;
  session.availableIds = after.dead || after.complete ? [] : [...spec.next];
  session.activeId = null; session.runtimeNodeId = null;
}
export function chooseOpeningDevelopment(session, statId) {
  const vassal = getCurrentLifeMapVassal(session.state);
  return requireOk(chooseVassalDevelopmentStat(session.state, vassal?.developmentChoiceQueue[0]?.choiceId, statId));
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
    const family = { world: 'travel', founding: 'warlordFounding', shop: 'practiceReform', martial: 'challenge', supply: 'stockShop', specialRelic: 'relic' }[spec.kind] ?? spec.kind;
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
