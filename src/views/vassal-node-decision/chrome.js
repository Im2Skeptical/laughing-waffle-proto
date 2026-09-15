// Overlapping title plaque and dock-style Confirm for the node-decision modal.

import { createText, roundedRect } from "../settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";
import { CONFIRM_DOCK, PANEL, TITLE_PLAQUE } from "./constants.js";

export function titlePlaqueRect() {
  return {
    x: TITLE_PLAQUE.x,
    y: PANEL.y - TITLE_PLAQUE.overlapY,
    width: TITLE_PLAQUE.width,
    height: TITLE_PLAQUE.height,
  };
}

export function renderTitlePlaque(parent, family) {
  if (!family) return null;
  const rect = titlePlaqueRect();
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 10,
    0x242a27, family.color ?? PALETTE.accent, 3);
  parent.addChild(gfx,
    createText(`${family.glyph}  ${String(family.label ?? "").toUpperCase()}`, {
      ...TEXT_STYLES.header, fontSize: 26, fill: family.color ?? PALETTE.accent,
    }, rect.x + 18, rect.y + 12),
    createText(family.description ?? "", {
      ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 36,
    }, rect.x + 18, rect.y + 46),
  );
  return rect;
}

export function confirmDockRect(app) {
  const width = app?.screen?.width ?? 2424;
  const height = app?.screen?.height ?? 1080;
  return {
    x: width - CONFIRM_DOCK.right - CONFIRM_DOCK.width,
    y: height - CONFIRM_DOCK.bottom - CONFIRM_DOCK.height,
    width: CONFIRM_DOCK.width,
    height: CONFIRM_DOCK.height,
  };
}

export function confirmDockButton(parent, app, { enabled, label, onClick } = {}) {
  const rect = confirmDockRect(app);
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  const radius = rect.height / 2;
  const bg = new PIXI.Graphics();
  const fill = enabled ? 0x405a3c : 0x3a4a3c;
  const hoverFill = 0x527249;
  const rim = enabled ? PALETTE.accent : PALETTE.stroke;
  function paint(hovered = false, pressed = false) {
    bg.clear();
    const color = enabled ? (hovered ? hoverFill : fill) : fill;
    bg.beginFill(0x090c0d, 0.72)
      .drawRoundedRect(5, 7, rect.width - 4, rect.height - 4, radius)
      .endFill();
    bg.lineStyle(4, rim, enabled ? 1 : 0.4)
      .beginFill(color, enabled ? 1 : 0.55)
      .drawRoundedRect(0, pressed ? 4 : 0, rect.width, rect.height, radius)
      .endFill();
  }
  paint();
  root.addChild(bg, createText(label ?? "Confirm", {
    ...TEXT_STYLES.title, fontSize: 42,
    fill: enabled ? 0xf6fff6 : PALETTE.textMuted,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  root.on("pointertap", (event) => {
    event?.stopPropagation?.();
    if (enabled) onClick?.();
  });
  root.on("pointerover", () => { if (enabled) paint(true); });
  root.on("pointerout", () => paint(false));
  root.on("pointerdown", (event) => {
    event?.stopPropagation?.();
    if (enabled) paint(true, true);
  });
  root.on("pointerup", () => { if (enabled) paint(true); });
  root.on("pointerupoutside", () => paint(false));
  root.on("pointercancel", () => paint(false));
  parent.addChild(root);
  return root;
}
