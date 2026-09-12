// Legacy hub/board/env instance constructors and occupancy rebuilders.
// Pre-redesign substrate on the serialization/replay path.
// Do not add new detailed-settlement gameplay here.

import { hubStructureDefs } from "../../defs/gamepieces/hub-structure-defs.js";
import { hubSystemDefs } from "../../defs/gamesystems/hub-system-defs.js";
import { envEventDefs } from "../../defs/gamepieces/env-events-defs.js";
import { envTileDefs } from "../../defs/gamepieces/env-tiles-defs.js";
import { ensureHubSettlementState } from "../settlement-state.js";
import {
  ensureSettlementStructureUpgradeState,
  isUpgradeableSettlementStructureDef,
} from "../settlement-upgrades.js";
import { getPrimaryDetailedSiteState } from "../world-state.js";
// Occupancy DEV checks call validateState at call time, not module init.
import { validateState } from "../state.js";

const hubTagDefs = Object.freeze({});
const envStructureDefs = Object.freeze({});

export const BOARD_COLS = 12;
export const BOARD_LAYERS = ["tile", "event", "envStructure"];
const HUB_COLS = 10;
export const DEFAULT_LOCATION_NAMES = Object.freeze({
  region: "Region",
  hub: "Hub",
});
export const DEFAULT_DISCOVERY_ENTRY = Object.freeze({
  exposed: true,
  revealed: true,
});
export const DEFAULT_DISCOVERY_STATE = Object.freeze({
  envCols: [],
  hubVisible: true,
  hubRenameUnlocked: true,
});

// Board contract: layers.*.anchors are authoritative placements.
// board.occ.* is derived in rebuildBoardOccupancy and stripped on serialize.

const DEV =
  (typeof globalThis !== "undefined" && globalThis.__DEV__ === true) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV !== "production");

export function createBoardState(cols = BOARD_COLS) {
  const layers = {};
  const occ = {};
  for (const layer of BOARD_LAYERS) {
    layers[layer] = { anchors: [] };
    occ[layer] = new Array(cols).fill(null);
  }
  return {
    cols,
    layers,
    occ,
  };
}

export function createHubState(cols = HUB_COLS) {
  const safeCols = Number.isFinite(cols) && cols > 0 ? Math.floor(cols) : HUB_COLS;
  return ensureHubSettlementState({
    cols: safeCols,
    slots: new Array(safeCols).fill(null).map(() => ({ structure: null })),
    anchors: [],
    occ: new Array(safeCols).fill(null),
  }, safeCols);
}

export function getLocalState(state) {
  return getPrimaryDetailedSiteState(state) ?? state;
}

export function ensureBoardState(state) {
  const local = getLocalState(state);
  if (!local.board || typeof local.board !== "object") {
    local.board = createBoardState();
    return;
  }

  const board = local.board;
  const cols =
    typeof board.cols === "number" && board.cols > 0 ? board.cols : BOARD_COLS;
  board.cols = cols;

  if (!board.layers || typeof board.layers !== "object") {
    board.layers = {};
  }
  if (board.layers.permanent) delete board.layers.permanent;

  for (const layer of BOARD_LAYERS) {
    if (!board.layers[layer] || typeof board.layers[layer] !== "object") {
      board.layers[layer] = { anchors: [] };
    }
    if (!Array.isArray(board.layers[layer].anchors)) {
      board.layers[layer].anchors = [];
    }
  }

  if (!board.occ || typeof board.occ !== "object") {
    board.occ = {};
  }
  if (board.occ.permanent) delete board.occ.permanent;

  for (const layer of BOARD_LAYERS) {
    if (!Array.isArray(board.occ[layer]) || board.occ[layer].length !== cols) {
      board.occ[layer] = new Array(cols).fill(null);
    }
  }
}

export function ensureLocationNamesState(state) {
  if (!state || typeof state !== "object") {
    return { ...DEFAULT_LOCATION_NAMES };
  }
  const local = getLocalState(state);
  const raw = local.locationNames;
  const locationNames = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const region =
    typeof locationNames.region === "string" && locationNames.region.trim().length > 0
      ? locationNames.region.trim()
      : DEFAULT_LOCATION_NAMES.region;
  const hub =
    typeof locationNames.hub === "string" && locationNames.hub.trim().length > 0
      ? locationNames.hub.trim()
      : DEFAULT_LOCATION_NAMES.hub;
  local.locationNames = {
    region,
    hub,
  };
  return local.locationNames;
}

