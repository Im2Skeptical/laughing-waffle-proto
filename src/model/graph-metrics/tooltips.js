import { stockTotal } from '../detailed-settlements/stock.js';
import { getMoonPhaseDurationSec } from "../moon-phases.js";
import {
  assignDetailedSettlementWorkers,
  getDetailedCivilizationSummary,
  getDetailedSettlement,
  getPopulationSummary as getDetailedPopulationSummary,
  getStoredFoodCapacity,
} from "../detailed-settlements.js";
import { getSettlementChaosGodSummary } from "../settlement-chaos.js";
import {
  getSettlementFaithSummary,
  getSettlementHappinessSummary,
} from "../settlement-state.js";
import { getPrimaryDetailedSiteId, getSiteById } from "../world-state.js";

function capitalizeLabel(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.length) return "None";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatClassLabel(classId) {
  return capitalizeLabel(typeof classId === "string" ? classId : "villager");
}

function getPrimaryDetailedRegionId(state) {
  const site = getSiteById(state, getPrimaryDetailedSiteId(state));
  return typeof site?.regionId === "string" ? site.regionId : null;
}

export function getSettlementFoodTooltipSpec(state) {
  const regionId = getPrimaryDetailedRegionId(state);
  const local = getDetailedSettlement(state, regionId);
  const storedFood = stockTotal(state, local, 'Edible');
  const looseFood = 0;
  const food = storedFood + looseFood;
  const foodCapacity = Math.max(0, Number(getStoredFoodCapacity(state, regionId) ?? 0));
  const population = getDetailedPopulationSummary(state, regionId);
  const mealDemand = Math.max(0, Math.floor(population.mealDemand ?? 0));
  const phaseDurationSec = getMoonPhaseDurationSec(state);
  return {
    title: "Food",
    lines: [
      `Hosted Edible: ${Math.floor(food)}/${Math.floor(foodCapacity)} Stock.`,
      `Each Food phase consumes up to ${mealDemand} food (${population.adults} adults + ${population.children} children + ${population.elders} elders).`,
      `Food phase cadence: every ${phaseDurationSec * 6}s in the six-phase moon.`,
      "Food is hosted [Edible] Stock, consumed from leftmost Practices after their Food activation.",
      "Villagers feed before Strangers.",
    ],
  };
}

export function getSettlementChaosPowerTooltipSpec(state) {
  const redGod = getSettlementChaosGodSummary(state, "redGod");
  return {
    title: "Chaos Power",
    lines: [
      `Current chaos power: ${Math.floor(redGod?.chaosPower ?? 0)}`,
      `Next spawn in: ${Math.floor(redGod?.spawnCountdownSec ?? 0)}s`,
      `Projected monsters on next spawn: ${Math.floor(redGod?.nextSpawnCount ?? 0)}`,
    ],
  };
}

function finiteFloor(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

export function getSettlementMonstersTooltipSpec(state) {
  const redGod = getSettlementChaosGodSummary(state, "redGod");
  const count = finiteFloor(redGod?.monsterCount, 0);
  // Schema >= 9 leaves monsterWinCount null and cadenceSec at 0. Those are not a cap.
  if (!Number.isFinite(redGod?.monsterWinCount)) {
    return {
      title: "Monsters",
      lines: [
        `Current monsters: ${count}`,
        "The run ends when spatial monster expansion takes every player settlement.",
      ],
    };
  }
  const lines = [`Current monsters: ${count}/${finiteFloor(redGod.monsterWinCount, 0)}`];
  if (Number.isFinite(redGod?.cadenceSec) && redGod.cadenceSec > 0) {
    lines.push(`Spawn cadence: every ${finiteFloor(redGod.cadenceSec, 0)}s`);
  }
  lines.push("If monsters reach the win threshold, the run ends.");
  return { title: "Monsters", lines };
}

function formatPopulationTooltip(classId, cohort, assigned, free) {
  const children = finiteFloor(cohort?.children, 0);
  const adults = finiteFloor(cohort?.adults, 0);
  const elders = finiteFloor(cohort?.elders, 0);
  const total = Number.isFinite(cohort?.total)
    ? finiteFloor(cohort.total, 0)
    : children + adults + elders;
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Population`,
    lines: [
      `Total population: ${total}`,
      `Children: ${children}`,
      `Adults: ${adults}`,
      `Elders: ${elders}`,
      `Assigned: ${finiteFloor(assigned, 0)}`,
      `Free population: ${finiteFloor(free, Math.max(0, adults + elders - finiteFloor(assigned, 0)))}`,
    ],
  };
}

function countAssignedWorkers(state, regionId, classId) {
  let assigned = 0;
  for (const assignment of assignDetailedSettlementWorkers(state, regionId)) {
    for (const token of assignment?.tokens ?? []) {
      if (!classId || token?.classId === classId) assigned += 1;
    }
  }
  return assigned;
}

export function getSettlementPopulationTooltipSpec(state, classId = null, scope = "region") {
  if (scope === "civilization") {
    const population = getDetailedCivilizationSummary(state).population;
    const cohort = classId ? population?.byClass?.[classId] : population;
    const classes = Object.values(population?.byClass ?? {});
    const assigned = classId
      ? cohort?.assignedWorkers ?? 0
      : classes.reduce((sum, entry) => sum + (entry?.assignedWorkers ?? 0), 0);
    const free = classId
      ? cohort?.freePopulation ?? 0
      : classes.reduce((sum, entry) => sum + (entry?.freePopulation ?? 0), 0);
    return formatPopulationTooltip(classId, cohort, assigned, free);
  }
  // Legend hover has no graph subject, so the local breakdown uses the primary settlement.
  const regionId = getPrimaryDetailedRegionId(state);
  const summary = getDetailedPopulationSummary(state, regionId);
  const cohort = classId ? summary.byClass?.[classId] : summary;
  const assigned = countAssignedWorkers(state, regionId, classId);
  const free = Math.max(0, finiteFloor(cohort?.adults, 0) + finiteFloor(cohort?.elders, 0) - assigned);
  return formatPopulationTooltip(classId, cohort, assigned, free);
}

function freePopulationLines(classId, free, assigned) {
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Free Population`,
    lines: [
      `Free population: ${finiteFloor(free, 0)}`,
      `Assigned workers: ${finiteFloor(assigned, 0)}`,
    ],
  };
}

