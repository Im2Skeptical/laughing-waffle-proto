// state.js — core GameState shape + RNG helpers + season decks + serialize/deserialize.
// Model-only. No view imports.
// On the serialization/replay path; retains pre-redesign substrate (board/hub/env).
// Do not add new detailed-settlement gameplay here.
// New site simulation belongs in src/model/detailed-settlements.js (barrel) / its folder.
// New Vassal Life Map rules belong in src/model/vassal-life-map.js.
// Legacy hub/board/env constructors: ./state/board-legacy.js
// Legacy pawn field helpers: ./state/pawn-legacy.js

import {
  SEASONS,
  SEASON_DURATION_SEC,
  INITIAL_POPULATION_DEFAULT,
} from "../defs/gamesettings/gamerules-defs.js";
import { envTileDefs } from "../defs/gamepieces/env-tiles-defs.js";
import { attachRngHelpers, createRng } from "./rng.js";
import { getActionPointCapAtSecond } from "./moon.js";
import {
  ensureSkillRuntimeState,
  getGlobalSkillModifier,
} from "./skills.js";
import { normalizeVariantFlags } from "../defs/gamesettings/variant-flags-defs.js";
import { ensurePersistentKnowledgeState } from "./persistent-memory.js";
import {
  canonicalizeWorldState,
  createWorldState,
  validateWorldState,
} from "./world-state.js";
import {
  canonicalizeGameConfig,
  createAuthoredGameConfig,
  validateGameConfig,
} from "./game-config.js";
import { validateVassalLifeMapState } from "./vassal-life-map.js";
import {
  BOARD_COLS,
  BOARD_LAYERS,
  DEFAULT_DISCOVERY_ENTRY,
  DEFAULT_DISCOVERY_STATE,
  DEFAULT_LOCATION_NAMES,
  createBoardState,
  createHubState,
  deepCloneSerializable,
  ensureBoardState,
  ensureDiscoveryState,
  ensureHubState,
  ensureLocationNamesState,
  getLocalState,
  rebuildBoardOccupancy,
} from "./state/board-legacy.js";
import {
  ensurePawnCollectionState,
  ensurePawnRoleFields,
  ensurePawnSystems,
  getPawns,
} from "./state/pawn-legacy.js";

export {
  ensureDiscoveryState,
  ensureHubState,
  ensureLocationNamesState,
  getVisibleEnvColCount,
  initializeInstanceFromDef,
  isEnvColExposed,
  isEnvColRevealed,
  isHubRenameUnlocked,
  isHubVisible,
  makeEnvEventInstance,
  makeEnvStructureInstance,
  makeEnvTileInstance,
  makeHubStructureInstance,
  rebuildBoardOccupancy,
  rebuildHubOccupancy,
} from "./state/board-legacy.js";
export {
  buildPawnSystemDefaults,
  ensurePawnAI,
  ensurePawnSkillFields,
  ensurePawnSystems,
  getPawns,
} from "./state/pawn-legacy.js";

// =============================================================================
// PHASE / PAUSE POLICY
// =============================================================================

// Single source of truth for pause → phase semantics.
// POLICY ONLY: phase remains non-authoritative.
export function syncPhaseToPaused(state) {
  if (!state) return;
  state.phase = state.paused ? "planning" : "simulation";
}

// =============================================================================
// CORE STATE
// =============================================================================