export function ensureDiscoveryState(state) {
  if (!state || typeof state !== "object") {
    return {
      envCols: [],
      hubVisible: DEFAULT_DISCOVERY_STATE.hubVisible,
      hubRenameUnlocked: DEFAULT_DISCOVERY_STATE.hubRenameUnlocked,
    };
  }
  const local = getLocalState(state);
  const raw =
    local.discovery && typeof local.discovery === "object" && !Array.isArray(local.discovery)
      ? local.discovery
      : {};
  const boardCols = Number.isFinite(local?.board?.cols)
    ? Math.max(0, Math.floor(local.board.cols))
    : 0;
  const envCols = new Array(boardCols);
  const rawEnvCols = Array.isArray(raw.envCols) ? raw.envCols : [];
  for (let col = 0; col < boardCols; col++) {
    const entry =
      rawEnvCols[col] && typeof rawEnvCols[col] === "object" ? rawEnvCols[col] : null;
    envCols[col] = {
      exposed:
        typeof entry?.exposed === "boolean"
          ? entry.exposed
          : DEFAULT_DISCOVERY_ENTRY.exposed,
      revealed:
        typeof entry?.revealed === "boolean"
          ? entry.revealed
          : DEFAULT_DISCOVERY_ENTRY.revealed,
    };
  }
  local.discovery = {
    envCols,
    hubVisible:
      typeof raw.hubVisible === "boolean"
        ? raw.hubVisible
        : DEFAULT_DISCOVERY_STATE.hubVisible,
    hubRenameUnlocked:
      typeof raw.hubRenameUnlocked === "boolean"
        ? raw.hubRenameUnlocked
        : DEFAULT_DISCOVERY_STATE.hubRenameUnlocked,
  };
  return local.discovery;
}

export function isEnvColExposed(state, envCol) {
  const discovery = ensureDiscoveryState(state);
  const col = Number.isFinite(envCol) ? Math.floor(envCol) : null;
  if (col == null || col < 0 || col >= discovery.envCols.length) return false;
  return discovery.envCols[col]?.exposed === true;
}

export function isEnvColRevealed(state, envCol) {
  const discovery = ensureDiscoveryState(state);
  const col = Number.isFinite(envCol) ? Math.floor(envCol) : null;
  if (col == null || col < 0 || col >= discovery.envCols.length) return false;
  return discovery.envCols[col]?.revealed === true;
}

export function getVisibleEnvColCount(state) {
  const discovery = ensureDiscoveryState(state);
  let count = 0;
  for (const entry of discovery.envCols) {
    if (entry?.exposed !== true) break;
    count += 1;
  }
  return count;
}

export function isHubVisible(state) {
  return ensureDiscoveryState(state).hubVisible === true;
}

export function isHubRenameUnlocked(state) {
  return ensureDiscoveryState(state).hubRenameUnlocked === true;
}

export function ensureHubState(state) {
  const local = getLocalState(state);
  if (!local.hub || typeof local.hub !== "object") {
    local.hub = createHubState();
    return;
  }

  const hub = local.hub;
  ensureHubSettlementState(
    hub,
    Number.isFinite(hub.cols) && hub.cols > 0 ? Math.floor(hub.cols) : HUB_COLS
  );
  if (!Array.isArray(hub.slots)) hub.slots = [];

  const slotsLen = hub.slots.length;
  const colHint =
    Number.isFinite(hub.cols) && hub.cols > 0 ? Math.floor(hub.cols) : 0;
  const cols = slotsLen > 0 ? slotsLen : colHint > 0 ? colHint : HUB_COLS;

  if (slotsLen === 0) {
    hub.slots = new Array(cols).fill(null).map(() => ({ structure: null }));
  }

  hub.cols = Array.isArray(hub.slots) ? hub.slots.length : cols;
  hub.zones.structures.slots = hub.slots;

  for (let i = 0; i < hub.slots.length; i++) {
    const slot = hub.slots[i];
    if (!slot || typeof slot !== "object") {
      hub.slots[i] = { structure: null };
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(slot, "structure")) {
      slot.structure = null;
    }
    const structure = slot.structure;
    if (structure) {
      const def = hubStructureDefs[structure.defId];
      if (def) ensureHubStructureFields(structure, def);
    }
  }

  if (!Array.isArray(hub.anchors)) hub.anchors = [];
  if (!Array.isArray(hub.occ) || hub.occ.length !== hub.cols) {
    hub.occ = new Array(hub.cols).fill(null);
  }

}

export function makeHubStructureInstance(defId, state, options = {}) {
  const def = hubStructureDefs[defId];
  const span =
    Number.isFinite(def?.defaultSpan) && def.defaultSpan > 0
      ? Math.floor(def.defaultSpan)
      : 1;
  const inst = {
    instanceId: state.nextHubStructureInstanceId++,
    defId,
    span,
    tier: typeof options?.tier === "string" ? options.tier : null,
    props: {},
    tags: [],
    systemTiers: {},
    systemState: {},
  };
  initializeInstanceFromDef(inst, def);
  return inst;
}

