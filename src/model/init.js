// init.js — scenario/setup assembly (NO core exports here besides init/createInitialState)

import { setupDefs } from "../defs/gamesettings/scenarios-defs.js";
import { normalizeVariantFlags } from "../defs/gamesettings/variant-flags-defs.js";
import { getActionPointCapAtSecond } from "./moon.js";

import { createEmptyState } from "./state.js";
import { initializeDetailedSettlementCivilization } from "./detailed-settlements.js";
import { getGlobalSkillModifier } from "./skills.js";
import { canonicalizeGameConfig, getGameSetting } from "./game-config.js";

function cloneSerializable(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function getSetupSkillProgressionDefs(setup) {
  const raw = setup?.skillProgressionDefs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return cloneSerializable(raw);
}

function recomputeInitialActionPoints(state) {
  if (!state || typeof state !== "object") return;
  const tSec = Number.isFinite(state.tSec) ? Math.floor(state.tSec) : 0;
  if (state.apCapOverride?.enabled === true) {
    const overrideCap = Number.isFinite(state.apCapOverride.cap)
      ? Math.max(0, Math.floor(state.apCapOverride.cap))
      : Math.max(0, Math.floor(state.actionPointCap ?? 0));
    const overridePoints = Number.isFinite(state.apCapOverride.points)
      ? Math.floor(state.apCapOverride.points)
      : Math.floor(state.actionPoints ?? 0);
    state.actionPointCap = overrideCap;
    state.actionPoints = Math.min(overrideCap, Math.max(0, overridePoints));
    return;
  }

  const baseCap = getActionPointCapAtSecond(tSec);
  const skillCapBonus = Math.floor(getGlobalSkillModifier(state, "apCapBonus", 0));
  state.actionPointCap = Math.max(0, baseCap + skillCapBonus);
  state.actionPoints = Math.min(
    state.actionPointCap,
    Math.max(0, Math.floor(state.actionPoints ?? 0))
  );
}

// Create a fully-initialized GameState snapshot
// - scenario can be a setupId string OR a raw setup object (from scenarios-defs style)
export function createInitialState(scenario = "devGym01", seed = null) {
  const setup = typeof scenario === "string" ? setupDefs[scenario] : scenario;

  if (!setup) {
    throw new Error(
      typeof scenario === "string"
        ? `Unknown setupId: ${scenario}`
        : "Invalid scenario object"
    );
  }

  const state = createEmptyState(
    seed ?? setup.rngSeed ?? 123456789,
    setup?.worldDefinitionId ?? "riverBasin01",
    setup?.worldDraft ?? null
  );
  state.gameConfig = canonicalizeGameConfig(setup?.gameConfig);
  state.seasonDurationSec = getGameSetting(state, "seasonDurationSec");
  state.civilization = {
    capitalRegionId:
      typeof setup?.civilization?.capitalRegionId === "string"
        ? setup.civilization.capitalRegionId
        : state.civilization.capitalRegionId,
    capitalSiteId:
      typeof setup?.civilization?.capitalSiteId === "string"
        ? setup.civilization.capitalSiteId
        : state.civilization.capitalSiteId,
  };
  state.variantFlags = normalizeVariantFlags(setup?.variantFlags);
  state.skillProgressionDefs = getSetupSkillProgressionDefs(setup);

  // baseline sim fields
  state.phase = "simulation";
  state.turn = 0;
  state.currentSeasonIndex = 0;
  state.year = 1;
  state.seasonTimeRemaining = 0;
  state.paused = false;

  // Map-driven settlement schema v10 is assembled by createWorldState. Legacy
  // board/hub setup is intentionally not constructed or migrated.
  initializeDetailedSettlementCivilization(state);
  recomputeInitialActionPoints(state);
  return state;
}

// Mutate an existing state object in-place (views call initGameState(gameState, "testing")).
export function initGameState(state, setupId = "devGym01") {
  const fresh = createInitialState(setupId, null);
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh);
  return state;
}
