import { VASSAL_COMMISSION_DEFS } from '../../defs/vassal-class-rules.js';
import { getCurrentLifeMapVassal, shuffle } from './selectors.js';
import { getDetailedSettlementSites } from '../detailed-settlements/queries.js';

export function ensureCommissionOffers(state, vassal) {
  if (vassal?.classId !== 'scholar' || vassal.isDead || vassal.endedReason
      || vassal.commission || vassal.commissionOffers?.length) return;
  const recent = vassal.commissionHistory ?? [];
  // Prefer less recently completed goals. With this initial three-goal pool,
  // all three remain available; a larger pool naturally avoids recent repeats.
  const pool = shuffle(state, VASSAL_COMMISSION_DEFS).sort((a, b) =>
    recent.lastIndexOf(a.id) - recent.lastIndexOf(b.id));
  const round = (vassal.completedCommissions ?? 0) + 1;
  vassal.commissionOffers = pool.slice(0, 3).map(def => ({
    ...def, offerId: `${vassal.vassalId}:commission:${round}:${def.id}`,
  }));
}

export function chooseVassalCommission(state, offerId) {
  const vassal = getCurrentLifeMapVassal(state);
  if (!vassal || vassal.classId !== 'scholar' || vassal.lifeMap.pendingResolution)
    return { ok: false, reason: 'commissionUnavailable' };
  const offer = vassal.commissionOffers?.find(entry => entry.offerId === offerId);
  if (!offer || vassal.commission) return { ok: false, reason: 'staleCommissionOffer' };
  vassal.commission = { ...offer, acceptedSec: state.tSec, projects: [] };
  vassal.commissionOffers = [];
  return { ok: true };
}

// Only committed vassal node actions call this, never autonomous simulation,
// inheritance, staged purchases, or regional installation commands.
export function recordCommissionAction(state, vassal, event) {
  const goal = vassal?.commission;
  if (!goal) return;
  if (event.kind === 'structureStarted' && goal.event === 'structureFinished') {
    goal.projects.push({ regionId: event.regionId, placementId: event.placementId });
  }
  if (goal.event === event.kind) {
    vassal.prestige += goal.prestige;
    vassal.completedCommissions = (vassal.completedCommissions ?? 0) + 1;
    vassal.commissionHistory = [...(vassal.commissionHistory ?? []), goal.id].slice(-12);
    vassal.lifeEvents.push({ eventId: `${goal.offerId}:completed`, kind: 'commissionCompleted',
      tSec: state.tSec, text: `${goal.label}: +${goal.prestige} Prestige` });
    vassal.commission = null;
    ensureCommissionOffers(state, vassal);
  }
}

export function stepVassalCommission(state, vassal) {
  ensureCommissionOffers(state, vassal);
  const goal = vassal?.commission;
  if (goal?.event !== 'structureFinished') return;
  const sites = getDetailedSettlementSites(state, { playerOnly: true });
  const completed = goal.projects.some(project => sites.find(site => site.regionId === project.regionId)
    ?.detailedState.structureSlots.some(slot => slot?.placementId === project.placementId && !slot.construction));
  if (completed) recordCommissionAction(state, vassal, { kind: 'structureFinished' });
}

export function validateVassalCommissions(vassal) {
  if (!vassal || typeof vassal !== 'object') return ['invalid Vassal Commission state'];
  const errors = [];
  const validOffer = offer => {
    const def = VASSAL_COMMISSION_DEFS.find(entry => entry.id === offer?.id);
    return def && offer.event === def.event && offer.prestige === def.prestige
      && offer.label === def.label && offer.description === def.description
      && typeof offer.offerId === 'string' && offer.offerId.startsWith(`${vassal.vassalId}:commission:`);
  };
  const offers = vassal.commissionOffers ?? [];
  if (!Array.isArray(offers) || (offers.length !== 0 && offers.length !== 3)
      || offers.some(offer => !validOffer(offer)) || new Set(offers.map(offer => offer.id)).size !== offers.length)
    errors.push('invalid Commission offers');
  const goal = vassal.commission;
  if (goal && (!validOffer(goal) || offers.length || !Number.isFinite(goal.acceptedSec)
      || !Array.isArray(goal.projects) || goal.projects.some(project =>
        typeof project.regionId !== 'string' || typeof project.placementId !== 'string')))
    errors.push('invalid active Commission');
  if ((goal || offers.length) && vassal.classId !== 'scholar') errors.push('Commission requires Scholar');
  if (vassal.commissionHistory != null && (!Array.isArray(vassal.commissionHistory)
      || vassal.commissionHistory.some(id => !VASSAL_COMMISSION_DEFS.some(def => def.id === id))))
    errors.push('invalid Commission history');
  return errors;
}
