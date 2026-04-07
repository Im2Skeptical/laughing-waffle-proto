import { settlementOrderDefs } from "../defs/gamepieces/settlement-order-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import {
  createSettlementCardInstance,
  getSettlementClassIds,
  getSettlementOrderSlots,
  getSettlementPopulationSummary,
  getSettlementPracticeSlotsByClass,
} from "./settlement-state.js";
import {
  buildGeneratedAgendaByClass,
  chooseRandom,
  cloneSerializable,
  getMortalityChance,
  normalizeAgendaByClass,
  pickWeightedClassId,
} from "./settlement-leadership.js";

function getFirstOrderCard(state, defId = null) {
  const slots = getSettlementOrderSlots(state);
  for (const slot of slots) {
    const card = slot?.card ?? null;
    if (!card) continue;
    if (defId && card.defId !== defId) continue;
    return card;
  }
  return null;
}

function getOrderDef(card) {
  return settlementOrderDefs?.[card?.defId] ?? null;
}

function ensureElderCouncilState(card, state) {
  if (!card || typeof card !== "object") return null;
  if (!card.systemState || typeof card.systemState !== "object" || Array.isArray(card.systemState)) {
    card.systemState = {};
  }
  const classIds = getSettlementClassIds(state);
  const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
  const existing =
    card.systemState.elderCouncil &&
    typeof card.systemState.elderCouncil === "object" &&
    !Array.isArray(card.systemState.elderCouncil)
      ? card.systemState.elderCouncil
      : {};
  const membersRaw = Array.isArray(existing.members) ? existing.members : [];
  const members = membersRaw
    .map((member, index) => {
      if (!member || typeof member !== "object" || Array.isArray(member)) return null;
      return {
        memberId:
          typeof member.memberId === "string" && member.memberId.length > 0
            ? member.memberId
            : `elder-${index + 1}`,
        sourceClassId:
          typeof member.sourceClassId === "string" && member.sourceClassId.length > 0
            ? member.sourceClassId
            : classIds[0] ?? "villager",
        joinedYear: Number.isFinite(member.joinedYear)
          ? Math.max(1, Math.floor(member.joinedYear))
          : currentYear,
        ageYears: Number.isFinite(member.ageYears) ? Math.max(0, Math.floor(member.ageYears)) : 0,
        modifierId:
          typeof member.modifierId === "string" && member.modifierId.length > 0
            ? member.modifierId
            : null,
        sourceVassalId:
          typeof member.sourceVassalId === "string" && member.sourceVassalId.length > 0
            ? member.sourceVassalId
            : null,
        agendaByClass: normalizeAgendaByClass(member.agendaByClass, classIds),
      };
    })
    .filter(Boolean);
  let nextMemberId = Number.isFinite(existing.nextMemberId)
    ? Math.max(1, Math.floor(existing.nextMemberId))
    : members.length + 1;
  card.systemState.elderCouncil = {
    lastProcessedYear: Number.isFinite(existing.lastProcessedYear)
      ? Math.max(1, Math.floor(existing.lastProcessedYear))
      : currentYear,
    nextMemberId,
    members,
  };

  if (members.length <= 0) {
    seedInitialCouncil(card, state);
    nextMemberId = Math.max(
      1,
      Math.floor(card.systemState.elderCouncil?.nextMemberId ?? nextMemberId)
    );
    card.systemState.elderCouncil.nextMemberId = nextMemberId;
  }

  return card.systemState.elderCouncil;
}

