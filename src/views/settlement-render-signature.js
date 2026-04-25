import { getCurrentSeasonKey } from "../model/state.js";
import { getSettlementChaosGodSummary } from "../model/settlement-chaos.js";
import {
  getSettlementClassIds,
  getSettlementCurrentVassal,
  getSettlementFaithSummary,
  getSettlementFirstSelectedVassal,
  getSettlementFloodplainFoodTotal,
  getSettlementHappinessSummary,
  getSettlementLatestSelectedVassalDeathSec,
  getSettlementOrderSlots,
  getSettlementPopulationSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementStockpile,
  getSettlementStructureSlots,
  getSettlementTileBlueResource,
  getSettlementTileFood,
  getSettlementTotalFood,
  getSettlementVisibleVassalLifeEvents,
} from "../model/settlement-state.js";

function buildCompactVassalSignature(vassal, visibleEvents, classIds) {
  if (!vassal || typeof vassal !== "object") return null;
  const safeClassIds = Array.isArray(classIds) ? classIds : [];
  return {
    vassalId: vassal.vassalId ?? null,
    sourceClassId: vassal.sourceClassId ?? null,
    currentClassId: vassal.currentClassId ?? null,
    birthYear: Number.isFinite(vassal.birthYear) ? Math.floor(vassal.birthYear) : null,
    deathYear: Number.isFinite(vassal.deathYear) ? Math.floor(vassal.deathYear) : null,
    professionId: vassal.professionId ?? null,
    traitId: vassal.traitId ?? null,
    isDead: vassal.isDead === true,
    isElder: vassal.isElder === true,
    agendaByClass: Object.fromEntries(
      safeClassIds.map((classId) => [
        classId,
        Array.isArray(vassal?.agendaByClass?.[classId]) ? [...vassal.agendaByClass[classId]] : [],
      ])
    ),
    visibleEvents: (Array.isArray(visibleEvents) ? visibleEvents : []).map((event) => ({
      eventId: event?.eventId ?? null,
      kind: event?.kind ?? null,
      tSec: Number.isFinite(event?.tSec) ? Math.floor(event.tSec) : null,
      ageYears: Number.isFinite(event?.ageYears) ? Math.floor(event.ageYears) : null,
      classId: event?.classId ?? null,
      professionId: event?.professionId ?? null,
      traitId: event?.traitId ?? null,
      causeOfDeath: event?.causeOfDeath ?? null,
      text: event?.text ?? "",
    })),
  };
}

function countVisibleVassalLifeEvents(vassal, visibleVassalThroughSec = null) {
  const events = Array.isArray(vassal?.lifeEvents) ? vassal.lifeEvents : [];
  if (!events.length) return 0;
  const safeVisibleSec = Number.isFinite(visibleVassalThroughSec)
    ? Math.max(0, Math.floor(visibleVassalThroughSec))
    : Number.POSITIVE_INFINITY;
  let count = 0;
  for (const event of events) {
    const eventSec = Number.isFinite(event?.tSec)
      ? Math.max(0, Math.floor(event.tSec))
      : null;
    if (eventSec == null || eventSec > safeVisibleSec) break;
    count += 1;
  }
  return count;
}

export function buildRenderGateKey(
  state,
  selectedClassId,
  visibleVassalThroughSec = null,
  civilizationLossInfo = null
) {
  const currentVassal = getSettlementCurrentVassal(state);
  const deathSec = Number.isFinite(currentVassal?.deathSec)
    ? Math.max(0, Math.floor(currentVassal.deathSec))
    : null;
  const deathYearKnown =
    deathSec != null &&
    Number.isFinite(visibleVassalThroughSec) &&
    Math.floor(visibleVassalThroughSec) >= deathSec;
  const lossYear = Number.isFinite(civilizationLossInfo?.lossYear)
    ? Math.floor(civilizationLossInfo.lossYear)
    : null;
  return [
    Math.floor(state?.tSec ?? 0),
    getCurrentSeasonKey(state),
    Math.floor(state?.year ?? 0),
    selectedClassId ?? "",
    currentVassal?.vassalId ?? "",
    currentVassal?.currentClassId ?? "",
    currentVassal?.professionId ?? "",
    currentVassal?.traitId ?? "",
    currentVassal?.isDead === true ? 1 : 0,
    currentVassal?.isElder === true ? 1 : 0,
    deathYearKnown ? 1 : 0,
    countVisibleVassalLifeEvents(currentVassal, visibleVassalThroughSec),
    lossYear ?? "",
    civilizationLossInfo?.resolved === true ? 1 : 0,
  ].join("|");
}

