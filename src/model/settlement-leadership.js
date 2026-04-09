import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";

export function cloneSerializable(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function normalizeAgendaByClass(rawAgendaByClass, classIds, { allowSet = false } = {}) {
  const next = {};
  for (const classId of Array.isArray(classIds) ? classIds : []) {
    const agenda = Array.isArray(rawAgendaByClass?.[classId]) ? rawAgendaByClass[classId] : [];
    const seen = allowSet ? new Set() : {};
    next[classId] = [];
    for (const defId of agenda) {
      if (typeof defId !== "string") continue;
      if (!settlementPracticeDefs[defId]) continue;
      if (allowSet) {
        if (seen.has(defId)) continue;
        seen.add(defId);
      } else if (seen[defId] === true) {
        continue;
      } else {
        seen[defId] = true;
      }
      next[classId].push(defId);
    }
  }
  return next;
}

export function getMortalityChance(orderDef, ageYears) {
  const bands = Array.isArray(orderDef?.mortalityByAge) ? orderDef.mortalityByAge : [];
  for (const band of bands) {
    const minAge = Number.isFinite(band?.minAgeYears) ? Math.floor(band.minAgeYears) : 0;
    const maxAge = Number.isFinite(band?.maxAgeYears) ? Math.floor(band.maxAgeYears) : Infinity;
    if (ageYears < minAge || ageYears > maxAge) continue;
    return Math.max(0, Math.min(1, Number(band?.yearlyChance ?? 0)));
  }
  return 0;
}

export function chooseRandom(list, state) {
  if (!Array.isArray(list) || list.length <= 0) return null;
  if (list.length === 1) return list[0];
  if (typeof state?.rngNextInt === "function") {
    return list[state.rngNextInt(0, list.length - 1)] ?? list[0];
  }
  return list[0];
}

export function pickWeightedClassId(state, classIds, adultSummaries) {
  const safeClassIds = Array.isArray(classIds) ? classIds : [];
  let totalAdults = 0;
  for (const classId of safeClassIds) {
    totalAdults += Math.max(0, Math.floor(adultSummaries?.[classId]?.adults ?? 0));
  }
  if (totalAdults <= 0) return safeClassIds[0] ?? "villager";
  let roll = typeof state?.rngNextFloat === "function" ? state.rngNextFloat() * totalAdults : 0;
  for (const classId of safeClassIds) {
    roll -= Math.max(0, Math.floor(adultSummaries?.[classId]?.adults ?? 0));
    if (roll < 0) return classId;
  }
  return safeClassIds[safeClassIds.length - 1] ?? "villager";
}

function getDevelopmentIdsByTier(classId, tier) {
  return Object.values(settlementPracticeDefs)
    .filter((def) => {
      if (!def || def.orderDevelopmentTier !== tier) return false;
      const eligible = Array.isArray(def.orderEligibleClassIds) ? def.orderEligibleClassIds : [];
      return eligible.includes(classId);
    })
    .map((def) => def.id)
    .sort((a, b) => a.localeCompare(b));
}

export function getMinorDevelopmentIds(classId) {
  return getDevelopmentIdsByTier(classId, "minor");
}

export function getMajorDevelopmentIds(classId) {
  return getDevelopmentIdsByTier(classId, "major");
}

export function getEligiblePracticeIds(classId) {
  return Object.values(settlementPracticeDefs)
    .filter((def) => {
      if (!def) return false;
      const eligible = Array.isArray(def.orderEligibleClassIds) ? def.orderEligibleClassIds : [];
      return eligible.includes(classId);
    })
    .map((def) => def.id)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeChance(value) {
  if (!Number.isFinite(value)) return 0;
  const raw = Number(value);
  if (raw <= 0) return 0;
  if (raw <= 1) {
    return Math.max(0, Math.min(1, raw));
  }
  return Math.max(0, Math.min(1, raw / 100));
}

function drawUniquePracticeIdsFromPool(pool, count, state) {
  const remaining = Array.isArray(pool) ? [...pool] : [];
  const picks = [];
  const targetCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  while (remaining.length > 0 && picks.length < targetCount) {
    const pickedDefId = chooseRandom(remaining, state);
    if (!pickedDefId) break;
    picks.push(pickedDefId);
    const pickedIndex = remaining.indexOf(pickedDefId);
    if (pickedIndex >= 0) {
      remaining.splice(pickedIndex, 1);
    }
  }
  return picks;
}

function movePracticeToFront(agenda, defId) {
  const index = Array.isArray(agenda) ? agenda.indexOf(defId) : -1;
  if (index <= 0) return Array.isArray(agenda) ? agenda : [];
  const [moved] = agenda.splice(index, 1);
  agenda.unshift(moved);
  return agenda;
}

export function ensureMajorDevelopmentInAgenda(seedAgenda, classId, state, limit) {
  const agenda = uniquePracticeIds(seedAgenda, classId, limit);
  const existingMajorDevelopmentId =
    agenda.find((defId) => settlementPracticeDefs?.[defId]?.orderDevelopmentTier === "major") ?? null;
  if (existingMajorDevelopmentId) {
    return uniquePracticeIds(movePracticeToFront(agenda, existingMajorDevelopmentId), classId, limit);
  }
  const majorDevelopmentIds = getMajorDevelopmentIds(classId).filter((defId) => !agenda.includes(defId));
  if (majorDevelopmentIds.length <= 0) return agenda;
  const majorDevelopmentId = chooseRandom(majorDevelopmentIds, state);
  if (!majorDevelopmentId) return agenda;
  if (!Number.isFinite(limit) || limit <= 0 || agenda.length < limit) {
    agenda.unshift(majorDevelopmentId);
  } else {
    const replaceIndex = agenda.findLastIndex(
      (defId) => settlementPracticeDefs?.[defId]?.orderDevelopmentTier !== "minor"
    );
    if (replaceIndex >= 0) {
      agenda[replaceIndex] = majorDevelopmentId;
    } else {
      agenda[agenda.length - 1] = majorDevelopmentId;
    }
    movePracticeToFront(agenda, majorDevelopmentId);
  }
  return uniquePracticeIds(agenda, classId, limit);
}

export function uniquePracticeIds(rawList, classId, limit) {
  const seen = new Set();
  const result = [];
  const eligibleClassId = typeof classId === "string" ? classId : null;
  for (const defId of Array.isArray(rawList) ? rawList : []) {
    if (typeof defId !== "string" || seen.has(defId)) continue;
    const def = settlementPracticeDefs[defId];
    if (!def) continue;
    const eligible = Array.isArray(def.orderEligibleClassIds) ? def.orderEligibleClassIds : [];
    if (eligibleClassId && eligible.length > 0 && !eligible.includes(eligibleClassId)) continue;
    seen.add(defId);
    result.push(defId);
    if (Number.isFinite(limit) && result.length >= limit) break;
  }
  return result;
}

export function getFallbackAgendaForClass(orderDef, classId) {
  const template = Array.isArray(orderDef?.initialCouncilTemplate) ? orderDef.initialCouncilTemplate : [];
  for (const member of template) {
    const agenda = Array.isArray(member?.agendaByClass?.[classId]) ? member.agendaByClass[classId] : [];
    if (agenda.length > 0) return agenda.slice();
  }
  return [];
}

export function mutateAgendaForClass(
  seedAgenda,
  classId,
  orderDef,
  state,
  limit,
  {
    fillToLimit = false,
    requireMinorDevelopment = false,
    majorDevelopmentChance = 0,
  } = {}
) {
  const agenda = uniquePracticeIds(seedAgenda, classId, limit);
  const reorderChance = Number(orderDef?.agendaMutation?.reorderChance ?? 0);
  const developmentChance = Number(orderDef?.agendaMutation?.developmentChance ?? 0);

  if (
    agenda.length > 1 &&
    typeof state?.rngNextFloat === "function" &&
    state.rngNextFloat() < reorderChance
  ) {
    const fromIndex = state.rngNextInt(0, agenda.length - 1);
    let toIndex = state.rngNextInt(0, agenda.length - 1);
    if (agenda.length > 1) {
      while (toIndex === fromIndex) {
        toIndex = state.rngNextInt(0, agenda.length - 1);
      }
    }
    const [moved] = agenda.splice(fromIndex, 1);
    agenda.splice(toIndex, 0, moved);
  }

  const minorDevelopmentIds = getMinorDevelopmentIds(classId).filter((defId) => !agenda.includes(defId));
  if (
    minorDevelopmentIds.length > 0 &&
    typeof state?.rngNextFloat === "function" &&
    state.rngNextFloat() < developmentChance
  ) {
    const replacementDefId = chooseRandom(minorDevelopmentIds, state);
    if (replacementDefId) {
      if (agenda.length <= 0) {
        agenda.push(replacementDefId);
      } else {
        const replaceIndex = state.rngNextInt(0, agenda.length - 1);
        agenda[replaceIndex] = replacementDefId;
      }
    }
  }

  if (fillToLimit === true && Number.isFinite(limit) && limit > 0) {
    const fillerIds = getEligiblePracticeIds(classId).filter((defId) => !agenda.includes(defId));
    for (const defId of fillerIds) {
      agenda.push(defId);
      if (agenda.length >= limit) break;
    }
  }

  if (requireMinorDevelopment === true) {
    const guaranteedMinorDevelopmentId = getMinorDevelopmentIds(classId)[0] ?? null;
    if (guaranteedMinorDevelopmentId && !agenda.includes(guaranteedMinorDevelopmentId)) {
      if (Number.isFinite(limit) && limit > 0 && agenda.length >= limit) {
        if (agenda.length > 0) {
          agenda[agenda.length - 1] = guaranteedMinorDevelopmentId;
        }
      } else {
        agenda.push(guaranteedMinorDevelopmentId);
      }
    }
  }

  const normalizedMajorDevelopmentChance = Math.max(0, Math.min(1, Number(majorDevelopmentChance) || 0));
  const majorDevelopmentIds = getMajorDevelopmentIds(classId).filter((defId) => !agenda.includes(defId));
  if (
    majorDevelopmentIds.length > 0 &&
    normalizedMajorDevelopmentChance > 0 &&
    typeof state?.rngNextFloat === "function" &&
    state.rngNextFloat() < normalizedMajorDevelopmentChance
  ) {
    return ensureMajorDevelopmentInAgenda(agenda, classId, state, limit);
  }

  return uniquePracticeIds(agenda, classId, limit);
}

export function buildGeneratedAgendaByClass(
  state,
  orderDef,
  classIds,
  boardByClass,
  getPracticeSlotCount,
  options = {}
) {
  const agendaByClass = {};
  for (const classId of classIds) {
    const limit = Number.isFinite(getPracticeSlotCount?.(classId))
      ? Math.max(0, Math.floor(getPracticeSlotCount(classId)))
      : 0;
    const seedAgenda =
      Array.isArray(boardByClass?.[classId]) && boardByClass[classId].length > 0
        ? boardByClass[classId]
        : getFallbackAgendaForClass(orderDef, classId);
    agendaByClass[classId] = mutateAgendaForClass(
      seedAgenda,
      classId,
      orderDef,
      state,
      limit,
      options
    );
  }
  return agendaByClass;
}

export function buildGeneratedElderAgendaByClass(
  state,
  classIds,
  getAgendaSizeForClass,
  { blockedPracticeIdsByClass = {} } = {}
) {
  const agendaByClass = {};
  for (const classId of Array.isArray(classIds) ? classIds : []) {
    const blockedPracticeIds = blockedPracticeIdsByClass?.[classId];
    const minorPool = getMinorDevelopmentIds(classId).filter(
      (defId) => !blockedPracticeIds?.has?.(defId)
    );
    const agendaSize = Number.isFinite(getAgendaSizeForClass?.(classId))
      ? Math.max(0, Math.floor(getAgendaSizeForClass(classId)))
      : 0;
    agendaByClass[classId] = drawUniquePracticeIdsFromPool(minorPool, agendaSize, state);
  }
  return agendaByClass;
}

export function buildGeneratedVassalAgendaByClass(
  state,
  classIds,
  { agendaSize = 3, majorDevelopmentChance = 0 } = {}
) {
  const normalizedAgendaSize = Number.isFinite(agendaSize) ? Math.max(0, Math.floor(agendaSize)) : 0;
  const normalizedMajorChance = normalizeChance(majorDevelopmentChance);
  const agendaByClass = {};

  for (const classId of Array.isArray(classIds) ? classIds : []) {
    const agenda = [];
    const shouldIncludeMajor =
      normalizedAgendaSize > 0 &&
      normalizedMajorChance > 0 &&
      typeof state?.rngNextFloat === "function" &&
      state.rngNextFloat() < normalizedMajorChance;
    if (shouldIncludeMajor) {
      const majorDefId = chooseRandom(getMajorDevelopmentIds(classId), state);
      if (majorDefId) {
        agenda.push(majorDefId);
      }
    }

    const nonMajorEligiblePool = getEligiblePracticeIds(classId).filter(
      (defId) =>
        !agenda.includes(defId) &&
        settlementPracticeDefs?.[defId]?.orderDevelopmentTier !== "major"
    );
    const remainingSlots = Math.max(0, normalizedAgendaSize - agenda.length);
    agenda.push(...drawUniquePracticeIdsFromPool(nonMajorEligiblePool, remainingSlots, state));
    agendaByClass[classId] = agenda;
  }

  return agendaByClass;
}
