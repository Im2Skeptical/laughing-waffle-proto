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
  getSettlementSelectedVassals,
  getSettlementVassalLineageState,
  getSettlementYearDurationSec,
  getSettlementYearStartSec,
} from "./settlement-state.js";
import {
  syncElderCouncilMembersFromVassals,
  upsertElderCouncilMemberFromVassal,
} from "./settlement-order-exec.js";
import { createRng } from "./rng.js";
import { deserializeGameState, serializeGameState } from "./state.js";

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

function hashString(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function getSharedSeedSnapshot(state) {
  if (Number.isFinite(state?.rng?.seed)) {
    return Math.floor(state.rng.seed);
  }
  if (Number.isFinite(state?.rng?.baseSeed)) {
    return Math.floor(state.rng.baseSeed);
  }
  return 0;
}

function deriveVassalPoolSeed(state, createdSec, poolId) {
  const safeSec = Math.max(0, Math.floor(createdSec ?? 0));
  const poolHash = hashString(poolId);
  let seed = getSharedSeedSnapshot(state) | 0;
  seed = Math.imul(seed ^ (safeSec + 0x9e3779b9), 0x85ebca6b);
  seed = Math.imul(seed ^ poolHash, 0xc2b2ae35);
  return seed | 0;
}

function createVassalRandomSource(state, createdSec, poolId) {
  const rng = createRng(deriveVassalPoolSeed(state, createdSec, poolId));
  return {
    rngNextFloat: () => rng.nextFloat(),
    rngNextInt: (min, max) => rng.nextInt(min, max),
  };
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

function randomAgeInRange(range, randomSource) {
  const min = Number.isFinite(range?.min) ? Math.max(0, Math.floor(range.min)) : 0;
  const max = Number.isFinite(range?.max) ? Math.max(min, Math.floor(range.max)) : min;
  return typeof randomSource?.rngNextInt === "function" ? randomSource.rngNextInt(min, max) : min;
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

function buildCandidateLifeSchedule(state, record, orderDef, randomSource) {
  const currentYear = Math.max(1, Math.floor(record.birthYear ?? getCurrentYear(state)));
  const classChangeAge =
    record.sourceClassId === "stranger" ? SETTLEMENT_VASSAL_VILLAGER_AGE_YEARS : null;
  const firstMortalityAgeYears = SETTLEMENT_VASSAL_ELDER_AGE_YEARS + 1;
  const professionAgeYears = randomAgeInRange(SETTLEMENT_VASSAL_PROFESSION_AGE_RANGE, randomSource);
  const traitAgeYears = randomAgeInRange(SETTLEMENT_VASSAL_TRAIT_AGE_RANGE, randomSource);
  const professionId = chooseRandom(settlementVassalProfessionIds, randomSource);
  const traitId = chooseRandom(settlementVassalTraitIds, randomSource);

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
      typeof randomSource?.rngNextFloat === "function" &&
      randomSource.rngNextFloat() < mortalityChance;
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

function createCandidateRecord(state, lineage, poolId, orderDef, randomSource) {
  const classIds = getSettlementClassIds(state);
  const populationSummary = getSettlementPopulationSummary(state);
  const currentYear = getCurrentYear(state);
  const vassalId = nextLineageVassalId(lineage);
  const sourceClassId = pickWeightedClassId(randomSource, classIds, populationSummary?.byClass ?? {});
  const initialAgeYears =
    typeof randomSource?.rngNextInt === "function"
      ? randomSource.rngNextInt(SETTLEMENT_VASSAL_STARTING_AGE_MIN, SETTLEMENT_VASSAL_STARTING_AGE_MAX)
      : SETTLEMENT_VASSAL_STARTING_AGE_MIN;
  const agendaByClass = buildGeneratedVassalAgendaByClass(
    randomSource,
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
  buildCandidateLifeSchedule(state, record, orderDef, randomSource);
  return record;
}

function generateSettlementVassalSelectionPoolMutable(state, tSec = null) {
  const lineage = getVassalLineageMutable(state);
  if (!lineage) return null;
  const orderDef = getOrderDef(state);
  const poolId = nextLineagePoolId(lineage);
  const createdSec = getSafeTSec(state, tSec);
  const randomSource = createVassalRandomSource(state, createdSec, poolId);
  const previousTSec = state?.tSec;
  if (Number.isFinite(createdSec)) {
    state.tSec = createdSec;
  }
  const candidates = [];
  for (let index = 0; index < SETTLEMENT_VASSAL_CANDIDATE_COUNT; index += 1) {
    const record = createCandidateRecord(state, lineage, poolId, orderDef, randomSource);
    candidates.push(record);
  }
  if (Number.isFinite(previousTSec)) {
    state.tSec = previousTSec;
  }
  return {
    poolId,
    createdSec,
    candidates,
  };
}

function buildSelectionPoolHash(pool) {
  const signature = {
    poolId: pool?.poolId ?? null,
    createdSec: Number.isFinite(pool?.createdSec) ? Math.floor(pool.createdSec) : null,
    candidates: (Array.isArray(pool?.candidates) ? pool.candidates : []).map((candidate) => ({
      vassalId: candidate?.vassalId ?? null,
      sourceClassId: candidate?.sourceClassId ?? null,
      initialAgeYears: Number.isFinite(candidate?.initialAgeYears)
        ? Math.floor(candidate.initialAgeYears)
        : null,
      birthYear: Number.isFinite(candidate?.birthYear) ? Math.floor(candidate.birthYear) : null,
      deathYear: Number.isFinite(candidate?.deathYear) ? Math.floor(candidate.deathYear) : null,
      agendaByClass: candidate?.agendaByClass ?? null,
    })),
  };
  return JSON.stringify(signature);
}

export function getSettlementVassalSelectionPoolHash(pool) {
  return buildSelectionPoolHash(pool);
}

export function buildSettlementVassalSelectionPool(state, tSec = null) {
  if (!state || typeof state !== "object") return null;
  const clonedState = deserializeGameState(serializeGameState(state));
  const pool = generateSettlementVassalSelectionPoolMutable(clonedState, tSec);
  if (!pool) return null;
  return {
    ...pool,
    candidates: pool.candidates.map((candidate, index) => ({
      ...candidate,
      candidateIndex: index,
    })),
    expectedPoolHash: buildSelectionPoolHash(pool),
  };
}

function finalizeSelectedVassal(state, lineage, candidate, tSec = null) {
  if (!lineage || !candidate) return { ok: false, reason: "missingCandidate" };
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

  lineage.vassalsById[candidate.vassalId] = candidate;
  lineage.currentVassalId = candidate.vassalId;
  if (!lineage.selectedVassalIds.includes(candidate.vassalId)) {
    lineage.selectedVassalIds.push(candidate.vassalId);
  }
  return { ok: true, vassalId: candidate.vassalId };
}

export function selectSettlementVassal(state, candidateIndex, expectedPoolHash, tSec = null) {
  const lineage = getVassalLineageMutable(state);
  if (!lineage) return { ok: false, reason: "noLineage" };
  const currentVassal = getCurrentSettlementVassal(state);
  if (currentVassal && currentVassal.isDead !== true) {
    return { ok: false, reason: "currentVassalAlive" };
  }
  const safeIndex = Number.isFinite(candidateIndex) ? Math.floor(candidateIndex) : -1;
  const previewPool = buildSettlementVassalSelectionPool(state, tSec);
  if (!previewPool) return { ok: false, reason: "poolFailed" };
  const actualHash = previewPool.expectedPoolHash;
  if (typeof expectedPoolHash === "string" && expectedPoolHash.length > 0 && expectedPoolHash !== actualHash) {
    return { ok: false, reason: "selectionPoolMismatch", actualPoolHash: actualHash };
  }
  if (safeIndex < 0 || safeIndex >= previewPool.candidates.length) {
    return { ok: false, reason: "missingCandidate" };
  }
  const pool = generateSettlementVassalSelectionPoolMutable(state, tSec);
  if (!pool) return { ok: false, reason: "poolFailed" };
  const candidate = pool.candidates[safeIndex] ?? null;
  if (!candidate) {
    return { ok: false, reason: "missingCandidate" };
  }
  return finalizeSelectedVassal(state, lineage, candidate, tSec);
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
  if (currentVassalId && lineage?.vassalsById?.[currentVassalId]) {
    return lineage.vassalsById[currentVassalId];
  }
  const selectedIds = Array.isArray(lineage?.selectedVassalIds) ? lineage.selectedVassalIds : [];
  for (let index = selectedIds.length - 1; index >= 0; index -= 1) {
    const fallback = lineage?.vassalsById?.[selectedIds[index]] ?? null;
    if (fallback) return fallback;
  }
  return null;
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
      return true;
    default:
      return false;
  }
}

function buildSelectedVassalCouncilSpecs(state, tSec) {
  const specs = [];
  for (const vassal of getSettlementSelectedVassals(state)) {
    if (!vassal || vassal.isElder !== true) continue;
    const joinedCouncilSec = Number.isFinite(vassal?.joinedCouncilSec)
      ? Math.max(0, Math.floor(vassal.joinedCouncilSec))
      : null;
    if (joinedCouncilSec == null || joinedCouncilSec > tSec) continue;
    const referenceSec =
      vassal.isDead === true && Number.isFinite(vassal?.removedFromCouncilSec)
        ? Math.max(0, Math.floor(vassal.removedFromCouncilSec))
        : tSec;
    specs.push({
      sourceVassalId: vassal.vassalId,
      memberId: vassal.councilMemberId ?? `vassal-${vassal.vassalId}`,
      sourceClassId: vassal.currentClassId,
      joinedYear: getYearAtSecond(state, joinedCouncilSec),
      ageYears: getSettlementVassalAgeYearsAtSecond(state, vassal, referenceSec),
      modifierId:
        typeof vassal.traitId === "string" && vassal.traitId.length > 0 ? vassal.traitId : null,
      agendaByClass: vassal.agendaByClass,
    });
  }
  return specs;
}

export function getSettlementVassalAgeYearsAtSecond(state, vassal, tSec = null) {
  const requestedSec = getSafeTSec(state, tSec);
  const deathSec = Number.isFinite(vassal?.deathSec)
    ? Math.max(0, Math.floor(vassal.deathSec))
    : null;
  const safeTSec = deathSec == null ? requestedSec : Math.min(requestedSec, deathSec);
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
  let changed = false;
  const safeTSec = getSafeTSec(state, tSec);
  if (currentVassal) {
    const events = Array.isArray(currentVassal.lifeEvents) ? currentVassal.lifeEvents : [];
    for (const event of events) {
      const eventSec = Math.max(0, Math.floor(event?.tSec ?? 0));
      if (eventSec > safeTSec) continue;
      changed = applyVassalLifeEvent(state, currentVassal, event) || changed;
    }
  }
  changed =
    syncElderCouncilMembersFromVassals(state, buildSelectedVassalCouncilSpecs(state, safeTSec)) ||
    changed;
  return changed;
}
