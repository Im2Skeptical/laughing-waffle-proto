import { inspectSaveText } from './sim-runner/save-slots.js';
import { serializeGameState } from '../model/state.js';
import { prepareSaveHistorySummaries } from './save-history-preparation.js';

globalThis.onmessage = async ({ data: text }) => {
  try {
    // Keep the authoritative validator and replay path. Only their execution
    // location changes; runtime RNG helpers cannot cross the worker boundary.
    const result = inspectSaveText(text);
    globalThis.postMessage(result.ok ? {
      ok: true, meta: result.meta, nextTimeline: result.nextTimeline,
      state: serializeGameState(result.state),
      historySummaryBySecond: await prepareSaveHistorySummaries(result.nextTimeline, {
        onProgress: coverageSec => globalThis.postMessage({ kind: 'historyProgress', coverageSec }),
      }),
    } : { ok: false, reason: result.reason, meta: result.meta });
  } catch (error) {
    globalThis.postMessage({ ok: false, reason: 'badSaveData' });
  }
};
