import { inspectSaveText } from './sim-runner/save-slots.js';
import { serializeGameState } from '../model/state.js';
import { prepareSaveHistorySummaries } from './save-history-preparation.js';

globalThis.onmessage = async ({ data: text }) => {
  try {
    globalThis.postMessage({ kind: 'loadProgress', progress: {
      stage: 'replay', label: 'Checking your save and replaying history', detail: 'Running in the save worker' } });
    // Keep the authoritative validator and replay path. Only their execution
    // location changes; runtime RNG helpers cannot cross the worker boundary.
    const result = inspectSaveText(text);
    if (result.ok) globalThis.postMessage({ kind: 'loadProgress', progress: {
      stage: 'history', label: 'Preparing historical graphs', completed: 0,
      total: result.nextTimeline.historyEndSec,
      detail: `Preparing every recorded second through ${result.nextTimeline.historyEndSec}` } });
    globalThis.postMessage(result.ok ? {
      ok: true, meta: result.meta, nextTimeline: result.nextTimeline,
      state: serializeGameState(result.state),
      historySummaryBySecond: await prepareSaveHistorySummaries(result.nextTimeline, {
        onProgress: coverageSec => globalThis.postMessage({ kind: 'historyProgress', coverageSec,
          endSec: result.nextTimeline.historyEndSec }),
      }),
    } : { ok: false, reason: result.reason, meta: result.meta });
  } catch (error) {
    globalThis.postMessage({ ok: false, reason: 'badSaveData' });
  }
};