export function createEmptyState(
  seed = 123456789,
  worldDefinitionId = "riverBasin01",
  worldDraft = null
) {
  const detailedState = {
    resources: {
      gold: 0,
      grain: 0,
      food: 0,
      population: INITIAL_POPULATION_DEFAULT,
    },
    board: createBoardState(),
    hub: createHubState(),
    locationNames: { ...DEFAULT_LOCATION_NAMES },
    discovery: {
      envCols: new Array(BOARD_COLS).fill(null).map(() => ({
        exposed: DEFAULT_DISCOVERY_ENTRY.exposed,
        revealed: DEFAULT_DISCOVERY_ENTRY.revealed,
      })),
      hubVisible: DEFAULT_DISCOVERY_STATE.hubVisible,
      hubRenameUnlocked: DEFAULT_DISCOVERY_STATE.hubRenameUnlocked,
    },
    currentSeasonDeck: null,
    activeEnvEventRuns: {},
    ownerInventories: {},
    pawns: [],
    passiveTimingRuntime: null,
  };
  const rngOwner = { rng: {
    seed,
    baseSeed: seed,
    vassalSeed: (Math.floor(seed) ^ 0x56a55a19) | 0,
    vassalDevelopmentSeed: (Math.floor(seed) ^ 0x3d7e10af) | 0,
    vassalLifeMapSeed: (Math.floor(seed) ^ 0x19a7c4e3) | 0,
    vassalPortraitSeed: (Math.floor(seed) ^ 0x2f6e2b1d) | 0,
  } };
  attachRngHelpers(rngOwner);
  const world = createWorldState(
    worldDefinitionId,
    detailedState,
    worldDraft,
    rngOwner.rngNextInt
  );
  const initialDetailedSite = world.sites.find((site) => site?.simulationMode === "detailed") ?? null;
  const state = {
    gameStateSchemaVersion: 20,
    phase: "simulation",
    turn: 0,
    seasons: SEASONS,
    currentSeasonIndex: 0,
    year: 1,

    // Time Axis (Integer-based)
    // simStepIndex: Master clock, increments +1 per fixed tick (1/60s).
    // tSec: Derived integer seconds = floor(simStepIndex / 60).
    simStepIndex: 0,
    tSec: 0,

    // Remaining seconds in the current season (derived from seasonClockSec).
    seasonTimeRemaining: 0,
    seasonDurationSec: SEASON_DURATION_SEC,

    simTime: 0, // Accumulator for floating point calculations if needed

    // Season clock accumulator (decoupled from planning/boundary indices).
    seasonClockSec: 0,

    paused: false,

    // Action Points (Skeleton)
    actionPoints: 100,
    actionPointCap: 100,
    apCapOverride: null,
    variantFlags: normalizeVariantFlags(null),
    gameConfig: createAuthoredGameConfig(),

    world,
    civilization: {
      capitalRegionId: initialDetailedSite?.regionId ?? null,
      capitalSiteId: initialDetailedSite?.id ?? null,
      chaos: {
        chaosPower: 0,
        monsterCount: 0,
        monsterLossThreshold: 1000,
        lastMoonIncome: null,
        pendingLosses: {
          prematureDeaths: 0,
          oldAgeDeaths: 0,
          externalEmigrants: 0,
          internalMigrants: 0,
        },
      },
      vassalLineage: {
        nextVassalId: 1,
        currentVassalId: null,
        selectedVassalIds: [],
        vassalsById: {},
        pendingCandidates: [],
        candidateRerollCount: 0,
      },
    },
    nextHubStructureInstanceId: 1,
    nextEnvStructureInstanceId: 1,
    nextEnvInstanceId: 1,

    nextItemId: 1,
    nextSettlementCardInstanceId: 1,
    nextPopulationCommitmentId: 1,

    nextPawnId: 101,
    nextFollowerCreationOrderIndex: 1,
    gameEventFeed: [],
    nextGameEventFeedId: 1,
    skillProgressionDefs: null,
    skillRuntime: null,
    persistentKnowledge: {
      droppedItemKindsByPoolId: {},
      maxObservedCivilizationSurvivalYear: null,
    },

    rng: rngOwner.rng,
  };

  ensureSkillRuntimeState(state);
  ensurePersistentKnowledgeState(state);
  attachRngHelpers(state);
  return state;
}

// Singleton used by the running game at the app edge.
export const gameState = createEmptyState();

// =============================================================================
// SEASON EVENT DECKS (tile-driven)
// =============================================================================

function pickWeightedDefId(rng, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  if (!rng || typeof rng.nextFloat !== "function") return null;

  let total = 0;
  const weights = new Array(entries.length);
  for (let i = 0; i < entries.length; i++) {
    const weight = Number.isFinite(entries[i]?.weight)
      ? Math.max(0, entries[i].weight)
      : 0;
    weights[i] = weight;
    total += weight;
  }

  if (total <= 0) return null;

  const roll = rng.nextFloat() * total;
  let acc = 0;
  for (let i = 0; i < entries.length; i++) {
    acc += weights[i];
    if (roll < acc) return entries[i]?.defId ?? null;
  }

  return entries[entries.length - 1]?.defId ?? null;
}

