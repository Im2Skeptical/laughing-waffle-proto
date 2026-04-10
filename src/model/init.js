// init.js — scenario/setup assembly (NO core exports here besides init/createInitialState)

import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { envTileDefs } from "../defs/gamepieces/env-tiles-defs.js";
import { envStructureDefs } from "../defs/gamepieces/env-structures-defs.js";
import { envTagDefs } from "../defs/gamesystems/env-tags-defs.js";
import { envSystemDefs } from "../defs/gamesystems/env-systems-defs.js";
import { settlementOrderDefs } from "../defs/gamepieces/settlement-order-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import { setupDefs } from "../defs/gamesettings/scenarios-defs.js";
import { createEmptyLeaderEquipment } from "./equipment-rules.js";
import {
  INITIAL_POPULATION_DEFAULT,
  LEADER_FAITH_STARTING_TIER,
} from "../defs/gamesettings/gamerules-defs.js";
import { normalizeVariantFlags } from "../defs/gamesettings/variant-flags-defs.js";
import { getActionPointCapAtSecond } from "./moon.js";

import {
  createEmptyState,
  makeEnvTileInstance,
  makeEnvStructureInstance,
  makeHubStructureInstance,
  buildSeasonDeckForCurrentSeason,
  rebuildBoardOccupancy,
  buildPawnSystemDefaults,
  ensureDiscoveryState,
  ensureLocationNamesState,
} from "./state.js";
import {
  createSettlementCardInstance,
  ensureHubSettlementState,
} from "./settlement-state.js";
import { syncSettlementDerivedState } from "./settlement-exec.js";
import { stepSettlementOrders } from "./settlement-order-exec.js";
import {
  getDefaultSkillPointsForPawnDefId,
  getGlobalSkillModifier,
  getSkillNodeDef,
  getSkillNodeUnlockEffects,
} from "./skills.js";
import { runEffect } from "./effects/index.js";

import { Inventory } from "./inventory-model.js";

const HUB_COLS = 10;
const DEV =
  (typeof globalThis !== "undefined" && globalThis.__DEV__ === true) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV !== "production");

