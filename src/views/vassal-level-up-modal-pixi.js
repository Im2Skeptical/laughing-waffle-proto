import { addInteractionFeedback } from "./interaction-feedback.js";
import { getVassalStatPresentation } from "../model/vassal-life-map.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { addIllustration, getArtRevision } from './chronicle-art.js';

const PANEL = Object.freeze({ x: 330, y: 176, width: 1764, height: 594 });
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
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8,
    enabled ? 0x40533b : 0x464743, enabled ? PALETTE.accent : PALETTE.stroke, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title, fontSize: 16,
    fill: enabled ? PALETTE.text : PALETTE.textMuted,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  addInteractionFeedback(root, {x:0,y:0,width:rect.width,height:rect.height}, {
    enabled, onActivate:onPress,
  });
  root.setEnabled = value => {
    root.eventMode = value ? "static" : "none";
    gfx.clear();
    roundedRect(gfx, 0, 0, rect.width, rect.height, 8,
      value ? 0x40533b : 0x464743, value ? PALETTE.accent : PALETTE.stroke, 2);
    root.children[1].style.fill = value ? PALETTE.text : PALETTE.textMuted;
    root.setInteractionEnabled(value);
  };
  parent.addChild(root);
  return root;
}

function addChoiceCard(parent, vassal, choice, statId, rect, selected, onSelect) {
  const before = getVassalStatPresentation(vassal, statId);
  const after = getVassalStatPresentation(vassal, statId, before.value + 1);
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  const color = STAT_COLORS[statId] ?? PALETTE.accent;
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 14, 0x303733, selected ? color : PALETTE.stroke, selected ? 4 : 2);
  root.addChild(gfx);
  addIllustration(root,{cunning:'patronage',wisdom:'legacy',effectiveness:'crisis',intelligence:'study'}[statId],
    {x:rect.width-160,y:8,width:150,height:100},{alpha:.85});
  root.addChild(
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
    createText(selected ? "SELECTED" : "SELECT THIS STAT", {
      ...TEXT_STYLES.header, fontSize: 17, fill: selected ? PALETTE.green : PALETTE.accent,
    }, rect.width / 2, rect.height - 36, 0.5, 0.5));
  const selectionLabel = root.children.at(-1);
  root.setSelected = value => {
    gfx.clear();
    roundedRect(gfx, 0, 0, rect.width, rect.height, 14, 0x303733,
      value ? color : PALETTE.stroke, value ? 4 : 2);
    selectionLabel.text = value ? "SELECTED" : "SELECT THIS STAT";
    selectionLabel.style.fill = value ? PALETTE.green : PALETTE.accent;
  };
  addInteractionFeedback(root, {x:0,y:0,width:rect.width,height:rect.height}, {onActivate:()=>onSelect?.(statId)});
  parent.addChild(root);
  return root;
}

export function createVassalLevelUpModalView({
  app, layer, getPresentation, isLifegraphVisible, isRecapOpen, onChoose,
} = {}) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 180;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let choiceRoots = [];
  let selectedStatId = null;
  let choiceKey = null;
  let confirmRoot = null;
  let pointerHeld = false;
  root.on("pointerdown", () => { pointerHeld = true; });
  for (const type of ["pointerup", "pointerupoutside", "pointercancel"]) root.on(type, () => { pointerHeld = false; });

  function render(force = false, prepared = null) {
    if (pointerHeld) return;
    const presentation = prepared ?? getPresentation?.() ?? {};
    const vassal = presentation.vassal;
    const queue = vassal?.developmentChoiceQueue ?? [];
    const visible = !prepared && isLifegraphVisible?.() === true
      && presentation.readOnly !== true && queue.length > 0
      && isRecapOpen?.() !== true;
    root.visible = visible;
    root.eventMode = visible ? "static" : "none";
    if (!queue.length) return;
    const choice = queue[0];
    const nextChoiceKey = `${vassal.vassalId}:${choice.choiceId}`;
    if (choiceKey !== nextChoiceKey) { selectedStatId = null; choiceKey = nextChoiceKey; }
    if (selectedStatId && !choice.offeredStatIds.includes(selectedStatId)) selectedStatId = null;
    const nextSignature = getArtRevision() + JSON.stringify({
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

    const cardWidth = 520;
    const gap = 26;
    const totalWidth = cardWidth * 3 + gap * 2;
    const startX = PANEL.x + (PANEL.width - totalWidth) / 2;
    choiceRoots = choice.offeredStatIds.map((statId, index) => addChoiceCard(
      root, vassal, choice, statId,
      { x: startX + index * (cardWidth + gap), y: PANEL.y + 124, width: cardWidth, height: 360 },
      selectedStatId === statId,
      (nextStatId) => {
        selectedStatId = nextStatId;
        choiceRoots.forEach((card, index) => card.setSelected(choice.offeredStatIds[index] === selectedStatId));
        confirmRoot.setEnabled(true);
      }
    ));
    confirmRoot = addButton(root, {
      x: PANEL.x + PANEL.width - 310, y: PANEL.y + PANEL.height - 72,
      width: 266, height: 48,
    }, "CONFIRM", !!selectedStatId, () => {
      if (!selectedStatId) return;
      onChoose?.(choice.choiceId, selectedStatId);
    });
  }

  return {
    prepare(presentation) {
      render(false, presentation);
      return app.renderer?.prepare?.upload(root);
    },
    init: () => render(true), update: () => render(), refresh: () => render(),
    resize: () => render(true), isOpen: () => root.visible,
    getChoiceClickPoint(index = 0) {
      if (!root.visible) return null;
      const target = choiceRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(
        target.hitArea.width / 2, target.hitArea.height / 2
      ));
      return point ? { x: point.x, y: point.y } : null;
    },
    getConfirmClickPoint: () => root.visible && confirmRoot?.toGlobal
      ? confirmRoot.toGlobal(new PIXI.Point(
        confirmRoot.hitArea.width / 2, confirmRoot.hitArea.height / 2
      )) : null,
    getSemanticSnapshot: () => ({
      open: root.visible,
      queue: getPresentation?.()?.vassal?.developmentChoiceQueue ?? [],
      selectedStatId,
      choiceStates: choiceRoots.map(card => card.interactionState),
      confirmState: confirmRoot?.interactionState ?? null,
    }),
    getHudDeltas() {
      if (!root.visible || !selectedStatId) return null;
      return { prestige: 0, stats: { [selectedStatId]: 1 } };
    },
  };
}