function getOrderedTileAnchors(state) {
  const local = getLocalState(state);
  const anchors = Array.isArray(local?.board?.layers?.tile?.anchors)
    ? local.board.layers.tile.anchors
    : [];
  const ordered = anchors.map((anchor, index) => ({
    anchor,
    index,
    col: Number.isFinite(anchor?.col) ? Math.floor(anchor.col) : 0,
  }));
  ordered.sort((a, b) => (a.col - b.col) || (a.index - b.index));
  return ordered.map((entry) => entry.anchor);
}

function shuffleDeckInPlace(rng, deck) {
  if (!Array.isArray(deck) || deck.length < 2) return;
  if (!rng || typeof rng.nextInt !== "function") return;
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    if (i === j) continue;
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
}

function deriveSeasonDeckSeed(state) {
  const baseSeed = Number.isFinite(state?.rng?.baseSeed)
    ? Math.floor(state.rng.baseSeed)
    : Number.isFinite(state?.rng?.seed)
      ? Math.floor(state.rng.seed)
      : 0;
  const year = Number.isFinite(state?.year) ? Math.floor(state.year) : 0;
  const seasonIndex = Number.isFinite(state?.currentSeasonIndex)
    ? Math.floor(state.currentSeasonIndex)
    : 0;
  let seed = baseSeed | 0;
  seed = Math.imul(seed ^ (year + 0x9e3779b9), 0x85ebca6b);
  seed = Math.imul(seed ^ (seasonIndex + 0x7f4a7c15), 0xc2b2ae35);
  return seed | 0;
}

export function buildSeasonDeckForCurrentSeason(state) {
  if (!state) return null;
  const seasonKey = getCurrentSeasonKey(state);
  const seasonIndex = Number.isFinite(state?.currentSeasonIndex)
    ? Math.floor(state.currentSeasonIndex)
    : 0;
  const year = Number.isFinite(state?.year) ? Math.floor(state.year) : 1;
  const deck = [];
  const rng = createRng(deriveSeasonDeckSeed(state));

  for (const anchor of getOrderedTileAnchors(state)) {
    if (!anchor) continue;
    const def = envTileDefs[anchor.defId];
    const table = def?.seasonTables?.[seasonKey];
    if (!Array.isArray(table) || table.length === 0) continue;

    const defId = pickWeightedDefId(rng, table);
    if (!defId) continue;

    deck.push({ defId });
  }

  // Shuffle so draw order is not tied to tile columns.
  shuffleDeckInPlace(rng, deck);
  const local = getLocalState(state);
  local.currentSeasonDeck = { seasonKey, seasonIndex, year, deck };
  return local.currentSeasonDeck;
}

export function getCurrentSeasonKey(state) {
  return state.seasons[state.currentSeasonIndex];
}

export function getCurrentSeasonData(state) {
  const seasonKey = getCurrentSeasonKey(state);
  const deck = getLocalState(state).currentSeasonDeck;
  if (deck && deck.seasonKey === seasonKey) return deck;
  return {
    seasonKey,
    seasonIndex: Number.isFinite(state?.currentSeasonIndex)
      ? Math.floor(state.currentSeasonIndex)
      : 0,
    year: Number.isFinite(state?.year) ? Math.floor(state.year) : 1,
    deck: [],
  };
}

export function drawSeasonDeckEntry(state) {
  const seasonKey = getCurrentSeasonKey(state);
  const deck = getLocalState(state).currentSeasonDeck;
  if (!deck || deck.seasonKey !== seasonKey) return null;
  if (!Array.isArray(deck.deck) || deck.deck.length === 0) return null;
  return deck.deck.shift();
}

// =============================================================================
// SERIALIZATION (core-only)
// =============================================================================

