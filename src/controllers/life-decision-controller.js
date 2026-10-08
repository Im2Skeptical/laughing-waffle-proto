import { applyAction, ActionKinds } from '../model/actions.js';
import { serializeGameState, deserializeGameState } from '../model/state.js';
import { freezeForecastChunkConfigs } from '../model/timegraph/forecast-wire.js';
import { LIFE_DRAFT_ACTIONS, runLifeDecisionJob } from '../model/vassal-life-map/decision-preparation.js';
import {
  getCurrentLifeMapVassal, getVassalNodeDecisionPresentation, getVassalPendingResolution,
} from '../model/vassal-life-map.js';

const TRANSACTIONS = new Set([
  ActionKinds.VASSAL_ENTER_LIFE_NODE, ActionKinds.VASSAL_REROLL_SHOP,
  ActionKinds.VASSAL_CONFIRM_LIFE_NODE, ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT,
]);
const workerUrl = typeof __LIFE_DECISION_WORKER_URL__ !== 'undefined'
  ? __LIFE_DECISION_WORKER_URL__ : './life-decision-worker.js';

// Drafts are controller-owned and never enter the timeline until a transaction
// succeeds. Every worker result is tied to the frontier it was prepared from.
export function createLifeDecisionController({
  getRunner, getState, onChange = () => {}, onPrepare = () => {}, onPrepareChoices = () => {}, onChunk = () => {},
  createWorker = () => new Worker(new URL(workerUrl, import.meta.url), { type: 'module' }),
  workerTimeoutMs = 15000,
}) {
  let adopting = false;
  let base = null, draft = null, actions = [], worker = null, requestId = 0;
  let job = null, nodes = {}, revision = 0;
  const presentations = new Map();
  let workerTimeout = null;

  function token() {
    const timeline = getRunner().getTimeline();
    return { timeline, revision: timeline?.revision, sec: Math.floor(timeline?.historyEndSec ?? 0) };
  }
  function matches(expected) {
    const now = token();
    return expected && now.timeline === expected.timeline
      && now.revision === expected.revision && now.sec === expected.sec;
  }
  function stopWorker() {
    clearTimeout(workerTimeout);
    workerTimeout = null;
    worker?.terminate();
    worker = null;
  }
  function sync() {
    if (adopting || matches(base)) return;
    stopWorker();
    requestId++;
    base = token();
    draft = null;
    actions = [];
    nodes = {};
    presentations.clear();
    job = null;
    revision++;
  }
  function current() { sync(); return draft ?? getState(); }
  function changed() { presentations.clear(); revision++; onChange(); }
  function fail(reason) {
    if (!job) return;
    job.error = reason;
    job.phase = 'error';
    job.ready = false;
    stopWorker();
    onChange();
  }
  function adopt(batch, stateData, options) {
    adopting = true;
    try {
      return getRunner().dispatchPreparedActionsAtCurrentSecond(batch, stateData, base, options);
    } finally { adopting = false; }
  }
  async function handleMessage(data, payload, accept, id) {
    if (data.kind === 'error') { fail(data.reason); return; }
    if (data.kind === 'accepted') {
      const result = adopt(payload.actions, data.stateData,
        { viewInvalidationReason: job.staged ? 'vassalDecisionStaged' : undefined });
      if (!result.ok) { fail(result.reason); return; }
      base = token();
      draft = null;
      actions = [];
      presentations.clear();
      nodes = {};
      job.accepted = true;
      job.stateData = data.stateData;
      job.targetSec = getVassalPendingResolution(deserializeGameState(data.stateData))?.resolveSec ?? base.sec;
      job.revealSec = job.targetSec;
      job.phase = 'resolving';
      if (job.targetSec > base.sec) accept?.(result);
      else job.acceptAfterReady = () => accept?.(result);
      changed();
    } else if (data.kind === 'chunk') {
      // Snapshots in one message share a config after structured clone; only
      // a frozen config may be shared between cached anchors.
      freezeForecastChunkConfigs(data.chunk);
      job.computedSec = data.chunk.endSec;
      job.targetSec = data.targetSec;
      job.summaries ??= new Map();
      for (const [sec, summary] of data.chunk.summaryBySecond) job.summaries.set(sec, summary);
      onChunk(data.chunk);
    } else if (data.kind === 'preparing') {
      job.phase = 'preparing';
      job.targetSec = data.stateData.tSec;
      job.revealSec = Math.min(job.revealSec ?? job.targetSec, job.targetSec);
      job.uiPreparation = Promise.resolve(onPrepare(deserializeGameState(data.stateData)));
      const preparingJob = job;
      job.uiPreparation.catch(error => {
        if (id === requestId && job === preparingJob) fail(error.message);
      });
    } else if (data.kind === 'ready') {
      const preparedJob = job;
      await preparedJob.uiPreparation;
      if (id !== requestId || job !== preparedJob || job.error || !matches(base)) return;
      const choicesReady = onPrepareChoices(data.nodes, deserializeGameState(data.stateData));
      if (choicesReady) await choicesReady;
      if (id !== requestId || job !== preparedJob || job.error || !matches(base)) return;
      nodes = data.nodes;
      job.stateData = data.stateData;
      job.targetSec = data.stateData.tSec;
      job.ready = true;
      job.phase = 'revealing';
      const completed = job.targetSec <= base.sec ? job.acceptAfterReady : null;
      if (job.targetSec <= base.sec) {
        // Prepare the mutable draft before controls become interactive.
        draft = deserializeGameState(data.stateData);
        job = null;
      }
      stopWorker();
      changed();
      completed?.();
    }
  }
  function startLocal(payload, accept) {
    stopWorker();
    // Invalidate late worker messages and abandon in-flight UI preparation.
    const id = ++requestId;
    const localJob = job;
    const localPayload = job.accepted
      ? { stateData: job.stateData, actions: [], prepareOnly: true } : payload;
    const isCurrent = () => id === requestId && job === localJob && !job.error && matches(base);
    const yieldTask = async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!isCurrent()) throw new Error('cancelled');
    };
    const receive = data => {
      if (!isCurrent()) return;
      handleMessage(data, localPayload, accept, id).catch(error => {
        if (id === requestId && job === localJob) fail(error.message);
      });
    };
    // The same isolated transaction/tick code serves both execution paths.
    // Yield before starting and between chunks/nodes so recovery stays usable.
    yieldTask().then(() => runLifeDecisionJob(localPayload, receive, yieldTask)).catch(error => {
      if (id === requestId && job === localJob) {
        if (!matches(base)) sync();
        else fail(error.message);
      }
    });
  }
  function start(payload, accept) {
    stopWorker();
    const id = ++requestId;
    try {
      worker = createWorker();
      const fallback = event => {
        event?.preventDefault?.();
        if (id === requestId && job && !job.error) {
          if (!matches(base)) sync();
          else startLocal(payload, accept);
        }
      };
      const watch = () => {
        clearTimeout(workerTimeout);
        workerTimeout = setTimeout(fallback, workerTimeoutMs);
      };
      worker.onerror = fallback;
      worker.onmessageerror = fallback;
      worker.onmessage = ({ data }) => {
        if (id !== requestId || data.requestId !== id || !job || job.error) return;
        if (!matches(base)) { sync(); return; }
        if (data.kind === 'ready') stopWorker();
        else watch();
        handleMessage(data, payload, accept, id).catch(error => {
          if (id === requestId) fail(error.message);
        });
      };
      watch();
      worker.postMessage({ ...payload, requestId: id });
    } catch { startLocal(payload, accept); }
  }

  return {
    handles: kind => LIFE_DRAFT_ACTIONS.has(kind) || TRANSACTIONS.has(kind),
    getState: current,
    getStatus() {
      sync();
      return job ? { phase: job.phase, error: job.error, canReturn: !job.accepted, ready: job.ready === true,
        startSec: base.sec, targetSec: job.targetSec, computedSec: job.computedSec ?? base.sec } : null;
    },
    getResolution() {
      sync();
      return job?.accepted && job.targetSec > base.sec ? job : null;
    },
    getReadinessCap() {
      sync();
      return job?.accepted && job.targetSec > base.sec && !job.ready
        ? Math.max(base.sec, (job.revealSec ?? job.targetSec) - 1) : null;
    },
    commitResolution() {
      if (!job?.ready || !matches(base)) return { ok: false, reason: 'resolutionNotReady' };
      adopting = true;
      let result;
      try { result = getRunner().commitCursorSecond(job.targetSec, job.stateData); }
      finally { adopting = false; }
      if (result.ok) {
        base = token();
        job = null;
        draft = null;
        actions = [];
        changed();
      }
      return result;
    },
    resumePendingResolution() {
      sync();
      if (job) return false;
      const state = getState();
      if (state?.runStatus?.complete) return false;
      const pending = getVassalPendingResolution(state);
      if (!pending) return false;
      const stateData = serializeGameState(state);
      const targetSec = Math.max(base.sec + 1, pending.resolveSec);
      job = { phase: 'resolving', accepted: true, stateData, targetSec, revealSec: targetSec };
      start({ stateData, prepareOnly: true }, null);
      return true;
    },
    getPresentation(nodeId, preview) {
      const state = current();
      const key = JSON.stringify([revision, nodeId, preview]);
      if (!presentations.has(key)) {
        const cached = actions.length === 0 && !preview?.previewOptionId && !preview?.previewOfferId && !preview?.draftMove
          ? getCurrentLifeMapVassal(state)?.lifeMap.currentNodeId === nodeId
            ? nodes[nodeId]?.presentation : nodes[nodeId]?.entryPresentation
          : null;
        if (preview?.draftMove) return getVassalNodeDecisionPresentation(state, nodeId, preview);
        presentations.set(key, cached ?? getVassalNodeDecisionPresentation(state, nodeId, preview));
      }
      return presentations.get(key);
    },
    overlay(presentation) {
      const state = current();
      if (presentation.viewedSec !== presentation.frontierSec) return presentation;
      const vassal = getCurrentLifeMapVassal(state);
      return { ...presentation, state, vassal, profileVassal: vassal, readOnly: presentation.readOnly || !!job,
        decisionProcessing: job ? { phase: job.phase, error: job.error } : null };
    },
    dispatch(kind, payload, options, accept) {
      sync();
      if (job) return { ok: false, reason: 'decisionProcessing' };
      if (LIFE_DRAFT_ACTIONS.has(kind)) {
        draft ??= deserializeGameState(serializeGameState(getState()));
        const result = applyAction(draft, { kind, payload }, { isReplay: true });
        if (result.ok) { actions.push({ kind, payload }); changed(); }
        return result;
      }
      const cached = nodes[payload.nodeId];
      const prepared = kind === ActionKinds.VASSAL_ENTER_LIFE_NODE ? cached
        : kind === ActionKinds.VASSAL_REROLL_SHOP && actions.length === 0 ? cached?.reroll : null;
      if (prepared?.actions.length) {
        const result = adopt(prepared.actions, prepared.stateData, options);
        if (!result.ok) return result;
        base = token();
        draft = null;
        actions = [];
        nodes = kind === ActionKinds.VASSAL_ENTER_LIFE_NODE
          ? { [payload.nodeId]: { ...cached, actions: [] } }
          : { [payload.nodeId]: { ...prepared, actions: [] } };
        changed();
        accept?.(result);
        return result;
      }
      job = {
        phase: 'committing', staged: kind === ActionKinds.VASSAL_ENTER_LIFE_NODE, targetSec: base.sec,
        payload: { stateData: serializeGameState(getState()), actions: [...actions, { kind, payload }] }, accept,
      };
      onChange();
      start(job.payload, accept);
      return { ok: true, pending: true };
    },
    cancelFailure() {
      if (!job?.error || job.accepted) return {ok:false};
      const nodeId = job.payload?.actions.at(-1)?.payload?.nodeId;
      stopWorker();
      requestId++;
      job = null;
      changed();
      return {ok:true,nodeId};
    },
    retry() {
      if (!job?.error) return;
      job.error = null;
      job.ready = false;
      job.phase = 'committing';
      // Once accepted, retry only preparation. Never charge the transaction again.
      start(job.accepted ? { stateData: job.stateData, actions: [], prepareOnly: true } : job.payload,
        job.accepted ? null : job.accept);
      onChange();
    },
  };
}