export function makeEnvTileInstance(defId, state, col, span = 1) {
  const def = envTileDefs[defId];
  const baseTags = Array.isArray(def?.baseTags) ? def.baseTags : [];
  const tags = [];
  const seen = new Set();
  for (const tag of baseTags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  return {
    instanceId: state.nextEnvInstanceId++,
    defId,
    col,
    span,
    tags,
    systemTiers: {},
    systemState: {},
  };
}

export function makeEnvEventInstance(defId, state, col, span, tSec) {
  const def = envEventDefs[defId];
  const safeSpan = typeof span === "number" && span > 0 ? span : 1;
  const inst = {
    instanceId: state.nextEnvInstanceId++,
    defId,
    col,
    span: safeSpan,
    createdSec: tSec,
    props: {},
  };
  if (def?.durationSec != null) {
    inst.expiresSec = tSec + def.durationSec;
  }
  return inst;
}

function initializeEnvStructureFromDef(instance, def) {
  if (!instance || !def) return;
  if (!Array.isArray(instance.tags) || instance.tags.length === 0) {
    instance.tags = normalizeTagList(def.tags);
  }
  if (!instance.systemTiers || typeof instance.systemTiers !== "object") {
    instance.systemTiers = {};
  }
  if (!instance.systemState || typeof instance.systemState !== "object") {
    instance.systemState = {};
  }

  const systems = def.systems;
  if (Array.isArray(systems)) {
    for (const systemId of systems) {
      if (typeof systemId !== "string" || !systemId.length) continue;
      if (instance.systemTiers[systemId] == null) {
        instance.systemTiers[systemId] =
          typeof instance.tier === "string" ? instance.tier : "bronze";
      }
      if (!instance.systemState[systemId]) {
        instance.systemState[systemId] = {};
      }
    }
    return;
  }

  if (!systems || typeof systems !== "object") return;
  for (const [systemId, spec] of Object.entries(systems)) {
    if (!systemId || typeof systemId !== "string") continue;
    if (instance.systemTiers[systemId] == null) {
      const tier =
        typeof spec?.defaultTier === "string"
          ? spec.defaultTier
          : typeof instance.tier === "string"
          ? instance.tier
          : "bronze";
      instance.systemTiers[systemId] = tier;
    }
    if (!instance.systemState[systemId]) {
      instance.systemState[systemId] = deepCloneSerializable(
        spec?.stateDefaults ?? {}
      );
    }
  }
}

export function makeEnvStructureInstance(
  defId,
  state,
  col,
  span = 1,
  options = {}
) {
  const def = envStructureDefs[defId];
  const fallbackSpan =
    Number.isFinite(def?.defaultSpan) && def.defaultSpan > 0
      ? Math.floor(def.defaultSpan)
      : 1;
  const safeSpan =
    Number.isFinite(span) && span > 0 ? Math.floor(span) : fallbackSpan;
  const inst = {
    instanceId: state.nextEnvStructureInstanceId++,
    defId,
    col,
    span: safeSpan,
    tier: typeof options?.tier === "string" ? options.tier : null,
    props: {},
    tags: [],
    systemTiers: {},
    systemState: {},
  };
  initializeEnvStructureFromDef(inst, def);
  return inst;
}

export function rebuildBoardOccupancy(state) {
  if (!state) return;
  ensureBoardState(state);
  ensureHubState(state);
  if (state.permanentSlots) delete state.permanentSlots;
  if (state.nextPermanentInstanceId) delete state.nextPermanentInstanceId;

  const local = getLocalState(state);
  const board = local.board;
  for (const layer of BOARD_LAYERS) {
    board.occ[layer].fill(null);
  }

  for (const layer of BOARD_LAYERS) {
    const anchors = board.layers[layer].anchors;
    for (const anchor of anchors) {
      if (!anchor) continue;
      const col = typeof anchor.col === "number" ? anchor.col : 0;
      const span = typeof anchor.span === "number" ? anchor.span : 1;
      for (let offset = 0; offset < span; offset++) {
        const occupiedCol = col + offset;
        if (occupiedCol < 0 || occupiedCol >= board.cols) continue;
        if (
          board.occ[layer][occupiedCol] &&
          board.occ[layer][occupiedCol] !== anchor
        ) {
          console.warn(
            `[board] occupancy collision on ${layer} col ${occupiedCol}; overwriting.`
          );
        }
        board.occ[layer][occupiedCol] = anchor;
      }
    }
  }

  rebuildHubOccupancy(state);
  maybeValidateState(state, "rebuildBoardOccupancy");
}

export function rebuildHubOccupancy(state) {
  if (!state) return;
  ensureHubState(state);

  const hub = getLocalState(state).hub;
  const slots = Array.isArray(hub.slots) ? hub.slots : [];
  hub.cols = slots.length;

  if (!Array.isArray(hub.anchors)) hub.anchors = [];
  hub.anchors.length = 0;

  if (!Array.isArray(hub.occ) || hub.occ.length !== hub.cols) {
    hub.occ = new Array(hub.cols).fill(null);
  } else {
    hub.occ.fill(null);
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || typeof slot !== "object") {
      slots[i] = { structure: null };
      continue;
    }
    const structure = slot.structure;
    if (!structure) continue;

    const def = hubStructureDefs[structure.defId];
    if (def) ensureHubStructureFields(structure, def);
    const fallbackSpan =
      Number.isFinite(def?.defaultSpan) && def.defaultSpan > 0
        ? Math.floor(def.defaultSpan)
        : 1;
    if (!Number.isFinite(structure.span) || structure.span <= 0) {
      structure.span = fallbackSpan;
    }
    structure.col = i;
    hub.anchors.push(structure);
  }

  for (const anchor of hub.anchors) {
    if (!anchor) continue;
    const col = typeof anchor.col === "number" ? anchor.col : 0;
    const span = typeof anchor.span === "number" ? anchor.span : 1;
    for (let offset = 0; offset < span; offset++) {
      const occupiedCol = col + offset;
      if (occupiedCol < 0 || occupiedCol >= hub.cols) continue;
      if (hub.occ[occupiedCol] && hub.occ[occupiedCol] !== anchor) {
        if (DEV) {
          console.warn(
            `[hub] occupancy collision on col ${occupiedCol}; overwriting.`
          );
        }
      }
      hub.occ[occupiedCol] = anchor;
    }
  }
}

