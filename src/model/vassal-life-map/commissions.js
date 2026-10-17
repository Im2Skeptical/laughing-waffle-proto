import { VASSAL_COMMISSION_DEFS } from '../../defs/vassal-class-rules.js';
import { VASSAL_NODE_FAMILIES, VASSAL_STAT_IDS } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { VASSAL_INTERVENTION_PRACTICE_IDS, settlementStructureDefs } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { getHeirloomDefinition, VASSAL_HEIRLOOM_QUALITIES } from '../../defs/gamepieces/vassal-heirloom-defs.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../game-config.js';
import { getResearchUnlockIndex } from '../research-progression.js';
import { getDetailedPracticeTierIndex } from '../detailed-practice-tiers.js';
import { getRegionReference } from '../world-state.js';
import { getCurrentLifeMapVassal, getPlayerDetailedSites, getVassalLifeMapReachableNodeIds, getVassalStatPresentation, shuffle } from './selectors.js';

const activeScholar = vassal => vassal?.classId === 'scholar' && !vassal.isDead && !vassal.endedReason;
const permanentStat = (vassal, statId) => Math.max(0, Math.floor(vassal.stats?.[statId] ?? 0));
const tags = definitions => [...new Set(definitions.flatMap(def => def.tags ?? []))].sort();

function offerContext(state, vassal) {
  const reachable = new Set(getVassalLifeMapReachableNodeIds(vassal));
  const nodes = (vassal.lifeMap.graph?.nodes ?? []).filter(node => reachable.has(node.id)
    && node.id !== vassal.lifeMap.currentNodeId && !vassal.lifeMap.completedNodeIds.includes(node.id));
  const unlocked = def => def && !def.locked && ['common', vassal.classId].includes(def.pool)
    && getDetailedPracticeTierIndex(def.minimumQuality ?? 'bronze') <= getResearchUnlockIndex(state);
  const practices = VASSAL_INTERVENTION_PRACTICE_IDS.map(id => getDetailedPracticeDef(state, id)).filter(unlocked);
  const structures = Object.keys(settlementStructureDefs).map(id => getDetailedStructureDef(state, id)).filter(unlocked);
  const connected = new Set([vassal.locationRegionId]);
  // Travel uses the same existing-road reachability as the live Travel node.
  for (const id of connected) for (const edge of state.world.connections) {
    if (edge.regionAId === id) connected.add(edge.regionBId);
    if (edge.regionBId === id) connected.add(edge.regionAId);
  }
  return { nodes, practices, structures, destinations: getPlayerDetailedSites(state)
    .filter(site => site.regionId !== vassal.locationRegionId && connected.has(site.regionId)) };
}

function parametersFor(def, context) {
  if (def.parameter === 'statId') return VASSAL_STAT_IDS.map(statId => ({ statId }));
  if (def.parameter === 'nodeFamily') return [...new Set(context.nodes.map(node => node.family))]
    .filter(family => VASSAL_NODE_FAMILIES[family]).sort().map(nodeFamily => ({ nodeFamily }));
  if (def.parameter === 'regionId') return context.nodes.some(node => node.family === 'travel')
    ? context.destinations.map(site => ({ regionId: site.regionId })) : [];
  if (def.parameter === 'tag') return tags(def.event === 'practiceInstalled' ? context.practices : context.structures).map(tag => ({ tag }));
  return [{}];
}

function offerText(def, parameters) {
  const replace = text => text.replace(/\{(stat|node|location|tag)\}/g, (_match, key) => parameters[`${key}Label`] ?? parameters.tag);
  return { label: replace(def.label), description: replace(def.description) };
}

export function ensureCommissionOffers(state, vassal) {
  if (!activeScholar(vassal) || vassal.commission || vassal.commissionOffers?.length) return;
  const context = offerContext(state, vassal);
  const recent = vassal.commissionHistory ?? [];
  const pool = VASSAL_COMMISSION_DEFS.map(def => ({ def, parameters: parametersFor(def, context) }))
    .filter(entry => entry.parameters.length);
  const selected = shuffle(state, pool).sort((a, b) => recent.lastIndexOf(a.def.id) - recent.lastIndexOf(b.def.id)).slice(0, 3);
  const round = (vassal.completedCommissions ?? 0) + 1;
  vassal.commissionOffers = selected.map(({ def, parameters }) => {
    const target = parameters.length === 1 ? parameters[0] : parameters[state.rngNextVassalInt(0, parameters.length - 1)];
    const labels = {
      ...(target.statId ? { statLabel: getVassalStatPresentation(vassal, target.statId).label } : {}),
      ...(target.nodeFamily ? { nodeLabel: VASSAL_NODE_FAMILIES[target.nodeFamily].label } : {}),
      ...(target.regionId ? { locationLabel: getRegionReference(state, target.regionId) ?? target.regionId } : {}),
    };
    return { ...def, ...target, ...labels, ...offerText(def, { ...target, ...labels }),
      offerId: `${vassal.vassalId}:commission:${round}:${def.id}` };
  });
}

