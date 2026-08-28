import { getVassalStatPresentation, getVassalStatsPresentation } from "../model/vassal-life-map.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const PANEL = Object.freeze({ x: 330, y: 150, width: 1764, height: 620 });
const STAT_COLORS = Object.freeze({
  cunning: 0xc58b5b,
  wisdom: 0x6ca6d7,
  effectiveness: 0x7faf6d,
  intelligence: 0xaf87cf,
});

function addButton(parent, rect, label, enabled, onPress) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = enabled ? "static" : "none";
  root.cursor = enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointertap", (event) => {
    event?.stopPropagation?.();
    if (enabled) onPress?.();
  });
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8,
    enabled ? 0x40533b : 0x464743, enabled ? PALETTE.accent : PALETTE.stroke, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title, fontSize: 16,
    fill: enabled ? PALETTE.text : PALETTE.textMuted,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  parent.addChild(root);
  return root;
}

function addChoiceCard(parent, vassal, choice, statId, rect, onChoose) {
  const before = getVassalStatPresentation(vassal, statId);
  const after = getVassalStatPresentation(vassal, statId, before.value + 1);
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointertap", (event) => {
    event?.stopPropagation?.();
    onChoose?.(choice.choiceId, statId);
  });
  const color = STAT_COLORS[statId] ?? PALETTE.accent;
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 14, 0x303733, color, 3);
  root.addChild(gfx,
    createText(before.label.toUpperCase(), {
      ...TEXT_STYLES.chip, fontSize: 15, fill: color,
    }, 22, 20),
    createText(`${before.value}  →  ${after.value}`, {
      ...TEXT_STYLES.header, fontSize: 38, fill: PALETTE.text,
    }, 22, 56),
    createText(before.powerLabel, {
      ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 44,
    }, 22, 120),
    createText(`BECOMES  ${after.powerLabel}`, {
      ...TEXT_STYLES.title, fontSize: 18, fill: color,
      wordWrap: true, wordWrapWidth: rect.width - 44, lineHeight: 21,
    }, 22, 168),
    createText(after.formula, {
      ...TEXT_STYLES.body, fontSize: 14, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 44,
    }, 22, 226),
    createText("CHOOSE THIS STAT", {
      ...TEXT_STYLES.header, fontSize: 17, fill: PALETTE.accent,
    }, rect.width / 2, rect.height - 36, 0.5, 0.5));
  parent.addChild(root);
  return root;
}

export function createVassalLevelUpModalView({
  app, layer, getPresentation, isLifegraphVisible, onChoose, onWorldMap,
} = {}) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 180;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let choiceRoots = [];

  function render(force = false) {
    const presentation = getPresentation?.() ?? {};
    const vassal = presentation.vassal;
    const queue = vassal?.developmentChoiceQueue ?? [];
    const visible = isLifegraphVisible?.() === true
      && presentation.readOnly !== true && queue.length > 0;
    root.visible = visible;
    if (!visible) {
      signature = "";
      clearChildren(root);
      choiceRoots = [];
      return;
    }
    const choice = queue[0];
    const nextSignature = JSON.stringify({
      vassalId: vassal.vassalId,
      stats: vassal.stats,
      queue,
    });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    choiceRoots = [];

    const blocker = new PIXI.Graphics();
    blocker.beginFill(0x171713, 0.72).drawRect(0, 0, app.screen.width, app.screen.height).endFill();
    blocker.eventMode = "static";
    blocker.on("pointerdown", (event) => event?.stopPropagation?.());
    const bg = new PIXI.Graphics();
    roundedRect(bg, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 18,
      0x292f2b, PALETTE.accent, 3);
    root.addChild(blocker, bg,
      createText("VASSAL LEVEL UP", {
        ...TEXT_STYLES.header, fontSize: 32, fill: PALETTE.accent,
      }, PANEL.x + 42, PANEL.y + 28),
      createText("Choose one of the three offered attributes. This decision is required before entering another Lifegraph node.", {
        ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 1050,
      }, PANEL.x + 42, PANEL.y + 72),
      createText(`${queue.length} ${queue.length === 1 ? "LEVEL" : "LEVELS"} REMAINING`, {
        ...TEXT_STYLES.chip, fontSize: 15, fill: PALETTE.accent,
      }, PANEL.x + PANEL.width - 270, PANEL.y + 34));

    const stats = getVassalStatsPresentation(vassal);
    stats.forEach((stat, index) => {
      const x = PANEL.x + 42 + index * 410;
      root.addChild(createText(`${stat.label} ${stat.value} · ${stat.powerLabel}`, {
        ...TEXT_STYLES.body, fontSize: 14,
        fill: STAT_COLORS[stat.statId] ?? PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 388,
      }, x, PANEL.y + 112));
    });

    const cardWidth = 520;
    const gap = 26;
    const totalWidth = cardWidth * 3 + gap * 2;
    const startX = PANEL.x + (PANEL.width - totalWidth) / 2;
    choiceRoots = choice.offeredStatIds.map((statId, index) => addChoiceCard(
      root, vassal, choice, statId,
      { x: startX + index * (cardWidth + gap), y: PANEL.y + 164, width: cardWidth, height: 342 },
      onChoose
    ));
    addButton(root, {
      x: PANEL.x + PANEL.width - 310, y: PANEL.y + PANEL.height - 72,
      width: 266, height: 48,
    }, "VIEW WORLD MAP", true, () => onWorldMap?.(vassal.locationRegionId));
  }

  return {
    init: () => render(true), update: () => render(), refresh: () => render(true),
    resize: () => render(true), isOpen: () => root.visible,
    getChoiceClickPoint(index = 0) {
      if (!root.visible) return null;
      const target = choiceRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(
        target.hitArea.width / 2, target.hitArea.height / 2
      ));
      return point ? { x: point.x, y: point.y } : null;
    },
    getSemanticSnapshot: () => ({
      open: root.visible,
      queue: getPresentation?.()?.vassal?.developmentChoiceQueue ?? [],
    }),
  };
}
