// Input feedback only. One clock keeps the refused cost and visible banks in sync.
const banks = new Set();
const costOverlays = new WeakMap();
const DURATION_MS = 900;
let active = null;
let frame = null;

function overlay(parent, rect) {
  const node = new PIXI.Graphics();
  node.eventMode = 'none';
  node.lineStyle(4, 0xf0ad97).beginFill(0xf0ad97, .2)
    .drawRoundedRect(rect.x, rect.y, rect.width, rect.height, 8).endFill();
  node.visible = false;
  parent.addChild(node);
  return node;
}

export function addPrestigeBankFeedback(parent, rect) {
  const node = overlay(parent, rect);
  if (active && !active.cost.destroyed && active.cost.worldVisible) {
    node.visible = true;
    node.alpha = active.overlay.alpha;
  }
  banks.add(node);
  node.once('destroyed', () => banks.delete(node));
}

function update(now) {
  frame = null;
  const live = active && !active.cost.destroyed && active.cost.worldVisible;
  const elapsed = active ? now - active.startedAt : DURATION_MS;
  if (!live || elapsed >= DURATION_MS) {
    if (active && !active.overlay.destroyed) active.overlay.visible = false;
    for (const bank of banks) bank.visible = false;
    active = null;
    return;
  }
  const alpha = active.reduced ? 1 : .35 + .65 * (1 + Math.cos(elapsed * Math.PI * 2 / 450)) / 2;
  active.overlay.visible = true;
  active.overlay.alpha = alpha;
  for (const bank of banks) {
    bank.visible = bank.parent?.worldVisible === true;
    bank.alpha = alpha;
  }
  frame = requestAnimationFrame(update);
}

export function flashPrestigeShortfall(cost) {
  if (!cost || cost.destroyed || !cost.worldVisible) return;
  if (frame !== null) cancelAnimationFrame(frame);
  if (active && !active.overlay.destroyed) active.overlay.visible = false;
  let highlight = costOverlays.get(cost);
  if (!highlight) {
    highlight = overlay(cost, cost.hitArea);
    costOverlays.set(cost, highlight);
  }
  active = { cost, overlay: highlight, startedAt: performance.now(),
    reduced: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true };
  update(active.startedAt);
}

// Focused browser diagnostics, kept outside GameState and save/replay payloads.
export function getPrestigeFeedbackSnapshot() {
  const describe = node => ({ alpha: node.alpha, rect: node.getBounds() });
  return {
    active: !!active,
    cost: active && !active.overlay.destroyed ? describe(active.overlay) : null,
    banks: [...banks].filter(node => node.visible && node.worldVisible).map(describe),
  };
}
