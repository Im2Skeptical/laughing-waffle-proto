import {
  CHAOS_GOD_IDS,
  MOON_CYCLE_SEC,
  RED_GOD_ENABLED,
  RED_GOD_BASE_CHAOS_INCOME,
  RED_GOD_CHAOS_INCOME_GROWTH_RATE,
  RED_GOD_CHAOS_INCOME_GROWTH_YEARS,
  RED_GOD_FAITH_MITIGATION_BY_TIER,
  RED_GOD_MONSTER_WIN_COUNT,
  RED_GOD_MONSTERS_PER_CHAOS,
  RED_GOD_SPAWN_CADENCE_MOONS,
} from "../defs/gamesettings/gamerules-defs.js";
import { pushGameEvent } from "./event-feed.js";
import { syncPhaseToPaused } from "./state.js";
import {
  getHubCore,
  getSettlementClassIds,
  getSettlementPopulationClassState,
  getSettlementYearDurationSec,
} from "./settlement-state.js";

function clampInt(value, fallback = 0) {
  if (!Number.isFinite(value)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(value));
}

function getRedGodSpawnCadenceSec() {
  const cadenceMoons = clampInt(RED_GOD_SPAWN_CADENCE_MOONS, 7);
  const moonCycleSec = clampInt(MOON_CYCLE_SEC, 6);
  return Math.max(1, cadenceMoons * moonCycleSec);
}

function normalizeGodEnabled(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback === true;
}

function normalizeRedGodState(raw) {
  const next = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const cadenceSec = getRedGodSpawnCadenceSec();
  const nextSpawnSec =
    Number.isFinite(next.nextSpawnSec) && Math.floor(next.nextSpawnSec) >= 0
      ? Math.floor(next.nextSpawnSec)
      : cadenceSec;
  return {
    enabled: normalizeGodEnabled(next.enabled, RED_GOD_ENABLED),
    chaosPower: clampInt(next.chaosPower, 0),
    monsterCount: clampInt(next.monsterCount, 0),
    nextSpawnSec,
    lastSpawnSec: Number.isFinite(next.lastSpawnSec) ? Math.max(0, Math.floor(next.lastSpawnSec)) : null,
    lastSpawnCount: clampInt(next.lastSpawnCount, 0),
  };
}

function normalizeInactiveGodState(raw) {
  const next = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  return {
    enabled: normalizeGodEnabled(next.enabled, false),
  };
}

export function ensureSettlementChaosGodState(state) {
  const core = getHubCore(state);
  if (!core) return null;
  if (!core.systemState || typeof core.systemState !== "object") {
    core.systemState = {};
  }
  const rawChaosGods =
    core.systemState.chaosGods &&
    typeof core.systemState.chaosGods === "object" &&
    !Array.isArray(core.systemState.chaosGods)
      ? core.systemState.chaosGods
      : {};
  core.systemState.chaosGods = {
    redGod: normalizeRedGodState(rawChaosGods.redGod),
    greenGod: normalizeInactiveGodState(rawChaosGods.greenGod),
    blueGod: normalizeInactiveGodState(rawChaosGods.blueGod),
    blackGod: normalizeInactiveGodState(rawChaosGods.blackGod),
  };
  return core.systemState.chaosGods;
}

export function getSettlementChaosGodState(state, godId) {
  const chaosGods = ensureSettlementChaosGodState(state);
  const safeGodId =
    typeof godId === "string" && CHAOS_GOD_IDS.includes(godId) ? godId : "redGod";
  return chaosGods?.[safeGodId] ?? null;
}

function getClassTotalPopulation(classState) {
  if (!classState || typeof classState !== "object") return 0;
  const adults = Number.isFinite(classState.adults)
    ? Math.max(0, Math.floor(classState.adults))
    : Number.isFinite(classState.total)
      ? Math.max(0, Math.floor(classState.total))
      : 0;
  const youth = Number.isFinite(classState.youth) ? Math.max(0, Math.floor(classState.youth)) : 0;
  return adults + youth;
}

function getRedGodElapsedYears(state) {
  const yearDurationSec = Math.max(1, clampInt(getSettlementYearDurationSec(state), 32));
  const tSec = clampInt(state?.tSec, 0);
  return Math.max(0, Math.floor(tSec / yearDurationSec));
}

function getRedGodGrowthSteps(state) {
  const growthYears = Math.max(1, clampInt(RED_GOD_CHAOS_INCOME_GROWTH_YEARS, 12));
  return Math.floor(getRedGodElapsedYears(state) / growthYears);
}

function getRedGodBaseChaosIncome(state) {
  const growthSteps = getRedGodGrowthSteps(state);
  const growthRate = Number.isFinite(RED_GOD_CHAOS_INCOME_GROWTH_RATE)
    ? Math.max(0, RED_GOD_CHAOS_INCOME_GROWTH_RATE)
    : 0;
  let income = Math.max(0, clampInt(RED_GOD_BASE_CHAOS_INCOME, 10));
  for (let step = 0; step < growthSteps; step += 1) {
    income = Math.ceil(income * (1 + growthRate));
  }
  return Math.max(0, income);
}

