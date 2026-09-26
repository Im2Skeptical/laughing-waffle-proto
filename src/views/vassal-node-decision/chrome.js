// Overlapping title plaque and dock-style Confirm for the node-decision modal.

import { createText, roundedRect } from "../settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";
import { dockPadContour, drawDockCheckIcon, paintDockPadFace } from "../settlement-dock-style.js";
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

export function confirmDockButton(parent, app, { enabled, label, onClick, showCheck = true } = {}) {
  const rect = confirmDockRect(app);
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = enabled ? "pointer" : "default";
  const contour = dockPadContour(rect.width, rect.height, "whole");
  root.hitArea = new PIXI.Polygon(contour);
  const bg = new PIXI.Graphics();
  const icon = new PIXI.Graphics();
  const title = new PIXI.Text(label ?? "Confirm", {
    fontFamily: "Georgia", fontSize: 32, fontWeight: "bold", fill: 0xdce8c5,
  });
  title.anchor.set(0.5);
  const colors = {
    fill: 0x405a3c, hoverFill: 0x527249, ink: 0xdce8c5, rim: 0x9ab681,
  };
  let hovered = false;
  let pressed = false;
  function paint() {
    paintDockPadFace(bg, {
      width: rect.width, height: rect.height, contour, colors,
      hovered: hovered && enabled, pressed: pressed && enabled,
    });
    root.alpha = enabled ? 1 : 0.55;
    const offset = pressed ? 3 : 0;
    icon.position.set(rect.width / 2, rect.height * 0.38 + offset);
    title.position.set(rect.width / 2, rect.height * (showCheck ? 0.72 : 0.5) + offset);
  }
  drawDockCheckIcon(icon, colors.ink);
  icon.scale.set(1.75);
  icon.visible = showCheck;
  root.addChild(bg, icon, title);
  paint();
  root.on("pointertap", (event) => {
    event?.stopPropagation?.();
    if (enabled) onClick?.();
  });
  root.on("pointerover", () => { hovered = true; paint(); });
  root.on("pointerout", () => { hovered = false; pressed = false; paint(); });
  root.on("pointerdown", (event) => {
    event?.stopPropagation?.();
    pressed = enabled;
    paint();
  });
  const release = () => { pressed = false; paint(); };
  root.on("pointerup", release);
  root.on("pointerupoutside", release);
  root.on("pointercancel", release);
  parent.addChild(root);
  return root;
}
