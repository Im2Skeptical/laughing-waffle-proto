import { createRunCompletePresentation } from "./run-complete-presentation.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const PANEL = { width: 1320, height: 620 };

export function createRunCompleteView({ app, layer, onOpen, onNewGame, getSpotlightRects } = {}) {
  const root = new PIXI.Container();
  root.zIndex = 190;
  layer.addChild(root);
  const presentation = createRunCompletePresentation();
  const targets = new Map();
  let signature = "";
  let spotlightRects = [];
  const contains = (rect, x, y) => x >= rect.x && x <= rect.x + rect.width &&
    y >= rect.y && y <= rect.y + rect.height;
  function minimize() { presentation.minimize(); render(); }
  app.stage.on("pointerdowncapture", event => {
    if (presentation.getSnapshot().open && spotlightRects.some(rect => contains(rect, event.global.x, event.global.y))) {
      minimize();
    }
  });

  function button(parent, id, rect, label, action, { fill = PALETTE.panelSoft } = {}) {
    const container = new PIXI.Container();
    container.position.set(rect.x, rect.y);
    container.eventMode = "static";
    container.cursor = "pointer";
    container.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    const bg = new PIXI.Graphics();
    roundedRect(bg, 0, 0, rect.width, rect.height, 10,
      fill, PALETTE.accent, 2);
    container.addChild(bg, createText(label, { ...TEXT_STYLES.title, fontSize: 30 },
      rect.width / 2, rect.height / 2, .5, .5));
    container.on("pointerdown", event => event.stopPropagation());
    container.on("pointertap", event => { event.stopPropagation(); action(); });
    parent.addChild(container);
    targets.set(id, container);
    return container;
  }

  function render(force = false) {
    const snapshot = presentation.getSnapshot();
    spotlightRects = snapshot.open && snapshot.info?.projected
      ? (getSpotlightRects?.() ?? []).map(rect => ({ x: rect.x - 6, y: rect.y - 6,
        width: rect.width + 12, height: rect.height + 12 })) : [];
    const nextSignature = JSON.stringify([snapshot, spotlightRects, app.screen.width, app.screen.height]);
    if (!force && signature === nextSignature) return;
    signature = nextSignature;
    clearChildren(root);
    targets.clear();
    const { info, open } = snapshot;
    root.visible = !!(info && open);
    if (!info || !open) return;
    const accent = info.projected ? PALETTE.accent : 0xe0a094;
    const blocker = new PIXI.Graphics();
    // Partition the backdrop so overlapping spotlights never double-fill or
    // intercept the actual control's pointer gesture.
    const xs = [...new Set([0, app.screen.width, ...spotlightRects.flatMap(r => [r.x, r.x + r.width])])]
      .map(x => Math.max(0, Math.min(app.screen.width, x))).sort((a, b) => a - b);
    const ys = [...new Set([0, app.screen.height, ...spotlightRects.flatMap(r => [r.y, r.y + r.height])])]
      .map(y => Math.max(0, Math.min(app.screen.height, y))).sort((a, b) => a - b);
    blocker.beginFill(0x090d0d, .78);
    for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) {
      if (!spotlightRects.some(r => contains(r, (xs[i - 1] + xs[i]) / 2, (ys[j - 1] + ys[j]) / 2))) {
        blocker.drawRect(xs[i - 1], ys[j - 1], xs[i] - xs[i - 1], ys[j] - ys[j - 1]);
      }
    }
    blocker.endFill();
    blocker.hitArea = { contains: (x, y) => !spotlightRects.some(r => contains(r, x, y)) };
    blocker.eventMode = "static";
    blocker.on("pointerdown", event => event.stopPropagation());
    blocker.on("pointertap", event => event.stopPropagation());
    root.addChild(blocker);
    const panel = new PIXI.Container();
    panel.position.set((app.screen.width - PANEL.width) / 2,
      info.projected ? Math.max(20, (app.screen.height - PANEL.height) / 2 - 90)
        : (app.screen.height - PANEL.height) / 2);
    panel.eventMode = "static";
    panel.hitArea = new PIXI.Rectangle(0, 0, PANEL.width, PANEL.height);
    const bg = new PIXI.Graphics();
    roundedRect(bg, 0, 0, PANEL.width, PANEL.height, 18, PALETTE.panel, accent, 3);
    panel.addChild(bg,
      createText(info.title, { ...TEXT_STYLES.header, fontSize: 48, fill: accent }, 56, 38),
      createText(`${info.projected ? "Foreseen end" : "Civilization ended"} · Year ${info.year}`, {
        ...TEXT_STYLES.title, fontSize: 29,
      }, 56, 104),
      createText(info.cause, { ...TEXT_STYLES.header, fontSize: 34, fill: accent }, 56, 172),
      createText(info.explanation, {
        ...TEXT_STYLES.body, fontSize: 29, lineHeight: 39,
        wordWrap: true, wordWrapWidth: PANEL.width - 112,
      }, 56, 224),
      createText(info.guidance, {
        ...TEXT_STYLES.body, fontSize: 27, lineHeight: 36, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: PANEL.width - 112,
      }, 56, 380),
    );
    root.addChild(panel);
    const browseRect = info.projected
      ? { x: 56, y: 504, width: PANEL.width - 112, height: 76 }
      : { x: 56, y: 504, width: 576, height: 76 };
    button(panel, "browse", browseRect,
      "Minimise · Browse history", minimize);
    if (!info.projected) {
      button(panel, "newGame", { x: 660, y: 504, width: 604, height: 76 },
        "New game", () => onNewGame?.(), {fill:0x405a3c});
    }
  }

  return {
    init: () => render(true), update: () => render(), resize: () => render(true),
    sync(input) { const result = presentation.sync(input); if (result.opened) onOpen?.(); render(); return result; },
    reset() { presentation.reset(); render(); },
    reopen() { presentation.reopen(); onOpen?.(); render(); return { ok: !!presentation.getSnapshot().info }; },
    isOpen: () => presentation.getSnapshot().open,
    getSemanticSnapshot: () => ({ ...presentation.getSnapshot(), spotlightRects }),
    getClickPoint(id) {
      const target = targets.get(id);
      return target?.toGlobal(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2)) ?? null;
    },
  };
}
