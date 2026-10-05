const seconds = ms => `${(ms / 1000).toFixed(1)}s`;

// Update only loading text/ink, preserving focus and the expanded timings panel.
export function createGameLoadingDom() {
  const element = document.createElement('section');
  element.className = 'game-loading-details';
  element.dataset.testid = 'game-loading-details';
  const stage = document.createElement('p');
  stage.className = 'game-loading-stage';
  stage.setAttribute('role', 'status');
  stage.setAttribute('aria-live', 'polite');
  const timing = document.createElement('p');
  const detail = document.createElement('p');
  const progress = document.createElement('div');
  progress.className = 'game-loading-progress';
  progress.setAttribute('role', 'progressbar');
  progress.dataset.testid = 'game-loading-progress';
  const pulse = document.createElement('span');
  progress.append(pulse);
  const failure = document.createElement('p');
  failure.className = 'game-loading-failure';
  const breakdown = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Loading timings';
  const stages = document.createElement('ol');
  breakdown.append(summary, stages);
  element.append(stage, timing, detail, progress, failure, breakdown);
  let previousPhase = null;
  return { element,
    reset() { previousPhase = null; breakdown.open = false; },
    update(status, failed = false) {
      const current = status?.stages.at(-1);
      const label = current?.label ?? 'Getting ready to open your chronicle';
      if (stage.textContent !== label) stage.textContent = label;
      timing.textContent = status ? `${seconds(status.elapsedMs)} total · ${seconds(current?.elapsedMs ?? 0)} in this stage` : 'Waiting for display setup…';
      detail.textContent = current?.detail ?? '';
      if (!failed && status?.phase === 'loading' && current?.completed != null && current.sinceProgressMs >= 5000) {
        detail.textContent += ` · ${seconds(current.sinceProgressMs)} since last progress`;
      }
      detail.hidden = !detail.textContent;
      progress.hidden = failed;
      progress.setAttribute('aria-label', label);
      progress.setAttribute('aria-valuetext', current?.detail || label);
      const determinate = current?.total > 0 && Number.isFinite(current.completed);
      pulse.className = determinate ? 'game-loading-fill' : 'game-loading-pulse';
      pulse.style.width = determinate ? `${Math.min(100, Math.max(0, current.completed / current.total * 100))}%` : '';
      for (const [key, value] of [['aria-valuemin', 0], ['aria-valuemax', current?.total], ['aria-valuenow', current?.completed]]) {
        if (determinate) progress.setAttribute(key, String(value));
        else progress.removeAttribute(key);
      }
      failure.textContent = failed ? `Stopped during: ${label}${status?.reason ? ` · ${status.reason}` : ''}` : '';
      failure.hidden = !failed;
      if (failed && previousPhase !== 'failed') breakdown.open = true;
      previousPhase = failed ? 'failed' : status?.phase;
      breakdown.hidden = !status?.stages.length;
      while (stages.children.length > (status?.stages.length ?? 0)) stages.lastChild.remove();
      for (const [index, entry] of (status?.stages ?? []).entries()) {
        const row = stages.children[index] ?? stages.appendChild(document.createElement('li'));
        row.textContent = `${entry.label} · ${seconds(entry.elapsedMs)}${entry.active ? ' · working' : ''}`;
      }
    },
  };
}
