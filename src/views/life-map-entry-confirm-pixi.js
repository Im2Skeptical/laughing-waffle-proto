// Entry confirmation for a Chronicle (Life Map) node. Mirrors the node
// decision modal's motion: a short eased fade/scale, instant under reduced
// motion, with controls live from the first frame so input is never delayed.
import { addInteractionFeedback } from './interaction-feedback.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { dockPadContour, drawDockCheckIcon, paintDockPadFace } from './settlement-dock-style.js';
import { drawLifeMapNodeIcon } from './life-map-node-icon.js';
import { addResourceAmount } from './resource-cost-pixi.js';
import { clearChildren, createText } from './settlement-view-primitives.js';
import { PALETTE, TEXT_STYLES } from './settlement-theme.js';

const STAGE = Object.freeze({ width: 2424, height: 1080, margin: 14 });
const CENTER = Object.freeze({ x: 1212, y: 448 });
// Compact: sized to its content, with only the rows that actually apply.
const PANEL_WIDTH = 860;
const PAD = 34;
const BUTTON = Object.freeze({ height: 100, maxHeight: 176, cancel: 220, confirm: 320, gap: 18 });
// 44 CSS px is the minimum comfortable touch target.
const MIN_TOUCH_CSS_PX = 44;
const OPEN_MS = 200;
const CLOSE_MS = 150;
const OPEN_SCALE = 0.94;
// Matches the map's double-click window: extra taps from the gesture that
// opened the dialog land on the backdrop and must not dismiss it.
const BACKDROP_GRACE_MS = 360;
const RISKY_FAMILIES = new Set(['crisis', 'monsterHunt', 'relic']);
const CONFIRM_COLORS = Object.freeze({ fill: 0x405a3c, hoverFill: 0x527249, ink: 0xdce8c5, rim: 0x9ab681 });
const CANCEL_COLORS = Object.freeze({ fill: RELIC.raised, hoverFill: 0x40463f, ink: RELIC.bone, rim: RELIC.brass });
const BLOCKED_REASONS = Object.freeze({
  heirloomLoadoutRequired: 'Finish equipping Heirlooms first.',
  developmentChoiceRequired: "Choose this Vassal's development first.",
  resolutionPending: 'Wait for the current turning point to resolve.',
  nodeAlreadyActive: 'Another turning point is already open.',
  nodeUnavailable: 'This node is no longer open.',
});

export function describeEntryBlockedReason(reason) {
  return reason ? BLOCKED_REASONS[reason] ?? "This node can't be entered right now." : null;
}

// Only conditional warnings earn a row: a death risk inside, or why entry
// just failed. Everything else is said by the title and description.
export function getEntryConsequences({ node, family, blockedReason = null } = {}) {
  const rows = [];
  const kind = node?.signatureNode?.variantId ?? node?.family ?? family?.id;
  if (RISKY_FAMILIES.has(kind)) {
    rows.push({ id: 'risk', label: 'Risk', detail: 'Some choices here can kill this Vassal' });
  }
  const blocked = describeEntryBlockedReason(blockedReason);
  if (blocked) rows.push({ id: 'blocked', label: "Can't enter", detail: blocked });
  return rows;
}

function cssScaleOf(app) {
  const width = app?.view?.getBoundingClientRect?.()?.width;
  return Number.isFinite(width) && width > 0 ? width / (app.screen?.width || STAGE.width) : 1;
}

function drawWarningIcon(g, x, y, color) {
  g.lineStyle(3, color, 1).drawPolygon([x, y - 13, x + 13, y + 11, x - 13, y + 11]);
  g.lineStyle(0).beginFill(color).drawRect(x - 1.5, y - 5, 3, 9).drawCircle(x, y + 7, 2).endFill();
}