function normalizeRedGodFaithMitigationRule(rawRule) {
  if (Number.isFinite(rawRule)) {
    const mitigationPerPop = Math.max(0, Math.floor(rawRule));
    return {
      amount: mitigationPerPop,
      perPopulation: 1,
      rounding: "floor",
      label: mitigationPerPop > 0 ? `${mitigationPerPop} / pop` : "",
    };
  }
  const rule = rawRule && typeof rawRule === "object" && !Array.isArray(rawRule) ? rawRule : null;
  const amount = Number.isFinite(rule?.amount) ? Math.max(0, Math.floor(rule.amount)) : 0;
  const perPopulation = Number.isFinite(rule?.perPopulation)
    ? Math.max(1, Math.floor(rule.perPopulation))
    : 1;
  const rounding =
    rule?.rounding === "ceil" || rule?.rounding === "round" || rule?.rounding === "floor"
      ? rule.rounding
      : "floor";
  return {
    amount,
    perPopulation,
    rounding,
    label: amount > 0 ? `${amount} / ${perPopulation} pop` : "",
  };
}

export function getRedGodFaithMitigationRule(faithTier) {
  const tier = typeof faithTier === "string" ? faithTier : null;
  return normalizeRedGodFaithMitigationRule(
    tier ? RED_GOD_FAITH_MITIGATION_BY_TIER?.[tier] : null
  );
}

function applyRedGodFaithMitigationRule(population, rule) {
  const safePopulation = Number.isFinite(population) ? Math.max(0, Math.floor(population)) : 0;
  const safeRule = normalizeRedGodFaithMitigationRule(rule);
  if (safePopulation <= 0 || safeRule.amount <= 0) return 0;
  const scaled = safePopulation / Math.max(1, safeRule.perPopulation);
  const units =
    safeRule.rounding === "ceil"
      ? Math.ceil(scaled)
      : safeRule.rounding === "round"
        ? Math.round(scaled)
        : Math.floor(scaled);
  return Math.max(0, units * safeRule.amount);
}

function getClassRedGodChaosMitigationBreakdown(state, classId) {
  const classState = getSettlementPopulationClassState(state, classId);
  const faithTier = typeof classState?.faith?.tier === "string" ? classState.faith.tier : null;
  const mitigationRule = getRedGodFaithMitigationRule(faithTier);
  const population = getClassTotalPopulation(classState);
  return {
    classId: typeof classId === "string" && classId.length > 0 ? classId : "unknown",
    faithTier,
    population,
    mitigationPerPop: mitigationRule.perPopulation === 1 ? mitigationRule.amount : 0,
    mitigationAmount: mitigationRule.amount,
    mitigationPerPopulation: mitigationRule.perPopulation,
    mitigationRounding: mitigationRule.rounding,
    mitigationLabel: mitigationRule.label,
    mitigation: applyRedGodFaithMitigationRule(population, mitigationRule),
  };
}

export function getSettlementChaosIncomeSummary(state, godId) {
  const safeGodId =
    typeof godId === "string" && CHAOS_GOD_IDS.includes(godId) ? godId : "redGod";
  if (safeGodId !== "redGod") {
    return {
      godId: safeGodId,
      totalIncome: 0,
      baseIncome: 0,
      baseRate: Math.max(0, clampInt(RED_GOD_BASE_CHAOS_INCOME, 10)),
      growthRate: 0,
      growthYears: Math.max(1, clampInt(RED_GOD_CHAOS_INCOME_GROWTH_YEARS, 12)),
      elapsedYears: 0,
      growthSteps: 0,
      totalMitigation: 0,
      byClass: [],
    };
  }
  const byClass = getSettlementClassIds(state).map((classId) =>
    getClassRedGodChaosMitigationBreakdown(state, classId)
  );
  const baseIncome = getRedGodBaseChaosIncome(state);
  const totalMitigation = byClass.reduce(
    (sum, entry) => sum + Math.max(0, Math.floor(entry?.mitigation ?? 0)),
    0
  );
  return {
    godId: safeGodId,
    totalIncome: baseIncome - totalMitigation,
    baseIncome,
    baseRate: Math.max(0, clampInt(RED_GOD_BASE_CHAOS_INCOME, 10)),
    growthRate: Number.isFinite(RED_GOD_CHAOS_INCOME_GROWTH_RATE)
      ? Math.max(0, RED_GOD_CHAOS_INCOME_GROWTH_RATE)
      : 0,
    growthYears: Math.max(1, clampInt(RED_GOD_CHAOS_INCOME_GROWTH_YEARS, 12)),
    elapsedYears: getRedGodElapsedYears(state),
    growthSteps: getRedGodGrowthSteps(state),
    totalMitigation,
    byClass,
  };
}

function getRedGodNextSpawnCount(chaosPower) {
  return Math.floor(
    clampInt(chaosPower, 0) / Math.max(1, clampInt(RED_GOD_MONSTERS_PER_CHAOS, 10))
  );
}

