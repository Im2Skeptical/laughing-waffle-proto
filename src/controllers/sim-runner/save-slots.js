// Browser save-slot helpers for the simulation runner.
// On the serialization/replay path; retains pre-redesign substrate.
// Do not add new detailed-settlement gameplay here.
// Explicit-arg key/meta/payload/inspect helpers only.
// loadFromSlot apply wiring stays in sim-runner.js.

import {
  deserializeGameState,
  serializeGameState,
  getCurrentSeasonKey,
} from "../../model/state.js";
import { rebuildStateAtSecond } from "../../model/timeline/index.js";
import { clonePersistentKnowledge } from "../../model/persistent-memory.js";

export const SAVE_SCHEMA_VERSION = 12;
export const SAVE_KEY_PREFIX = "civsurvivor.save";
export const SAVE_SLOT_COUNT = 3;

export function getSaveSlotKey(slot) {
  const idx = Number.isFinite(slot) ? Math.floor(slot) : 1;
  const clamped = Math.max(1, Math.min(SAVE_SLOT_COUNT, idx));
  return `${SAVE_KEY_PREFIX}.slot${clamped}`;
}

export function getLocalStorageSafe() {
  try {
    return globalThis?.localStorage ?? null;
  } catch (_) {
    return null;
  }
}

export function buildSaveMeta(state, setupId) {
  const tSec = Math.floor(state?.tSec ?? 0);
  const seasonKey = getCurrentSeasonKey(state);
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    setupId,
    savedAt: new Date().toISOString(),
    tSec,
    seasonKey,
    year: Number.isFinite(state?.year) ? Math.floor(state.year) : 1,
    actionPoints: Math.floor(state?.actionPoints ?? 0),
    actionPointCap: Math.floor(state?.actionPointCap ?? 0),
  };
}

export function serializeTimelineForSave(tl) {
  if (!tl) return null;
  const historyEndSec = Math.floor(tl.historyEndSec ?? 0);
  const maxReachedHistoryEndSec = Math.max(
    historyEndSec,
    Math.floor(tl.maxReachedHistoryEndSec ?? historyEndSec)
  );
  return {
    baseStateData: tl.baseStateData ?? null,
    persistentKnowledge: clonePersistentKnowledge(tl),
    actions: Array.isArray(tl.actions) ? tl.actions : [],
    checkpoints: Array.isArray(tl.checkpoints) ? tl.checkpoints : [],
    cursorSec: Math.floor(tl.cursorSec ?? 0),
    historyEndSec,
    maxReachedHistoryEndSec,
    revision: Math.floor(tl.revision ?? 0),
  };
}

export function normalizeSavedTimeline(rawTimeline, fallbackStateData) {
  if (!rawTimeline || typeof rawTimeline !== "object") return null;
  const baseStateData = rawTimeline.baseStateData ?? fallbackStateData ?? null;
  if (!baseStateData) return null;
  if (!Number.isFinite(rawTimeline.historyEndSec)) return null;
  const historyEndSec = Math.floor(rawTimeline.historyEndSec);
  const maxReachedHistoryEndSec = Math.max(
    historyEndSec,
    Math.floor(rawTimeline.maxReachedHistoryEndSec ?? historyEndSec)
  );
  return {
    baseStateData,
    persistentKnowledge: clonePersistentKnowledge(
      rawTimeline?.persistentKnowledge != null
        ? rawTimeline.persistentKnowledge
        : fallbackStateData
    ),
    actions: Array.isArray(rawTimeline.actions) ? rawTimeline.actions : [],
    checkpoints: Array.isArray(rawTimeline.checkpoints)
      ? rawTimeline.checkpoints
      : [],
    cursorSec: Math.floor(rawTimeline.cursorSec ?? 0),
    historyEndSec,
    maxReachedHistoryEndSec,
    revision: Math.floor(rawTimeline.revision ?? 0),
  };
}

export function readSaveSlot(slot) {
  const store = getLocalStorageSafe();
  if (!store) return { ok: false, reason: "noStorage" };
  const key = getSaveSlotKey(slot);
  try {
    const raw = store.getItem(key);
    if (!raw) return { ok: false, reason: "emptySlot" };
    const parsed = JSON.parse(raw);
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, reason: "badSaveData", error: err };
  }
}

export function getSaveSlotMeta(slot) {
  const res = readSaveSlot(slot);
  if (!res.ok) return null;
  return res.data?.meta ?? null;
}

export function writeSaveToSlot(slot, { state, timeline, setupId } = {}) {
  if (!state) return { ok: false, reason: "noState" };
  const store = getLocalStorageSafe();
  if (!store) return { ok: false, reason: "noStorage" };
  const key = getSaveSlotKey(slot);

  const meta = buildSaveMeta(state, setupId);
  const timelineData = serializeTimelineForSave(timeline);
  const payload = {
    meta,
    state: serializeGameState(state),
    timeline: timelineData,
  };

  try {
    store.setItem(key, JSON.stringify(payload));
    return { ok: true, meta };
  } catch (error) {
    return { ok: false, reason: "storageFailed", error };
  }
}

export function inspectSaveSlot(slot) {
  const res = readSaveSlot(slot);
  if (!res.ok) return res;
  const data = res.data;
  const meta = data?.meta ?? null;
  if (meta?.schemaVersion !== SAVE_SCHEMA_VERSION) return { ok: false, reason: "versionMismatch", meta };
  try {
    deserializeGameState(data.state);
    const nextTimeline = normalizeSavedTimeline(data.timeline, data.state);
    if (!nextTimeline) return { ok: false, reason: "missingTimeline" };
    deserializeGameState(nextTimeline.baseStateData);
    const rebuilt = rebuildStateAtSecond(nextTimeline, nextTimeline.cursorSec);
    if (!rebuilt?.ok) return { ok: false, reason: "badSaveData" };
    return { ok: true, meta, data, nextTimeline, state: rebuilt.state };
  } catch (error) {
    return { ok: false, reason: "badSaveData", error };
  }
}
