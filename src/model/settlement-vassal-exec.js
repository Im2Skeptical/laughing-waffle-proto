import { settlementOrderDefs } from "../defs/gamepieces/settlement-order-defs.js";
import {
  SETTLEMENT_VASSAL_CANDIDATE_COUNT,
  SETTLEMENT_VASSAL_ELDER_AGE_YEARS,
  SETTLEMENT_VASSAL_MAJOR_DEVELOPMENT_CHANCE,
  SETTLEMENT_VASSAL_PROFESSION_AGE_RANGE,
  SETTLEMENT_VASSAL_STARTING_AGE_MAX,
  SETTLEMENT_VASSAL_STARTING_AGE_MIN,
  SETTLEMENT_VASSAL_TRAIT_AGE_RANGE,
  SETTLEMENT_VASSAL_VILLAGER_AGE_YEARS,
  settlementVassalProfessionDefs,
  settlementVassalProfessionIds,
  settlementVassalTraitDefs,
  settlementVassalTraitIds,
} from "../defs/gamepieces/settlement-vassal-defs.js";
import {
  buildGeneratedVassalAgendaByClass,
  chooseRandom,
  getMortalityChance,
  pickWeightedClassId,
} from "./settlement-leadership.js";
import {
  getHubCore,
  getSettlementClassIds,
  getSettlementOrderSlots,
  getSettlementPopulationSummary,
  getSettlementVassalLineageState,
  getSettlementYearDurationSec,
  getSettlementYearStartSec,
} from "./settlement-state.js";
import {
  removeElderCouncilMemberBySourceVassalId,
  upsertElderCouncilMemberFromVassal,
} from "./settlement-order-exec.js";

function getVassalLineageMutable(state) {
  const core = getHubCore(state);
  if (!core?.systemState?.vassalLineage || typeof core.systemState.vassalLineage !== "object") {
    return null;
  }
  return core.systemState.vassalLineage;
}

function getCurrentYear(state) {
  return Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
}

function getSafeTSec(state, tSec = null) {
  if (Number.isFinite(tSec)) return Math.max(0, Math.floor(tSec));
  return Math.max(0, Math.floor(state?.tSec ?? 0));
}

