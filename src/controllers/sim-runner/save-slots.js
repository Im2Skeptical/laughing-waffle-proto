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
import { accessSaveStorage, describeSaveError, saveFailureCategory } from './save-diagnostics.js';

export const SAVE_SCHEMA_VERSION = 18;
export const SAVE_KEY_PREFIX = "civsurvivor.save";
export const SAVE_SLOT_COUNT = 3;

export function getSaveSlotKey(slot) {
  const idx = Number.isFinite(slot) ? Math.floor(slot) : 1;
  const clamped = Math.max(1, Math.min(SAVE_SLOT_COUNT, idx));
  return `${SAVE_KEY_PREFIX}.slot${clamped}`;
}

export function getLocalStorageSafe() {
  return accessSaveStorage().storage;
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

export function exportSave({ state, timeline, setupId } = {}) {
  try {
    if (!state) return { ok: false, reason: 'noState' };
    const meta = buildSaveMeta(state, setupId);
    const text = JSON.stringify({ meta, state: serializeGameState(state), timeline: serializeTimelineForSave(timeline) });
    return { ok: true, meta, text };
  } catch (error) { return { ok: false, reason: 'serializationFailed', error }; }
}

function persistSave(slot, prepare, context = {}) {
  const start = performance.now();
  const diagnostics = { attemptedAt: new Date().toISOString(), slot, operation: context.operation ?? 'save',
    stateSec: context.state?.tSec ?? null, checkpointCount: context.timeline?.checkpoints?.length ?? null,
    stage: 'access', category: null, payloadCharacters: null, estimatedUtf16Bytes: null,
    payloadUtf8Bytes: null, durationMs: null, error: null };
  const finish = (result, error = null, text = null) => {
    diagnostics.durationMs = Math.round((performance.now() - start) * 100) / 100;
    diagnostics.error = describeSaveError(error);
    if (!result.ok) {
      diagnostics.category = saveFailureCategory(diagnostics.stage, error);
      // Extra byte encoding is only needed on failure; successful autosaves
      // reuse the existing JSON string and record its cheap character count.
      if (text !== null) diagnostics.payloadUtf8Bytes = new Blob([text]).size;
    }
    return { ...result, diagnostics };
  };
  const { storage, error } = accessSaveStorage();
  if (!storage) return finish({ ok: false, reason: 'noStorage', error }, error);
  diagnostics.stage = 'serialize';
  const prepared = prepare();
  if (!prepared.ok) return finish(prepared, prepared.error);
  diagnostics.payloadCharacters = prepared.text.length;
  diagnostics.estimatedUtf16Bytes = prepared.text.length * 2;
  diagnostics.stage = 'write';
  try {
    storage.setItem(getSaveSlotKey(slot), prepared.text);
    diagnostics.stage = 'complete';
    return finish({ ok: true, meta: prepared.meta });
  } catch (failure) { return finish({ ok: false, reason: 'storageFailed', error: failure }, failure, prepared.text); }
}

export function writeSaveToSlot(slot, context = {}) {
  return persistSave(slot, () => exportSave(context), context);
}

export function inspectSaveText(text) {
  try { return inspectSaveData(JSON.parse(text)); }
  catch (error) { return { ok: false, reason: 'badSaveData', error }; }
}

export function importSaveToSlot(slot, text) {
  const inspected = inspectSaveText(text);
  if (!inspected.ok) return inspected;
  return persistSave(slot, () => ({ ok: true, text, meta: inspected.meta }),
    { operation: 'import', state: inspected.state, timeline: inspected.nextTimeline });
}

export function inspectSaveSlot(slot) {
  const res = readSaveSlot(slot);
  if (!res.ok) return res;
  return inspectSaveData(res.data);
}

function inspectSaveData(data) {
  const meta = data?.meta ?? null;
  if (meta?.schemaVersion !== SAVE_SCHEMA_VERSION) return { ok: false, reason: "versionMismatch", meta };
  try {
    if (!Number.isFinite(data?.timeline?.cursorSec) || data.timeline.cursorSec < 0
      || data.timeline.cursorSec > data.timeline.historyEndSec) return { ok: false, reason: 'badSaveData' };
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
