import { paintRelicPanel, RELIC, drawHourglass } from './chronicle-skin.js';
import { createVassalPortraitView } from './vassal-portrait-pixi.js';
import { getArtRevision } from './chronicle-art.js';

// Fits the existing recess to the left of the timegraph, in design coordinates.
export const SETTLEMENT_NAVIGATION_LAYOUT = Object.freeze({
  x: 28, bottom: 16, width: 308, height: 224,
  timeHeight: 68, navigationY: 78, rowHeight: 70, gap: 6, portraitWidth: 98,
});
const TIME_COLORS = Object.freeze({ present: RELIC.gold, history: 0xd5a475, projection: 0x8bc1b9 });
const DOUBLE_TAP_MS = 420;

function label(size, fill = RELIC.bone) {
  return new PIXI.Text('', { fontFamily: 'Georgia', fontSize: size, fill });
}

function drawNavigationIcon(g, id, x, y, color) {
  g.lineStyle(2, color, 1);
  if (id === 'map') {
    g.drawPolygon([x-14,y-13,x-4,y-17,x+5,y-12,x+15,y-16,x+15,y+12,x+5,y+16,x-4,y+11,x-14,y+15])
      .moveTo(x-4,y-17).lineTo(x-4,y+11).moveTo(x+5,y-12).lineTo(x+5,y+16);
  } else if (id === 'settlement') {
    g.moveTo(x-16,y).lineTo(x,y-15).lineTo(x+16,y)
      .moveTo(x-12,y-3).lineTo(x-12,y+15).lineTo(x+12,y+15).lineTo(x+12,y-3)
      .moveTo(x-4,y+15).lineTo(x-4,y+4).lineTo(x+4,y+4).lineTo(x+4,y+15);
  } else if (id === 'life') {
    g.moveTo(x-12,y+13).lineTo(x,y+1).lineTo(x+12,y-13)
      .moveTo(x,y+1).lineTo(x-12,y-13);
    for (const [dx,dy] of [[-12,13],[0,1],[12,-13],[-12,-13]]) {
      g.beginFill(RELIC.stone).drawCircle(x+dx,y+dy,4).endFill();
    }
  } else drawHourglass(g, x, y, 27, color);
}