export function initializeInstanceFromDef(instance, def) {
  if (!instance || !def) return;
  ensureHubStructureFields(instance, def);
}

function ensureHubStructureFields(instance, def) {
  if (!instance || !def) return;

  if (!Array.isArray(instance.tags) || instance.tags.length === 0) {
    instance.tags = normalizeTagList(def.tags);
  }

  if (!instance.systemTiers || typeof instance.systemTiers !== "object") {
    instance.systemTiers = {};
  }
  if (!instance.systemState || typeof instance.systemState !== "object") {
    instance.systemState = {};
  }

  function ensureHubSystemState(systemId) {
    if (!systemId || typeof systemId !== "string") return;
    if (instance.systemTiers[systemId] == null) {
      const sysDef = hubSystemDefs[systemId];
      const instanceTier =
        typeof instance.tier === "string" ? instance.tier : null;
      if (instanceTier) {
        instance.systemTiers[systemId] = instanceTier;
      } else if (sysDef?.defaultTier != null) {
        instance.systemTiers[systemId] = sysDef.defaultTier;
      }
    }
    if (!instance.systemState[systemId]) {
      const sysDef = hubSystemDefs[systemId];
      if (sysDef?.stateDefaults) {
        instance.systemState[systemId] = deepCloneSerializable(
          sysDef.stateDefaults
        );
      }
    }
  }

  const tags = Array.isArray(instance.tags) ? instance.tags : [];
  for (const tagId of tags) {
    const tagDef = hubTagDefs[tagId];
    const systems = Array.isArray(tagDef?.systems) ? tagDef.systems : [];
    for (const systemId of systems) {
      ensureHubSystemState(systemId);
    }
  }

  const depositSystemId =
    typeof def?.deposit?.systemId === "string" ? def.deposit.systemId : null;
  if (depositSystemId) {
    ensureHubSystemState(depositSystemId);
  }

  if (isUpgradeableSettlementStructureDef(def)) {
    ensureSettlementStructureUpgradeState(instance);
  }
}

function normalizeTagList(tags) {
  const raw = Array.isArray(tags) ? tags : [];
  const seen = new Set();
  const out = [];
  for (const tag of raw) {
    if (typeof tag !== "string") continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function deepCloneSerializable(value) {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch (_) {
    // ignore
  }
  return JSON.parse(JSON.stringify(value));
}

function maybeValidateState(state, origin) {
  if (!DEV) return;
  const result = validateState(state);
  if (!result.ok) {
    console.warn(`[state] ${origin}: ${result.errors.join("; ")}`);
  }
  if (result.warnings.length > 0) {
    console.warn(`[state] ${origin}: ${result.warnings.join("; ")}`);
  }
}