export function getSettlementChaosGodSummary(state, godId) {
  const safeGodId =
    typeof godId === "string" && CHAOS_GOD_IDS.includes(godId) ? godId : "redGod";
  const godState = getSettlementChaosGodState(state, safeGodId);
  const cadenceSec = getRedGodSpawnCadenceSec();
  const incomeSummary = getSettlementChaosIncomeSummary(state, safeGodId);
  if (safeGodId !== "redGod") {
    return {
      godId: safeGodId,
      enabled: godState?.enabled === true,
      chaosPower: 0,
      monsterCount: 0,
      chaosIncome: 0,
      monsterWinCount: clampInt(RED_GOD_MONSTER_WIN_COUNT, 100),
      nextSpawnSec: null,
      spawnCountdownSec: 0,
      nextSpawnCount: 0,
      cadenceSec,
    };
  }
  const tSec = clampInt(state?.tSec, 0);
  const nextSpawnSec = Number.isFinite(godState?.nextSpawnSec)
    ? Math.max(0, Math.floor(godState.nextSpawnSec))
    : cadenceSec;
  const chaosPower = clampInt(godState?.chaosPower, 0);
  return {
    godId: safeGodId,
    enabled: godState?.enabled === true,
    chaosPower,
    chaosIncome: Math.floor(incomeSummary?.totalIncome ?? 0),
    monsterCount: clampInt(godState?.monsterCount, 0),
    monsterWinCount: clampInt(RED_GOD_MONSTER_WIN_COUNT, 100),
    nextSpawnSec,
    spawnCountdownSec: Math.max(0, nextSpawnSec - tSec),
    nextSpawnCount: getRedGodNextSpawnCount(chaosPower),
    cadenceSec,
  };
}

export function stepSettlementChaosSecond(state, tSec) {
  if (!state || state?.runStatus?.complete === true) return false;
  const redGod = getSettlementChaosGodState(state, "redGod");
  if (!redGod || redGod.enabled !== true) return false;

  let changed = false;
  const contributionRaw = getSettlementChaosIncomeSummary(state, "redGod").totalIncome;
  const contribution = Number.isFinite(contributionRaw) ? Math.floor(contributionRaw) : 0;
  const currentChaosPower = clampInt(redGod.chaosPower, 0);
  if (contribution !== 0) {
    redGod.chaosPower = Math.max(0, currentChaosPower + contribution);
    changed = redGod.chaosPower !== currentChaosPower;
  } else if (redGod.chaosPower !== currentChaosPower) {
    redGod.chaosPower = currentChaosPower;
    changed = true;
  }

  const cadenceSec = getRedGodSpawnCadenceSec();
  if (!Number.isFinite(redGod.nextSpawnSec) || Math.floor(redGod.nextSpawnSec) < 0) {
    redGod.nextSpawnSec = cadenceSec;
    changed = true;
  }

  let triggerEventId = null;
  while (tSec >= redGod.nextSpawnSec) {
    const pulseSec = Math.max(0, Math.floor(redGod.nextSpawnSec));
    const spawnCount = getRedGodNextSpawnCount(redGod.chaosPower);
    redGod.monsterCount = clampInt(redGod.monsterCount, 0) + spawnCount;
    redGod.lastSpawnSec = pulseSec;
    redGod.lastSpawnCount = spawnCount;
    redGod.nextSpawnSec = pulseSec + cadenceSec;
    changed = true;

    if (spawnCount > 0) {
      const entry = pushGameEvent(state, {
        type: "redGodSpawn",
        tSec: pulseSec,
        text: `redGod spawned ${spawnCount} monsters (${redGod.monsterCount}/${clampInt(RED_GOD_MONSTER_WIN_COUNT, 100)}).`,
        data: {
          godId: "redGod",
          chaosPower: clampInt(redGod.chaosPower, 0),
          spawnCount,
          monsterCount: clampInt(redGod.monsterCount, 0),
          monsterWinCount: clampInt(RED_GOD_MONSTER_WIN_COUNT, 100),
        },
      });
      triggerEventId = Number.isFinite(entry?.id) ? Math.floor(entry.id) : triggerEventId;
    }

    if (
      redGod.monsterCount >= clampInt(RED_GOD_MONSTER_WIN_COUNT, 100) &&
      state?.runStatus?.complete !== true
    ) {
      const runYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
      state.runStatus = {
        complete: true,
        reason: "redGodMonsterOverrun",
        year: runYear,
        tSec: Math.max(0, Math.floor(tSec ?? state?.tSec ?? 0)),
        triggerEventId,
      };
      state.paused = true;
      syncPhaseToPaused(state);
      pushGameEvent(state, {
        type: "runComplete",
        tSec,
        text: `Run complete: redGod reached ${clampInt(RED_GOD_MONSTER_WIN_COUNT, 100)} monsters and overran the settlement in Year ${runYear}.`,
        data: {
          runComplete: true,
          year: runYear,
          reason: "redGodMonsterOverrun",
          triggerEventId,
        },
      });
      break;
    }
  }

  return changed;
}
