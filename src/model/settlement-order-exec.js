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
  buildGeneratedElderAgendaByClass,
  cloneSerializable,
  getMortalityChance,
  normalizeAgendaByClass,
  pickWeightedClassId,
  uniquePracticeIds,
} from "./settlement-leadership.js";

function getCurrentSettlementYear(state) {
  return Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
}

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

function hasOrderRuntime(card) {
  const settlement = card?.props?.settlement;
  return settlement && typeof settlement === "object" && !Array.isArray(settlement);
}

function ensureElderCouncilState(card, state) {
  if (!card || typeof card !== "object") return null;
  if (!card.systemState || typeof card.systemState !== "object" || Array.isArray(card.systemState)) {
    card.systemState = {};
  }
  const classIds = getSettlementClassIds(state);
  const currentYear = getCurrentSettlementYear(state);
  const orderDef = getOrderDef(card);
  const existing =
    card.systemState.elderCouncil &&
    typeof card.systemState.elderCouncil === "object" &&
    !Array.isArray(card.systemState.elderCouncil)
      ? card.systemState.elderCouncil
      : {};
  const shouldSeedInitialCouncil = !Array.isArray(existing.members);
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
  const suppressedPracticeYearsByClassRaw =
    existing.suppressedPracticeYearsByClass &&
    typeof existing.suppressedPracticeYearsByClass === "object" &&
    !Array.isArray(existing.suppressedPracticeYearsByClass)
      ? existing.suppressedPracticeYearsByClass
      : {};
  const suppressedPracticeYearsByClass = {};
  for (const classId of classIds) {
    const rawByClass =
      suppressedPracticeYearsByClassRaw[classId] &&
      typeof suppressedPracticeYearsByClassRaw[classId] === "object" &&
      !Array.isArray(suppressedPracticeYearsByClassRaw[classId])
        ? suppressedPracticeYearsByClassRaw[classId]
        : {};
    const normalizedByClass = {};
    for (const [defId, year] of Object.entries(rawByClass)) {
      if (!settlementPracticeDefs[defId]) continue;
      if (!Number.isFinite(year)) continue;
      normalizedByClass[defId] = Math.max(1, Math.floor(year));
    }
    suppressedPracticeYearsByClass[classId] = normalizedByClass;
  }
  let nextMemberId = Number.isFinite(existing.nextMemberId)
    ? Math.max(1, Math.floor(existing.nextMemberId))
    : members.length + 1;
  card.systemState.elderCouncil = {
    lastProcessedYear: Number.isFinite(existing.lastProcessedYear)
      ? Math.max(1, Math.floor(existing.lastProcessedYear))
      : currentYear,
    nextMemberId,
    members,
    runtimeSyncDirty: existing.runtimeSyncDirty === true || !hasOrderRuntime(card),
    suppressedPracticeYearsByClass,
    practiceBoardMemoryByClass: normalizePracticeBoardMemoryByClass(
      existing.practiceBoardMemoryByClass,
      state,
      orderDef
    ),
  };

  if (shouldSeedInitialCouncil && members.length <= 0) {
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

function getStarterPracticeBoardForClass(orderDef, classId) {
  const starterBoard = orderDef?.starterPracticeBoardByClass?.[classId];
  if (Array.isArray(starterBoard) && starterBoard.length > 0) {
    return starterBoard.slice();
  }
  const template = Array.isArray(orderDef?.initialCouncilTemplate) ? orderDef.initialCouncilTemplate : [];
  for (const member of template) {
    const agenda = Array.isArray(member?.agendaByClass?.[classId]) ? member.agendaByClass[classId] : [];
    if (agenda.length > 0) return agenda.slice();
  }
  return [];
}

function normalizePracticeBoardMemoryByClass(rawPracticeBoardMemoryByClass, state, orderDef) {
  const classIds = getSettlementClassIds(state);
  const next = {};
  for (const classId of classIds) {
    const slotCount = getPracticeSlotCount(state, classId);
    const sourceBoard =
      Array.isArray(rawPracticeBoardMemoryByClass?.[classId])
        ? rawPracticeBoardMemoryByClass[classId]
        : getStarterPracticeBoardForClass(orderDef, classId);
    next[classId] = uniquePracticeIds(sourceBoard, classId, slotCount);
  }
  return next;
}

function getSuppressedPracticeIdsForClass(councilState, state, classId) {
  const currentYear = getCurrentSettlementYear(state);
  const byClass =
    councilState?.suppressedPracticeYearsByClass &&
    typeof councilState.suppressedPracticeYearsByClass === "object" &&
    !Array.isArray(councilState.suppressedPracticeYearsByClass)
      ? councilState.suppressedPracticeYearsByClass[classId]
      : null;
  const blocked = new Set();
  if (!byClass || typeof byClass !== "object" || Array.isArray(byClass)) return blocked;
  for (const [defId, year] of Object.entries(byClass)) {
    if (!settlementPracticeDefs[defId]) continue;
    if (Math.floor(year) !== currentYear) continue;
    blocked.add(defId);
  }
  return blocked;
}

function createRecruitMember(card, state, orderDef) {
  const councilState = card?.systemState?.elderCouncil;
  if (!councilState) return null;
  const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
  const populationSummary = getSettlementPopulationSummary(state);
  const byClass = populationSummary?.byClass ?? {};
  const classIds = getSettlementClassIds(state);
  const sourceClassId = pickWeightedClassId(state, classIds, byClass);
  const modifierIds = Object.keys(orderDef?.prestigeModifiers ?? {}).sort((a, b) => a.localeCompare(b));
  const modifierId =
    modifierIds.length > 0 && typeof state?.rngNextInt === "function"
      ? modifierIds[state.rngNextInt(0, modifierIds.length - 1)] ?? modifierIds[0]
      : modifierIds[0] ?? null;
  const nextMemberId = Number.isFinite(councilState.nextMemberId)
    ? Math.max(1, Math.floor(councilState.nextMemberId))
    : 1;
  councilState.nextMemberId = nextMemberId + 1;
  const ageYears =
    typeof state?.rngNextInt === "function" ? state.rngNextInt(45, 64) : 55;
  const agendaByClass = buildGeneratedElderAgendaByClass(state, classIds, () => {
    if (typeof state?.rngNextInt === "function") {
      return state.rngNextInt(1, 3);
    }
    return 1;
  }, {
    blockedPracticeIdsByClass: Object.fromEntries(
      classIds.map((classId) => [classId, getSuppressedPracticeIdsForClass(councilState, state, classId)])
    ),
  });
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

  const councilState = card?.systemState?.elderCouncil;
  if (!councilState) return false;
  for (let index = 0; index < recruitCount; index += 1) {
    const member = createRecruitMember(card, state, orderDef);
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

  const priorMemberCount = Array.isArray(councilState.members) ? councilState.members.length : 0;
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
  const recruited = maybeRecruitElders(card, state, orderDef);
  councilState.lastProcessedYear = currentYear;
  return (
    recruited ||
    (Array.isArray(councilState.members) ? councilState.members.length : 0) !== priorMemberCount
  );
}

function buildPracticePrestigeTotalsForClass(orderDef, councilState, classId) {
  const totals = {};
  for (const member of Array.isArray(councilState?.members) ? councilState.members : []) {
    const agenda = Array.isArray(member?.agendaByClass?.[classId]) ? member.agendaByClass[classId] : [];
    const memberPrestige = getMemberPrestige(orderDef, member);
    for (const defId of agenda) {
      if (!settlementPracticeDefs[defId]) continue;
      totals[defId] = Math.max(0, Math.floor(totals[defId] ?? 0)) + memberPrestige;
    }
  }
  return totals;
}

function sortSupportedPracticeIds(practiceIds, prestigeTotals, boardPositions) {
  return [...practiceIds].sort((a, b) => {
    const prestigeDelta = Math.max(0, Math.floor(prestigeTotals?.[b] ?? 0)) -
      Math.max(0, Math.floor(prestigeTotals?.[a] ?? 0));
    if (prestigeDelta !== 0) return prestigeDelta;
    const positionDelta =
      Math.max(0, Math.floor(boardPositions?.[a] ?? Number.MAX_SAFE_INTEGER)) -
      Math.max(0, Math.floor(boardPositions?.[b] ?? Number.MAX_SAFE_INTEGER));
    if (positionDelta !== 0) return positionDelta;
    return a.localeCompare(b);
  });
}

function resolvePracticeBoardForClass(state, orderDef, councilState, classId) {
  const maxSlots = getPracticeSlotCount(state, classId);
  const residentBoard = uniquePracticeIds(
    councilState?.practiceBoardMemoryByClass?.[classId],
    classId,
    maxSlots
  );
  const members = Array.isArray(councilState?.members) ? councilState.members : [];
  const prestigeTotals = buildPracticePrestigeTotalsForClass(orderDef, councilState, classId);
  if (members.length <= 0) {
    return {
      resolvedBoard: residentBoard,
      prestigeTotals,
    };
  }

  const boardPositions = Object.fromEntries(residentBoard.map((defId, index) => [defId, index]));
  const supportedResidentDefIds = residentBoard.filter(
    (defId) => Math.max(0, Math.floor(prestigeTotals?.[defId] ?? 0)) > 0
  );
  const unsupportedResidentDefIds = residentBoard.filter(
    (defId) => Math.max(0, Math.floor(prestigeTotals?.[defId] ?? 0)) <= 0
  );
  const incomingSupportedDefIds = Object.keys(prestigeTotals)
    .filter(
      (defId) => Math.max(0, Math.floor(prestigeTotals?.[defId] ?? 0)) > 0 && !residentBoard.includes(defId)
    )
    .sort((a, b) => a.localeCompare(b));

  const supportedDefIds = sortSupportedPracticeIds(
    [...supportedResidentDefIds, ...incomingSupportedDefIds],
    prestigeTotals,
    boardPositions
  );

  return {
    resolvedBoard: [...supportedDefIds, ...unsupportedResidentDefIds].slice(0, maxSlots),
    prestigeTotals,
  };
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
  const practicePrestigeTotalsByClass = {};
  for (const classId of getSettlementClassIds(state)) {
    const { resolvedBoard, prestigeTotals } = resolvePracticeBoardForClass(
      state,
      orderDef,
      councilState,
      classId
    );
    resolvedBoardsByClass[classId] = resolvedBoard;
    practicePrestigeTotalsByClass[classId] = prestigeTotals;
    if (
      councilState?.practiceBoardMemoryByClass &&
      typeof councilState.practiceBoardMemoryByClass === "object" &&
      !Array.isArray(councilState.practiceBoardMemoryByClass)
    ) {
      councilState.practiceBoardMemoryByClass[classId] = cloneSerializable(resolvedBoard);
    }
  }
  return {
    resolvedBoardsByClass,
    practicePrestigeTotalsByClass,
  };
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

function buildRecruitmentRuntime(orderDef, state) {
  const cadenceYears = Number.isFinite(orderDef?.recruitmentCadenceYears)
    ? Math.max(1, Math.floor(orderDef.recruitmentCadenceYears))
    : 5;
  const adultsPerElder = Number.isFinite(orderDef?.recruitmentAdultsPerElder)
    ? Math.max(1, Math.floor(orderDef.recruitmentAdultsPerElder))
    : 100;
  const populationSummary = getSettlementPopulationSummary(state);
  const adultPopulation = Math.max(0, Math.floor(populationSummary?.adults ?? 0));
  const guaranteedRecruits = Math.floor(adultPopulation / adultsPerElder);
  const remainderAdults = adultPopulation % adultsPerElder;
  const remainderRecruitChance = remainderAdults > 0 ? remainderAdults / adultsPerElder : 0;
  return {
    recruitmentCadenceYears: cadenceYears,
    recruitmentAdultsPerElder: adultsPerElder,
    recruitmentAdultPopulation: adultPopulation,
    projectedRecruitsGuaranteed: guaranteedRecruits,
    projectedRecruitsRemainderAdults: remainderAdults,
    projectedRecruitsRemainderChance: remainderRecruitChance,
    projectedRecruitsMin: guaranteedRecruits,
    projectedRecruitsMax: guaranteedRecruits + (remainderAdults > 0 ? 1 : 0),
    projectedRecruitsExpected: guaranteedRecruits + remainderRecruitChance,
  };
}

function syncOrderRuntime(
  card,
  state,
  orderDef,
  resolvedBoardsByClass,
  practicePrestigeTotalsByClass
) {
  const councilState = ensureElderCouncilState(card, state);
  const recruitmentRuntime = buildRecruitmentRuntime(orderDef, state);
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
    recruitmentCadenceYears: recruitmentRuntime.recruitmentCadenceYears,
    recruitmentAdultsPerElder: recruitmentRuntime.recruitmentAdultsPerElder,
    recruitmentAdultPopulation: recruitmentRuntime.recruitmentAdultPopulation,
    projectedRecruitsGuaranteed: recruitmentRuntime.projectedRecruitsGuaranteed,
    projectedRecruitsRemainderAdults: recruitmentRuntime.projectedRecruitsRemainderAdults,
    projectedRecruitsRemainderChance: recruitmentRuntime.projectedRecruitsRemainderChance,
    projectedRecruitsMin: recruitmentRuntime.projectedRecruitsMin,
    projectedRecruitsMax: recruitmentRuntime.projectedRecruitsMax,
    projectedRecruitsExpected: recruitmentRuntime.projectedRecruitsExpected,
    members: buildRuntimeMembers(orderDef, councilState),
    resolvedBoardsByClass: cloneSerializable(resolvedBoardsByClass),
    practiceBoardMemoryByClass: cloneSerializable(councilState?.practiceBoardMemoryByClass ?? {}),
    practicePrestigeTotalsByClass: cloneSerializable(practicePrestigeTotalsByClass ?? {}),
    lastBoardSyncReason: "elderCouncil",
  };
  if (councilState && typeof councilState === "object") {
    councilState.runtimeSyncDirty = false;
  }
}

export function removePracticeFromElderAgendas(
  state,
  practiceDefId,
  classId = null,
  options = {}
) {
  if (typeof practiceDefId !== "string" || practiceDefId.length <= 0) return false;
  const card = getFirstOrderCard(state, "elderCouncil");
  if (!card) return false;
  const councilState = ensureElderCouncilState(card, state);
  if (!councilState) return false;

  const classIds = classId ? [classId] : getSettlementClassIds(state);
  let changed = false;
  let suppressedChanged = false;
  if (options?.suppressForCurrentYear === true) {
    const currentYear = getCurrentSettlementYear(state);
    if (
      !councilState.suppressedPracticeYearsByClass ||
      typeof councilState.suppressedPracticeYearsByClass !== "object" ||
      Array.isArray(councilState.suppressedPracticeYearsByClass)
    ) {
      councilState.suppressedPracticeYearsByClass = {};
    }
    for (const targetClassId of classIds) {
      if (
        !councilState.suppressedPracticeYearsByClass[targetClassId] ||
        typeof councilState.suppressedPracticeYearsByClass[targetClassId] !== "object" ||
        Array.isArray(councilState.suppressedPracticeYearsByClass[targetClassId])
      ) {
        councilState.suppressedPracticeYearsByClass[targetClassId] = {};
      }
      if (councilState.suppressedPracticeYearsByClass[targetClassId][practiceDefId] === currentYear) {
        continue;
      }
      councilState.suppressedPracticeYearsByClass[targetClassId][practiceDefId] = currentYear;
      suppressedChanged = true;
    }
  }
  for (const member of Array.isArray(councilState.members) ? councilState.members : []) {
    if (!member || typeof member !== "object") continue;
    if (
      !member.agendaByClass ||
      typeof member.agendaByClass !== "object" ||
      Array.isArray(member.agendaByClass)
    ) {
      continue;
    }
    for (const targetClassId of classIds) {
      const agenda = Array.isArray(member.agendaByClass[targetClassId])
        ? member.agendaByClass[targetClassId]
        : [];
      const nextAgenda = agenda.filter((defId) => defId !== practiceDefId);
      if (nextAgenda.length === agenda.length) continue;
      member.agendaByClass[targetClassId] = nextAgenda;
      changed = true;
    }
  }

  if (!changed && !suppressedChanged) return false;
  const orderDef = getOrderDef(card);
  if ((changed || suppressedChanged) && orderDef) {
    const { resolvedBoardsByClass, practicePrestigeTotalsByClass } = resolveBoardsByClass(
      state,
      card,
      orderDef
    );
    for (const targetClassId of getSettlementClassIds(state)) {
      reconcilePracticeBoard(state, targetClassId, resolvedBoardsByClass[targetClassId] ?? []);
    }
    syncOrderRuntime(
      card,
      state,
      orderDef,
      resolvedBoardsByClass,
      practicePrestigeTotalsByClass
    );
  }
  return changed || suppressedChanged;
}

export function removePracticeFromPersistentPracticeBoards(state, practiceDefId, classId = null) {
  if (typeof practiceDefId !== "string" || practiceDefId.length <= 0) return false;
  const card = getFirstOrderCard(state, "elderCouncil");
  if (!card) return false;
  const councilState = ensureElderCouncilState(card, state);
  const orderDef = getOrderDef(card);
  if (!councilState || !orderDef) return false;

  const classIds = classId ? [classId] : getSettlementClassIds(state);
  let changed = false;
  for (const targetClassId of classIds) {
    const currentBoard = Array.isArray(councilState?.practiceBoardMemoryByClass?.[targetClassId])
      ? councilState.practiceBoardMemoryByClass[targetClassId]
      : [];
    const nextBoard = currentBoard.filter((defId) => defId !== practiceDefId);
    if (nextBoard.length === currentBoard.length) continue;
    councilState.practiceBoardMemoryByClass[targetClassId] = nextBoard;
    changed = true;
  }

  if (!changed) return false;
  const { resolvedBoardsByClass, practicePrestigeTotalsByClass } = resolveBoardsByClass(
    state,
    card,
    orderDef
  );
  for (const targetClassId of getSettlementClassIds(state)) {
    reconcilePracticeBoard(state, targetClassId, resolvedBoardsByClass[targetClassId] ?? []);
  }
  syncOrderRuntime(
    card,
    state,
    orderDef,
    resolvedBoardsByClass,
    practicePrestigeTotalsByClass
  );
  return true;
}

export function stepSettlementOrders(state, tSec) {
  const card = getFirstOrderCard(state, "elderCouncil");
  if (!card) return false;
  const orderDef = getOrderDef(card);
  if (!orderDef) return false;

  const councilState = ensureElderCouncilState(card, state);
  if (!councilState) return false;
  const needsRuntimeSync =
    councilState.runtimeSyncDirty === true || !hasOrderRuntime(card);
  if (state?._seasonChanged !== true && !needsRuntimeSync) {
    return false;
  }

  let changed = false;
  if (state?._seasonChanged === true) {
    changed = processAnnualCouncilUpdate(card, state, orderDef) || changed;
  }

  const { resolvedBoardsByClass, practicePrestigeTotalsByClass } = resolveBoardsByClass(
    state,
    card,
    orderDef
  );
  for (const classId of getSettlementClassIds(state)) {
    changed = reconcilePracticeBoard(state, classId, resolvedBoardsByClass[classId] ?? []) || changed;
  }
  syncOrderRuntime(
    card,
    state,
    orderDef,
    resolvedBoardsByClass,
    practicePrestigeTotalsByClass
  );
  return changed;
}

function areAgendaByClassEqual(left, right, classIds) {
  for (const classId of classIds) {
    const leftAgenda = Array.isArray(left?.[classId]) ? left[classId] : [];
    const rightAgenda = Array.isArray(right?.[classId]) ? right[classId] : [];
    if (leftAgenda.length !== rightAgenda.length) return false;
    for (let index = 0; index < leftAgenda.length; index += 1) {
      if (leftAgenda[index] !== rightAgenda[index]) return false;
    }
  }
  return true;
}

function areCouncilMembersEqual(left, right, classIds) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.memberId === right.memberId &&
    left.sourceClassId === right.sourceClassId &&
    left.joinedYear === right.joinedYear &&
    left.ageYears === right.ageYears &&
    left.modifierId === right.modifierId &&
    left.sourceVassalId === right.sourceVassalId &&
    areAgendaByClassEqual(left.agendaByClass, right.agendaByClass, classIds)
  );
}

function upsertElderCouncilMemberFromVassal(state, spec = {}) {
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

export function syncElderCouncilMembersFromVassals(state, specs = []) {
  const card = getFirstOrderCard(state, "elderCouncil");
  if (!card) return false;
  const councilState = ensureElderCouncilState(card, state);
  if (!councilState) return false;

  const classIds = getSettlementClassIds(state);
  const normalizedSpecs = [];
  const eligibleVassalIds = new Set();
  for (const spec of Array.isArray(specs) ? specs : []) {
    const vassalId =
      typeof spec?.sourceVassalId === "string" && spec.sourceVassalId.length > 0
        ? spec.sourceVassalId
        : null;
    if (!vassalId || eligibleVassalIds.has(vassalId)) continue;
    eligibleVassalIds.add(vassalId);
    normalizedSpecs.push(spec);
  }

  const beforeCount = Array.isArray(councilState.members) ? councilState.members.length : 0;
  councilState.members = (Array.isArray(councilState.members) ? councilState.members : []).filter(
    (member) => {
      const sourceVassalId =
        typeof member?.sourceVassalId === "string" && member.sourceVassalId.length > 0
          ? member.sourceVassalId
          : null;
      if (!sourceVassalId) return true;
      return eligibleVassalIds.has(sourceVassalId);
    }
  );

  let changed = councilState.members.length !== beforeCount;
  for (const spec of normalizedSpecs) {
    const vassalId = spec.sourceVassalId;
    const existingMember =
      councilState.members.find((member) => member?.sourceVassalId === vassalId) ?? null;
    const nextMember = upsertElderCouncilMemberFromVassal(state, spec);
    if (nextMember && !areCouncilMembersEqual(existingMember, nextMember, classIds)) {
      changed = true;
    }
  }
  if (changed) {
    councilState.runtimeSyncDirty = true;
  }
  return changed;
}
