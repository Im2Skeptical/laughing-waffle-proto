import { createLoadingLifecycle } from './loading-lifecycle.js';

const WORKER_URL = typeof __SAVE_LOAD_WORKER_URL__ === 'string'
  ? new URL(__SAVE_LOAD_WORKER_URL__, import.meta.url)
  : new URL('./save-load-worker.js', import.meta.url);

// A single entry owns this worker. Explicit cancellation terminates
// replay without installing a partial state in the live runner.
export function inspectSaveInWorker(text, { isCurrent = () => true,
  onProgress = () => {},
  lifecycle = null, progressTimeoutMs = 30000,
  createWorker = () => typeof Worker === 'function' ? new Worker(WORKER_URL, { type: 'module' }) : null,
} = {}) {
  if (!isCurrent()) return Promise.resolve({ ok: false, reason: 'cancelled' });
  let worker;
  try { worker = createWorker(); } catch { return Promise.resolve(null); }
  if (!worker) return Promise.resolve(null);
  const activity = lifecycle ?? createLoadingLifecycle();
  return new Promise(resolve => {
    let settled = false;
    let cancellation;
    let timeout;
    let lastProgress = activity.now();
    let unsubscribe;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearInterval(cancellation);
      clearTimeout(timeout);
      unsubscribe?.();
      if (!lifecycle) activity.dispose();
      worker.terminate();
      resolve(isCurrent() ? result : { ok: false, reason: 'cancelled' });
    };
    const armTimeout = () => {
      clearTimeout(timeout);
      if (settled || activity.isSuspended()) return;
      const remaining = progressTimeoutMs - (activity.now() - lastProgress);
      timeout = setTimeout(() => {
        if (activity.isSuspended()) return;
        if (activity.now() - lastProgress >= progressTimeoutMs) finish({ ok: false, reason: 'loadTimeout' });
        else armTimeout();
      }, Math.max(1, remaining));
    };
    const resetTimeout = () => { lastProgress = activity.now(); armTimeout(); };
    unsubscribe = activity.subscribe(() => armTimeout());
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data?.kind === 'historyProgress' || data?.kind === 'loadProgress') {
        if (isCurrent()) onProgress(data.kind === 'historyProgress'
          ? { stage: 'history', label: 'Preparing historical graphs',
            detail: `Game second ${data.coverageSec} of ${data.endSec}`,
            completed: data.coverageSec, total: data.endSec }
          : data.progress);
        resetTimeout(); return;
      }
      finish(data);
    };
    // Unsupported module workers retain the ordinary save inspector.
    worker.onerror = event => { event.preventDefault?.(); finish(null); };
    worker.onmessageerror = () => finish(null);
    cancellation = setInterval(() => { if (!isCurrent()) finish({ ok: false, reason: 'cancelled' }); }, 50);
    resetTimeout();
    try { worker.postMessage(text); } catch { finish(null); }
  });
}