// Carved pill button shared by both actions (the same face as the Lifegraph
// Confirm dock), so the dialog's primary action reads like the dock that opened it.
function pillButton(parent, rect, { label, colors, primary, onActivate }) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = 'static';
  root.cursor = 'pointer';
  const contour = dockPadContour(rect.width, rect.height, 'whole');
  root.hitArea = new PIXI.Polygon(contour);
  const face = new PIXI.Graphics();
  const content = new PIXI.Container();
  const fontSize = Math.round(Math.min(38, rect.height * .34));
  const text = createText(label, {
    ...TEXT_STYLES.title, fontSize, fill: colors.ink, letterSpacing: 1,
  }, 0, 0, 0, .5);
  content.addChild(text);
  if (primary) {
    const icon = new PIXI.Graphics();
    drawDockCheckIcon(icon, colors.ink);
    icon.scale.set(fontSize / 24);
    icon.position.set(fontSize * .6, 0);
    text.x = fontSize * 1.6;
    content.addChild(icon);
  }
  const contentWidth = text.x + text.width;
  function paint(state = 'idle') {
    const pressed = state === 'pressed';
    paintDockPadFace(face, {
      width: rect.width, height: rect.height, contour, colors,
      hovered: state === 'hover', pressed,
    });
    content.position.set((rect.width - contentWidth) / 2, rect.height / 2 + (pressed ? 3 : 0));
  }
  root.addChild(face, content);
  paint();
  addInteractionFeedback(root, { x: 0, y: 0, width: rect.width, height: rect.height }, {
    onActivate, onStateChange: paint,
    drawFeedback: (graphics, { pressed }) => {
      if (!pressed) return;
      graphics.lineStyle(3, colors.ink, .8).beginFill(colors.ink, .16).drawPolygon(contour).endFill();
    },
  });
  parent.addChild(root);
  return root;
}