function rebuildInventoryDerived(inv) {
  if (!inv) return;

  // Ensure structural fields exist
  inv.items = Array.isArray(inv.items) ? inv.items : [];
  inv.cols = typeof inv.cols === "number" ? inv.cols : 0;
  inv.rows = typeof inv.rows === "number" ? inv.rows : 0;

  // Rebuild itemsById to reference the SAME objects as inv.items
  const itemsById = {};
  for (const it of inv.items) {
    if (!it || it.id == null) continue;
    itemsById[it.id] = it;
  }
  inv.itemsById = itemsById;

  // Rebuild grid defensively from items (ids only)
  const cellCount = Math.max(0, inv.cols * inv.rows);
  const grid = new Array(cellCount).fill(null);

  for (const it of inv.items) {
    if (!it) continue;
    const w = typeof it.width === "number" ? it.width : 1;
    const h = typeof it.height === "number" ? it.height : 1;
    const gx = typeof it.gridX === "number" ? it.gridX : 0;
    const gy = typeof it.gridY === "number" ? it.gridY : 0;

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const x = gx + dx;
        const y = gy + dy;
        if (x < 0 || y < 0 || x >= inv.cols || y >= inv.rows) continue;
        const idx = y * inv.cols + x;
        grid[idx] = it.id;
      }
    }
  }

  inv.grid = grid;
  inv.version = inv.version ?? 0;
}

export function serializeGameState(state) {
  const clean = JSON.parse(JSON.stringify(state));

  delete clean.rngNextFloat;
  delete clean.rngNextInt;
  delete clean.rngNextVassalFloat;
  delete clean.rngNextVassalInt;
  delete clean.rngNextVassalDevelopmentFloat;
  delete clean.rngNextVassalDevelopmentInt;
  delete clean.rngNextVassalLifeMapFloat;
  delete clean.rngNextVassalLifeMapInt;
  delete clean.rngNextVassalPortraitFloat;
  delete clean.rngNextVassalPortraitInt;
  delete clean._boardDirty;
  delete clean._seasonChanged;
  for (const site of Array.isArray(clean?.world?.sites) ? clean.world.sites : []) {
    const local = site?.detailedState;
    if (!local) continue;
    for (const slot of local.practiceSlots ?? []) {
      if (slot && slot.tier == null) slot.tier = "bronze";
    }
    if (local.board?.occ) delete local.board.occ;
    if (local.hub) {
      delete local.hub.occ;
      delete local.hub.anchors;
    }
    for (const inv of Object.values(local.ownerInventories ?? {})) {
      if (!inv) continue;
      delete inv.itemsById;
      delete inv.grid;
    }
  }
  if (clean.permanentSlots) delete clean.permanentSlots;
  if (clean.nextPermanentInstanceId) delete clean.nextPermanentInstanceId;
  if (clean.envSlots) delete clean.envSlots;
  if (clean.envSlotsEnabled != null) delete clean.envSlotsEnabled;

  return clean;
}

