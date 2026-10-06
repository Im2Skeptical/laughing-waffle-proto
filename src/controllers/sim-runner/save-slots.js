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
import { describeSaveError, saveFailureCategory } from './save-diagnostics.js';
import { initializeSaveStorage, runSaveTransaction, putSaveRecord, SAVE_PAYLOAD_STORE, SAVE_META_STORE } from './save-storage.js';
import { inspectSaveInWorker } from '../save-load-worker-service.js';

export const SAVE_SCHEMA_VERSION = 19;
export const SAVE_SLOT_COUNT = 3;

function normalizeSaveSlot(slot) {
  const idx = Number.isFinite(slot) ? Math.floor(slot) : 1;
  const clamped = Math.max(1, Math.min(SAVE_SLOT_COUNT, idx));
  return clamped;
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

async function readSaveSlotText(slot) {
  let raw;
  try {
    const db = await initializeSaveStorage(inspectSaveText);
    raw = await runSaveTransaction(db, [SAVE_PAYLOAD_STORE], 'readonly', (tx, setResult) => {
      const request = tx.objectStore(SAVE_PAYLOAD_STORE).get(normalizeSaveSlot(slot));
      request.onsuccess = () => setResult(request.result?.text ?? null);
    });
  } catch (error) { return { ok: false, reason: 'storageFailed', error }; }
  if (raw === null) return { ok: false, reason: 'emptySlot' };
  return { ok: true, text: raw };
}

export async function readSaveSlot(slot) {
  const res = await readSaveSlotText(slot);
  if (!res.ok) return res;
  try { return { ok: true, data: JSON.parse(res.text) }; }
  catch (error) { return { ok: false, reason: 'badSaveData', error }; }
}

export async function listSaveSlotSummaries() {
  const db = await initializeSaveStorage(inspectSaveText);
  return runSaveTransaction(db, [SAVE_META_STORE], 'readonly', (tx, setResult) => {
    const request = tx.objectStore(SAVE_META_STORE).getAll();
    request.onsuccess = () => setResult(request.result);
  });
}

export async function getSaveSlotMeta(slot) {
  try { return (await listSaveSlotSummaries()).find(entry => entry.slot === normalizeSaveSlot(slot))?.meta ?? null; }
  catch { return null; }
}

export function exportSave({ state, timeline, setupId } = {}) {
  try {
    if (!state) return { ok: false, reason: 'noState' };
    const meta = buildSaveMeta(state, setupId);
    const text = JSON.stringify({ meta, state: serializeGameState(state), timeline: serializeTimelineForSave(timeline) });
    return { ok: true, meta, text };
  } catch (error) { return { ok: false, reason: 'serializationFailed', error }; }
}

async function persistSave(slot, prepare, context = {}) {
  const start = performance.now();
  const diagnostics = { backend: 'indexedDB', attemptedAt: new Date().toISOString(), slot, operation: context.operation ?? 'save',
    startedAtMs: start, serializationMs: null, storageAccessMs: null, storageEnqueueMs: null, storageWriteMs: null,
    stateSec: context.state?.tSec ?? null, checkpointCount: context.timeline?.checkpoints?.length ?? null,
    stage: 'serialize', category: null, payloadCharacters: null, estimatedUtf16Bytes: null,
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
  // Capture the JSON snapshot before yielding; the live run can keep advancing.
  const prepared = prepare();
  diagnostics.serializationMs = Math.round((performance.now() - start) * 100) / 100;
  if (!prepared.ok) return finish(prepared, prepared.error);
  diagnostics.payloadCharacters = prepared.text.length;
  diagnostics.estimatedUtf16Bytes = prepared.text.length * 2;
  diagnostics.stage = 'access';
  let stageStart = performance.now();
  try {
    const db = await initializeSaveStorage(inspectSaveText);
    diagnostics.storageAccessMs = Math.round((performance.now() - stageStart) * 100) / 100;
    diagnostics.stage = 'write';
    stageStart = performance.now();
    await runSaveTransaction(db, [SAVE_PAYLOAD_STORE, SAVE_META_STORE], 'readwrite', tx => {
      const enqueueStart = performance.now();
      try { putSaveRecord(tx, normalizeSaveSlot(slot), prepared.text, prepared.meta); }
      finally { diagnostics.storageEnqueueMs = Math.round((performance.now() - enqueueStart) * 100) / 100; }
    });
    diagnostics.storageWriteMs = Math.round((performance.now() - stageStart) * 100) / 100;
    diagnostics.stage = 'complete';
    return finish({ ok: true, meta: prepared.meta });
  } catch (failure) {
    const field = diagnostics.stage === 'write' ? 'storageWriteMs' : 'storageAccessMs';
    diagnostics[field] = Math.round((performance.now() - stageStart) * 100) / 100;
    return finish({ ok: false, reason: 'storageFailed', error: failure }, failure, prepared.text);
  }
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

export async function inspectSaveSlot(slot, { background = false, isCurrent = () => true, onProgress } = {}) {
  onProgress?.({ stage: 'read', label: 'Reading your browser save', detail: `Browser save slot ${slot}` });
  const res = await readSaveSlotText(slot);
  if (!isCurrent()) return { ok: false, reason: 'cancelled' };
  if (!res.ok) return res;
  if (background) {
    onProgress?.({ stage: 'replay', label: 'Checking your save and replaying history', detail: 'Starting the save worker…' });
    const inspected = await inspectSaveInWorker(res.text, { isCurrent, onProgress });
    if (!isCurrent()) return { ok: false, reason: 'cancelled' };
    if (inspected) {
      if (!inspected.ok) return inspected;
      // Reattach runtime helpers and validate the transferred mutable body.
      return { ...inspected, state: deserializeGameState(inspected.state) };
    }
  }
  onProgress?.({ stage: 'replay', label: 'Checking your save and replaying history', detail: 'Running on this device' });
  if (onProgress) await new Promise(resolve => setTimeout(resolve, 0));
  if (!isCurrent()) return { ok: false, reason: 'cancelled' };
  return inspectSaveText(res.text);
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
