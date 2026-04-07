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

export function getMinorDevelopmentIds(classId) {
  return Object.values(settlementPracticeDefs)
    .filter((def) => {
      if (!def || def.orderDevelopmentTier !== "minor") return false;
      const eligible = Array.isArray(def.orderEligibleClassIds) ? def.orderEligibleClassIds : [];
      return eligible.includes(classId);
    })
    .map((def) => def.id)
    .sort((a, b) => a.localeCompare(b));
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