export function buildSignature(
  state,
  selectedClassId,
  visibleVassalThroughSec = null,
  civilizationLossInfo = null
) {
  const summary = getSettlementPopulationSummary(state);
  const classIds = getSettlementClassIds(state);
  const redGodSummary = getSettlementChaosGodSummary(state, "redGod");
  const practiceCardsByClass = {};
  for (const classId of classIds) {
    practiceCardsByClass[classId] = getSettlementPracticeSlotsByClass(state, classId).map(
      (slot) => ({
        defId: slot?.card?.defId ?? null,
        runtime: slot?.card?.props?.settlement ?? null,
      })
    );
  }
  const structures = getSettlementStructureSlots(state).map((slot) => ({
    defId: slot?.structure?.defId ?? null,
    runtime: slot?.structure?.props?.settlement ?? null,
  }));
  const orderCards = getSettlementOrderSlots(state).map((slot) => ({
    defId: slot?.card?.defId ?? null,
    runtime: slot?.card?.props?.settlement ?? null,
  }));
  const tiles = Array.isArray(state?.board?.layers?.tile?.anchors)
    ? state.board.layers.tile.anchors.map((tile) => ({
        defId: tile?.defId ?? null,
        foodStored: getSettlementTileFood(tile),
        blueResourceStored: getSettlementTileBlueResource(tile),
      }))
    : [];
  return JSON.stringify({
    tSec: Math.floor(state?.tSec ?? 0),
    season: getCurrentSeasonKey(state),
    year: Math.floor(state?.year ?? 1),
    previewing: state !== null,
    selectedClassId,
    classIds,
    summary,
    stockpiles: {
      food: getSettlementTotalFood(state),
      storedFood: getSettlementStockpile(state, "food"),
      red: getSettlementStockpile(state, "redResource"),
      fieldFood: getSettlementFloodplainFoodTotal(state),
      blue: getSettlementStockpile(state, "blueResource"),
      black: getSettlementStockpile(state, "blackResource"),
    },
    redGodSummary,
    civilizationLossInfo: civilizationLossInfo && typeof civilizationLossInfo === "object"
      ? {
          lossSec: Number.isFinite(civilizationLossInfo.lossSec)
            ? Math.floor(civilizationLossInfo.lossSec)
            : null,
          lossYear: Number.isFinite(civilizationLossInfo.lossYear)
            ? Math.floor(civilizationLossInfo.lossYear)
            : null,
          maxLossYear: Number.isFinite(civilizationLossInfo.maxLossYear)
            ? Math.floor(civilizationLossInfo.maxLossYear)
            : null,
          resolved: civilizationLossInfo.resolved === true,
        }
      : null,
    classSummaries: classIds.map((classId) => ({
      classId,
      population: getSettlementPopulationSummary(state, classId),
      faith: getSettlementFaithSummary(state, classId),
      happiness: getSettlementHappinessSummary(state, classId),
    })),
    vassal: (() => {
      const currentVassal = getSettlementCurrentVassal(state);
      const firstSelectedVassal = getSettlementFirstSelectedVassal(state);
      const visibleEvents = currentVassal
        ? getSettlementVisibleVassalLifeEvents(
            state,
            currentVassal.vassalId,
            visibleVassalThroughSec
          )
        : [];
      return {
        currentVassal: buildCompactVassalSignature(currentVassal, visibleEvents, classIds),
        firstSelectedVassalId: firstSelectedVassal?.vassalId ?? null,
        latestDeathSec: getSettlementLatestSelectedVassalDeathSec(state),
      };
    })(),
    orderCards,
    practiceCardsByClass,
    structures,
    tiles,
  });
}
