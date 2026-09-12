// Legacy pawn collection, AI, skill, and role field helpers.
// Pre-redesign substrate on the serialization/replay path.
// Do not add new detailed-settlement gameplay here.

import { LEADER_FAITH_STARTING_TIER } from "../../defs/gamesettings/gamerules-defs.js";
import { getLocalState } from "./board-legacy.js";

const LEADER_EQUIPMENT_SLOT_ORDER = Object.freeze([
  "head",
  "chest",
  "mainHand",
  "offHand",
  "ring1",
  "ring2",
  "amulet",
]);

export function ensurePawnCollectionState(state) {
  if (!state || typeof state !== "object") return [];
  const local = getLocalState(state);
  if (Array.isArray(local.pawns)) return local.pawns;
  local.pawns = [];
  return local.pawns;
}

export function getPawns(state) {
  return ensurePawnCollectionState(state);
}

export function buildPawnSystemDefaults() {
  return { systemTiers: {}, systemState: {} };
}

export function ensurePawnSystems(pawn) {
  if (!pawn || typeof pawn !== "object") return;
  if (!pawn.systemTiers || typeof pawn.systemTiers !== "object") {
    pawn.systemTiers = {};
  }
  if (!pawn.systemState || typeof pawn.systemState !== "object") {
    pawn.systemState = {};
  }

  ensurePawnAI(pawn);
}

export function ensurePawnAI(pawn) {
  if (!pawn || typeof pawn !== "object") return;
  const raw = pawn.ai;
  const ai = raw && typeof raw === "object" ? raw : {};
  const mode = ai.mode === "eat" || ai.mode === "rest" ? ai.mode : null;
  const currentPlacement = normalizePawnAiPlacement(pawn, null);
  const assignedPlacement = normalizePawnAiPlacement(
    ai.assignedPlacement,
    currentPlacement
  );
  const suppressAutoUntilSec = Number.isFinite(ai.suppressAutoUntilSec)
    ? Math.max(0, Math.floor(ai.suppressAutoUntilSec))
    : 0;
  let returnState =
    ai.returnState === "waitingForEat" ||
    ai.returnState === "waitingForRest" ||
    ai.returnState === "ready"
      ? ai.returnState
      : "none";
  if (pawnPlacementEquals(currentPlacement, assignedPlacement)) {
    returnState = "none";
  }
  ai.mode = mode;
  ai.assignedPlacement = assignedPlacement;
  ai.returnState = returnState;
  ai.suppressAutoUntilSec = suppressAutoUntilSec;
  pawn.ai = ai;
}

function normalizePawnAiPlacement(value, fallback = null) {
  const fallbackPlacement =
    fallback && typeof fallback === "object"
      ? {
          hubCol: Number.isFinite(fallback.hubCol)
            ? Math.floor(fallback.hubCol)
            : null,
          envCol: Number.isFinite(fallback.envCol)
            ? Math.floor(fallback.envCol)
            : null,
        }
      : { hubCol: null, envCol: null };
  const hubCol = Number.isFinite(value?.hubCol) ? Math.floor(value.hubCol) : null;
  const envCol = Number.isFinite(value?.envCol) ? Math.floor(value.envCol) : null;
  if (hubCol != null) return { hubCol, envCol: null };
  if (envCol != null) return { hubCol: null, envCol };
  return fallbackPlacement;
}

function pawnPlacementEquals(a, b) {
  const left = normalizePawnAiPlacement(a, null);
  const right = normalizePawnAiPlacement(b, null);
  if (left.hubCol != null || right.hubCol != null) {
    return left.hubCol != null && right.hubCol != null && left.hubCol === right.hubCol;
  }
  if (left.envCol != null || right.envCol != null) {
    return left.envCol != null && right.envCol != null && left.envCol === right.envCol;
  }
  return true;
}