export function getSettlementFreePopulationTooltipSpec(state, classId = null, scope = "region") {
  if (scope === "civilization") {
    const population = getDetailedCivilizationSummary(state).population;
    const cohort = classId ? population?.byClass?.[classId] : null;
    const entries = classId ? [cohort] : Object.values(population?.byClass ?? {});
    const free = entries.reduce((sum, entry) => sum + finiteFloor(entry?.freePopulation, 0), 0);
    const assigned = entries.reduce((sum, entry) => sum + finiteFloor(entry?.assignedWorkers, 0), 0);
    return freePopulationLines(classId, free, assigned);
  }
  const regionId = getPrimaryDetailedRegionId(state);
  const summary = getDetailedPopulationSummary(state, regionId);
  const cohort = classId ? summary.byClass?.[classId] : summary;
  const assigned = countAssignedWorkers(state, regionId, classId);
  const free = Math.max(0, finiteFloor(cohort?.adults, 0) + finiteFloor(cohort?.elders, 0) - assigned);
  return freePopulationLines(classId, free, assigned);
}

export function getSettlementFaithTooltipSpec(state, classId = null) {
  const faith = getSettlementFaithSummary(state, classId);
  const happiness = getSettlementHappinessSummary(state, classId);
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Faith`,
    lines: [
      `Current tier: ${capitalizeLabel(faith.tier)}`,
      `Current happiness: ${capitalizeLabel(happiness.status)}`,
      "At each Faith moon, positive happiness raises faith and negative happiness lowers it.",
    ],
  };
}

export function getSettlementHappinessTooltipSpec(state, classId = null) {
  const happiness = getSettlementHappinessSummary(state, classId);
  const partialMemory =
    happiness.partialFeedRatios.length > 0
      ? happiness.partialFeedRatios.map((value) => `${Math.round(value * 100)}%`).join(" -> ")
      : "None";
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Happiness`,
    lines: [
      `Current state: ${capitalizeLabel(happiness.status)}`,
      `Full-feed streak: ${happiness.fullFeedStreak}/${happiness.fullFeedThreshold}`,
      `Missed-feed streak: ${happiness.missedFeedStreak}/${happiness.missedFeedThreshold}`,
      `Partial memory: ${partialMemory}`,
      "Three full seasons set happiness to positive. Three consecutive misses trigger starvation, and further misses keep triggering it until the class gets at least a 50% feed. Partial ratios improve on 3 rising steps and worsen immediately on flat-or-lower steps.",
    ],
  };
}

export function getChaosReckoningValue(state, key) {
  const value = state?.civilization?.chaos?.lastMoonIncome?.[key];
  return Number.isFinite(value) ? Number(value) : 0;
}

export function formatChaosReckoningValue(value) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(4)).toString();
}

export function getChaosRawPressureTooltipSpec(state) {
  return {
    title: "Raw Chaos Pressure",
    lines: [
      `Latest Faith reckoning: ${formatChaosReckoningValue(getChaosReckoningValue(state, "rawPressure"))}`,
      "Primordial pressure plus recorded civilization losses, before resistance.",
      "Reckoned during Faith and held until the next Faith phase.",
    ],
  };
}

export function getChaosResistanceTooltipSpec(state) {
  return {
    title: "Chaos Resistance",
    lines: [
      `Latest Faith reckoning: ${formatChaosReckoningValue(getChaosReckoningValue(state, "resistance"))}`,
      "Living population contributes resistance according to its Faith tier.",
      "Resistance only reduces new incoming Chaos; it never removes accumulated Chaos.",
    ],
  };
}
