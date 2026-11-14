import { createNewGameState } from "../model/new-game.js";
import { createEmptyTimelineFromBase } from "../model/timeline/index.js";
import { validateOpeningCheckpoint } from './opening-checkpoint-validation.js';
import { mergePreparedForecast } from './prepared-forecast-handoff.js';

// Preparation never touches the live runner or its RNG. Optional checkpoints
// retain only this disposable opening, outside the player save slots.
export function createNewGameOpeningController({ createCache, createWorkerService, searchLimitSec,
  createState = () => createNewGameState(globalThis.crypto.getRandomValues(new Uint32Array(1))[0]),
  getPreparationKey = () => null,
  loadPrepared = null,
  lifecycle = null,
  checkpoints = null,
  checkpointIntervalMs = 5000,
}) {
  let job = null;
  let phase = "idle";
  let preparation = "idle";
  let coverageSec = 0;
  let elapsedSec = 0;
  let lossSec = null;
  let checkpointRef = null;
  let checkpointQueue = Promise.resolve();
  const now = () => lifecycle?.now() ?? performance.now();

  function clearCheckpoint(ref = checkpointRef) {
    if (!ref || !checkpoints) return Promise.resolve();
    if (checkpointRef?.key === ref.key && checkpointRef.owner === ref.owner) checkpointRef = null;
    checkpointQueue = checkpointQueue.then(() => checkpoints.clear(ref.key, ref.owner)).catch(() => {});
    return checkpointQueue;
  }

  function cancel({ discard = false } = {}) {
    if (job) {
      job.discarded = discard;
      clearTimeout(job.timer);
      job.off?.();
      job.worker?.dispose();
      job.resolve({ ok: false, reason: "cancelled" });
      job = null;
    }
    if (discard) void clearCheckpoint();
    preparation = "idle";
  }

  // onState(state) receives the new world as soon as it exists (immediately if it
  // already does), so presentation work can start during the forecast wait.
  function prepare({ onProgress, onState } = {}) {
    const key=getPreparationKey();
    if (job && job.key===key) {
      if (onProgress) { job.onProgress = onProgress; onProgress(job.progress); }
      if (onState) { job.onState = onState; if (job.state) onState(job.state); }
      return job.promise;
    }
    if (job) cancel({ discard: true });
    const current = { timer: null, worker: null, key, onProgress, onState, state: null,
      owner: Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4))).join('-'),
      pendingWrites: 0, checkpointAt: -Infinity, checkpointEnd: -1,
      progress: { stage: 'world', label: 'Creating your realm' } };
    function report(progress) { current.progress = progress; current.onProgress?.(progress); }
    current.promise = new Promise(resolve => { current.resolve = resolve; });
    job = current;
    preparation = "preparing";
    coverageSec = 0;
    report(current.progress);
    function checkpoint(force = false) {
      if (!checkpoints || !current.cache || current.restoring || current.persistenceFailed) return Promise.resolve();
      const end = current.cache.getForecastAsyncMeta().forecastAsyncEndSec;
      if (end === current.checkpointEnd) return checkpointQueue;
      if (!force && (current.pendingWrites || now() - current.checkpointAt < checkpointIntervalMs)) return Promise.resolve();
      const forecast = end > 0 ? current.cache.exportForecastChunk(end)
        : { baseSec: 0, endSec: 0, stepSec: 1, stateDataBySecond: [], summaryBySecond: [], lastStateData: current.timeline.baseStateData };
      const ref = { key, owner: current.owner };
      checkpointRef = ref;
      current.checkpointAt = now(); current.checkpointEnd = end; current.pendingWrites++;
      checkpointQueue = checkpointQueue.then(() => checkpoints.write(key, {
        owner: current.owner, stateData: current.timeline.baseStateData, forecast,
      })).catch(() => { current.persistenceFailed = true; }).finally(() => { current.pendingWrites--; });
      return checkpointQueue;
    }
    current.off = lifecycle?.subscribe(suspended => {
      if (job !== current || current.finished) return;
      clearTimeout(current.timer);
      if (suspended) {
        current.worker?.dispose(); current.worker = null;
        void checkpoint(true);
      } else if (current.step) {
        current.timer = setTimeout(current.step, 0);
      } else if (!current.started) {
        current.timer = setTimeout(current.start, 0);
      }
    });
    // Let the menu paint before constructing the world and priming the worker.
    current.start = async () => {
      current.started = true;
      try {
        await lifecycle?.waitUntilActive();
        if (job !== current) return;
        if (loadPrepared) {
          report({stage:"forecast",label:"Loading prepared performance start"});
          const prepared = await loadPrepared();
          if (job !== current) return;
          current.state = prepared.state; current.onState?.(prepared.state);
          coverageSec = prepared.lossSec??prepared.forecast.endSec; preparation = "ready";
          current.resolve(prepared); return;
        }
        let recovered = null;
        if (checkpoints) {
          try {
            await checkpointQueue;
            const record = await checkpoints.read(key);
            if (job !== current) {
              if (record && current.discarded) void clearCheckpoint({ key, owner: record.owner });
              return;
            }
            if (record) {
              try {
                recovered = validateOpeningCheckpoint(record, searchLimitSec);
                current.owner = record.owner;
                checkpointRef = { key, owner: record.owner };
                current.checkpointEnd = recovered.forecast.endSec;
                current.checkpointAt = now();
              }
              catch { await clearCheckpoint({ key, owner: record.owner }); }
            }
          } catch { current.persistenceFailed = true; }
        }
        await lifecycle?.waitUntilActive();
        if (job !== current) return;
        const state = recovered?.state ?? createState();
        current.state = state;
        current.onState?.(state);
        const timeline = createEmptyTimelineFromBase(state);
        const cache = createCache();
        current.cache = cache; current.timeline = timeline;
        if (recovered && recovered.forecast.endSec > 0) {
          current.restoring = true;
          report({ stage: 'forecast', label: 'Restoring your opening future', completed: recovered.forecast.endSec });
          const merged = await mergePreparedForecast({ cache, timeline, forecast: recovered.forecast,
            isCurrent: () => job === current,
            yieldTask: async () => { await lifecycle?.waitUntilActive(); await new Promise(resolve => setTimeout(resolve, 0)); },
          });
          if (!merged.ok) throw new Error(merged.reason);
          current.restoring = false;
        }
        if (job !== current) return;
        coverageSec = recovered?.forecast.endSec ?? 0;
        report({ stage: 'forecast', label: 'Simulating your opening future',
          detail: recovered ? `Resuming from game second ${coverageSec}` : 'Starting the forecast worker…', completed: coverageSec });
        await checkpoint(true);
        let lastCoverage = coverageSec;
        let lastProgress = now();
        function step() {
          if (job !== current || current.finished || lifecycle?.isSuspended()) return;
          try {
            const cachedEnd = cache.getForecastAsyncMeta().forecastAsyncEndSec;
            const alreadyReady = cache.getSummary(cachedEnd)?.runComplete || cachedEnd >= searchLimitSec;
            const worker = alreadyReady ? null : (current.worker ??= createWorkerService());
            const result = alreadyReady ? { ok: true, coverageEndSec: cachedEnd } : worker.requestCoverage({
              projectionCache: cache, timeline, timelineToken: cache.getTimelineToken(timeline),
              historyEndSec: 0, stepSec: 1, desiredEndSec: searchLimitSec,
              boundaryStateData: timeline.baseStateData, scheduledActionsBySecond: [],
            });
            if (!result.ok) throw new Error(result.reason);
            const coverage = result.coverageEndSec;
            coverageSec = coverage;
            report({ stage: 'forecast', label: 'Simulating your opening future',
              detail: `Forecast reached game second ${coverage}${result.reason?.startsWith('localFallback') ? ' · running on this device' : ''}`,
              completed: coverage });
            if (coverage > lastCoverage) { lastCoverage = coverage; lastProgress = now(); }
            const summary = cache.getSummary(coverage);
            if (summary?.runComplete || coverage>=searchLimitSec) {
              const end = summary?.runComplete?(summary.runLossSec??coverage):coverage;
              const terminal = cache.getStateData(end);
              if (summary?.runComplete&&!terminal?.runStatus?.complete) throw new Error("missingTerminalPreview");
              current.finished = true;
              current.off?.();
              current.worker?.dispose();
              preparation = "ready";
              report({ stage: 'forecast', label: 'Opening future ready',
                detail: `Prepared through game second ${end}`, completed: end, total: end });
              const prepared = { ok: true, state, lossSec: summary?.runComplete?end:null,
                checkpointRef: checkpoints ? { key, owner: current.owner } : null,
                forecast: cache.exportForecastChunk(end) };
              void checkpoint(true).then(() => { if (job === current) current.resolve(prepared); });
              return;
            }
            void checkpoint();
            if (!result.pending || now() - lastProgress > 30000) {
              throw new Error("forecastIncomplete");
            }
            current.timer = setTimeout(step, 32);
          } catch (error) { fail(error); }
        }
        current.step = step;
        current.timer = setTimeout(step, 0);
      } catch (error) { fail(error); }
      function fail(error) {
        if (job !== current) return;
        current.worker?.dispose();
        current.off?.();
        preparation = "error";
        current.resolve({ ok: false, reason: error.message });
      }
    };
    current.timer = setTimeout(current.start, 0);
    return current.promise;
  }

  return {
    prepare, cancel, clearCheckpoint,
    setPreparedLoader(loader) {
      cancel({ discard: true });
      phase = 'idle'; elapsedSec = 0; lossSec = null;
      loadPrepared = loader;
    },
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