function seedInitialCouncil(card, state) {
  const councilState = card?.systemState?.elderCouncil;
  const def = getOrderDef(card);
  if (!councilState || !def) return false;
  const classIds = getSettlementClassIds(state);
  const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
  const template = Array.isArray(def.initialCouncilTemplate) ? def.initialCouncilTemplate : [];
  councilState.members = template.map((entry) => {
    const nextMemberId = Number.isFinite(councilState.nextMemberId)
      ? Math.max(1, Math.floor(councilState.nextMemberId))
      : 1;
    councilState.nextMemberId = nextMemberId + 1;
    return {
      memberId: `elder-${nextMemberId}`,
      sourceClassId:
        typeof entry?.sourceClassId === "string" && entry.sourceClassId.length > 0
          ? entry.sourceClassId
          : classIds[0] ?? "villager",
      joinedYear: currentYear,
      ageYears: Number.isFinite(entry?.ageYears) ? Math.max(0, Math.floor(entry.ageYears)) : 0,
      modifierId:
        typeof entry?.modifierId === "string" && entry.modifierId.length > 0
          ? entry.modifierId
          : null,
      sourceVassalId:
        typeof entry?.sourceVassalId === "string" && entry.sourceVassalId.length > 0
          ? entry.sourceVassalId
          : null,
      agendaByClass: normalizeAgendaByClass(entry?.agendaByClass, classIds),
    };
  });
  councilState.lastProcessedYear = currentYear;
  return councilState.members.length > 0;
}

function getModifierDef(orderDef, modifierId) {
  return orderDef?.prestigeModifiers?.[modifierId] ?? null;
}

function getMemberPrestige(orderDef, member) {
  const ageYears = Number.isFinite(member?.ageYears) ? Math.max(0, Math.floor(member.ageYears)) : 0;
  const modifierDelta = Number(getModifierDef(orderDef, member?.modifierId)?.prestigeDelta ?? 0);
  return Math.max(0, ageYears + modifierDelta);
}

function getPracticeSlotCount(state, classId) {
  return getSettlementPracticeSlotsByClass(state, classId).length;
}

function getCurrentBoardDefIds(state, classId) {
  return getSettlementPracticeSlotsByClass(state, classId)
    .map((slot) => slot?.card?.defId ?? null)
    .filter((defId) => typeof defId === "string" && defId.length > 0);
}

function createRecruitMember(card, state, orderDef, boardByClass) {
  const councilState = card?.systemState?.elderCouncil;
  if (!councilState) return null;
  const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
  const populationSummary = getSettlementPopulationSummary(state);
  const byClass = populationSummary?.byClass ?? {};
  const classIds = getSettlementClassIds(state);
  const sourceClassId = pickWeightedClassId(state, classIds, byClass);
  const modifierIds = Object.keys(orderDef?.prestigeModifiers ?? {}).sort((a, b) => a.localeCompare(b));
  const modifierId = chooseRandom(modifierIds, state);
  const nextMemberId = Number.isFinite(councilState.nextMemberId)
    ? Math.max(1, Math.floor(councilState.nextMemberId))
    : 1;
  councilState.nextMemberId = nextMemberId + 1;
  const ageYears =
    typeof state?.rngNextInt === "function" ? state.rngNextInt(45, 64) : 55;
  const agendaByClass = buildGeneratedAgendaByClass(
    state,
    orderDef,
    classIds,
    boardByClass,
    (classId) => getPracticeSlotCount(state, classId)
  );
  return {
    memberId: `elder-${nextMemberId}`,
    sourceClassId,
    joinedYear: currentYear,
    ageYears,
    modifierId,
    sourceVassalId: null,
    agendaByClass,
  };
}

