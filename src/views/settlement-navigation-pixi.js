import { getStoneTexture, paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createVassalPortraitView } from './vassal-portrait-pixi.js';
import { getArtRevision } from './chronicle-art.js';
import { getCurrentLifeMapVassal } from '../model/vassal-life-map.js';
import { getRegionReference } from '../model/world-state.js';

// Unlike the Life Map's retained historical profile, this shortcut describes
// the active Vassal in the snapshot under the playhead, including drag previews.
export function getNavigationVassalPortrait(viewedState) {
  const vassal = getCurrentLifeMapVassal(viewedState);
  const regionId = vassal?.locationRegionId;
  if (!vassal || !regionId) return null;
  return {
    vassalId: vassal.vassalId,
    traits: vassal.portrait,
    regionId,
    locationLabel: getRegionReference(viewedState, regionId) ?? regionId,
    hasSettlement: !!viewedState?.world?.sites?.some(
      (site) => site.regionId === regionId && site.detailedState),
  };
}

// A thumb pad below the playfield, clear of the graph and modal action footers.
export const SETTLEMENT_NAVIGATION_LAYOUT = Object.freeze({
  x: 28, bottom: 20, width: 308, height: 234,
  padY: 64, padHeight: 170, gap: 10, auxiliarySize: 72,
});
const TIME_COLORS = Object.freeze({ present: RELIC.gold, history: 0xd5a475, projection: 0x8bc1b9 });
const BUTTON_COLORS = Object.freeze({
  life: { fill: 0x3d5049, ink: 0xc4d5b0, rim: 0x8faaa0 },
  settlement: { fill: 0x594a35, ink: 0xf1d49a, rim: 0xb59a69 },
  map: { fill: 0x30393c, ink: 0xb9c6c6, rim: 0x73898c },
  vassal: { fill: 0x504930, ink: 0xf1d49a, rim: RELIC.gold },
});
const DOUBLE_TAP_MS = 420;

function label(size, fill = RELIC.bone) {
  return new PIXI.Text('', { fontFamily: 'Georgia', fontSize: size, fontWeight: 'bold', fill });
}