export function createSettlementNavigationView({
  app, layer, getState, onNavigate, onLocateVassal, onOpenVassalSettlement,
  onReturnToPresent, tooltipView,
} = {}) {
  const layout = SETTLEMENT_NAVIGATION_LAYOUT;
  const root = new PIXI.Container();
  // Shared navigation remains reachable below Life Map decision/level-up panels.
  root.zIndex = 190;
  layer?.addChild(root);
  const buttons = new Map();
  let state = null;
  let portraitKey = '';
  let lastPortraitTap = { id: null, atMs: -Infinity };
  let feedbackRemaining = 0;
  let feedbackMode = null;
  let feedbackCount = 0;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

  function makeButton(id, onPress) {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const icon = new PIXI.Graphics();
    const title = label(26);
    title.style.fontWeight = 'bold';
    const subtitle = label(19, RELIC.ash);
    container.addChild(bg, icon, title, subtitle);
    container.eventMode = 'static';
    container.on('pointerdown', (event) => event?.stopPropagation?.());
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
      paintButton(button);
      tooltipView?.hide?.();
    });
    root.addChild(container);
    const button = { id, container, bg, icon, title, subtitle, hovered: false, spec: null };
    buttons.set(id, button);
    return button;
  }

  const time = makeButton('present', () => onReturnToPresent?.());
  const timeGlow = new PIXI.Graphics();
  timeGlow.eventMode = 'none';
  root.addChild(timeGlow);
  const portrait = new PIXI.Container();
  portrait.eventMode = 'static';
  portrait.cursor = 'pointer';
  portrait.hitArea = new PIXI.Rectangle(0, 0, layout.portraitWidth, 146);
  portrait.on('pointerdown', (event) => event?.stopPropagation?.());
  portrait.on('pointertap', (event) => {
    event?.stopPropagation?.();
    tooltipView?.hide?.();
    const profile = getState?.()?.portrait;
    if (!profile) return;
    const now = performance.now();
    const doubleTap = lastPortraitTap.id === profile.vassalId && now - lastPortraitTap.atMs <= DOUBLE_TAP_MS;
    lastPortraitTap = { id: doubleTap ? null : profile.vassalId, atMs: now };
    if (doubleTap && profile.hasSettlement) onOpenVassalSettlement?.();
    else onLocateVassal?.();
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

  // Feedback sits above the dock without obscuring the graph or a decision.
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
    const { width, height, enabled = true } = spec;
    const isTime = button.id === 'present';
    const color = isTime ? TIME_COLORS[spec.mode] : RELIC.gold;
    button.bg.clear();
    paintRelicPanel(button.bg, 0, 0, width, height,
      button.hovered && enabled ? 0x414940 : RELIC.stone,
      isTime || button.hovered ? color : RELIC.brass, isTime ? 2 : 1);
    button.container.alpha = enabled ? 1 : 0.65;
    button.container.cursor = enabled ? 'pointer' : 'default';
    button.icon.clear();
    if (isTime) {
      const x = 30, y = height / 2;
      button.icon.lineStyle(2, color, 1).drawCircle(x, y, 16);
      if (spec.mode === 'present') {
        button.icon.beginFill(color).drawCircle(x, y, 5).endFill();
        button.icon.moveTo(x,y-21).lineTo(x,y-16).moveTo(x,y+16).lineTo(x,y+21);
      } else {
        const direction = spec.mode === 'history' ? -1 : 1;
        button.icon.moveTo(x-8*direction,y).lineTo(x+8*direction,y)
          .moveTo(x+2*direction,y-6).lineTo(x+8*direction,y).lineTo(x+2*direction,y+6);
      }
    } else if (!spec.compact) drawNavigationIcon(button.icon, button.id, 30, height / 2, color);
    const textX = spec.compact ? 14 : 58;
    button.title.text = spec.label;
    button.title.style.fill = color;
    button.title.style.fontSize = 28;
    button.title.position.set(textX, height / 2 - (spec.detail ? 26 : 16));
    button.title.scale.set(1);
    button.title.scale.x = Math.min(1, (width - textX - 12) / Math.max(1, button.title.width));
    button.subtitle.text = spec.detail ?? '';
    button.subtitle.position.set(textX, height / 2 + 5);
    button.subtitle.scale.set(1);
    button.subtitle.scale.x = Math.min(1, (width - textX - 12) / Math.max(1, button.subtitle.width));
  }

  function placeButton(button, spec, x, y, width, height) {
    const next = { ...spec, width, height };
    button.container.visible = true;
    button.container.position.set(x, y);
    button.container.hitArea = new PIXI.Rectangle(0, 0, width, height);
    if (JSON.stringify(button.spec) !== JSON.stringify(next)) {
      button.spec = next;
      paintButton(button);
    }
  }

  function update(frameDt = 0) {
    state = getState?.() ?? null;
    root.visible = !!state;
    if (!state) return;
    root.position.set(layout.x, (app?.screen?.height ?? 1080) - layout.bottom - layout.height);
    const mode = state.time.mode;
    if (feedbackMode !== mode) feedbackRemaining = 0;
    placeButton(time, {
      mode, label: { present: 'Present', history: 'History', projection: 'Projected future' }[mode],
      detail: mode === 'present' ? 'You are here' : 'Return to Present',
      hint: [mode === 'present' ? 'Hold at the latest committed moment.'
        : mode === 'history' ? 'You are viewing fixed history. Return to Present to make decisions.'
          : 'You are viewing a possible future. Return to Present to make decisions.'],
    }, 0, 0, layout.width, layout.timeHeight);

    portrait.visible = !!state.portrait;
    const nextPortraitKey = JSON.stringify([getArtRevision(), state.portrait]);
    if (nextPortraitKey !== portraitKey) {
      portraitKey = nextPortraitKey;
      for (const child of portrait.removeChildren()) child.destroy({ children: true });
      if (state.portrait) {
        const bg = new PIXI.Graphics();
        paintRelicPanel(bg, 0, 0, layout.portraitWidth, 146, RELIC.night, RELIC.brass, 1);
        const art = createVassalPortraitView(state.portrait.traits, { size: 94 });
        art.position.set(2, 2);
        const name = label(15, RELIC.ash);
        name.text = 'LOCATE';
        name.anchor.set(0.5, 0);
        name.position.set(49, 101);
        const location = label(22, RELIC.gold);
        location.text = state.portrait.locationLabel;
        location.anchor.set(0.5, 0);
        location.position.set(49, 119);
        portrait.addChild(bg, art, name, location);
      }
    }
    portrait.position.set(0, layout.navigationY);
    for (const button of buttons.values()) if (button !== time) button.container.visible = false;
    const x = state.portrait ? layout.portraitWidth + 8 : 0;
    state.destinations.forEach((destination, index) => {
      const button = buttons.get(destination.id) ?? makeButton(destination.id, () => onNavigate?.(destination.id));
      const height = state.destinations.length === 1 ? 146 : layout.rowHeight;
      placeButton(button, { ...destination, compact: !!state.portrait }, x,
        layout.navigationY + index * (layout.rowHeight + layout.gap), layout.width - x, height);
    });

    feedbackRemaining = Math.max(0, feedbackRemaining - Math.max(0, frameDt));
    feedback.visible = feedbackRemaining > 0;
    timeGlow.clear();
    if (feedback.visible) {
      feedback.position.set(0, -feedback.height - 10);
      // A short input response uses UI time; it never animates the simulation.
      const alpha = reducedMotion?.matches ? 0.8 : 0.45 + 0.3 * (0.5 + 0.5 * Math.cos((4.5 - feedbackRemaining) * Math.PI * 2));
      timeGlow.lineStyle(3, TIME_COLORS[mode], alpha).drawRoundedRect(-3, -3, layout.width+6, layout.timeHeight+6, 9);
    }
  }

  function getClickPoint(id) {
    const target = id === 'portrait' ? portrait : buttons.get(id)?.container;
    if (!root.visible || !target?.visible || !target.hitArea) return null;
    const point = target.toGlobal(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2));
    return { x: point.x, y: point.y };
  }

  return {
    init: () => update(), update,
    getClickPoint,
    showReadOnlyFeedback() {
      const mode = getState?.()?.time.mode;
      if (!mode || mode === 'present') return;
      feedbackMode = mode;
      feedbackRemaining = 4.5;
      feedbackCount += 1;
      feedbackText.text = mode === 'history'
        ? 'History is fixed.\nReturn to Present to make decisions.'
        : 'This is a projection.\nReturn to Present to make decisions.';
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
        id: button.id, x: root.x + button.container.x, y: root.y + button.container.y,
        width: button.container.hitArea.width, height: button.container.hitArea.height,
      })),
    } : null,
  };
}
