// Press feedback is immediate. Transaction progress belongs to the screen.
const activePresses = new Set();
const tapFeedback = new Set();
const TAP_FEEDBACK_MS = 180;

// The acknowledgement belongs to the stage so an immediate redraw/modal close
// cannot erase a quick tap before the renderer has shown it. Actions never wait.
function acknowledgeTap(root, drawFeedback) {
  if (!root.parent) return;
  let stage = root.parent;
  while (stage.parent) stage = stage.parent;
  root.getBounds(); // Update the control's transform before copying its position.
  const flash = new PIXI.Graphics();
  flash.eventMode = 'none';
  flash.zIndex = Number.MAX_SAFE_INTEGER;
  drawFeedback(flash, {pressed:true, hovered:false});
  flash.transform.setFromMatrix(stage.worldTransform.clone().invert().append(root.worldTransform));
  stage.addChild(flash);
  const startedAt = performance.now();
  const item = {flash, startedAt};
  tapFeedback.add(item);
  let firstFrameAt = null;
  function fade(now) {
    if (flash.destroyed || stage.destroyed) { tapFeedback.delete(item); return; }
    firstFrameAt ??= now;
    const age = now - firstFrameAt;
    if (age >= TAP_FEEDBACK_MS) {
      tapFeedback.delete(item);
      flash.destroy();
      return;
    }
    flash.alpha = Math.min(1, (TAP_FEEDBACK_MS - age) / 140);
    requestAnimationFrame(fade);
  }
  requestAnimationFrame(fade);
}

export function getTapFeedbackSnapshot() {
  return Array.from(tapFeedback, ({flash,startedAt}) => ({
    ageMs: performance.now() - startedAt, alpha: flash.alpha,
    shape: flash.geometry.graphicsData[0]?.shape.type === PIXI.SHAPES.POLY ? 'polygon' : 'rectangle',
    rect: flash.getBounds(),
  }));
}
// Pixi 7 does not forward native touchcancel/pointercancel. Clear the held
// control and its modal's pointer guard when the browser interrupts a gesture.
function cancelNativePresses(event) {
  const targets = new Set();
  for (const root of activePresses) {
    for (let target = root; target; target = target.parent) targets.add(target);
  }
  for (const target of targets) target.emit('pointercancel', event);
}
for (const type of ['touchcancel', 'pointercancel', 'blur']) {
  globalThis.addEventListener?.(type, cancelNativePresses, {capture:true});
}

export function addInteractionFeedback(root, rect, {
  enabled = true, onActivate, drawFeedback, onStateChange,
} = {}) {
  drawFeedback ??= (graphics, {pressed,hovered}) => {
    if (!pressed && !hovered) return;
    graphics.lineStyle(pressed ? 6 : 2, 0xffe5a3, 1)
      .beginFill(0xffe5a3, pressed ? .28 : .12)
      .drawRoundedRect(rect.x, rect.y, rect.width, rect.height, 8).endFill();
  };
  const overlay = new PIXI.Graphics();
  overlay.eventMode = 'none';
  root.addChild(overlay);
  let hovered = false;
  let pressed = false;
  let armed = false;
  root.on('destroyed', () => activePresses.delete(root));
  function paint() {
    if (pressed) activePresses.add(root);
    else activePresses.delete(root);
    root.interactionState = !enabled ? 'disabled' : pressed ? 'pressed' : hovered ? 'hover' : 'idle';
    overlay.clear();
    if (enabled) drawFeedback(overlay, {pressed,hovered});
    onStateChange?.(root.interactionState);
    root.cursor = enabled ? 'pointer' : 'default';
  }
  root.on('pointerover', event => {
    if (event.pointerType !== 'touch') hovered = true;
    // Sliding onto a control gives feedback without arming its action.
    if (enabled && event.pointerType === 'touch' && event.buttons > 0) pressed = true;
    paint();
  });
  // Touch has no hover before pointerdown, so its first move off a control may
  // not emit pointerout. Use Pixi's current hit path, including modal occlusion.
  root.on('globalpointermove', event => {
    if (event.pointerType !== 'touch') return;
    const inside = event.composedPath().includes(root);
    if (pressed && !inside) {
      pressed = false;
      armed = false;
      paint();
    } else if (enabled && inside && event.buttons > 0 && !pressed) {
      pressed = true;
      paint();
    }
  });
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
    acknowledgeTap(root, drawFeedback);
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