function addArc(points, x, y, radius, from, to, steps = 24) {
  for (let step = 0; step <= steps; step++) {
    const angle = from + (to - from) * step / steps;
    points.push(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
}

// Paint and hit-test the same contour, keeping curved corners and the seam inert.
function padContour(width, height, shape) {
  const points = [];
  const radius = height / 2;
  if (shape === 'whole') {
    addArc(points, width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
    addArc(points, radius, radius, radius, Math.PI / 2, Math.PI * 1.5);
  } else {
    const seamRadius = 10;
    addArc(points, width - seamRadius, seamRadius, seamRadius, -Math.PI / 2, 0, 6);
    addArc(points, width - seamRadius, height - seamRadius, seamRadius, 0, Math.PI / 2, 6);
    addArc(points, radius, radius, radius, Math.PI / 2, Math.PI * 1.5);
    if (shape === 'right') {
      for (let i = 0; i < points.length; i += 2) points[i] = width - points[i];
    }
  }
  return points;
}

function insetContour(points, width, height, inset, offsetY = 0) {
  return points.map((value, index) => index % 2
    ? inset + value * (height - inset * 2) / height + offsetY
    : inset + value * (width - inset * 2) / width);
}

function drawNavigationIcon(g, id, color) {
  g.lineStyle(2.4, color, 1);
  if (id === 'map') {
    g.drawPolygon([-14,-13,-4,-17,5,-12,15,-16,15,12,5,16,-4,11,-14,15])
      .moveTo(-4,-17).lineTo(-4,11).moveTo(5,-12).lineTo(5,16);
  } else if (id === 'settlement') {
    g.moveTo(-16,0).lineTo(0,-15).lineTo(16,0)
      .moveTo(-12,-3).lineTo(-12,15).lineTo(12,15).lineTo(12,-3)
      .moveTo(-4,15).lineTo(-4,4).lineTo(4,4).lineTo(4,15);
  } else if (id === 'life') {
    g.moveTo(-12,13).lineTo(0,1).lineTo(12,-13).moveTo(0,1).lineTo(-12,-13);
    for (const [x,y] of [[-12,13],[0,1],[12,-13],[-12,-13]]) {
      g.beginFill(BUTTON_COLORS.life.fill).drawCircle(x,y,4).endFill();
    }
  } else if (id === 'confirm') {
    g.moveTo(-15,0).lineTo(-4,11).lineTo(16,-12);
  } else if (id === 'chronicle') {
    g.drawRoundedRect(-13,-16,26,32,3)
      .moveTo(-7,-16).lineTo(-7,16).moveTo(-2,-6).lineTo(7,-6)
      .moveTo(-2,1).lineTo(7,1).moveTo(-2,8).lineTo(4,8);
  } else {
    g.drawCircle(0,-9,7).moveTo(-15,16).lineTo(-15,10)
      .quadraticCurveTo(-15,1,0,1).quadraticCurveTo(15,1,15,10).lineTo(15,16)
      .lineTo(-15,16);
  }
}

function drawTimeIcon(g, mode, color) {
  g.lineStyle(2, color, 1).drawCircle(0, 0, 17);
  for (const [x,y] of [[0,-23],[23,0],[0,23],[-23,0]]) {
    g.moveTo(x * 0.84,y * 0.84).lineTo(x,y);
  }
  if (mode === 'present') {
    g.moveTo(0,-10).lineTo(0,0).lineTo(8,5);
    g.beginFill(color).drawCircle(0,0,2.5).endFill();
  } else {
    const direction = mode === 'history' ? -1 : 1;
    g.moveTo(-9*direction,0).lineTo(9*direction,0)
      .moveTo(2*direction,-7).lineTo(9*direction,0).lineTo(2*direction,7);
  }
}

export function createSettlementNavigationView({
  app, layer, getState, onNavigate, onLocateVassal, onOpenVassalSettlement,
  onReturnToPresent, tooltipView,
} = {}) {
  const layout = SETTLEMENT_NAVIGATION_LAYOUT;
  const root = new PIXI.Container();
  root.zIndex = 190;
  layer?.addChild(root);
  const buttons = new Map();
  let state = null;
  let portraitKey = '';
  let lastPortraitTap = { id: null, atMs: -Infinity };
  let portraitDownAtMs = -Infinity;
  let scheduledLocate = 0;
  let feedbackRemaining = 0;
  let feedbackMode = null;
  let feedbackCount = 0;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

  function makeButton(id, onPress) {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const icon = new PIXI.Graphics();
    const title = label(28);
    title.anchor.set(0.5);
    container.addChild(bg, icon, title);
    container.eventMode = 'static';
    const button = { id, container, bg, icon, title, hovered: false, pressed: false, spec: null };
    container.on('pointerdown', (event) => {
      event?.stopPropagation?.();
      button.pressed = button.spec?.enabled !== false;
      paintButton(button);
    });
    const release = () => { button.pressed = false; paintButton(button); };
    container.on('pointerup', release);
    container.on('pointerupoutside', release);
    container.on('pointercancel', release);
    container.on('pointertap', (event) => {
      event?.stopPropagation?.();
      tooltipView?.hide?.();
      if (button.spec?.enabled !== false) onPress?.();
    });
    container.on('pointerover', () => {
      button.hovered = true;
      paintButton(button);
      if (button.spec?.hint) tooltipView?.show?.({
        title: button.spec.label, lines: button.spec.hint, maxWidth: 290, scale: 1.5,
      }, container.getBounds());
    });
    container.on('pointerout', () => {
      button.hovered = false;
      button.pressed = false;
      paintButton(button);
      tooltipView?.hide?.();
    });
    root.addChild(container);
    buttons.set(id, button);
    return button;
  }

  const time = makeButton('present', () => onReturnToPresent?.());
  const timeGlow = new PIXI.Graphics();
  timeGlow.eventMode = 'none';
  root.addChild(timeGlow);
  const portrait = new PIXI.Container();
  const auxiliaryRadius = layout.auxiliarySize / 2;
  portrait.eventMode = 'static';
  portrait.cursor = 'pointer';
  portrait.hitArea = new PIXI.Circle(auxiliaryRadius, auxiliaryRadius, auxiliaryRadius);
  function cancelScheduledLocate() {
    if (!scheduledLocate) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scheduledLocate);
    scheduledLocate = 0;
  }
  function scheduleLocate() {
    cancelScheduledLocate();
    if (typeof requestAnimationFrame === 'function') {
      scheduledLocate = requestAnimationFrame(() => {
        scheduledLocate = 0;
        onLocateVassal?.();
      });
      return;
    }
    onLocateVassal?.();
  }
  portrait.on('pointerdown', (event) => {
    event?.stopPropagation?.();
    // Time the gap from this down, before pointertap locate/refresh work.
    portraitDownAtMs = performance.now();
  });
  portrait.on('pointertap', (event) => {
    event?.stopPropagation?.();
    tooltipView?.hide?.();
    const profile = getState?.()?.portrait;
    if (!profile) return;
    const now = portraitDownAtMs;
    const doubleTap = lastPortraitTap.id === profile.vassalId && now - lastPortraitTap.atMs <= DOUBLE_TAP_MS;
    lastPortraitTap = { id: doubleTap ? null : profile.vassalId, atMs: now };
    if (doubleTap && profile.hasSettlement) {
      cancelScheduledLocate();
      onOpenVassalSettlement?.();
    } else {
      scheduleLocate();
    }
  });
  portrait.on('pointerover', () => {
    if (!state?.portrait) return;
    portrait.alpha = 0.88;
    tooltipView?.show?.({
      title: `Vassal · ${state.portrait.locationLabel}`,
      lines: ['Click or tap to focus this region on the Regional Map.',
        ...(state.portrait.hasSettlement ? ['Double-click or double-tap to open their settlement.'] : [])],
      maxWidth: 280, scale: 1.5,
    }, portrait.getBounds());
  });
  portrait.on('pointerout', () => { portrait.alpha = 1; tooltipView?.hide?.(); });
  root.addChild(portrait);

  const feedback = new PIXI.Container();
  feedback.eventMode = 'none';
  const feedbackBg = new PIXI.Graphics();
  const feedbackText = label(21);
  feedbackText.style.wordWrap = true;
  feedbackText.style.wordWrapWidth = layout.width - 28;
  feedbackText.style.lineHeight = 27;
  feedbackText.position.set(14, 12);
  feedback.addChild(feedbackBg, feedbackText);
  root.addChild(feedback);

  function paintButton(button) {
    const spec = button.spec;
    if (!spec) return;
    const { width, height, enabled = true, shape } = spec;
    const isTime = button.id === 'present';
    const colors = isTime ? { fill: RELIC.stone, ink: TIME_COLORS[spec.mode], rim: TIME_COLORS[spec.mode] }
      : BUTTON_COLORS[button.id];
    const { bg, icon, title } = button;
    bg.clear();
    const active = button.hovered && enabled;
    button.container.alpha = enabled ? 1 : 0.55;
    button.container.cursor = enabled ? 'pointer' : 'default';
    if (isTime) {
      bg.beginFill(RELIC.shadow, 0.8).drawCircle(width/2, height/2 + 4, width/2).endFill();
      bg.lineStyle(2, active ? colors.ink : RELIC.brass, 1)
        .beginTextureFill({ texture: getStoneTexture(), color: active ? RELIC.raised : colors.fill })
        .drawCircle(width/2, height/2, width/2 - 1).endFill();
      bg.lineStyle(1, colors.ink, 0.28).drawCircle(width/2, height/2, width/2 - 6);
    } else {
      bg.beginFill(RELIC.shadow, 0.85).drawPolygon(insetContour(spec.contour, width, height, 0, 5)).endFill();
      bg.lineStyle(3, active ? colors.ink : colors.rim, 1)
        .beginTextureFill({ texture: getStoneTexture(), color: button.pressed ? RELIC.stone : colors.fill })
        .drawPolygon(spec.contour).endFill();
      bg.lineStyle(2, colors.ink, active ? 0.55 : 0.25)
        .drawPolygon(insetContour(spec.contour, width, height, 5));
    }
    icon.clear();
    if (isTime) drawTimeIcon(icon, spec.mode, colors.ink);
    else drawNavigationIcon(icon, spec.icon ?? button.id, colors.ink);
    const centerX = width / 2 + (shape === 'left' ? 9 : shape === 'right' ? -9 : 0);
    const pressedOffset = button.pressed ? 3 : 0;
    icon.position.set(centerX, (isTime ? height/2 : height*0.38) + pressedOffset);
    icon.scale.set(isTime ? 1 : spec.role === 'secondary' ? 1.2 : 1.75);
    title.visible = !isTime;
    title.text = spec.label;
    title.style.fill = colors.ink;
    title.style.fontSize = shape === 'whole' ? 32 : 26;
    title.style.wordWrap = button.id === 'vassal' && shape !== 'whole';
    title.style.wordWrapWidth = Math.max(60, width - 24);
    title.style.lineHeight = 27;
    title.style.align = 'center';
    title.position.set(centerX, height*0.72 + pressedOffset);
    title.scale.set(1);
    // Fit a short title within the curved face, without stretching its letters.
    if (title.width > width - 22) title.style.fontSize *= (width - 22) / title.width;
  }

  function placeButton(button, spec, rect, role, shape) {
    const next = { ...spec, ...rect, role, shape };
    button.container.visible = true;
    button.container.position.set(rect.x, rect.y);
    if (button.spec?.width !== rect.width || button.spec?.height !== rect.height || button.spec?.shape !== shape) {
      button.contour = shape === 'circle' ? null : padContour(rect.width, rect.height, shape);
      button.container.hitArea = shape === 'circle'
        ? new PIXI.Circle(rect.width/2, rect.height/2, rect.width/2)
        : new PIXI.Polygon(button.contour);
    }
    const previous = button.signature;
    button.signature = JSON.stringify(next);
    button.spec = { ...next, contour: button.contour };
    if (previous !== button.signature) paintButton(button);
  }

  function update(frameDt = 0) {
    state = getState?.() ?? null;
    root.visible = !!state;
    if (!state) return;
    root.position.set(layout.x, (app?.screen?.height ?? 1080) - layout.bottom - layout.height);
    const mode = state.time.mode;
    if (feedbackMode !== mode) feedbackRemaining = 0;
    placeButton(time, {
      mode, label: mode === 'present' ? 'Present' : 'Return to Present',
      hint: [mode === 'present' ? 'Hold at the latest committed moment.'
        : mode === 'history' ? 'You are viewing fixed history.' : 'You are viewing a projected future.'],
    }, { x: layout.width - layout.auxiliarySize, y: 0, width: layout.auxiliarySize, height: layout.auxiliarySize },
    'auxiliary', 'circle');

    portrait.visible = !!state.portrait;
    const nextPortraitKey = JSON.stringify([getArtRevision(), state.portrait]);
    if (nextPortraitKey !== portraitKey) {
      portraitKey = nextPortraitKey;
      for (const child of portrait.removeChildren()) child.destroy({ children: true });
      if (state.portrait) {
        const art = createVassalPortraitView(state.portrait.traits, { size: layout.auxiliarySize });
        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff).drawCircle(auxiliaryRadius, auxiliaryRadius, auxiliaryRadius - 4).endFill();
        art.mask = mask;
        art.eventMode = 'none';
        const rim = new PIXI.Graphics();
        rim.lineStyle(3, RELIC.brass, 1).drawCircle(auxiliaryRadius, auxiliaryRadius, auxiliaryRadius - 1);
        portrait.addChild(art, mask, rim);
      }
    }

    for (const button of buttons.values()) if (button !== time) button.container.visible = false;
    // Keep decisions under the thumb. On the Regional Map the destinations
    // share the pad equally; when returning from either one, Map is secondary.
    const ordered = [...state.destinations].sort((a, b) => Number(a.id === 'map') - Number(b.id === 'map'));
    const hasSecondaryMap = ordered.length === 2 && ordered[1].id === 'map';
    const firstWidth = ordered.length === 1 ? layout.width : hasSecondaryMap ? 184 : (layout.width - layout.gap)/2;
    ordered.forEach((destination, index) => {
      const button = buttons.get(destination.id) ?? makeButton(destination.id, () => onNavigate?.(destination.id));
      const x = index === 0 ? 0 : firstWidth + layout.gap;
      placeButton(button, destination,
        { x, y: layout.padY, width: index === 0 ? firstWidth : layout.width - x, height: layout.padHeight },
        hasSecondaryMap && index === 1 ? 'secondary' : 'primary',
        ordered.length === 1 ? 'whole' : index === 0 ? 'left' : 'right');
    });

    feedbackRemaining = Math.max(0, feedbackRemaining - Math.max(0, frameDt));
    feedback.visible = feedbackRemaining > 0;
    timeGlow.clear();
    if (feedback.visible) {
      feedback.position.set(0, -feedback.height - 10);
      // A brief input response uses UI time; it never animates the simulation.
      const alpha = reducedMotion?.matches ? 0.8 : 0.45 + 0.3 * (0.5 + 0.5 * Math.cos((4.5 - feedbackRemaining) * Math.PI * 2));
      timeGlow.lineStyle(3, TIME_COLORS[mode], alpha)
        .drawCircle(time.container.x + auxiliaryRadius, auxiliaryRadius, auxiliaryRadius + 3);
    }
  }

  function getClickPoint(id) {
    const button = buttons.get(id);
    const target = id === 'portrait' ? portrait : button?.container;
    if (!root.visible || !target?.visible) return null;
    const point = target.toGlobal(new PIXI.Point(
      id === 'portrait' ? auxiliaryRadius : button.spec.width / 2,
      id === 'portrait' ? auxiliaryRadius : button.spec.height / 2));
    return { x: point.x, y: point.y };
  }

  return {
    init: () => update(), update, getClickPoint,
    showReadOnlyFeedback() {
      const mode = getState?.()?.time.mode;
      if (!mode || mode === 'present') return;
      feedbackMode = mode;
      feedbackRemaining = 4.5;
      feedbackCount += 1;
      feedbackText.text = mode === 'history'
        ? 'History is fixed.\nUse the clock to return to Present.'
        : 'This is a projection.\nUse the clock to return to Present.';
      feedbackBg.clear();
      paintRelicPanel(feedbackBg, 0, 0, layout.width, feedbackText.height + 24,
        RELIC.night, TIME_COLORS[mode], 2);
      update();
    },
    getSemanticSnapshot: () => state ? {
      mode: state.mode, time: state.time, destinations: state.destinations,
      portrait: state.portrait ? { vassalId: state.portrait.vassalId,
        regionId: state.portrait.regionId, locationLabel: state.portrait.locationLabel } : null,
      feedbackVisible: feedback.visible, feedbackCount,
      rect: { x: root.x, y: root.y, width: layout.width, height: layout.height },
      targets: [...buttons.values()].filter((button) => button.container.visible).map((button) => ({
        id: button.id, role: button.spec.role, shape: button.spec.shape,
        x: root.x + button.container.x, y: root.y + button.container.y,
        width: button.spec.width, height: button.spec.height,
      })),
    } : null,
  };
}
