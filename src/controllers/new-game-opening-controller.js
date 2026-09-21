import { createNewGameState } from "../model/new-game.js";
import { createEmptyTimelineFromBase } from "../model/timeline/index.js";

// Runtime-only preparation. Never touches the live runner, storage, or its RNG.
export function createNewGameOpeningController({ createCache, createWorkerService, searchLimitSec,
  createState = () => createNewGameState(globalThis.crypto.getRandomValues(new Uint32Array(1))[0]),
}) {
  let job = null;
  let phase = "idle";
  let preparation = "idle";
  let coverageSec = 0;
  let elapsedSec = 0;
  let lossSec = null;

  function cancel() {
    if (job) {
      clearTimeout(job.timer);
      job.worker?.dispose();
      job.resolve({ ok: false, reason: "cancelled" });
      job = null;
    }
    preparation = "idle";
  }

  function prepare() {
    if (job) return job.promise;
    const current = { timer: null, worker: null };
    current.promise = new Promise(resolve => { current.resolve = resolve; });
    job = current;
    preparation = "preparing";
    coverageSec = 0;
    // Let the menu paint before constructing the world and priming the worker.
    current.timer = setTimeout(() => {
      try {
        const state = createState();
        const timeline = createEmptyTimelineFromBase(state);
        const cache = createCache();
        const worker = createWorkerService();
        current.worker = worker;
        let lastCoverage = 0;
        let lastProgress = performance.now();
        function step() {
          if (job !== current) return;
          try {
            const result = worker.requestCoverage({
              projectionCache: cache, timeline, timelineToken: cache.getTimelineToken(timeline),
              historyEndSec: 0, stepSec: 1, desiredEndSec: searchLimitSec,
              boundaryStateData: timeline.baseStateData, scheduledActionsBySecond: [],
            });
            if (!result.ok) throw new Error(result.reason);
            const coverage = result.coverageEndSec;
            coverageSec = coverage;
            if (coverage > lastCoverage) { lastCoverage = coverage; lastProgress = performance.now(); }
            const summary = cache.getSummary(coverage);
            if (summary?.runComplete) {
              const end = summary.runLossSec ?? coverage;
              const terminal = cache.getStateData(end);
              if (!terminal?.runStatus?.complete) throw new Error("missingTerminalPreview");
              worker.dispose();
              preparation = "ready";
              current.resolve({ ok: true, state, lossSec: end,
                forecast: cache.exportForecastChunk(end) });
              return;
            }
            if (!result.pending || performance.now() - lastProgress > 30000) {
              throw new Error("forecastIncomplete");
            }
            current.timer = setTimeout(step, 32);
          } catch (error) { fail(error); }
        }
        step();
      } catch (error) { fail(error); }
      function fail(error) {
        if (job !== current) return;
        current.worker?.dispose();
        preparation = "error";
        current.resolve({ ok: false, reason: error.message });
      }
    }, 0);
    return current.promise;
  }

  return {
    prepare, cancel,
    consume() { cancel(); },
    begin(endSec) { cancel(); phase = "revealing"; elapsedSec = 0; lossSec = endSec; },
    reset() { cancel(); phase = "idle"; elapsedSec = 0; lossSec = null; },
    advance(dt) {
      if (phase !== "revealing") return null;
      elapsedSec = Math.min(5, elapsedSec + Math.max(0, dt));
      if (elapsedSec >= 5) phase = "completed";
      return { second: Math.floor(lossSec * elapsedSec / 5), complete: phase === "completed" };
    },
    isRevealing: () => phase === "revealing",
    getSnapshot: () => ({ phase: phase === "idle" ? preparation : phase,
      preparation, coverageSec, elapsedSec, lossSec }),
  };
}