function maybeRecruitElders(card, state, orderDef) {
  const recruitmentCadenceYears = Number.isFinite(orderDef?.recruitmentCadenceYears)
    ? Math.max(1, Math.floor(orderDef.recruitmentCadenceYears))
    : 5;
  const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
  if (currentYear % recruitmentCadenceYears !== 0) return false;
  const adultsPerElder = Number.isFinite(orderDef?.recruitmentAdultsPerElder)
    ? Math.max(1, Math.floor(orderDef.recruitmentAdultsPerElder))
    : 100;
  const populationSummary = getSettlementPopulationSummary(state);
  const totalAdults = Math.max(0, Math.floor(populationSummary?.adults ?? 0));
  let recruitCount = Math.floor(totalAdults / adultsPerElder);
  const remainder = totalAdults % adultsPerElder;
  if (
    remainder > 0 &&
    typeof state?.rngNextFloat === "function" &&
    state.rngNextFloat() < remainder / adultsPerElder
  ) {
    recruitCount += 1;
  }
  if (recruitCount <= 0) return false;

  const boardByClass = {};
  for (const classId of getSettlementClassIds(state)) {
    boardByClass[classId] = getCurrentBoardDefIds(state, classId);
  }
  const councilState = card?.systemState?.elderCouncil;
  if (!councilState) return false;
  for (let index = 0; index < recruitCount; index += 1) {
    const member = createRecruitMember(card, state, orderDef, boardByClass);
    if (member) {
      councilState.members.push(member);
    }
  }
  return recruitCount > 0;
}

function processAnnualCouncilUpdate(card, state, orderDef) {
  const councilState = ensureElderCouncilState(card, state);
  if (!councilState) return false;
  const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
  if (councilState.lastProcessedYear >= currentYear) return false;

  const survivors = [];
  for (const member of councilState.members) {
    if (typeof member?.sourceVassalId === "string" && member.sourceVassalId.length > 0) {
      survivors.push({
        ...member,
        agendaByClass: cloneSerializable(member?.agendaByClass ?? {}),
      });
      continue;
    }
    const nextMember = {
      ...member,
      ageYears: Math.max(0, Math.floor(member?.ageYears ?? 0)) + 1,
      agendaByClass: cloneSerializable(member?.agendaByClass ?? {}),
    };
    const mortalityChance = getMortalityChance(orderDef, nextMember.ageYears);
    if (
      mortalityChance > 0 &&
      typeof state?.rngNextFloat === "function" &&
      state.rngNextFloat() < mortalityChance
    ) {
      continue;
    }
    survivors.push(nextMember);
  }
  councilState.members = survivors;
  maybeRecruitElders(card, state, orderDef);
  councilState.lastProcessedYear = currentYear;
  return true;
}

function buildCurrentBoardPositionMap(state, classId) {
  const map = {};
  const currentBoard = getCurrentBoardDefIds(state, classId);
  for (let index = 0; index < currentBoard.length; index += 1) {
    map[currentBoard[index]] = index;
  }
  return map;
}

function getMemberCandidate(member, classId, placedDefIds) {
  const agenda = Array.isArray(member?.agendaByClass?.[classId]) ? member.agendaByClass[classId] : [];
  for (const defId of agenda) {
    if (placedDefIds.has(defId)) continue;
    if (!settlementPracticeDefs[defId]) continue;
    return defId;
  }
  return null;
}

function getWinningCandidateIds(state, tallies, currentBoardPositions, remainingSlots) {
  const entries = Array.from(tallies.values());
  if (entries.length <= 0) return [];
  let contenders = entries.filter(
    (entry) => entry.prestigeTotal === Math.max(...entries.map((item) => item.prestigeTotal))
  );

  const existingContenders = contenders
    .map((entry) => ({
      ...entry,
      existingPosition:
        Number.isFinite(currentBoardPositions?.[entry.defId])
          ? Math.floor(currentBoardPositions[entry.defId])
          : Infinity,
    }))
    .sort((a, b) => a.existingPosition - b.existingPosition);
  if (existingContenders[0]?.existingPosition !== Infinity) {
    const bestPosition = existingContenders[0].existingPosition;
    contenders = existingContenders.filter((entry) => entry.existingPosition === bestPosition);
  } else {
    const bestAgeTotal = Math.max(...contenders.map((entry) => entry.ageTotal));
    contenders = contenders.filter((entry) => entry.ageTotal === bestAgeTotal);
  }

  if (contenders.length <= 1) {
    return contenders.map((entry) => entry.defId);
  }
  if (remainingSlots <= 1) {
    const chosen = chooseRandom(
      contenders.map((entry) => entry.defId).sort((a, b) => a.localeCompare(b)),
      state
    );
    return chosen ? [chosen] : [];
  }
  return contenders
    .map((entry) => entry.defId)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, remainingSlots);
}