function cloneSerializable(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function applyInstanceOverrides(instance, spec) {
  if (!instance || !spec || typeof spec !== "object") return instance;
  for (const key of [
    "tier",
    "span",
    "tags",
    "tagStates",
    "props",
    "systemTiers",
    "systemState",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) continue;
    instance[key] = cloneSerializable(spec[key]);
  }
  return instance;
}

function ensureEnvTagSystems(instance) {
  if (!instance || !Array.isArray(instance.tags)) return;
  if (!instance.systemTiers || typeof instance.systemTiers !== "object") {
    instance.systemTiers = {};
  }
  if (!instance.systemState || typeof instance.systemState !== "object") {
    instance.systemState = {};
  }
  for (const tagId of instance.tags) {
    const tagDef = envTagDefs?.[tagId];
    const systems = Array.isArray(tagDef?.systems) ? tagDef.systems : [];
    for (const systemId of systems) {
      if (instance.systemTiers[systemId] == null) {
        const sysDef = envSystemDefs?.[systemId];
        if (typeof sysDef?.defaultTier === "string") {
          instance.systemTiers[systemId] = sysDef.defaultTier;
        }
      }
      if (!instance.systemState[systemId] && envSystemDefs?.[systemId]?.stateDefaults) {
        instance.systemState[systemId] = cloneSerializable(
          envSystemDefs[systemId].stateDefaults
        );
      }
    }
  }
}

function applySetupLocationNames(state, setup) {
  const raw = setup?.locationNames;
  if (!raw || typeof raw !== "object") return;
  const locationNames = ensureLocationNamesState(state);
  if (typeof raw.region === "string" && raw.region.trim().length > 0) {
    locationNames.region = raw.region.trim();
  }
  if (typeof raw.hub === "string" && raw.hub.trim().length > 0) {
    locationNames.hub = raw.hub.trim();
  }
}

function applySetupDiscoveryState(state, setup) {
  const raw = setup?.discovery;
  if (!raw || typeof raw !== "object") return;
  const discovery = ensureDiscoveryState(state);
  if (Array.isArray(raw.envCols)) {
    const max = Math.min(discovery.envCols.length, raw.envCols.length);
    for (let col = 0; col < max; col++) {
      const entry = raw.envCols[col];
      if (!entry || typeof entry !== "object") continue;
      if (typeof entry.exposed === "boolean") {
        discovery.envCols[col].exposed = entry.exposed;
      }
      if (typeof entry.revealed === "boolean") {
        discovery.envCols[col].revealed = entry.revealed;
      }
    }
  }
  if (typeof raw.hubVisible === "boolean") {
    discovery.hubVisible = raw.hubVisible;
  }
  if (typeof raw.hubRenameUnlocked === "boolean") {
    discovery.hubRenameUnlocked = raw.hubRenameUnlocked;
  }
}

function getSetupSkillProgressionDefs(setup) {
  const raw = setup?.skillProgressionDefs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return cloneSerializable(raw);
}

function normalizeUnlockedSkillNodeIds(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.length === 0) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function applyScenarioUnlockedSkillEffects(state) {
  const pawns = Array.isArray(state?.pawns) ? state.pawns : [];
  const nowSec = Number.isFinite(state?.tSec) ? Math.floor(state.tSec) : 0;

  for (const pawn of pawns) {
    if (!pawn || pawn.role !== "leader") continue;
    const nodeIds = Array.isArray(pawn.unlockedSkillNodeIds)
      ? pawn.unlockedSkillNodeIds
      : [];
    for (const nodeId of nodeIds) {
      const nodeDef = getSkillNodeDef(null, nodeId);
      if (!nodeDef) continue;
      const unlockEffects = getSkillNodeUnlockEffects(nodeDef);
      if (!unlockEffects.length) continue;
      runEffect(state, unlockEffects, {
        kind: "game",
        state,
        source: pawn,
        pawn,
        pawnId: pawn.id,
        ownerId: pawn.id,
        tSec: nowSec,
      });
    }
  }
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

function isSettlementPrototypeSetup(state) {
  return state?.variantFlags?.settlementPrototypeEnabled === true;
}

function resolveSettlementZoneSpecs(zoneSpec) {
  if (Array.isArray(zoneSpec?.slots)) return zoneSpec.slots;
  if (Array.isArray(zoneSpec)) return zoneSpec;
  return [];
}

function applySettlementCoreSpec(core, spec) {
  if (!core || !spec || typeof spec !== "object" || Array.isArray(spec)) return;
  if (spec.systemTiers && typeof spec.systemTiers === "object") {
    Object.assign(core.systemTiers, cloneSerializable(spec.systemTiers));
  }
  if (spec.systemState?.stockpiles && typeof spec.systemState.stockpiles === "object") {
    Object.assign(core.systemState.stockpiles, cloneSerializable(spec.systemState.stockpiles));
  }
  if (
    spec.systemState?.populationClasses &&
    typeof spec.systemState.populationClasses === "object"
  ) {
    core.systemState.populationClasses = cloneSerializable(spec.systemState.populationClasses);
  }
  if (spec.systemState?.chaosGods && typeof spec.systemState.chaosGods === "object") {
    core.systemState.chaosGods = cloneSerializable(spec.systemState.chaosGods);
  } else if (spec.systemState?.population && typeof spec.systemState.population === "object") {
    const faithTier =
      typeof spec.systemState?.faith?.tier === "string"
        ? spec.systemState.faith.tier
        : typeof spec.systemTiers?.faith === "string"
          ? spec.systemTiers.faith
          : "gold";
    core.systemState.populationClasses = {
      villager: {
        adults: Number.isFinite(spec.systemState.population.total)
          ? Math.max(0, Math.floor(spec.systemState.population.total))
          : 0,
        youth: 0,
        commitments: Array.isArray(spec.systemState.population.commitments)
          ? cloneSerializable(spec.systemState.population.commitments)
          : [],
        yearly: cloneSerializable(spec.systemState.population.yearly || {}),
        faith: {
          tier: faithTier,
        },
        happiness: cloneSerializable(spec.systemState.population.happiness || {}),
      },
    };
  }
  if (spec.props && typeof spec.props === "object") {
    Object.assign(core.props, cloneSerializable(spec.props));
  }
}

function buildSettlementCardSlots(state, zoneSpec, defs, cardKind, fallbackCount) {
  const specs = resolveSettlementZoneSpecs(zoneSpec);
  const slotCount =
    specs.length > 0
      ? specs.length
      : Number.isFinite(zoneSpec?.slotCount)
        ? Math.max(0, Math.floor(zoneSpec.slotCount))
        : fallbackCount;
  const slots = new Array(slotCount).fill(null).map(() => ({ card: null }));
  for (let index = 0; index < specs.length && index < slotCount; index += 1) {
    const rawSlot = specs[index];
    if (rawSlot == null) continue;
    const spec =
      rawSlot && typeof rawSlot === "object" && rawSlot.card ? rawSlot.card : rawSlot;
    const defId =
      typeof spec === "string"
        ? spec
        : typeof spec?.defId === "string"
          ? spec.defId
          : null;
    if (!defId || !defs[defId]) continue;
    slots[index].card = createSettlementCardInstance(defId, cardKind, state, spec);
  }
  return slots;
}

function buildSettlementStructureSlots(state, zoneSpec, slotCountHint) {
  const specs = resolveSettlementZoneSpecs(zoneSpec);
  const slotCount =
    specs.length > 0
      ? specs.length
      : Number.isFinite(zoneSpec?.slotCount)
        ? Math.max(1, Math.floor(zoneSpec.slotCount))
        : slotCountHint;
  const slots = new Array(slotCount).fill(null).map(() => ({ structure: null }));
  for (let index = 0; index < specs.length && index < slotCount; index += 1) {
    const rawSlot = specs[index];
    if (rawSlot == null) continue;
    const spec =
      rawSlot && typeof rawSlot === "object" && rawSlot.structure
        ? rawSlot.structure
        : rawSlot;
    const defId =
      typeof spec === "string"
        ? spec
        : typeof spec?.defId === "string"
          ? spec.defId
          : null;
    if (!defId || !hubStructureDefs[defId]) continue;
    const structure = makeHubStructureInstance(defId, state, {
      tier: typeof spec?.tier === "string" ? spec.tier : null,
    });
    applyInstanceOverrides(structure, spec);
    slots[index].structure = structure;
  }
  return slots;
}

function buildSettlementPrototypeHubState(state, setup, hubCols) {
  ensureHubSettlementState(state.hub, hubCols);
  const rawHub =
    setup?.hub && typeof setup.hub === "object" && !Array.isArray(setup.hub)
      ? setup.hub
      : {};
  if (Array.isArray(rawHub.classOrder)) {
    state.hub.classOrder = cloneSerializable(rawHub.classOrder);
  }
  ensureHubSettlementState(state.hub, hubCols);
  applySettlementCoreSpec(state.hub.core, setup?.hub?.core);
  ensureHubSettlementState(state.hub, hubCols);

  const rawZones =
    setup?.hub?.zones && typeof setup.hub.zones === "object" ? setup.hub.zones : {};
  state.hub.zones.order.slots = buildSettlementCardSlots(
    state,
    rawZones.order,
    settlementOrderDefs,
    "settlementOrder",
    1
  );
  const rawPracticeByClass =
    rawZones.practiceByClass && typeof rawZones.practiceByClass === "object"
      ? rawZones.practiceByClass
      : {};
  for (const classId of state.hub.classOrder || []) {
    const zoneSpec =
      rawPracticeByClass[classId] ??
      (classId === state.hub.classOrder[0] ? rawZones.practice : null);
    state.hub.zones.practiceByClass[classId].slots = buildSettlementCardSlots(
      state,
      zoneSpec,
      settlementPracticeDefs,
      "settlementPractice",
      5
    );
  }
  state.hub.zones.structures.slots = buildSettlementStructureSlots(
    state,
    rawZones.structures,
    hubCols
  );
  state.hub.slots = state.hub.zones.structures.slots;
  state.hub.cols = state.hub.slots.length;
  ensureHubSettlementState(state.hub, state.hub.cols);
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

  const state = createEmptyState(seed ?? setup.rngSeed ?? 123456789);
  state.variantFlags = normalizeVariantFlags(setup?.variantFlags);
  state.skillProgressionDefs = getSetupSkillProgressionDefs(setup);
  const skillDefsInput = state.skillProgressionDefs
    ? { skillProgressionDefs: state.skillProgressionDefs }
    : null;

  // baseline sim fields
  state.phase = "simulation";
  state.turn = 0;
  state.currentSeasonIndex = 0;
  state.year = 1;
  state.seasonTimeRemaining = 0;
  state.paused = false;

  // resources
  state.resources = {
    gold: 0,
    grain: 0,
    food: 0,
    population: INITIAL_POPULATION_DEFAULT,
    ...(setup.resources || {}),
  };

  // reset ids for deterministic scenario creation
  state.nextHubStructureInstanceId = 1;
  state.nextEnvStructureInstanceId = 1;
  state.nextEnvInstanceId = 1;
  state.nextItemId = 1;
  state.nextSettlementCardInstanceId = 1;
  state.nextPopulationCommitmentId = 1;
  state.nextPawnId = 101;
  state.nextFollowerCreationOrderIndex = 1;

  const boardCols = getBoardColsFromSetup(setup, state);
  const hubCols = getHubColsFromSetup(setup);
  ensureBoardCols(state, boardCols);
  if (!state.hub || typeof state.hub !== "object") {
    state.hub = { cols: hubCols, slots: [] };
  }
  state.hub.cols = hubCols;
  applySetupLocationNames(state, setup);
  applySetupDiscoveryState(state, setup);

  state.board.layers.envStructure.anchors = buildEnvStructureAnchors(
    setup,
    boardCols,
    state,
    { includeDefaultPortal: !isSettlementPrototypeSetup(state) }
  );
  state.board.layers.tile.anchors = buildTileAnchors(setup, boardCols, state);

  if (isSettlementPrototypeSetup(state)) {
    buildSettlementPrototypeHubState(state, setup, hubCols);
    state.pawns = [];
    state.ownerInventories = {};
    recomputeInitialActionPoints(state);
    buildSeasonDeckForCurrentSeason(state);
    rebuildBoardOccupancy(state);
    stepSettlementOrders(state, state.tSec);
    syncSettlementDerivedState(state, state.tSec);
    return state;
  }

  // hub structures
  state.hub.slots = buildHubSlots(setup, hubCols, state);
  state.hub.zones.structures.slots = state.hub.slots;

  // pawns
  const pawnSpecs =
    (Array.isArray(setup.pawns) ? setup.pawns : null) || [];
  const created = [];
  for (let index = 0; index < pawnSpecs.length; index++) {
    const c = pawnSpecs[index];
    const wantsEnvRow = c?.row === "env" || Number.isFinite(c?.envCol);
    const envCol = wantsEnvRow
      ? getColIndex({ envCol: c.envCol }, index, boardCols)
      : null;
    const hubCol = wantsEnvRow
      ? null
      : getColIndex({ hubCol: c.hubCol }, index, hubCols);
    const { systemTiers, systemState } = buildPawnSystemDefaults();
    const role = c?.role === "follower" ? "follower" : "leader";
    const pawnDefId =
      typeof c?.pawnDefId === "string" ? c.pawnDefId : "default";
    const pawn = {
      id: state.nextPawnId++,
      pawnDefId,
      name: c.name,
      color: c.color,
      hubCol,
      envCol,
      systemTiers,
      systemState,
      skillPoints: Number.isFinite(c?.skillPoints)
        ? Math.max(0, Math.floor(c.skillPoints))
        : getDefaultSkillPointsForPawnDefId(pawnDefId, skillDefsInput),
      unlockedSkillNodeIds: normalizeUnlockedSkillNodeIds(
        c?.unlockedSkillNodeIds
      ),
      props: {},
      role,
      leaderId: null,
      ai: {
        mode: null,
        assignedPlacement:
          envCol != null
            ? { hubCol: null, envCol }
            : { hubCol, envCol: null },
        returnState: "none",
        suppressAutoUntilSec: 0,
      },
    };
    if (role === "follower") {
      pawn.followerCreationOrderIndex = state.nextFollowerCreationOrderIndex++;
      pawn._leaderIndex = Number.isFinite(c?.leaderIndex)
        ? Math.floor(c.leaderIndex)
        : null;
      pawn._leaderId = Number.isFinite(c?.leaderId) ? Math.floor(c.leaderId) : null;
    } else {
      pawn.totalDepositedAmountByTier = {};
      pawn.prestigeCapBaseFromDeposits = 0;
      pawn.prestigeCapBonus = 0;
      pawn.prestigeCapBase = 0;
      pawn.prestigeCapDebt = 0;
      pawn.prestigeCapEffective = 0;
      pawn.prestigeDebtByFollowerId = {};
      pawn.workerCount = 0;
      pawn.equipment = createEmptyLeaderEquipment();
      pawn.leaderFaith = {
        tier: LEADER_FAITH_STARTING_TIER,
        eatStreak: 0,
        decayElapsedSec: 0,
        failedEatWarnActive: false,
      };
    }
    created.push(pawn);
  }

  for (const pawn of created) {
    if (pawn.role !== "follower") continue;
    const leaderId =
      Number.isFinite(pawn._leaderIndex) && created[pawn._leaderIndex]
        ? created[pawn._leaderIndex].id
        : Number.isFinite(pawn._leaderId)
        ? pawn._leaderId
        : null;
    pawn.leaderId = leaderId;
    delete pawn._leaderIndex;
    delete pawn._leaderId;
  }

  state.pawns = created;
  applyScenarioUnlockedSkillEffects(state);
  recomputeInitialActionPoints(state);

  // inventories
  state.ownerInventories = {};

  // hub structure inventories
  for (const slot of state.hub.slots) {
    const structure = slot.structure;
    if (!structure) continue;
    const def = hubStructureDefs[structure.defId];
    if (!def) continue;

    const invSpec = def.inventory ?? {};
    const cols = Number.isFinite(invSpec.cols) ? invSpec.cols : 5;
    const rows = Number.isFinite(invSpec.rows) ? invSpec.rows : 10;
    const inv = Inventory.create(cols, rows);
    Inventory.init(inv);
    inv.version = 0;
    state.ownerInventories[structure.instanceId] = inv;
  }

  // pawn inventories
  for (const pawn of state.pawns) {
    const inv = Inventory.create(5, 3);
    Inventory.init(inv);
    inv.version = 0;
    state.ownerInventories[pawn.id] = inv;
  }

  // scenario-defined inventory items
  applySetupInventories(state, setup);

  // season deck (tile-driven)
  buildSeasonDeckForCurrentSeason(state);

  rebuildBoardOccupancy(state);

  return state;
}

// Mutate an existing state object in-place (views call initGameState(gameState, "testing")).
export function initGameState(state, setupId = "devGym01") {
  const fresh = createInitialState(setupId, null);
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh);
  return state;
}

// ----- internal helpers -----

function applySetupInventories(state, setup) {
  const invSpecs = setup.inventories || [];
  if (invSpecs.length === 0) return;

  const hubStructureIdsInOrder = state.hub.slots.map(
    (s) => s?.structure?.instanceId ?? null
  );
  const pawnIdsInOrder = state.pawns.map((c) => c.id);
  const leaderPawnIdsInOrder = state.pawns
    .filter((pawn) => pawn?.role === "leader")
    .map((pawn) => pawn.id);

  for (const spec of invSpecs) {
    const owner = spec.owner;
    if (!owner) continue;

    let ownerId = null;

    if (owner.type === "hubStructure") {
      const idx =
        Number.isFinite(owner.hubCol)
          ? getColIndex(owner, owner.index ?? 0, hubStructureIdsInOrder.length)
          : owner.index;
      ownerId = hubStructureIdsInOrder[idx];
    } else if (owner.type === "hubSlot") {
      ownerId =
        hubStructureIdsInOrder[
          getColIndex(owner, owner.index ?? 0, hubStructureIdsInOrder.length)
        ];
    } else if (owner.type === "leaderPawn") {
      ownerId = leaderPawnIdsInOrder[owner.index];
    } else if (owner.type === "pawn") {
      ownerId = pawnIdsInOrder[owner.index];
    }

    if (!ownerId) continue;

    const inv = state.ownerInventories[ownerId];
    if (!inv) continue;

    for (const it of spec.items || []) {
      const item = Inventory.addNewItem(state, inv, {
        kind: it.kind,
        width: it.width ?? 1,
        height: it.height ?? 1,
        quantity: it.quantity ?? 1,
        gridX: it.gridX ?? 0,
        gridY: it.gridY ?? 0,
      });

    }

    inv.version = (inv.version ?? 0) + 1;
  }
}

function getBoardColsFromSetup(setup, state) {
  const candidate = setup?.board?.cols;
  if (Number.isFinite(candidate)) return Math.max(1, Math.floor(candidate));
  return Number.isFinite(state?.board?.cols) ? Math.floor(state.board.cols) : 12;
}

function getHubColsFromSetup(setup) {
  const candidate = setup?.hub?.cols;
  if (Number.isFinite(candidate)) return Math.max(1, Math.floor(candidate));
  return HUB_COLS;
}

function ensureBoardCols(state, cols) {
  if (!state?.board) return;
  if (state.board.cols === cols) return;
  state.board.cols = cols;
  if (!state.board.layers) {
    state.board.layers = {
      tile: { anchors: [] },
      event: { anchors: [] },
      envStructure: { anchors: [] },
    };
  }
  if (!state.board.occ) {
    state.board.occ = { tile: [], event: [], envStructure: [] };
  }
  for (const layer of ["tile", "event", "envStructure"]) {
    state.board.occ[layer] = new Array(cols).fill(null);
    if (!state.board.layers[layer]) state.board.layers[layer] = { anchors: [] };
    if (!Array.isArray(state.board.layers[layer].anchors)) {
      state.board.layers[layer].anchors = [];
    }
  }
}

function getColIndex(spec, fallback, maxCols) {
  const raw = Number.isFinite(spec?.hubCol)
    ? spec.hubCol
    : Number.isFinite(spec?.envCol)
    ? spec.envCol
    : Number.isFinite(spec?.col)
    ? spec.col
    : fallback;
  const col = Number.isFinite(raw) ? Math.floor(raw) : 0;
  if (Number.isFinite(maxCols) && maxCols > 0) {
    return Math.max(0, Math.min(maxCols - 1, col));
  }
  return Math.max(0, col);
}

function buildHubSlots(setup, hubCols, state) {
  const slots = new Array(hubCols).fill(null).map(() => ({ structure: null }));
  const occupiedBy = new Array(hubCols).fill(null);
  const specs = Array.isArray(setup?.hub?.structures)
    ? setup.hub.structures
    : [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (!spec?.defId) continue;
    const def = hubStructureDefs[spec.defId];
    const span =
      Number.isFinite(spec.span) && spec.span > 0
        ? Math.floor(spec.span)
        : Number.isFinite(def?.defaultSpan) && def.defaultSpan > 0
          ? Math.floor(def.defaultSpan)
          : 1;
    if (span > hubCols) continue;
    let hubCol = getColIndex(spec, i, hubCols);
    if (hubCol < 0 || hubCol >= hubCols) continue;
    if (hubCol + span > hubCols) hubCol = hubCols - span;

    let blocked = false;
    for (let offset = 0; offset < span; offset++) {
      if (occupiedBy[hubCol + offset] != null) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const structure = makeHubStructureInstance(spec.defId, state, {
        tier: typeof spec.tier === "string" ? spec.tier : null,
    });
    applyInstanceOverrides(structure, spec);
    slots[hubCol] = {
      x: spec.x,
      y: spec.y,
      structure,
    };
    for (let offset = 0; offset < span; offset++) {
      occupiedBy[hubCol + offset] = structure.instanceId;
    }
  }
  return slots;
}

function buildEnvStructureAnchors(setup, boardCols, state, options = {}) {
  const setupSpecs = Array.isArray(setup?.board?.envStructures)
    ? setup.board.envStructures
    : [];
  const includeDefaultPortal = options?.includeDefaultPortal !== false;
  const specs =
    setupSpecs.length > 0
      ? setupSpecs
      : includeDefaultPortal
        ? [{ defId: "hubPortal", col: Math.floor((boardCols - 1) / 2) }]
        : [];
  const anchors = [];
  const occupiedBy = new Array(boardCols).fill(null);

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const rawDefId =
      typeof spec === "string"
        ? spec
        : typeof spec?.defId === "string"
        ? spec.defId
        : null;
    if (!rawDefId || !envStructureDefs[rawDefId]) {
      if (DEV) {
        console.warn(
          `[init] skipping unknown env structure defId "${rawDefId ?? "?"}" at index ${i}`
        );
      }
      continue;
    }

    const def = envStructureDefs[rawDefId];
    const defaultSpan =
      Number.isFinite(def?.defaultSpan) && def.defaultSpan > 0
        ? Math.floor(def.defaultSpan)
        : 1;
    const span =
      Number.isFinite(spec?.span) && spec.span > 0
        ? Math.floor(spec.span)
        : defaultSpan;
    if (span > boardCols) {
      if (DEV) {
        console.warn(
          `[init] skipping env structure "${rawDefId}" span ${span} > board cols ${boardCols}`
        );
      }
      continue;
    }

    let col = getColIndex(spec, i, boardCols);
    if (col + span > boardCols) col = boardCols - span;

    let blocked = false;
    for (let offset = 0; offset < span; offset++) {
      if (occupiedBy[col + offset] != null) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      if (DEV) {
        console.warn(
          `[init] skipping env structure "${rawDefId}" at col ${col}; occupied`
        );
      }
      continue;
    }

    const inst = makeEnvStructureInstance(rawDefId, state, col, span, {
      tier: typeof spec?.tier === "string" ? spec.tier : null,
    });
    applyInstanceOverrides(inst, spec);
    ensureEnvTagSystems(inst);
    anchors.push(inst);
    for (let offset = 0; offset < span; offset++) {
      occupiedBy[col + offset] = inst.instanceId;
    }
  }

  return anchors;
}

function buildTileAnchors(setup, boardCols, state) {
  const tileSpecs = setup?.board?.tiles ?? setup?.tiles ?? null;
  const anchors = [];

  if (Array.isArray(tileSpecs) && tileSpecs.length > 0) {
    if (typeof tileSpecs[0] === "string") {
      for (let col = 0; col < boardCols; col++) {
        const defId = tileSpecs[col % tileSpecs.length];
        if (!defId || !envTileDefs[defId]) continue;
        anchors.push(makeEnvTileInstance(defId, state, col, 1));
      }
      return anchors;
    }

    for (let i = 0; i < tileSpecs.length; i++) {
      const spec = tileSpecs[i];
      if (!spec?.defId || !envTileDefs[spec.defId]) continue;
      const col = getColIndex(spec, i, boardCols);
      const span =
        Number.isFinite(spec.span) && spec.span > 0 ? Math.floor(spec.span) : 1;
      const inst = makeEnvTileInstance(spec.defId, state, col, span);
      applyInstanceOverrides(inst, spec);
      ensureEnvTagSystems(inst);
      anchors.push(inst);
    }
    return anchors;
  }

  const tileDefIds = Object.keys(envTileDefs);
  const orderedTileDefIds =
    tileDefIds.length > 0 ? tileDefIds.slice().sort() : ["tile_floodplains"];
  for (let col = 0; col < boardCols; col++) {
    const defId = orderedTileDefIds[col % orderedTileDefIds.length];
    anchors.push(makeEnvTileInstance(defId, state, col, 1));
  }
  return anchors;
}