function normalizeSkillNodeIdList(value) {
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

export function ensurePawnSkillFields(pawn) {
  if (!pawn || typeof pawn !== "object") return;
  pawn.skillPoints = Number.isFinite(pawn.skillPoints)
    ? Math.max(0, Math.floor(pawn.skillPoints))
    : 0;
  pawn.unlockedSkillNodeIds = normalizeSkillNodeIdList(
    pawn.unlockedSkillNodeIds
  );
}

function ensureLeaderPrestigeFields(pawn) {
  if (!pawn || pawn.role !== "leader") return;
  if (!pawn.totalDepositedAmountByTier || typeof pawn.totalDepositedAmountByTier !== "object") {
    pawn.totalDepositedAmountByTier = {};
  }
  if (!pawn.prestigeDebtByFollowerId || typeof pawn.prestigeDebtByFollowerId !== "object") {
    pawn.prestigeDebtByFollowerId = {};
  }
  if (!Number.isFinite(pawn.prestigeCapBaseFromDeposits)) {
    pawn.prestigeCapBaseFromDeposits = 0;
  }
  if (!Number.isFinite(pawn.prestigeCapBonus)) pawn.prestigeCapBonus = 0;
  if (!Number.isFinite(pawn.prestigeCapBase)) pawn.prestigeCapBase = 0;
  if (!Number.isFinite(pawn.prestigeCapDebt)) pawn.prestigeCapDebt = 0;
  if (!Number.isFinite(pawn.workerCount)) pawn.workerCount = 0;
  const deposits = Math.max(0, Math.floor(pawn.prestigeCapBaseFromDeposits ?? 0));
  const bonus = Math.max(0, Math.floor(pawn.prestigeCapBonus ?? 0));
  const base = Math.max(0, Math.floor(pawn.prestigeCapBase ?? 0));
  const debt = Math.max(0, Math.floor(pawn.prestigeCapDebt ?? 0));
  pawn.prestigeCapBaseFromDeposits = deposits;
  pawn.prestigeCapBonus = bonus;
  pawn.prestigeCapBase = Math.max(base, deposits + bonus);
  pawn.prestigeCapDebt = debt;
  pawn.workerCount = Math.max(0, Math.floor(pawn.workerCount ?? 0));
  pawn.prestigeCapEffective = Math.max(
    0,
    pawn.prestigeCapBase - Math.min(debt, pawn.prestigeCapBase)
  );

  if (!pawn.equipment || typeof pawn.equipment !== "object") {
    pawn.equipment = {};
    for (const slotId of LEADER_EQUIPMENT_SLOT_ORDER) {
      pawn.equipment[slotId] = null;
    }
    return;
  }
  for (const slotId of LEADER_EQUIPMENT_SLOT_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(pawn.equipment, slotId)) {
      pawn.equipment[slotId] = null;
    }
  }

  ensureLeaderFaithFields(pawn);
}

const LEADER_FAITH_TIER_ORDER = Object.freeze([
  "bronze",
  "silver",
  "gold",
  "diamond",
]);

function normalizeLeaderFaithTier(value, fallback = "gold") {
  const fallbackTier = LEADER_FAITH_TIER_ORDER.includes(fallback)
    ? fallback
    : "gold";
  if (typeof value !== "string") return fallbackTier;
  return LEADER_FAITH_TIER_ORDER.includes(value) ? value : fallbackTier;
}

function ensureLeaderFaithFields(pawn) {
  if (!pawn || pawn.role !== "leader") return;
  const existing =
    pawn.leaderFaith && typeof pawn.leaderFaith === "object"
      ? pawn.leaderFaith
      : {};
  const fallbackTier = normalizeLeaderFaithTier(LEADER_FAITH_STARTING_TIER, "gold");
  const tier = normalizeLeaderFaithTier(existing.tier, fallbackTier);
  const eatStreak = Number.isFinite(existing.eatStreak)
    ? Math.max(0, Math.floor(existing.eatStreak))
    : 0;
  const decayElapsedSec = Number.isFinite(existing.decayElapsedSec)
    ? Math.max(0, Math.floor(existing.decayElapsedSec))
    : 0;
  const failedEatWarnActive = existing.failedEatWarnActive === true;
  pawn.leaderFaith = {
    tier,
    eatStreak,
    decayElapsedSec,
    failedEatWarnActive,
  };
}

function ensureFollowerFields(pawn, fallbackOrderIndex = null) {
  if (!pawn || pawn.role !== "follower") return;
  if (pawn.leaderId == null) pawn.leaderId = null;
  if (!Number.isFinite(pawn.followerCreationOrderIndex)) {
    pawn.followerCreationOrderIndex =
      Number.isFinite(fallbackOrderIndex) && fallbackOrderIndex >= 0
        ? Math.floor(fallbackOrderIndex)
        : 0;
  }
  const hunger = pawn.systemState?.hunger;
  if (hunger && typeof hunger === "object") {
    if (!Number.isFinite(hunger.belowThresholdSec)) hunger.belowThresholdSec = 0;
    if (!Number.isFinite(hunger.debtCadenceSec)) hunger.debtCadenceSec = 0;
  }
}

export function ensurePawnRoleFields(state, pawn, fallbackFollowerOrderIndex = null) {
  if (!pawn || typeof pawn !== "object") return;
  ensurePawnSkillFields(pawn);
  if (pawn.role !== "leader" && pawn.role !== "follower") {
    pawn.role = "leader";
  }
  if (pawn.role === "leader") {
    ensureLeaderPrestigeFields(pawn);
    const leadership = pawn.systemState?.leadership;
    if (leadership && typeof leadership === "object") {
      if (typeof leadership.followersAutoFollow !== "boolean") {
        leadership.followersAutoFollow = true;
      }
    }
  } else if (pawn.role === "follower") {
    ensureFollowerFields(pawn, fallbackFollowerOrderIndex);
  }
}