function resolvePracticeBoardForClass(state, orderDef, councilState, classId) {
  const maxSlots = getPracticeSlotCount(state, classId);
  const resolved = [];
  const placedDefIds = new Set();
  const currentBoardPositions = buildCurrentBoardPositionMap(state, classId);

  while (resolved.length < maxSlots) {
    const tallies = new Map();
    for (const member of Array.isArray(councilState?.members) ? councilState.members : []) {
      const candidateDefId = getMemberCandidate(member, classId, placedDefIds);
      if (!candidateDefId) continue;
      if (!tallies.has(candidateDefId)) {
        tallies.set(candidateDefId, {
          defId: candidateDefId,
          prestigeTotal: 0,
          ageTotal: 0,
        });
      }
      const tally = tallies.get(candidateDefId);
      tally.prestigeTotal += getMemberPrestige(orderDef, member);
      tally.ageTotal += Math.max(0, Math.floor(member?.ageYears ?? 0));
    }
    if (tallies.size <= 0) break;
    const winners = getWinningCandidateIds(
      state,
      tallies,
      currentBoardPositions,
      maxSlots - resolved.length
    );
    if (winners.length <= 0) break;
    for (const defId of winners) {
      if (placedDefIds.has(defId)) continue;
      placedDefIds.add(defId);
      resolved.push(defId);
      if (resolved.length >= maxSlots) break;
    }
  }

  return resolved;
}

function reconcilePracticeBoard(state, classId, resolvedDefIds) {
  const slots = getSettlementPracticeSlotsByClass(state, classId);
  const existingByDefId = new Map();
  for (const slot of slots) {
    const card = slot?.card ?? null;
    if (!card || typeof card.defId !== "string") continue;
    if (!existingByDefId.has(card.defId)) existingByDefId.set(card.defId, []);
    existingByDefId.get(card.defId).push(card);
  }

  let changed = false;
  for (let index = 0; index < slots.length; index += 1) {
    const defId = resolvedDefIds[index] ?? null;
    let nextCard = null;
    if (defId) {
      const existingCards = existingByDefId.get(defId);
      if (Array.isArray(existingCards) && existingCards.length > 0) {
        nextCard = existingCards.shift();
      } else {
        nextCard = createSettlementCardInstance(defId, "settlementPractice", state);
      }
    }
    if ((slots[index]?.card ?? null) !== nextCard) {
      slots[index].card = nextCard;
      changed = true;
    }
  }
  return changed;
}

function resolveBoardsByClass(state, card, orderDef) {
  const councilState = ensureElderCouncilState(card, state);
  const resolvedBoardsByClass = {};
  for (const classId of getSettlementClassIds(state)) {
    resolvedBoardsByClass[classId] = resolvePracticeBoardForClass(
      state,
      orderDef,
      councilState,
      classId
    );
  }
  return resolvedBoardsByClass;
}

function buildRuntimeMembers(orderDef, councilState) {
  const members = Array.isArray(councilState?.members) ? councilState.members : [];
  return members
    .map((member) => ({
      memberId: member.memberId,
      sourceClassId: member.sourceClassId,
      joinedYear: member.joinedYear,
      ageYears: member.ageYears,
      modifierId: member.modifierId,
      sourceVassalId: member.sourceVassalId ?? null,
      modifierLabel: getModifierDef(orderDef, member.modifierId)?.label ?? member.modifierId ?? "None",
      prestige: getMemberPrestige(orderDef, member),
      agendaByClass: cloneSerializable(member.agendaByClass ?? {}),
    }))
    .sort((a, b) => (b.prestige - a.prestige) || (b.ageYears - a.ageYears) || a.memberId.localeCompare(b.memberId));
}

