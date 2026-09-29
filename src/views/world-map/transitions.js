// UI response time is independent of simulation/replay time, including while
// paused. A redraw samples an existing transition rather than restarting it.
export function createMapTransition({ apply, duration = 320,
  now = () => performance.now(),
  reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
} = {}) {
  let transition = null;
  const update = () => {
    if (!transition) return;
    const progress = Math.max(0, Math.min(1, (now() - transition.startedAt) / duration));
    const eased = 1 - (1 - progress) ** 3;
    const pose = Object.fromEntries(Object.keys(transition.to).map(key =>
      [key, transition.from[key] + (transition.to[key] - transition.from[key]) * eased]));
    apply(pose);
    if (progress === 1) transition = null;
  };
  return {
    start(from, to) {
      transition = reducedMotion() ? null : { from, to, startedAt: now() };
      apply(transition ? from : to);
    },
    update,
    cancel() { update(); transition = null; },
    finish() { if (transition) apply(transition.to); transition = null; },
    isActive: () => transition !== null,
  };
}

export function createMapPanelReveal(panel, rect, options = {}) {
  panel.pivot.set(rect.x, rect.y);
  let origin = null;
  const transition = createMapTransition({ ...options, duration: 240, apply(pose) {
    panel.position.set(pose.x, pose.y);
    panel.scale.set(pose.scale);
  } });
  return {
    open(point) {
      origin = { ...point };
      const scale = .06;
      transition.start({ x: point.x - rect.width * scale / 2,
        y: point.y - rect.height * scale / 2, scale },
      { x: rect.x, y: rect.y, scale: 1 });
      panel.eventMode = transition.isActive() ? 'none' : 'passive';
    },
    update() {
      transition.update();
      panel.eventMode = transition.isActive() ? 'none' : 'passive';
    },
    finish() { transition.finish(); panel.eventMode = 'passive'; },
    snapshot: () => ({ animating: transition.isActive(), origin,
      x: panel.position.x, y: panel.position.y, scale: panel.scale.x }),
  };
}