export function chooseVassalCommission(state, offerId) {
  const vassal = getCurrentLifeMapVassal(state);
  if (!activeScholar(vassal) || vassal.lifeMap.pendingResolution) return { ok: false, reason: 'commissionUnavailable' };
  const offer = vassal.commissionOffers?.find(entry => entry.offerId === offerId);
  if (!offer || vassal.commission) return { ok: false, reason: 'staleCommissionOffer' };
  vassal.commission = { ...offer, acceptedSec: state.tSec, progress: 0,
    ...(offer.statId ? { startingStat: permanentStat(vassal, offer.statId) } : {}) };
  vassal.commissionOffers = [];
  return { ok: true };
}

// Only authoritative, committed Vassal actions submit these events. Staging,
// inheritance and autonomous construction never count as commissioned work.
export function recordCommissionAction(state, vassal, event) {
  const goal = vassal?.commission;
  if (!activeScholar(vassal) || !goal || goal.event !== event.kind) return;
  if (goal.tag) {
    const def = goal.event === 'practiceInstalled' ? getDetailedPracticeDef(state, event.practiceId)
      : getDetailedStructureDef(state, event.structureId);
    if (!def?.tags?.includes(goal.tag)) return;
  }
  if (goal.nodeFamily && event.nodeFamily !== goal.nodeFamily) return;
  if (goal.regionId && event.regionId !== goal.regionId) return;
  if (goal.minimumQuality && VASSAL_HEIRLOOM_QUALITIES.indexOf(getHeirloomDefinition(event.definitionId)?.quality)
      < VASSAL_HEIRLOOM_QUALITIES.indexOf(goal.minimumQuality)) return;
  if (goal.statId && permanentStat(vassal, goal.statId) <= goal.startingStat) return;
  if (goal.amount) {
    goal.progress = Math.min(goal.amount, goal.progress + Math.max(0, Math.floor(event.amount ?? 0)));
    if (goal.progress < goal.amount) return;
  }
  // Clear before awarding: the prize cannot progress another Commission.
  vassal.commission = null;
  vassal.prestige += goal.prestige;
  vassal.completedCommissions = (vassal.completedCommissions ?? 0) + 1;
  vassal.commissionHistory = [...(vassal.commissionHistory ?? []), goal.id].slice(-12);
  vassal.lifeEvents.push({ eventId: `${goal.offerId}:completed`, kind: 'commissionCompleted',
    tSec: state.tSec, text: `${goal.label}: +${goal.prestige} Prestige` });
  ensureCommissionOffers(state, vassal);
}

export function stepVassalCommission(state, vassal) {
  ensureCommissionOffers(state, vassal);
  if (vassal?.commission?.statId) recordCommissionAction(state, vassal, { kind: 'statIncreased' });
}

export function validateVassalCommissions(vassal) {
  if (!vassal || typeof vassal !== 'object') return ['invalid Vassal Commission state'];
  const errors = [];
  const validOffer = offer => {
    const def = VASSAL_COMMISSION_DEFS.find(entry => entry.id === offer?.id);
    if (!def || ['event', 'prestige', 'difficulty', 'parameter', 'amount', 'minimumQuality'].some(key => offer[key] !== def[key])) return false;
    if (def.parameter === 'statId' && (!VASSAL_STAT_IDS.includes(offer.statId)
        || offer.statLabel !== getVassalStatPresentation(vassal, offer.statId).label)) return false;
    if (def.parameter === 'nodeFamily' && (!VASSAL_NODE_FAMILIES[offer.nodeFamily]
        || offer.nodeLabel !== VASSAL_NODE_FAMILIES[offer.nodeFamily].label)) return false;
    if (def.parameter === 'regionId' && (typeof offer.regionId !== 'string' || typeof offer.locationLabel !== 'string')) return false;
    if (def.parameter === 'tag' && (typeof offer.tag !== 'string' || !offer.tag)) return false;
    const copy = offerText(def, offer);
    return offer.label === copy.label && offer.description === copy.description
      && typeof offer.offerId === 'string' && offer.offerId.startsWith(`${vassal.vassalId}:commission:`);
  };
  const offers = vassal.commissionOffers ?? [];
  if (!Array.isArray(offers) || offers.length > 3 || offers.some(offer => !validOffer(offer))
      || new Set(offers.map(offer => offer.id)).size !== offers.length) errors.push('invalid Commission offers');
  const goal = vassal.commission;
  if (goal && (!validOffer(goal) || offers.length || !Number.isFinite(goal.acceptedSec)
      || !Number.isInteger(goal.progress) || goal.progress < 0 || (goal.amount && goal.progress >= goal.amount)
      || (goal.statId && (!Number.isInteger(goal.startingStat) || goal.startingStat < 0)))) errors.push('invalid active Commission');
  if ((goal || offers.length) && vassal.classId !== 'scholar') errors.push('Commission requires Scholar');
  if (vassal.commissionHistory != null && (!Array.isArray(vassal.commissionHistory)
      || vassal.commissionHistory.some(id => !VASSAL_COMMISSION_DEFS.some(def => def.id === id)))) errors.push('invalid Commission history');
  return errors;
}