export function createLifeMapEntryConfirm({ app, layer, onConfirm, onCancel } = {}) {
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointer = globalThis.matchMedia?.('(pointer: fine)');
  const root = new PIXI.Container();
  root.visible = false;
  root.eventMode = 'none';
  layer?.addChild(root);
  const backdrop = new PIXI.Graphics();
  backdrop.eventMode = 'static';
  backdrop.cursor = 'pointer';
  const panelRoot = new PIXI.Container();
  root.addChild(backdrop, panelRoot);

  let logicalOpen = false;
  let visibility = 0;
  let motion = null;
  let spec = null;
  let contentKey = '';
  let layout = null;
  let pointerHeld = false;
  let backdropPressedPointerId = null;
  let tickerAttached = false;
  let openedAtMs = -Infinity;

  panelRoot.on('pointerdown', (event) => { event?.stopPropagation?.(); pointerHeld = true; });
  for (const type of ['pointerup', 'pointerupoutside', 'pointercancel']) {
    panelRoot.on(type, () => { pointerHeld = false; });
  }
  // Like the node decision modal: a press and release on the dim backdrop
  // cancels, except while it is still opening from a double-tap.
  backdrop.on('pointerdown', (event) => {
    event?.stopPropagation?.();
    const settling = motion || performance.now() - openedAtMs < BACKDROP_GRACE_MS;
    backdropPressedPointerId = settling ? null : event?.pointerId ?? 'pointer';
  });
  for (const type of ['pointerupoutside', 'pointercancel']) {
    backdrop.on(type, () => { backdropPressedPointerId = null; });
  }
  backdrop.on('pointertap', (event) => {
    event?.stopPropagation?.();
    if (backdropPressedPointerId !== (event?.pointerId ?? 'pointer')) return;
    backdropPressedPointerId = null;
    if (logicalOpen) onCancel?.();
  });

  function computeScale() {
    const css = cssScaleOf(app);
    const body = layout?.bodyHeight ?? 320;
    const fitWidth = (STAGE.width - STAGE.margin * 2) / PANEL_WIDTH;
    const fitHeight = STAGE.height - STAGE.margin * 2;
    const fit = (buttonHeight) => Math.min(fitWidth, fitHeight / (body + buttonHeight));
    let buttonHeight = BUTTON.height;
    let scale = Math.min(fit(buttonHeight), Math.max(1, MIN_TOUCH_CSS_PX / (buttonHeight * css)));
    // On very small stages the panel cannot grow enough, so taller buttons buy
    // back the touch size: solve buttonHeight * fit(buttonHeight) * css = 44.
    if (buttonHeight * scale * css < MIN_TOUCH_CSS_PX && fitHeight * css > MIN_TOUCH_CSS_PX) {
      const needed = Math.ceil(MIN_TOUCH_CSS_PX * body / (fitHeight * css - MIN_TOUCH_CSS_PX));
      buttonHeight = Math.max(BUTTON.height, Math.min(BUTTON.maxHeight, needed));
      scale = Math.min(fit(buttonHeight), MIN_TOUCH_CSS_PX / (buttonHeight * css));
    }
    return { css, scale, buttonHeight };
  }

  function build() {
    clearChildren(panelRoot);
    layout = null;
    if (!spec) return;
    const { family = {}, node } = spec;
    const accent = family.color ?? PALETTE.accent;
    const content = new PIXI.Container();
    const textWidth = PANEL_WIDTH - PAD * 2;

    // Header: the map's own node icon in a medallion, then eyebrow, name, context.
    const medallion = new PIXI.Graphics();
    const mx = PAD + 46, my = 72;
    medallion.lineStyle(3, RELIC.brass, 1).beginFill(RELIC.night, .95).drawCircle(mx, my, 46).endFill();
    medallion.lineStyle(3, accent, 1).drawCircle(mx, my, 39);
    if (node) drawLifeMapNodeIcon(medallion, node, { fill: 0xf4e7bd, accent, outline: 0x111714, x: mx, y: my, scale: .92 });
    const titleX = PAD + 112;
    const eyebrow = createText(spec.signature ? 'Signature opportunity' : 'Enter turning point', {
      ...TEXT_STYLES.title, fontSize: 20, fill: RELIC.gold, letterSpacing: 3,
    }, titleX, 24);
    const title = createText(family.label ?? 'Turning point', {
      ...TEXT_STYLES.header, fontSize: 42, fill: RELIC.bone,
      wordWrap: true, wordWrapWidth: PANEL_WIDTH - titleX - PAD,
    }, titleX, 48);
    content.addChild(medallion, eyebrow, title);
    // Context line: location, then Prestige with the HUD's own Prestige icon.
    const metaY = title.y + title.height + 20;
    let metaX = titleX;
    if (spec.location) {
      const where = createText(`Vassal at ${spec.location}`, { ...TEXT_STYLES.body, fontSize: 24, fill: RELIC.ash }, metaX, metaY, 0, .5);
      content.addChild(where);
      metaX += where.width + 14;
    }
    if (Number.isFinite(spec.prestige)) {
      if (spec.location) {
        content.addChild(new PIXI.Graphics().beginFill(RELIC.brass).drawCircle(metaX, metaY, 3).endFill());
        metaX += 14;
      }
      const iconSize = 32;
      const amount = addResourceAmount(content, 'prestige', spec.prestige, {
        x: metaX, y: metaY - iconSize / 2, fontSize: 26, iconSize, fill: PALETTE.accent,
      });
      amount.label = 'entry-prestige';
    }
    const headerBottom = Math.max(140, metaY + 22);

    const description = createText(family.description ?? '', {
      ...TEXT_STYLES.body, fontSize: 29, lineHeight: 38, fill: PALETTE.text,
      wordWrap: true, wordWrapWidth: textWidth,
    }, PAD, headerBottom + 18);
    content.addChild(description);
    let contentBottom = description.y + description.height;

    // Conditional warnings only (death risk, blocked entry).
    const rows = getEntryConsequences({ node, family, blockedReason: spec.blockedReason });
    if (rows.length) {
      const rowHeight = 48;
      const rowsY = contentBottom + 16;
      const band = new PIXI.Graphics();
      band.beginFill(PALETTE.red, .12).drawRect(PAD, rowsY, textWidth, rows.length * rowHeight).endFill();
      band.beginFill(PALETTE.red, .85).drawRect(PAD, rowsY, 4, rows.length * rowHeight).endFill();
      rows.forEach((row, index) => {
        const y = rowsY + index * rowHeight + rowHeight / 2;
        drawWarningIcon(band, PAD + 30, y, PALETTE.red);
        const label = createText(row.label, { ...TEXT_STYLES.title, fontSize: 24, fill: 0xe0a093 }, PAD + 56, y, 0, .5);
        content.addChild(label, createText(row.detail, {
          ...TEXT_STYLES.body, fontSize: 24, fill: 0xe0b3a8,
        }, label.x + label.width + 18, y, 0, .5));
      });
      content.addChildAt(band, 0);
      contentBottom = rowsY + rows.length * rowHeight;
    }
    const footerY = contentBottom + 24;
    const bottomPad = 26;
    const bodyHeight = footerY + bottomPad;
    layout = { bodyHeight };

    const { scale, buttonHeight } = computeScale();
    const height = bodyHeight + buttonHeight;
    const confirmRect = { x: PANEL_WIDTH - PAD - BUTTON.confirm, y: footerY, width: BUTTON.confirm, height: buttonHeight };
    const cancelRect = { x: confirmRect.x - BUTTON.gap - BUTTON.cancel, y: footerY, width: BUTTON.cancel, height: buttonHeight };

    // Panel chrome: drop shadow, relic stone, inner gold hairline, header band.
    const chrome = new PIXI.Graphics();
    chrome.beginFill(RELIC.shadow, .55).drawRect(8, 12, PANEL_WIDTH, height).endFill();
    paintRelicPanel(chrome, 0, 0, PANEL_WIDTH, height, RELIC.stone, RELIC.brass, 3);
    chrome.lineStyle(0).beginFill(RELIC.night, .5).drawRect(8, 8, PANEL_WIDTH - 16, headerBottom - 8).endFill();
    chrome.beginFill(accent, .9).drawRect(8, 8, PANEL_WIDTH - 16, 5).endFill();
    const inset = 8, c = 6;
    chrome.lineStyle(1.5, RELIC.gold, .42).drawPolygon([
      inset + c, inset, PANEL_WIDTH - inset - c, inset, PANEL_WIDTH - inset, inset + c,
      PANEL_WIDTH - inset, height - inset - c, PANEL_WIDTH - inset - c, height - inset,
      inset + c, height - inset, inset, height - inset - c, inset, inset + c,
    ]);
    // Engraved header rule with a centre diamond.
    const midX = PANEL_WIDTH / 2;
    chrome.lineStyle(2, RELIC.brass, .8).moveTo(PAD, headerBottom).lineTo(midX - 12, headerBottom)
      .moveTo(midX + 12, headerBottom).lineTo(PANEL_WIDTH - PAD, headerBottom);
    chrome.lineStyle(2, RELIC.gold, 1).beginFill(RELIC.night)
      .drawPolygon([midX, headerBottom - 8, midX + 8, headerBottom, midX, headerBottom + 8, midX - 8, headerBottom]).endFill();
    panelRoot.addChild(chrome, content);

    if (finePointer?.matches) {
      panelRoot.addChild(createText('Enter ↵  confirms\nEsc  cancels', {
        ...TEXT_STYLES.body, fontSize: 20, lineHeight: 28, fill: RELIC.ash,
      }, PAD, footerY + buttonHeight / 2, 0, .5));
    }
    const cancelRoot = pillButton(panelRoot, cancelRect, { label: 'Cancel', colors: CANCEL_COLORS, onActivate: () => onCancel?.() });
    const confirmRoot = pillButton(panelRoot, confirmRect, {
      label: 'Enter', colors: CONFIRM_COLORS, primary: true,
      // Double-tap safety: a closing dialog never commits.
      onActivate: () => { if (logicalOpen) onConfirm?.(); },
    });

    // On a tiny stage (a narrow portrait window) the enlarged panel spans the
    // screen. Hug the left edge so its title clears the DOM Save & menu chrome
    // that floats over the top-right corner of the canvas.
    const panelX = PANEL_WIDTH * scale > STAGE.width * .6 ? STAGE.margin + PANEL_WIDTH * scale / 2 : CENTER.x;
    const halfHeight = height * scale / 2;
    const panelY = Math.max(STAGE.margin + halfHeight, Math.min(STAGE.height - STAGE.margin - halfHeight, CENTER.y));
    panelRoot.pivot.set(PANEL_WIDTH / 2, height / 2);
    layout = {
      bodyHeight, height, scale, buttonHeight, center: { x: panelX, y: panelY },
      confirmRect, cancelRect, confirmRoot, cancelRoot, cssScale: cssScaleOf(app),
      panelSize: { width: PANEL_WIDTH * scale, height: height * scale },
    };
    backdrop.clear().beginFill(0x050808, .66)
      .drawRect(0, 0, app?.screen?.width ?? STAGE.width, app?.screen?.height ?? STAGE.height).endFill();
    applyPose();
  }

  function applyPose() {
    backdrop.alpha = visibility;
    if (!layout) return;
    const s = layout.scale * (OPEN_SCALE + (1 - OPEN_SCALE) * visibility);
    panelRoot.scale.set(s);
    panelRoot.position.set(layout.center.x, layout.center.y + (1 - visibility) * 18 * layout.scale);
    panelRoot.alpha = Math.min(1, visibility * 1.25);
  }

  function tick() {
    if (pointerHeld) return;
    if (layout && root.visible && Math.abs(cssScaleOf(app) - layout.cssScale) > layout.cssScale * .01) build();
    if (!motion) return;
    const t = Math.min(1, (performance.now() - motion.startedAtMs) / motion.duration);
    const eased = 1 - (1 - t) ** 3;
    visibility = motion.from + (motion.to - motion.from) * eased;
    applyPose();
    if (t >= 1) finish();
  }

  function attachTicker(attach) {
    if (attach === tickerAttached || !app?.ticker) return;
    tickerAttached = attach;
    if (attach) app.ticker.add(tick);
    else app.ticker.remove(tick);
  }

  function finish() {
    motion = null;
    if (!logicalOpen) {
      root.visible = false;
      root.eventMode = 'none';
      clearChildren(panelRoot);
      layout = null;
      spec = null;
      contentKey = '';
      attachTicker(false);
    }
  }

  function moveTo(target, immediate) {
    if (immediate || reducedMotion?.matches || Math.abs(visibility - target) < .001) {
      motion = null;
      visibility = target;
      applyPose();
      finish();
      return;
    }
    motion = { from: visibility, to: target, startedAtMs: performance.now(), duration: target > visibility ? OPEN_MS : CLOSE_MS };
    applyPose();
  }

  function open(nextSpec) {
    spec = nextSpec;
    contentKey = JSON.stringify(nextSpec?.key ?? null);
    logicalOpen = true;
    openedAtMs = performance.now();
    backdropPressedPointerId = null;
    // The modal layer stacks by insertion order. Rise above the Vassal HUD and
    // other chrome while open, so the dim backdrop covers the whole screen.
    root.parent?.addChild(root);
    root.visible = true;
    // Controls accept input from the first frame; armed taps already require a
    // fresh press on the control, so the opening double-tap cannot commit.
    root.eventMode = 'static';
    attachTicker(true);
    build();
    moveTo(1, false);
  }

  function close({ immediate = false } = {}) {
    if (!logicalOpen && !immediate) return;
    logicalOpen = false;
    pointerHeld = false;
    backdropPressedPointerId = null;
    root.eventMode = 'none';
    moveTo(0, immediate);
  }

  function sync({ open: shouldOpen = false, spec: nextSpec = null, immediate = false } = {}) {
    if (!shouldOpen || !nextSpec) {
      close({ immediate });
      return;
    }
    if (!logicalOpen) { open(nextSpec); return; }
    const nextKey = JSON.stringify(nextSpec.key ?? null);
    if (nextKey === contentKey || pointerHeld) return;
    spec = nextSpec;
    contentKey = nextKey;
    build();
  }

  function globalCenter(rectKey) {
    if (!logicalOpen || !layout) return null;
    const rect = layout[rectKey];
    // Report the settled position so automation lands on the control mid-motion.
    return {
      x: layout.center.x + (rect.x + rect.width / 2 - PANEL_WIDTH / 2) * layout.scale,
      y: layout.center.y + (rect.y + rect.height / 2 - layout.height / 2) * layout.scale,
    };
  }

  return {
    root,
    sync,
    close,
    isOpen: () => logicalOpen && root.visible,
    isPointerHeld: () => pointerHeld,
    getConfirmPoint: () => globalCenter('confirmRect'),
    getCancelPoint: () => globalCenter('cancelRect'),
    getSnapshot: () => ({
      open: logicalOpen, visible: root.visible, visibility,
      phase: motion ? (logicalOpen ? 'opening' : 'closing') : logicalOpen ? 'open' : 'closed',
      scale: layout?.scale ?? null, buttonHeight: layout?.buttonHeight ?? null,
      buttonCssHeight: layout ? layout.buttonHeight * layout.scale * layout.cssScale : null,
      panelSize: layout?.panelSize ?? null,
    }),
  };
}
