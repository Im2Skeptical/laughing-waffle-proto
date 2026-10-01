// Press feedback is immediate. Transaction progress belongs to the screen.
export function addInteractionFeedback(root, rect, { enabled = true, onActivate } = {}) {
  const overlay = new PIXI.Graphics();
  overlay.eventMode = 'none';
  root.addChild(overlay);
  let hovered = false;
  let pressed = false;
  let armed = false;
  function paint() {
    root.interactionState = !enabled ? 'disabled' : pressed ? 'pressed' : hovered ? 'hover' : 'idle';
    overlay.clear();
    if (enabled && (hovered || pressed)) {
      overlay.lineStyle(pressed ? 3 : 2, 0xffe5a3, .95)
        .beginFill(pressed ? 0x000000 : 0xffe5a3, pressed ? .3 : .12)
        .drawRoundedRect(rect.x, rect.y, rect.width, rect.height, 8).endFill();
    }
    root.cursor = enabled ? 'pointer' : 'default';
  }
  root.on('pointerover', event => { if (event.pointerType !== 'touch') hovered = true; paint(); });
  root.on('pointerdown', () => { if (enabled) { pressed = true; armed = true; paint(); } });
  root.on('pointerout', () => { hovered = false; pressed = false; armed = false; paint(); });
  for (const type of ['pointerupoutside', 'pointercancel']) {
    root.on(type, () => { pressed = false; armed = false; paint(); });
  }
  root.on('pointerup', () => { pressed = false; paint(); });
  root.on('pointertap', event => {
    event.stopPropagation();
    if (!enabled || !armed) return;
    armed = false;
    onActivate?.();
    if (!root.destroyed) paint();
  });
  root.setInteractionEnabled = value => {
    enabled = value === true;
    if (!enabled) { armed = false; pressed = false; }
    paint();
  };
  paint();
  return root;
}
