// Browser lifetime and a foreground-only clock. Never advances game time.
export function createLoadingLifecycle({ document = globalThis.document,
  window = globalThis.window, now = () => performance.now() } = {}) {
  let suspended = Boolean(document?.hidden);
  let changedAt = now();
  let elapsed = 0;
  const listeners = new Set();
  const bindings = [];
  function setSuspended(value) {
    value = Boolean(value || document?.hidden);
    if (value === suspended) return;
    const time = now();
    if (!suspended) elapsed += Math.max(0, time - changedAt);
    changedAt = time;
    suspended = value;
    for (const listener of [...listeners]) listener(suspended);
  }
  function bind(target, event, callback) {
    target?.addEventListener(event, callback);
    bindings.push(() => target?.removeEventListener(event, callback));
  }
  bind(document, 'visibilitychange', () => setSuspended(document.hidden));
  bind(document, 'freeze', () => setSuspended(true));
  bind(document, 'resume', () => setSuspended(false));
  bind(window, 'pagehide', () => setSuspended(true));
  bind(window, 'pageshow', () => setSuspended(false));
  return {
    isSuspended: () => suspended,
    now: () => elapsed + (suspended ? 0 : Math.max(0, now() - changedAt)),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    waitUntilActive() {
      if (!suspended) return Promise.resolve();
      return new Promise(resolve => {
        const off = this.subscribe(value => { if (!value) { off(); resolve(); } });
      });
    },
    dispose() { bindings.forEach(unbind => unbind()); listeners.clear(); },
  };
}
