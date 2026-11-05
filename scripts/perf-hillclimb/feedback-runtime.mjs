// Browser observer under construction after independent static R1.
// Job adapters and native ordering/render proof remain mandatory.
export function installFeedbackObserver({maxRetainedOperations = 16, replaceDrained = false} = {}) {
  if (globalThis.__HC__?.active) throw new Error('install feedback observer outside host operation clocks');
  if (!Number.isInteger(maxRetainedOperations) || maxRetainedOperations < 1 || maxRetainedOperations > 128) {
    throw new Error('bounded retained-operation capacity required');
  }
  const previous = globalThis.__HC_FEEDBACK__;
  const prior = previous?.status?.() ?? null;
  if (previous && (!replaceDrained || prior?.active || prior?.retainedRecords !== 0)) {
    throw new Error('feedback replacement requires explicit drained inactive session');
  }
  const now = () => performance.now();
  const copy = value => JSON.parse(JSON.stringify(value));
  const describeError = error => error instanceof Error ? error.message : String(error);
  const history = [];
  let active = null;
  const totals = {
    generation: (prior?.generation ?? 0) + 1,
    createdRecords: prior?.createdRecords ?? 0,
    collectedRecords: prior?.collectedRecords ?? 0,
    exportedRecords: prior?.exportedRecords ?? 0,
    exportBatches: prior?.exportBatches ?? 0,
    rejectedArms: prior?.rejectedArms ?? 0,
    failedArms: prior?.failedArms ?? 0,
    explicitReplacements: (prior?.explicitReplacements ?? 0) + (previous ? 1 : 0),
  };
  const status = () => ({...totals, active: active !== null,
    phase: active?.state.phase ?? null, error: active?.state.error ?? null,
    firstFeedbackAtMs: active?.state.firstFeedbackAtMs ?? null,
    firstFeedbackMs: active?.state.firstFeedbackMs ?? null,
    retainedRecords: history.length, maxRetainedOperations,
    exportScope: 'export means drained to caller, not durable disk persistence'});
  const outsideClock = () => {
    if (globalThis.__HC__?.active) throw new Error('full feedback export is forbidden under a host operation clock');
  };
  const rejectArm = message => { totals.rejectedArms++; throw new Error(message); };
  const validCue = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new Error('feedback cue must be a plain synchronous DTO');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string')) throw new Error('feedback cue symbol fields are forbidden');
    keys.sort();
    const required = ['responseKey', 'sourceKey', 'sourceValid', 'visible'];
    if (keys.length !== required.length || keys.some((key, i) => key !== required[i])) {
      throw new Error('feedback cue requires exactly responseKey/sourceKey/sourceValid/visible');
    }
    for (const key of keys) {
      if (!Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable) {
        throw new Error('feedback cue accessors/nonenumerable fields are forbidden');
      }
    }
    const cue = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
    if (typeof cue.visible !== 'boolean' || typeof cue.sourceValid !== 'boolean'
      || typeof cue.responseKey !== 'string' || cue.responseKey.length > 4096
      || typeof cue.sourceKey !== 'string' || !cue.sourceKey.length || cue.sourceKey.length > 4096) {
      throw new Error('invalid feedback cue primitive fields');
    }
    return cue;
  };

  function arm({operationId, binding, readCue, backgroundStart = false}) {
    const runtime = globalThis.__HC__, operation = runtime?.active;
    if (active) return rejectArm('overlapping feedback observation');
    if (history.length >= maxRetainedOperations) return rejectArm('drain retained feedback before arming another host operation');
    if (runtime?.version !== 4 || operation?.id !== operationId) return rejectArm('current runtimev4 operation required');
    if (operation.started !== null && !backgroundStart) return rejectArm('feedback must arm before real input');
    if(backgroundStart && (operation.started === null || operation.eventTimeStamp != null))return rejectArm('explicit original background clock required');
    if (typeof readCue !== 'function' || typeof binding !== 'string' || !binding.length) {
      return rejectArm('named feedback binding and synchronous cue reader required');
    }
    if (!Number.isFinite(operation.timeoutMs) || operation.timeoutMs <= 0 || !Number.isFinite(operation.armed)) {
      return rejectArm('finite host operation deadline required');
    }
    totals.createdRecords++;
    let frameId = null, deadlineId = null, postDispatchId = null;
    let candidate = null, preInput = null, finalized = false, collected = false;
    const state = {
      version: 3, generation: totals.generation, operationId, binding, event: operation.event,
      phase: 'arming', armedAtMs: now(), startedAtMs: null,
      hostHandlerAtMs: null, inputQueueMs: null, hostCaptureReadMs: null,
      observerHandlerAtMs: null, hostToObserverMs: null,
      preHandlerAtMs: null, preHandlerQueueMs: null, preHandlerCue: null,
      preHandlerOrdering: 'window capture; adapter must prove this precedes its app mutation path',
      baseline: null, inputBaselineMatches: null, trustedInput: null,
      postDispatchAtMs: null, firstResponseSemanticMs: null,
      firstChangedAtMs: null, firstChangedFrameAtMs: null,
      firstFeedbackAtMs: null, firstFeedbackMs: null,
      lateValidatedAtMs: null, lateValidatedFeedbackMs: null,
      frameValidations: 2, observedArmedEventCount: 0,
      readCount: 0, readCpuMs: 0, maxReadCpuMs: 0,
      lastCueReadAtMs: null, lastFrameCueReadAtMs: null, lastNegativeFrameCueAtMs: null,
      readSamples: [], readSamplesTruncated: false,
      rejectedCandidates: [], rejectedCandidatesTruncated: false,
      observerError: null, error: null, censor: null, stoppedAtMs: null,
      hostAtStop: null, hostAtCollection: null,
      scope: 'action-related retained cue plus double-rAF opportunity; no physical scanout claim',
      detectionScope: 'cancellable post-dispatch timer task, then frame probes; task scheduling delay included',
    };
    const remember = (list, item, truncatedKey) => {
      if (list.length < 512) list.push(item); else state[truncatedKey] = true;
    };
    const host = () => {
      const globalRuntimeMatches = globalThis.__HC__ === runtime;
      const activeMatches = runtime.active === operation;
      const recordedLast = runtime.operations.at(-1) === operation;
      const error = operation.error == null ? null : String(operation.error);
      const timeout = operation.timeout === true;
      const status = !globalRuntimeMatches ? 'runtime-replaced'
        : runtime.active && !activeMatches ? 'operation-replaced'
        : error !== null ? 'error'
        : timeout ? 'timeout'
        : activeMatches ? 'active'
        : runtime.active === null && recordedLast && Number.isFinite(operation.finished) ? 'completed'
        : 'operation-missing';
      return {status, globalRuntimeMatches, activeMatches, recordedLast, error, timeout,
        startedAtMs: operation.started, handlerAtMs: operation.handlerStarted ?? null,
        inputQueueMs: operation.inputQueueMs ?? null, finishedAtMs: operation.finished ?? null,
        trustedInput: operation.trustedInput ?? null};
    };
    const hostFailed = h => !['active', 'completed'].includes(h.status);
    const read = label => {
      const began = now(); let failure = null, cue = null;
      try { cue = validCue(readCue()); return cue; }
      catch (error) { failure = describeError(error); throw error; }
      finally {
        const cost = now() - began;
        state.readCount++; state.readCpuMs += cost;
        state.maxReadCpuMs = Math.max(state.maxReadCpuMs, cost);
        remember(state.readSamples, {atMs: began, cpuMs: cost, label, failure, cue}, 'readSamplesTruncated');
      }
    };
    const clear = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      clearTimeout(deadlineId); clearTimeout(postDispatchId);
      deadlineId = null; postDispatchId = null;
      window.removeEventListener(operation.event, onPreInput, {capture: true});
      document.removeEventListener(operation.event, onInput, {capture: true});
    };
    const rejectCandidate = reason => {
      if (!candidate) return;
      remember(state.rejectedCandidates,
        {semanticAtMs: candidate.semanticAtMs, rejectedAtMs: now(), reason,
          validatedFrames: candidate.validatedFrames, sourceKey: candidate.sourceKey},
        'rejectedCandidatesTruncated');
      candidate = null;
    };
    const finalize = (phase, reason = null) => {
      if (finalized) return;
      const outcome = host();
      state.hostAtStop = outcome;
      state.phase = phase;
      if (phase === 'failed') state.observerError = reason;
      if (hostFailed(outcome) && phase !== 'completed' && phase !== 'failed') {
        state.phase = outcome.status === 'timeout' ? 'censored' : 'cancelled';
        reason = outcome.error ?? `host operation ${outcome.status}`;
      }
      state.error = state.observerError ?? outcome.error;
      if (state.phase === 'censored' || state.phase === 'cancelled') state.censor = reason;
      state.stoppedAtMs = now(); finalized = true; clear();
    };
    const reconcileBeforeObservation = () => {
      const outcome = host();
      if (!hostFailed(outcome)) return true;
      rejectCandidate(`host operation ${outcome.status}`);
      finalize(outcome.status === 'timeout' ? 'censored' : 'cancelled', outcome.error ?? outcome.status);
      return false;
    };
    const deadline = () => {
      clearTimeout(deadlineId);
      const start = state.startedAtMs ?? operation.armed;
      deadlineId = setTimeout(() => {
        deadlineId = null;
        if (!reconcileBeforeObservation()) return;
        rejectCandidate('feedback observation deadline');
        finalize('censored', state.startedAtMs === null
          ? 'no trusted operation input before deadline'
          : 'no validated visible response before operation deadline');
      }, Math.max(0, start + operation.timeoutMs - now()));
    };
    const observe = (isFrame, label) => {
      if (finalized || state.startedAtMs === null || !reconcileBeforeObservation()) return;
      let cue;
      try { cue = read(label); }
      catch (error) { rejectCandidate('cue reader failed'); finalize('failed', describeError(error)); return; }
      state.lastCueReadAtMs = now();
      if (isFrame) state.lastFrameCueReadAtMs = state.lastCueReadAtMs;
      const changed = cue.sourceValid && cue.visible
        && (!state.baseline.visible || cue.responseKey !== state.baseline.responseKey);
      if (!changed) {
        if (isFrame && cue.sourceValid) state.lastNegativeFrameCueAtMs = state.lastFrameCueReadAtMs;
        rejectCandidate(!cue.sourceValid ? 'source correspondence unavailable'
          : !cue.visible ? 'cue is not visible' : 'cue returned to baseline');
        return;
      }
      if (candidate && candidate.sourceKey !== cue.sourceKey) rejectCandidate('cue source lineage changed');
      state.firstChangedAtMs ??= now();
      if (isFrame) state.firstChangedFrameAtMs ??= now();
      if (!candidate) {
        // Detection in rAF already supplies the first of two sampled frames.
        // Do not add an unintended third callback when the task saw baseline.
        candidate = {semanticAtMs: now(), sourceKey: cue.sourceKey, validatedFrames: isFrame ? 1 : 0};
        return;
      }
      if (!isFrame) return;
      candidate.validatedFrames++;
      if (candidate.validatedFrames < state.frameValidations) return;
      const validatedAtMs = now(), elapsedMs = validatedAtMs - state.startedAtMs;
      state.firstResponseSemanticMs = candidate.semanticAtMs - state.startedAtMs;
      state.validatedCue = cue;
      if (elapsedMs > operation.timeoutMs) {
        state.lateValidatedAtMs = validatedAtMs;
        state.lateValidatedFeedbackMs = elapsedMs;
        rejectCandidate('validated response exceeded deadline');
        finalize('censored', 'response was only validated after deadline');
      } else {
        state.firstFeedbackAtMs = validatedAtMs; state.firstFeedbackMs = elapsedMs;
        finalize('completed');
      }
    };
    const tick = () => {
      frameId = null; observe(true, 'animation-frame');
      if (!finalized) frameId = requestAnimationFrame(tick);
    };
    function onPreInput(event) {
      if (finalized || preInput || !event.isTrusted) return;
      if (!reconcileBeforeObservation()) return;
      state.preHandlerAtMs = now();
      state.preHandlerQueueMs = state.preHandlerAtMs - event.timeStamp;
      try {
        const cue = read('input-window-capture-before-app');
        state.preHandlerCue = cue;
        state.inputBaselineMatches = cue.sourceValid
          && cue.sourceKey === state.baseline.sourceKey
          && cue.visible === state.baseline.visible && cue.responseKey === state.baseline.responseKey;
        if (!state.inputBaselineMatches) throw new Error('arm-to-input visual/source drift; no action feedback inference');
        preInput = {event, cue};
      } catch (error) { finalize('failed', describeError(error)); }
    }
    function onInput(event) {
      if (finalized || !event.isTrusted) return;
      state.observedArmedEventCount++;
      if (state.startedAtMs !== null) return;
      if (!reconcileBeforeObservation()) return;
      const observerAt = now();
      if (!preInput || preInput.event !== event || runtime.active !== operation
        || operation.trustedInput !== true || operation.started !== event.timeStamp
        || operation.eventTimeStamp !== event.timeStamp
        || !Number.isFinite(operation.handlerStarted) || !Number.isFinite(operation.inputQueueMs)
        || operation.inputQueueMs !== operation.handlerStarted - operation.started
        || !Number.isFinite(event.timeStamp) || event.timeStamp < 0 || event.timeStamp > observerAt + 1) {
        finalize('failed', 'feedback input does not match pre-handler/HC trusted timestamp'); return;
      }
      state.startedAtMs = operation.started;
      state.hostHandlerAtMs = operation.handlerStarted;
      state.inputQueueMs = operation.inputQueueMs;
      state.hostCaptureReadMs = operation.inputTimingReadMs ?? null;
      state.observerHandlerAtMs = observerAt;
      state.hostToObserverMs = observerAt - operation.handlerStarted;
      state.trustedInput = true; state.phase = 'observing'; deadline();
      // A timer task is cancellable and does not claim microtask/target ordering.
      // Its actual native ordering and observation delay require controls.
      postDispatchId = setTimeout(() => {
        postDispatchId = null; state.postDispatchAtMs = now();
        observe(false, 'post-dispatch-timer-task');
        if (!finalized) frameId = requestAnimationFrame(tick);
      }, 0);
    }
    const controller = {
      state,
      finish() {
        const collectionStarted = now();
        outsideClock();
        if (collected) throw new Error('feedback record already collected');
        if (!finalized) {
          if (reconcileBeforeObservation()) {
            rejectCandidate('completion collected before a validated cue');
            finalize('censored', 'no validated visible response by collection');
          }
        }
        state.hostAtCollection = host();
        state.error = state.observerError ?? state.hostAtStop?.error ?? state.hostAtCollection.error;
        state.overallStatus = hostFailed(state.hostAtCollection) || state.phase === 'failed'
          ? 'failed' : state.phase;
        state.hostEndAtMs = state.hostAtCollection.finishedAtMs;
        state.completionAtMs = state.hostAtCollection.status === 'completed'
          ? state.hostAtCollection.finishedAtMs : null;
        const markerAtMs = state.firstFeedbackAtMs ?? state.lateValidatedAtMs;
        state.markerAfterHostEnd = markerAtMs !== null && state.hostEndAtMs !== null
          ? markerAtMs > state.hostEndAtMs : null;
        state.markerAfterCompletion = markerAtMs !== null && state.completionAtMs !== null
          ? markerAtMs > state.completionAtMs : null;
        state.censorAtMs = state.phase === 'censored' && state.startedAtMs !== null
          ? state.lastNegativeFrameCueAtMs : null;
        state.censorScope = state.censorAtMs === null ? 'no supported negative-frame bound'
          : 'last sampled valid-source negative retained cue; no physical absence claim';
        state.comparisonEligible = false;
        state.eligibilityScope = 'construction draft; adapters/controls/overhead/native corroboration unaudited';
        const result = copy(state);
        history.push(result); totals.collectedRecords++; collected = true;
        if (active === controller) active = null;
        const returned = copy(result);
        returned.collectionCpuMs = now() - collectionStarted;
        returned.collectionScope = 'outside host clock; validation and full record copies; host RPC separately measured';
        result.collectionCpuMs = returned.collectionCpuMs;
        result.collectionScope = returned.collectionScope;
        return returned;
      },
      cancel(reason) {
        if (globalThis.__HC__ === runtime && runtime.active === operation) runtime.cancel(reason);
        rejectCandidate('observer/host paired cancellation'); finalize('cancelled', String(reason));
        return controller.finish();
      },
    };
    active = controller;
    try {
      state.baseline = read('before-input-arm-baseline');
      if (!state.baseline.sourceValid) throw new Error('feedback baseline source correspondence invalid');
      if(backgroundStart){
        state.startedAtMs=operation.started;state.phase='observing';
        state.preHandlerOrdering='background clock; no input dispatch or physical feedback claim';
        state.backgroundStart=true;deadline();
        postDispatchId=setTimeout(()=>{postDispatchId=null;observe(false,'background-task');if(!finalized)frameId=requestAnimationFrame(tick);},0);
        return operationId;
      }
      state.phase = 'waiting-input';
      window.addEventListener(operation.event, onPreInput, {capture: true});
      document.addEventListener(operation.event, onInput, {capture: true});
      deadline(); return operationId;
    } catch (error) {
      totals.failedArms++;
      if (globalThis.__HC__ === runtime && runtime.active === operation) runtime.cancel(describeError(error));
      finalize('failed', describeError(error)); controller.finish(); throw error;
    }
  }

  globalThis.__HC_FEEDBACK__ = {
    version: 3, arm, status,
    snapshot: () => { outsideClock(); return active ? copy(active.state) : null; },
    finish: () => { if (!active) throw new Error('no armed feedback observer'); return active.finish(); },
    cancel: reason => active?.cancel(reason) ?? null,
    history: () => {
      outsideClock(); if (active) throw new Error('collect active feedback before full history export');
      return copy(history);
    },
    drain: () => {
      outsideClock(); if (active) throw new Error('collect active feedback before drain');
      const began = now(), records = copy(history), count = records.length;
      history.length = 0; totals.exportedRecords += count; totals.exportBatches++;
      return {records, status: status(), exportCpuMs: now() - began,
        scope: 'outside-clock export to caller; caller must persist and retain its own failures'};
    },
  };
}
