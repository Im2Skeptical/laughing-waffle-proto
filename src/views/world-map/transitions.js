// UI response time is independent of simulation/replay time, including while
// paused. A redraw samples an existing transition rather than restarting it.
export function createMapTransition({ apply, duration = 320,
  now = () => performance.now(),
  reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
} = {}) {
  let transition = null;
  const update = () => {
    if (!transition) return;
    const progress = Math.max(0, Math.min(1, (now() - transition.startedAt) / transition.duration));
    const eased = 1 - (1 - progress) ** 3;
    const pose = Object.fromEntries(Object.keys(transition.to).map(key =>
      [key, transition.from[key] + (transition.to[key] - transition.from[key]) * eased]));
    apply(pose);
    if (progress === 1) transition = null;
  };
  return {
    start(from, to, transitionDuration = duration) {
      transition = reducedMotion() ? null : { from, to, duration: transitionDuration, startedAt: now() };
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
  let phase = 'closed';
  panel.visible = false;
  const transition = createMapTransition({ ...options, duration: 240, apply(pose) {
    panel.position.set(pose.x, pose.y);
    panel.scale.set(pose.scale);
  } });
  const pose = () => ({ x: panel.position.x, y: panel.position.y, scale: panel.scale.x });
  const collapsed = point => ({ x: point.x - rect.width * .06 / 2,
    y: point.y - rect.height * .06 / 2, scale: .06 });
  const sync = () => {
    if (!transition.isActive()) {
      if (phase === 'opening') phase = 'open';
      if (phase === 'closing') phase = 'closed';
    }
    panel.visible = phase !== 'closed';
    panel.eventMode = phase === 'open' ? 'passive' : 'none';
  };
  return {
    open(point) {
      transition.cancel();
      const from = phase === 'closing' ? pose() : collapsed(point);
      origin = { ...point };
      phase = 'opening';
      transition.start(from, { x: rect.x, y: rect.y, scale: 1 });
      sync();
    },
    close(point) {
      transition.cancel();
      origin = { ...point };
      phase = 'closing';
      // Match the overview camera duration so both arrive together.
      transition.start(pose(), collapsed(point), 320);
      sync();
    },
    update() {
      transition.update();
      sync();
    },
    finish() { transition.finish(); sync(); },
    isClosing: () => phase === 'closing',
    snapshot: () => ({ animating: transition.isActive(), phase, origin,
      x: panel.position.x, y: panel.position.y, scale: panel.scale.x }),
  };
}