export function deserializeGameState(data) {
  const raw = typeof data === "string" ? JSON.parse(data) : data;

  // CRITICAL: deep clone to avoid mutating stored snapshots (timeline/checkpoints).
  const state = deepCloneSerializable(raw);
  if (state?.gameStateSchemaVersion !== 20) {
    throw new Error("Unsupported game-state schema: expected v20");
  }
  const gameConfigValidation = validateGameConfig(state.gameConfig);
  if (!gameConfigValidation.ok) {
    throw new Error(`Invalid serialized game config: ${gameConfigValidation.errors.join("; ")}`);
  }
  state.gameConfig = canonicalizeGameConfig(state.gameConfig);
  canonicalizeWorldState(state);
  const worldValidation = validateWorldState(state);
  if (!worldValidation.ok) {
    throw new Error(`Invalid serialized world state: ${worldValidation.errors.join("; ")}`);
  }
  const vassalValidation = validateVassalLifeMapState(state);
  if (!vassalValidation.ok) {
    throw new Error(`Invalid serialized Vassal Life Map: ${vassalValidation.errors.join("; ")}`);
  }
  if (!state.rng || !Number.isFinite(state.rng.seed) || !Number.isFinite(state.rng.baseSeed)
      || !Number.isFinite(state.rng.vassalSeed)
      || !Number.isFinite(state.rng.vassalDevelopmentSeed)
      || !Number.isFinite(state.rng.vassalLifeMapSeed)
      || !Number.isFinite(state.rng.vassalPortraitSeed)) {
    throw new Error("Invalid serialized RNG state");
  }
  attachRngHelpers(state);
  state._boardDirty = false;
  state._seasonChanged = false;
  syncPhaseToPaused(state);
  return state;

  const local = getLocalState(state);

  // Ensure defaults
  if (!state.rng) state.rng = { seed: 123456789, baseSeed: 123456789 };
  if (!Number.isFinite(state.rng.seed)) {
    state.rng.seed = Number.isFinite(state.rng.baseSeed)
      ? Math.floor(state.rng.baseSeed)
      : 123456789;
  }
  if (!Number.isFinite(state.rng.baseSeed)) {
    state.rng.baseSeed = Math.floor(state.rng.seed ?? 123456789);
  }
  if (!local.resources) {
    local.resources = {
      gold: 0,
      grain: 0,
      food: 0,
      population: INITIAL_POPULATION_DEFAULT,
    };
  }
  if (!Number.isFinite(local.resources.gold)) local.resources.gold = 0;
  if (!Number.isFinite(local.resources.grain)) local.resources.grain = 0;
  if (!Number.isFinite(local.resources.food)) local.resources.food = 0;
  if (!Number.isFinite(local.resources.population)) {
    local.resources.population = INITIAL_POPULATION_DEFAULT;
  }
  if (state.envSlots) delete state.envSlots;
  if (state.envSlotsEnabled != null) delete state.envSlotsEnabled;
  if (!local.hub || typeof local.hub !== "object") local.hub = createHubState();
  ensureLocationNamesState(state);
  ensureDiscoveryState(state);
  const pawns = ensurePawnCollectionState(state);
  if (!state.seasons) state.seasons = SEASONS;
  if (!local.ownerInventories) local.ownerInventories = {};
  if (!Array.isArray(state.gameEventFeed)) state.gameEventFeed = [];
  ensurePersistentKnowledgeState(state);
  if (
    !state.skillProgressionDefs ||
    typeof state.skillProgressionDefs !== "object" ||
    Array.isArray(state.skillProgressionDefs)
  ) {
    state.skillProgressionDefs = null;
  }
  if (!Number.isFinite(state.nextGameEventFeedId)) {
    let maxEventId = 0;
    for (const entry of state.gameEventFeed) {
      const id = Number.isFinite(entry?.id) ? Math.floor(entry.id) : 0;
      if (id > maxEventId) maxEventId = id;
    }
    state.nextGameEventFeedId = Math.max(1, maxEventId + 1);
  }
  if (
    local.currentSeasonDeck != null &&
    typeof local.currentSeasonDeck !== "object"
  ) {
    local.currentSeasonDeck = null;
  } else if (local.currentSeasonDeck) {
    if (!Array.isArray(local.currentSeasonDeck.deck)) {
      local.currentSeasonDeck.deck = [];
    }
    if (typeof local.currentSeasonDeck.seasonKey !== "string") {
      local.currentSeasonDeck.seasonKey = getCurrentSeasonKey(state);
    }
    if (!Number.isFinite(local.currentSeasonDeck.seasonIndex)) {
      local.currentSeasonDeck.seasonIndex = Number.isFinite(state?.currentSeasonIndex)
        ? Math.floor(state.currentSeasonIndex)
        : 0;
    }
    if (!Number.isFinite(local.currentSeasonDeck.year)) {
      local.currentSeasonDeck.year = Number.isFinite(state?.year)
        ? Math.floor(state.year)
        : 1;
    }
  }
  if (
    !local.activeEnvEventRuns ||
    typeof local.activeEnvEventRuns !== "object" ||
    Array.isArray(local.activeEnvEventRuns)
  ) {
    local.activeEnvEventRuns = {};
  } else {
    const normalizedRuns = {};
    for (const [aggregateKey, rawRun] of Object.entries(local.activeEnvEventRuns)) {
      if (!rawRun || typeof rawRun !== "object" || Array.isArray(rawRun)) continue;
      const defId = typeof rawRun.defId === "string" ? rawRun.defId : null;
      if (!defId) continue;
      normalizedRuns[String(aggregateKey)] = {
        defId,
        aggregateKey:
          typeof rawRun.aggregateKey === "string" && rawRun.aggregateKey.length > 0
            ? rawRun.aggregateKey
            : String(aggregateKey),
        sourceYear: Number.isFinite(rawRun.sourceYear)
          ? Math.floor(rawRun.sourceYear)
          : Number.isFinite(state?.year)
            ? Math.floor(state.year)
            : 1,
        sourceSeasonIndex: Number.isFinite(rawRun.sourceSeasonIndex)
          ? Math.floor(rawRun.sourceSeasonIndex)
          : Number.isFinite(state?.currentSeasonIndex)
            ? Math.floor(state.currentSeasonIndex)
            : 0,
        firstDrawSec: Number.isFinite(rawRun.firstDrawSec)
          ? Math.max(0, Math.floor(rawRun.firstDrawSec))
          : 0,
        cardsDrawn: Number.isFinite(rawRun.cardsDrawn)
          ? Math.max(1, Math.floor(rawRun.cardsDrawn))
          : 1,
        magnitudeId:
          typeof rawRun.magnitudeId === "string" ? rawRun.magnitudeId : null,
        expiresSec: Number.isFinite(rawRun.expiresSec)
          ? Math.max(0, Math.floor(rawRun.expiresSec))
          : 0,
      };
    }
    local.activeEnvEventRuns = normalizedRuns;
  }
  ensureBoardState(state);
  ensureDiscoveryState(state);
  ensureHubState(state);
  let nextFollowerIndex = Number.isFinite(state.nextFollowerCreationOrderIndex)
    ? Math.floor(state.nextFollowerCreationOrderIndex)
    : 1;
  let maxFollowerIndex = 0;

  for (const pawn of pawns) {
    ensurePawnSystems(pawn);
    if (pawn?.role !== "leader" && pawn?.role !== "follower") {
      pawn.role = "leader";
    }
    if (pawn?.role === "follower" && Number.isFinite(pawn.followerCreationOrderIndex)) {
      maxFollowerIndex = Math.max(
        maxFollowerIndex,
        Math.floor(pawn.followerCreationOrderIndex)
      );
    }
  }

  if (nextFollowerIndex <= maxFollowerIndex) {
    nextFollowerIndex = maxFollowerIndex + 1;
  }

  for (const pawn of pawns) {
    if (pawn?.role === "follower" && !Number.isFinite(pawn.followerCreationOrderIndex)) {
      ensurePawnRoleFields(state, pawn, nextFollowerIndex++);
      continue;
    }
    ensurePawnRoleFields(state, pawn, null);
  }
  state.nextFollowerCreationOrderIndex = nextFollowerIndex;
  state._boardDirty = false;
  state._seasonChanged = false;
  ensureSkillRuntimeState(state);

  // New integer time defaults if missing from save
  if (state.simStepIndex == null) state.simStepIndex = 0;
  if (state.tSec == null) state.tSec = 0;
  if (state.year == null) state.year = 1;
  if (state.actionPoints == null) state.actionPoints = 100;
  if (state.actionPointCap == null) state.actionPointCap = 100;
  if (state.nextHubStructureInstanceId == null) {
    state.nextHubStructureInstanceId = 1;
  }
  if (!Number.isFinite(state.nextEnvStructureInstanceId)) {
    let maxEnvStructureId = 0;
    const anchors = Array.isArray(local?.board?.layers?.envStructure?.anchors)
      ? local.board.layers.envStructure.anchors
      : [];
    for (const anchor of anchors) {
      const id = Number.isFinite(anchor?.instanceId)
        ? Math.floor(anchor.instanceId)
        : 0;
      if (id > maxEnvStructureId) maxEnvStructureId = id;
    }
    state.nextEnvStructureInstanceId = Math.max(1, maxEnvStructureId + 1);
  }
  if (!Number.isFinite(state.nextPawnId)) {
    state.nextPawnId = 101;
  }
  if (!Number.isFinite(state.nextSettlementCardInstanceId)) {
    state.nextSettlementCardInstanceId = 1;
  }
  if (!Number.isFinite(state.nextPopulationCommitmentId)) {
    state.nextPopulationCommitmentId = 1;
  }
  if (!state.apCapOverride || typeof state.apCapOverride !== "object") {
    state.apCapOverride = null;
  } else if (state.apCapOverride.enabled === false) {
    state.apCapOverride = null;
  }
  state.variantFlags = normalizeVariantFlags(state.variantFlags);

  // Season clock defaults
  if (state.seasonClockSec == null) state.seasonClockSec = 0;

  // Ensure defaults
  if (state.seasonDurationSec == null)
    state.seasonDurationSec = SEASON_DURATION_SEC;

  if (state.paused == null) state.paused = false;

  // Normalize phase after paused is known.
  syncPhaseToPaused(state);

  if (state.apCapOverride) {
    const overrideCap =
      typeof state.apCapOverride.cap === "number"
        ? Math.max(0, Math.floor(state.apCapOverride.cap))
        : state.actionPointCap;
    const overridePoints =
      typeof state.apCapOverride.points === "number"
        ? Math.floor(state.apCapOverride.points)
        : state.actionPoints;

    state.apCapOverride.enabled = true;
    state.apCapOverride.cap = overrideCap;
    state.apCapOverride.points = overridePoints;

    state.actionPointCap = overrideCap;
    state.actionPoints = Math.min(
      state.actionPointCap,
      Math.max(0, overridePoints)
    );
  } else {
    const baseCap = getActionPointCapAtSecond(state.tSec ?? 0);
    const skillCapBonus = Math.floor(
      getGlobalSkillModifier(state, "apCapBonus", 0)
    );
    state.actionPointCap = Math.max(0, baseCap + skillCapBonus);
    // Enforce Cap Clamp immediately on load (in case save data is over-cap)
    state.actionPoints = Math.min(state.actionPoints, state.actionPointCap);
  }

  // Rebuild derived inventory indices after JSON clone / replay.
  for (const inv of Object.values(local.ownerInventories)) {
    rebuildInventoryDerived(inv);
  }

  const eventAnchors = Array.isArray(local?.board?.layers?.event?.anchors)
    ? local.board.layers.event.anchors
    : [];
  for (const anchor of eventAnchors) {
    if (!anchor || typeof anchor !== "object") continue;
    if (!anchor.props || typeof anchor.props !== "object" || Array.isArray(anchor.props)) {
      anchor.props = {};
    }
  }

  rebuildBoardOccupancy(state);
  attachRngHelpers(state);
  return state;
}