function getYearAtSecond(state, tSec = null) {
  const safeTSec = getSafeTSec(state, tSec);
  const yearDurationSec = Math.max(1, getSettlementYearDurationSec(state));
  return 1 + Math.floor(safeTSec / yearDurationSec);
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

function getOrderDef(state) {
  const card = getFirstOrderCard(state, "elderCouncil");
  return settlementOrderDefs?.[card?.defId] ?? settlementOrderDefs?.elderCouncil ?? null;
}

function nextLineagePoolId(lineage) {
  const nextPoolId = Number.isFinite(lineage?.nextPoolId) ? Math.max(1, Math.floor(lineage.nextPoolId)) : 1;
  lineage.nextPoolId = nextPoolId + 1;
  return `vassal-pool-${nextPoolId}`;
}

function nextLineageVassalId(lineage) {
  const nextVassalId = Number.isFinite(lineage?.nextVassalId)
    ? Math.max(1, Math.floor(lineage.nextVassalId))
    : 1;
  lineage.nextVassalId = nextVassalId + 1;
  return `vassal-${nextVassalId}`;
}

function randomAgeInRange(range, state) {
  const min = Number.isFinite(range?.min) ? Math.max(0, Math.floor(range.min)) : 0;
  const max = Number.isFinite(range?.max) ? Math.max(min, Math.floor(range.max)) : min;
  return typeof state?.rngNextInt === "function" ? state.rngNextInt(min, max) : min;
}

function buildLifeEvent(eventId, kind, tSec, ageYears, extra = {}) {
  return {
    eventId,
    kind,
    tSec: Math.max(0, Math.floor(tSec ?? 0)),
    ageYears: Math.max(0, Math.floor(ageYears ?? 0)),
    classId: typeof extra.classId === "string" && extra.classId.length > 0 ? extra.classId : null,
    professionId:
      typeof extra.professionId === "string" && extra.professionId.length > 0 ? extra.professionId : null,
    traitId: typeof extra.traitId === "string" && extra.traitId.length > 0 ? extra.traitId : null,
    causeOfDeath:
      typeof extra.causeOfDeath === "string" && extra.causeOfDeath.length > 0
        ? extra.causeOfDeath
        : null,
    text: typeof extra.text === "string" ? extra.text : "",
  };
}

function buildCandidateLifeSchedule(state, record, orderDef) {
  const currentYear = Math.max(1, Math.floor(record.birthYear ?? getCurrentYear(state)));
  const classChangeAge =
    record.sourceClassId === "stranger" ? SETTLEMENT_VASSAL_VILLAGER_AGE_YEARS : null;
  const firstMortalityAgeYears = SETTLEMENT_VASSAL_ELDER_AGE_YEARS + 1;
  const professionAgeYears = randomAgeInRange(SETTLEMENT_VASSAL_PROFESSION_AGE_RANGE, state);
  const traitAgeYears = randomAgeInRange(SETTLEMENT_VASSAL_TRAIT_AGE_RANGE, state);
  const professionId = chooseRandom(settlementVassalProfessionIds, state);
  const traitId = chooseRandom(settlementVassalTraitIds, state);

  const events = [
    buildLifeEvent(`${record.vassalId}:birth`, "birth", record.birthSec, record.initialAgeYears, {
      classId: record.sourceClassId,
      text: "Born into the lineage",
    }),
  ];

  let deathAgeYears = null;
  let deathYear = null;
  for (let ageYears = record.initialAgeYears + 1; ageYears <= 200; ageYears += 1) {
    const eventYear = currentYear + (ageYears - record.initialAgeYears);
    const eventSec = getSettlementYearStartSec(state, eventYear);

    if (classChangeAge != null && ageYears === classChangeAge) {
      events.push(
        buildLifeEvent(`${record.vassalId}:class:${ageYears}`, "classChanged", eventSec, ageYears, {
          classId: "villager",
          text: "Became a villager",
        })
      );
    }
    if (ageYears === professionAgeYears) {
      events.push(
        buildLifeEvent(
          `${record.vassalId}:profession:${ageYears}`,
          "professionAssigned",
          eventSec,
          ageYears,
          {
            professionId,
            text: `Changed profession: ${settlementVassalProfessionDefs?.[professionId]?.label ?? professionId ?? "Profession"}`,
          }
        )
      );
    }
    if (ageYears === traitAgeYears) {
      events.push(
        buildLifeEvent(`${record.vassalId}:trait:${ageYears}`, "traitAssigned", eventSec, ageYears, {
          traitId,
          text: `Gained trait: ${settlementVassalTraitDefs?.[traitId]?.label ?? traitId ?? "Trait"}`,
        })
      );
    }
    if (ageYears === SETTLEMENT_VASSAL_ELDER_AGE_YEARS) {
      events.push(
        buildLifeEvent(`${record.vassalId}:elder:${ageYears}`, "becameElder", eventSec, ageYears, {
          text: "Became elder",
        })
      );
    }
    if (ageYears < firstMortalityAgeYears) {
      continue;
    }

    const mortalityChance = getMortalityChance(orderDef, ageYears);
    const diedThisYear =
      mortalityChance > 0 &&
      typeof state?.rngNextFloat === "function" &&
      state.rngNextFloat() < mortalityChance;
    if (diedThisYear) {
      deathAgeYears = ageYears;
      deathYear = eventYear;
      events.push(
        buildLifeEvent(`${record.vassalId}:death:${ageYears}`, "died", eventSec, ageYears, {
          causeOfDeath: "oldAge",
          text: "Died of old age",
        })
      );
      break;
    }
  }
  if (deathAgeYears == null || deathYear == null) {
    deathAgeYears = 200;
    deathYear = currentYear + (deathAgeYears - record.initialAgeYears);
    events.push(
      buildLifeEvent(
        `${record.vassalId}:death:${deathAgeYears}`,
        "died",
        getSettlementYearStartSec(state, deathYear),
        deathAgeYears,
        {
          causeOfDeath: "oldAge",
          text: "Died of old age",
        }
      )
    );
  }

  record.professionAgeYears = professionAgeYears;
  record.traitAgeYears = traitAgeYears;
  record.professionId = null;
  record.traitId = null;
  record.elderAgeYears = SETTLEMENT_VASSAL_ELDER_AGE_YEARS;
  record.villagerAgeYears = classChangeAge;
  record.deathAgeYears = deathAgeYears;
  record.deathYear = deathYear;
  record.deathSec = getSettlementYearStartSec(state, deathYear);
  record.deathCause = "oldAge";
  record.lifeEvents = events;
  return record;
}

function createCandidateRecord(state, lineage, poolId, orderDef) {
  const classIds = getSettlementClassIds(state);
  const populationSummary = getSettlementPopulationSummary(state);
  const currentYear = getCurrentYear(state);
  const vassalId = nextLineageVassalId(lineage);
  const sourceClassId = pickWeightedClassId(state, classIds, populationSummary?.byClass ?? {});
  const initialAgeYears =
    typeof state?.rngNextInt === "function"
      ? state.rngNextInt(SETTLEMENT_VASSAL_STARTING_AGE_MIN, SETTLEMENT_VASSAL_STARTING_AGE_MAX)
      : SETTLEMENT_VASSAL_STARTING_AGE_MIN;
  const agendaByClass = buildGeneratedVassalAgendaByClass(
    state,
    classIds,
    {
      agendaSize: 3,
      majorDevelopmentChance: SETTLEMENT_VASSAL_MAJOR_DEVELOPMENT_CHANCE,
    }
  );
  const record = {
    vassalId,
    poolId,
    sourceClassId,
    currentClassId: sourceClassId,
    birthSec: getSafeTSec(state),
    birthYear: currentYear,
    selectedSec: getSafeTSec(state),
    deathSec: getSafeTSec(state),
    deathYear: currentYear,
    initialAgeYears,
    deathAgeYears: initialAgeYears,
    villagerAgeYears: null,
    professionAgeYears: null,
    traitAgeYears: null,
    elderAgeYears: SETTLEMENT_VASSAL_ELDER_AGE_YEARS,
    agendaByClass,
    professionId: null,
    traitId: null,
    deathCause: null,
    councilMemberId: null,
    joinedCouncilSec: null,
    removedFromCouncilSec: null,
    isDead: false,
    isElder: false,
    lifeEvents: [],
  };
  buildCandidateLifeSchedule(state, record, orderDef);
  return record;
}

export function ensureSettlementVassalSelectionPool(state, tSec = null) {
  const lineage = getVassalLineageMutable(state);
  if (!lineage) return null;
  if (lineage.pendingSelection?.candidates?.length === SETTLEMENT_VASSAL_CANDIDATE_COUNT) {
    return lineage.pendingSelection;
  }
  const orderDef = getOrderDef(state);
  const poolId = nextLineagePoolId(lineage);
  const createdSec = getSafeTSec(state, tSec);
  const previousTSec = state?.tSec;
  if (Number.isFinite(createdSec)) {
    state.tSec = createdSec;
  }
  const candidates = [];
  for (let index = 0; index < SETTLEMENT_VASSAL_CANDIDATE_COUNT; index += 1) {
    const record = createCandidateRecord(state, lineage, poolId, orderDef);
    candidates.push(record);
    lineage.vassalsById[record.vassalId] = record;
  }
  if (Number.isFinite(previousTSec)) {
    state.tSec = previousTSec;
  }
  lineage.pendingSelection = {
    poolId,
    createdSec,
    candidates,
  };
  return lineage.pendingSelection;
}

export function selectSettlementVassalCandidate(state, vassalId, tSec = null) {
  const lineage = getVassalLineageMutable(state);
  if (!lineage) return { ok: false, reason: "noLineage" };
  const pendingSelection = lineage.pendingSelection;
  if (!pendingSelection) return { ok: false, reason: "noPendingSelection" };
  const candidate = Array.isArray(pendingSelection.candidates)
    ? pendingSelection.candidates.find((entry) => entry?.vassalId === vassalId) ?? null
    : null;
  if (!candidate) return { ok: false, reason: "missingCandidate" };

  const safeTSec = getSafeTSec(state, tSec);
  candidate.selectedSec = safeTSec;
  candidate.birthSec = safeTSec;
  candidate.birthYear = getCurrentYear(state);
  const yearOffset = Math.max(0, candidate.deathAgeYears - candidate.initialAgeYears);
  candidate.deathYear = candidate.birthYear + yearOffset;
  candidate.deathSec = getSettlementYearStartSec(state, candidate.deathYear);
  candidate.currentClassId = candidate.sourceClassId;
  candidate.professionId = null;
  candidate.traitId = null;
  candidate.councilMemberId = null;
  candidate.joinedCouncilSec = null;
  candidate.removedFromCouncilSec = null;
  candidate.isDead = false;
  candidate.isElder = false;
  candidate.lifeEvents = Array.isArray(candidate.lifeEvents)
    ? candidate.lifeEvents.map((entry) => {
        if (!entry) return entry;
        const yearDelta = Math.max(0, Math.floor(entry.ageYears ?? candidate.initialAgeYears) - candidate.initialAgeYears);
        return {
          ...entry,
          tSec:
            entry.kind === "birth"
              ? safeTSec
              : getSettlementYearStartSec(state, candidate.birthYear + yearDelta),
        };
      })
    : [];

  lineage.currentVassalId = candidate.vassalId;
  if (!lineage.selectedVassalIds.includes(candidate.vassalId)) {
    lineage.selectedVassalIds.push(candidate.vassalId);
  }
  lineage.pendingSelection = null;
  return { ok: true, vassalId: candidate.vassalId };
}

export function beginNextSettlementVassalSelection(state, tSec = null) {
  const lineage = getVassalLineageMutable(state);
  if (!lineage) return { ok: false, reason: "noLineage" };
  if (lineage.pendingSelection) return { ok: false, reason: "selectionAlreadyOpen" };
  const currentVassal = getCurrentSettlementVassal(state);
  if (currentVassal && currentVassal.isDead !== true) {
    return { ok: false, reason: "currentVassalAlive" };
  }
  const pool = ensureSettlementVassalSelectionPool(state, tSec);
  return pool ? { ok: true, poolId: pool.poolId } : { ok: false, reason: "poolFailed" };
}

export function removePracticeFromVassalAgendas(state, practiceDefId, classId = null) {
  if (typeof practiceDefId !== "string" || practiceDefId.length <= 0) return false;
  const lineage = getVassalLineageMutable(state);
  if (!lineage?.vassalsById || typeof lineage.vassalsById !== "object") return false;

  const classIds = classId ? [classId] : getSettlementClassIds(state);
  const processedVassalIds = new Set();
  let changed = false;

  for (const record of Object.values(lineage.vassalsById)) {
    const vassalId =
      typeof record?.vassalId === "string" && record.vassalId.length > 0 ? record.vassalId : null;
    if (!vassalId || processedVassalIds.has(vassalId)) continue;
    processedVassalIds.add(vassalId);
    if (!record?.agendaByClass || typeof record.agendaByClass !== "object") continue;
    for (const targetClassId of classIds) {
      const agenda = Array.isArray(record.agendaByClass[targetClassId])
        ? record.agendaByClass[targetClassId]
        : [];
      const nextAgenda = agenda.filter((defId) => defId !== practiceDefId);
      if (nextAgenda.length === agenda.length) continue;
      record.agendaByClass[targetClassId] = nextAgenda;
      changed = true;
    }
  }

  return changed;
}

export function getCurrentSettlementVassal(state) {
  const lineage = getSettlementVassalLineageState(state);
  const currentVassalId =
    typeof lineage?.currentVassalId === "string" && lineage.currentVassalId.length > 0
      ? lineage.currentVassalId
      : null;
  if (!currentVassalId) return null;
  return lineage?.vassalsById?.[currentVassalId] ?? null;
}

function applyVassalLifeEvent(state, vassal, event) {
  if (!vassal || !event) return false;
  switch (event.kind) {
    case "classChanged":
      if (event.classId && vassal.currentClassId !== event.classId) {
        vassal.currentClassId = event.classId;
        return true;
      }
      return false;
    case "professionAssigned":
      if (!vassal.professionId && typeof event?.professionId === "string" && event.professionId.length > 0) {
        vassal.professionId = event.professionId;
        return true;
      }
      return false;
    case "traitAssigned":
      if (!vassal.traitId && typeof event?.traitId === "string" && event.traitId.length > 0) {
        vassal.traitId = event.traitId;
        return true;
      }
      return false;
    case "becameElder":
      if (vassal.isElder === true) return false;
      vassal.isElder = true;
      vassal.joinedCouncilSec = Math.max(0, Math.floor(event.tSec ?? 0));
      vassal.councilMemberId = `vassal-${vassal.vassalId}`;
      upsertElderCouncilMemberFromVassal(state, {
        sourceVassalId: vassal.vassalId,
        memberId: vassal.councilMemberId,
        sourceClassId: vassal.currentClassId,
        joinedYear: getYearAtSecond(state, event.tSec),
        ageYears: Math.max(0, Math.floor(event.ageYears ?? vassal.initialAgeYears)),
        modifierId:
          typeof vassal.traitId === "string" && vassal.traitId.length > 0 ? vassal.traitId : null,
        agendaByClass: vassal.agendaByClass,
      });
      return true;
    case "died":
      if (vassal.isDead === true) return false;
      vassal.isDead = true;
      vassal.deathCause =
        typeof event?.causeOfDeath === "string" && event.causeOfDeath.length > 0
          ? event.causeOfDeath
          : vassal.deathCause ?? null;
      vassal.removedFromCouncilSec = Math.max(0, Math.floor(event.tSec ?? 0));
      if (typeof vassal.vassalId === "string" && vassal.vassalId.length > 0) {
        removeElderCouncilMemberBySourceVassalId(state, vassal.vassalId);
      }
      return true;
    default:
      return false;
  }
}

function syncCouncilMirrorForAliveVassal(state, vassal, tSec) {
  if (!vassal || vassal.isElder !== true || vassal.isDead === true) return false;
  const ageYears = getSettlementVassalAgeYearsAtSecond(state, vassal, tSec);
  const joinedCouncilSec = Number.isFinite(vassal?.joinedCouncilSec)
    ? Math.max(0, Math.floor(vassal.joinedCouncilSec))
    : tSec;
  upsertElderCouncilMemberFromVassal(state, {
    sourceVassalId: vassal.vassalId,
    memberId: vassal.councilMemberId ?? `vassal-${vassal.vassalId}`,
    sourceClassId: vassal.currentClassId,
    joinedYear: getYearAtSecond(state, joinedCouncilSec),
    ageYears,
    modifierId:
      typeof vassal.traitId === "string" && vassal.traitId.length > 0
        ? vassal.traitId
        : null,
    agendaByClass: vassal.agendaByClass,
  });
  return true;
}

export function getSettlementVassalAgeYearsAtSecond(state, vassal, tSec = null) {
  const safeTSec = getSafeTSec(state, tSec);
  const selectedSec = Number.isFinite(vassal?.selectedSec) ? Math.max(0, Math.floor(vassal.selectedSec)) : safeTSec;
  const birthYear = Number.isFinite(vassal?.birthYear) ? Math.max(1, Math.floor(vassal.birthYear)) : getCurrentYear(state);
  const initialAgeYears = Number.isFinite(vassal?.initialAgeYears) ? Math.max(0, Math.floor(vassal.initialAgeYears)) : 0;
  if (safeTSec <= selectedSec) return initialAgeYears;
  const yearDurationSec = Math.max(1, getSettlementYearDurationSec(state));
  const currentYear = Math.max(birthYear, 1 + Math.floor(safeTSec / yearDurationSec));
  return initialAgeYears + Math.max(0, currentYear - birthYear);
}

export function stepSettlementVassals(state, tSec) {
  const lineage = getVassalLineageMutable(state);
  if (!lineage) return false;
  const currentVassal = getCurrentSettlementVassal(state);
  if (!currentVassal) return false;
  let changed = false;
  const safeTSec = getSafeTSec(state, tSec);
  const events = Array.isArray(currentVassal.lifeEvents) ? currentVassal.lifeEvents : [];
  for (const event of events) {
    const eventSec = Math.max(0, Math.floor(event?.tSec ?? 0));
    if (eventSec > safeTSec) continue;
    changed = applyVassalLifeEvent(state, currentVassal, event) || changed;
  }
  changed = syncCouncilMirrorForAliveVassal(state, currentVassal, safeTSec) || changed;
  return changed;
}
