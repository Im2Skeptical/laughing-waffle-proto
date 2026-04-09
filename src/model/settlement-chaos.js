import {
  CHAOS_GOD_IDS,
  MOON_CYCLE_SEC,
  RED_GOD_ENABLED,
  RED_GOD_CHAOS_RATE_BY_FAITH,
  RED_GOD_MONSTER_WIN_COUNT,
  RED_GOD_MONSTERS_PER_CHAOS,
  RED_GOD_POPULATION_BAND_SIZE,
  RED_GOD_SPAWN_CADENCE_MOONS,
} from "../defs/gamesettings/gamerules-defs.js";
import { pushGameEvent } from "./event-feed.js";
import { syncPhaseToPaused } from "./state.js";
import {
  getHubCore,
  getSettlementClassIds,
  getSettlementPopulationClassState,
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

function getClassRedGodChaosContribution(state, classId) {
  const classState = getSettlementPopulationClassState(state, classId);
  const tier = typeof classState?.faith?.tier === "string" ? classState.faith.tier : null;
  const rate = Number.isFinite(RED_GOD_CHAOS_RATE_BY_FAITH?.[tier])
    ? Math.max(0, Math.floor(RED_GOD_CHAOS_RATE_BY_FAITH[tier]))
    : 0;
  if (rate <= 0) return 0;
  const populationBands = Math.floor(
    getClassTotalPopulation(classState) / Math.max(1, clampInt(RED_GOD_POPULATION_BAND_SIZE, 10))
  );
  return Math.max(0, populationBands * rate);
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
  if (safeGodId !== "redGod") {
    return {
      godId: safeGodId,
      enabled: godState?.enabled === true,
      chaosPower: 0,
      monsterCount: 0,
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
  let contribution = 0;
  for (const classId of getSettlementClassIds(state)) {
    contribution += getClassRedGodChaosContribution(state, classId);
  }
  if (contribution > 0) {
    redGod.chaosPower = clampInt(redGod.chaosPower, 0) + contribution;
    changed = true;
  } else {
    redGod.chaosPower = clampInt(redGod.chaosPower, 0);
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