export function validateState(state) {
  const errors = [];
  const warnings = [];

  if (!state || typeof state !== "object") {
    errors.push("state missing");
    return { ok: false, errors, warnings };
  }

  const board = getLocalState(state).board;
  if (!board || typeof board !== "object") {
    errors.push("board missing");
    return { ok: false, errors, warnings };
  }

  const cols = Number.isFinite(board.cols) ? Math.floor(board.cols) : null;
  if (!cols || cols <= 0) {
    errors.push("board.cols invalid");
    return { ok: false, errors, warnings };
  }
  const hub = getLocalState(state).hub;
  if (!hub || typeof hub !== "object") {
    errors.push("hub missing");
  }
  const hubCols = Array.isArray(hub?.slots) ? hub.slots.length : 0;

  const pawns = getPawns(state);
  for (const pawn of pawns) {
    const hasHub = Number.isFinite(pawn?.hubCol);
    const hasEnv = Number.isFinite(pawn?.envCol);
    if (hasHub && hasEnv) {
      warnings.push(
        `pawn has both hubCol and envCol: ${pawn.id ?? "unknown"}`
      );
    }
    if (hasHub) {
      const col = Math.floor(pawn.hubCol);
      if (col < 0 || col >= hubCols) {
        errors.push(`pawn hubCol out of bounds: ${pawn.id ?? "unknown"}`);
      }
    }
    if (hasEnv) {
      const col = Math.floor(pawn.envCol);
      if (col < 0 || col >= cols) {
        errors.push(`pawn envCol out of bounds: ${pawn.id ?? "unknown"}`);
      }
    }
  }

  const occ = board.occ || {};
  for (const layer of BOARD_LAYERS) {
    const anchors = Array.isArray(board.layers?.[layer]?.anchors)
      ? board.layers[layer].anchors
      : null;
    if (!anchors) {
      errors.push(`board.layers.${layer}.anchors missing`);
      continue;
    }

    const occLayer = occ[layer];
    if (!Array.isArray(occLayer) || occLayer.length !== cols) {
      errors.push(`board.occ.${layer} length mismatch`);
      continue;
    }

    const expected = new Array(cols).fill(null);
    for (const anchor of anchors) {
      if (!anchor) continue;
      const rawCol = anchor.col;
      if (!Number.isFinite(rawCol)) {
        errors.push(`anchor missing col in layer ${layer}`);
        continue;
      }
      const col = Math.floor(rawCol);
      const rawSpan = anchor.span;
      if (!Number.isFinite(rawSpan) || rawSpan <= 0) {
        errors.push(`anchor span invalid in layer ${layer}`);
        continue;
      }
      const span = Math.floor(rawSpan);
      for (let offset = 0; offset < span; offset++) {
        const occCol = col + offset;
        if (occCol < 0 || occCol >= cols) {
          errors.push(`anchor out of bounds in layer ${layer}`);
          continue;
        }
        expected[occCol] = anchor;
      }
    }

    for (let col = 0; col < cols; col++) {
      const actual = occLayer[col];
      const exp = expected[col];
      if (exp === actual) continue;
      if (exp?.instanceId != null && actual?.instanceId != null) {
        if (exp.instanceId === actual.instanceId) continue;
      }
      if (exp || actual) {
        errors.push(`board.occ.${layer}[${col}] mismatch`);
      }
    }
  }

  if (!hub || typeof hub !== "object") {
    return { ok: errors.length === 0, errors, warnings };
  }

  const hubAnchors = Array.isArray(hub.anchors) ? hub.anchors : null;
  if (!hubAnchors) {
    errors.push("hub.anchors missing");
  }

  if (!Array.isArray(hub.occ) || hub.occ.length !== hubCols) {
    errors.push("hub.occ length mismatch");
  } else if (hubAnchors) {
    const expected = new Array(hubCols).fill(null);
    for (const anchor of hubAnchors) {
      if (!anchor) continue;
      const rawCol = anchor.col;
      if (!Number.isFinite(rawCol)) {
        errors.push("hub anchor missing col");
        continue;
      }
      const col = Math.floor(rawCol);
      const rawSpan = anchor.span;
      if (!Number.isFinite(rawSpan) || rawSpan <= 0) {
        errors.push("hub anchor span invalid");
        continue;
      }
      const span = Math.floor(rawSpan);
      for (let offset = 0; offset < span; offset++) {
        const occCol = col + offset;
        if (occCol < 0 || occCol >= hubCols) {
          errors.push("hub anchor out of bounds");
          continue;
        }
        expected[occCol] = anchor;
      }
    }

    for (let col = 0; col < hubCols; col++) {
      const actual = hub.occ[col];
      const exp = expected[col];
      if (exp === actual) continue;
      if (exp?.instanceId != null && actual?.instanceId != null) {
        if (exp.instanceId === actual.instanceId) continue;
      }
      if (exp || actual) {
        errors.push(`hub.occ[${col}] mismatch`);
      }
    }
  }

  for (let col = 0; col < hubCols; col++) {
    const slot = hub.slots?.[col];
    const structure = slot?.structure;
    if (!structure) continue;
    if (!Number.isFinite(structure.col) || Math.floor(structure.col) !== col) {
      errors.push(`hub slot col mismatch at ${col}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// App-edge only: explicitly mutates the singleton.
export function loadIntoGameState(data) {
  const loaded = deserializeGameState(data);
  Object.keys(gameState).forEach((k) => delete gameState[k]);
  Object.assign(gameState, loaded);
  attachRngHelpers(gameState);
}

// Fast path for already-materialized canonical states (e.g. timeline rebuilds).
// Avoids serialize/deserialize roundtrips when callers already hold a full state object.
export function loadStateObjectIntoGameState(stateObj) {
  if (!stateObj || typeof stateObj !== "object") return;
  Object.keys(gameState).forEach((k) => delete gameState[k]);
  Object.assign(gameState, stateObj);
  attachRngHelpers(gameState);
}
