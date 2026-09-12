import { getMoonPhaseDurationSec } from "../moon-phases.js";
import {
  getDetailedSettlement,
  getPopulationSummary as getDetailedPopulationSummary,
  getStoredFoodCapacity,
} from "../detailed-settlements.js";
import { getSettlementChaosGodSummary } from "../settlement-chaos.js";
import {
  getSettlementFaithSummary,
  getSettlementHappinessSummary,
  getSettlementPopulationSummary,
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
  const storedFood = Number(local?.storedFood ?? 0);
  const looseFood = Number(local?.looseFood ?? 0);
  const food = storedFood + looseFood;
  const foodCapacity = Math.max(0, Number(getStoredFoodCapacity(state, regionId) ?? 0));
  const population = getDetailedPopulationSummary(state, regionId);
  const mealDemand = Math.max(0, Math.floor(population.mealDemand ?? 0));
  const phaseDurationSec = getMoonPhaseDurationSec(state);
  return {
    title: "Food",
    lines: [
      `Current food: ${Math.floor(food)} (${Math.floor(storedFood)}/${Math.floor(foodCapacity)} stored, ${Math.floor(looseFood)} loose).`,
      `Each Food phase consumes up to ${mealDemand} food (${population.adults} adults + ${population.children} children + ${population.elders} elders).`,
      `Food phase cadence: every ${phaseDurationSec}s in the six-phase moon.`,
      "Food fills stored capacity first, then loose food; meals consume loose first.",
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

export function getSettlementMonstersTooltipSpec(state) {
  const redGod = getSettlementChaosGodSummary(state, "redGod");
  return {
    title: "Monsters",
    lines: [
      `Current monsters: ${Math.floor(redGod?.monsterCount ?? 0)}/${Math.floor(redGod?.monsterWinCount ?? 100)}`,
      `Spawn cadence: every ${Math.floor(redGod?.cadenceSec ?? 0)}s`,
      "If monsters reach the win threshold, the run ends.",
    ],
  };
}

export function getSettlementPopulationTooltipSpec(state, classId = null) {
  const population = getSettlementPopulationSummary(state, classId);
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Population`,
    lines: [
      `Total population: ${population.total}`,
      `Adults: ${population.adults}`,
      `Youth: ${population.youth}`,
      `Reserved by structures/practices: ${population.reserved}`,
      `Free population: ${population.free}`,
    ],
  };
}

export function getSettlementFreePopulationTooltipSpec(state, classId = null) {
  const population = getSettlementPopulationSummary(state, classId);
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Free Population`,
    lines: [
      `Free population: ${population.free}`,
      `Structure staffing: ${population.staffed}`,
      `Practice commitments: ${population.committed}`,
    ],
  };
}

export function getSettlementFaithTooltipSpec(state, classId = null) {
  const faith = getSettlementFaithSummary(state, classId);
  const happiness = getSettlementHappinessSummary(state, classId);
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Faith`,
    lines: [
      `Current tier: ${capitalizeLabel(faith.tier)}`,
      `Current happiness: ${capitalizeLabel(happiness.status)}`,
      "At each spring rollover, positive happiness raises faith and negative happiness lowers it.",
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
