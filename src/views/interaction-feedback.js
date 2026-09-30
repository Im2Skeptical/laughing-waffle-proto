// Presentation-only feedback. Yield a painted pending state before synchronous
// actions, and keep the control's ancestors alive until the action starts.
export function addInteractionFeedback(root, rect, { enabled = true, onActivate, pendingLabel = 'Updating…' } = {}) {
  const overlay = new PIXI.Graphics();
  overlay.eventMode = 'none';
  let label = null;
  root.addChild(overlay);
  let hovered = false;
  let pressed = false;
  let pending = false;
  let armed = false;
  function paint() {
    root.interactionState = !enabled ? 'disabled' : pending ? 'pending' : pressed ? 'pressed' : hovered ? 'hover' : 'idle';
    overlay.clear();
    if (enabled && (hovered || pressed || pending)) {
      overlay.lineStyle(pressed || pending ? 3 : 2, 0xffe5a3, .95)
        .beginFill(pending ? 0x17211f : pressed ? 0x000000 : 0xffe5a3, pending ? .94 : pressed ? .3 : .12)
        .drawRoundedRect(rect.x, rect.y, rect.width, rect.height, 8).endFill();
    }
    if (pending && !label) {
      label = new PIXI.Text(pendingLabel, { fontFamily: 'Georgia', fontSize: 22, fill: 0xfff3ce, align: 'center' });
      label.anchor.set(.5);
      label.position.set(rect.x + rect.width / 2, rect.y + rect.height / 2);
      label.eventMode = 'none';
      root.addChild(label);
    }
    if (label) label.visible = pending;
    root.cursor = pending ? 'wait' : enabled ? 'pointer' : 'default';
  }
  root.on('pointerover', event => { if (event.pointerType !== 'touch') hovered = true; paint(); });
  root.on('pointerdown', () => { if (enabled && !pending) { pressed = true; armed = true; paint(); } });
  root.on('pointerout', () => { hovered = false; pressed = false; armed = false; paint(); });
  for (const type of ['pointerupoutside', 'pointercancel']) {
    root.on(type, () => { pressed = false; armed = false; paint(); });
  }
  root.on('pointerup', () => { pressed = false; paint(); });
  root.on('pointertap', event => {
    event.stopPropagation();
    if (!enabled || pending || !armed) return;
    armed = false;
    if (!onActivate) return;
    pending = true;
    const ancestors = [];
    for (let item = root; item; item = item.parent) {
      ancestors.push(item);
      item.pendingInteractionCount = (item.pendingInteractionCount ?? 0) + 1;
    }
    paint();
    // A task after the next paint avoids adding a second frame of input latency.
    requestAnimationFrame(() => setTimeout(() => {
      for (const item of ancestors) item.pendingInteractionCount--;
      try { if (!root.destroyed) onActivate(); }
      finally {
        pending = false;
        if (!root.destroyed) paint();
      }
    }, 0));
  });
  paint();
  return root;
}