function syncOrderRuntime(card, state, orderDef, resolvedBoardsByClass) {
  const councilState = ensureElderCouncilState(card, state);
  if (!card.props || typeof card.props !== "object" || Array.isArray(card.props)) {
    card.props = {};
  }
  card.props.settlement = {
    ...(card.props.settlement || {}),
    memberCount: Array.isArray(councilState?.members) ? councilState.members.length : 0,
    lastProcessedYear: Number.isFinite(councilState?.lastProcessedYear)
      ? Math.floor(councilState.lastProcessedYear)
      : null,
    nextRecruitmentYear: (() => {
      const cadence = Number.isFinite(orderDef?.recruitmentCadenceYears)
        ? Math.max(1, Math.floor(orderDef.recruitmentCadenceYears))
        : 5;
      const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
      return currentYear % cadence === 0 ? currentYear + cadence : currentYear + (cadence - (currentYear % cadence));
    })(),
    members: buildRuntimeMembers(orderDef, councilState),
    resolvedBoardsByClass: cloneSerializable(resolvedBoardsByClass),
    lastBoardSyncReason: "elderCouncil",
  };
}

export function stepSettlementOrders(state, tSec) {
  const card = getFirstOrderCard(state, "elderCouncil");
  if (!card) return false;
  const orderDef = getOrderDef(card);
  if (!orderDef) return false;

  let changed = false;
  ensureElderCouncilState(card, state);
  if (state?._seasonChanged === true) {
    changed = processAnnualCouncilUpdate(card, state, orderDef) || changed;
  }

  const resolvedBoardsByClass = resolveBoardsByClass(state, card, orderDef);
  for (const classId of getSettlementClassIds(state)) {
    changed = reconcilePracticeBoard(state, classId, resolvedBoardsByClass[classId] ?? []) || changed;
  }
  syncOrderRuntime(card, state, orderDef, resolvedBoardsByClass);
  return changed;
}

export function upsertElderCouncilMemberFromVassal(state, spec = {}) {
  const card = getFirstOrderCard(state, "elderCouncil");
  if (!card) return null;
  const councilState = ensureElderCouncilState(card, state);
  if (!councilState) return null;
  const vassalId =
    typeof spec?.sourceVassalId === "string" && spec.sourceVassalId.length > 0
      ? spec.sourceVassalId
      : null;
  if (!vassalId) return null;
  const memberId =
    typeof spec?.memberId === "string" && spec.memberId.length > 0 ? spec.memberId : `vassal-${vassalId}`;
  const existingIndex = councilState.members.findIndex((member) => member?.sourceVassalId === vassalId);
  const nextMember = {
    memberId,
    sourceClassId:
      typeof spec?.sourceClassId === "string" && spec.sourceClassId.length > 0 ? spec.sourceClassId : "villager",
    joinedYear: Number.isFinite(spec?.joinedYear) ? Math.max(1, Math.floor(spec.joinedYear)) : 1,
    ageYears: Number.isFinite(spec?.ageYears) ? Math.max(0, Math.floor(spec.ageYears)) : 0,
    modifierId:
      typeof spec?.modifierId === "string" && spec.modifierId.length > 0 ? spec.modifierId : null,
    sourceVassalId: vassalId,
    agendaByClass: normalizeAgendaByClass(spec?.agendaByClass, getSettlementClassIds(state)),
  };
  if (existingIndex >= 0) {
    councilState.members[existingIndex] = nextMember;
  } else {
    councilState.members.push(nextMember);
  }
  return nextMember;
}

export function removeElderCouncilMemberBySourceVassalId(state, sourceVassalId) {
  const card = getFirstOrderCard(state, "elderCouncil");
  if (!card || typeof sourceVassalId !== "string" || sourceVassalId.length <= 0) return false;
  const councilState = ensureElderCouncilState(card, state);
  if (!councilState) return false;
  const beforeCount = councilState.members.length;
  councilState.members = councilState.members.filter(
    (member) => member?.sourceVassalId !== sourceVassalId
  );
  return councilState.members.length !== beforeCount;
}
