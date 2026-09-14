import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const COMPACT = Object.freeze({ x: 70, y: 16, width: 500, height: 118 });
const BLOCKING = Object.freeze({ x: 620, y: 220, width: 1200, height: 420 });

function addButton(parent, rect, label, onPress) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointertap", (event) => {
    event?.stopPropagation?.();
    onPress?.();
  });
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8, 0x40533b, PALETTE.accent, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title, fontSize: 18, fill: PALETTE.text,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  parent.addChild(root);
  return root;
}

function deathCopy(cause) {
  if (cause === "crisis") {
    return "They died taking a lethal risk on this turning point.";
  }
  if (cause === "naturalMortality") {
    return "They died of age after the time spent on this turning point.";
  }
  return "They died during this turning point.";
}

export function createVassalResolutionRecapView({
  app, layer, getRecap, isLifegraphVisible, onDismiss,
} = {}) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 185;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let dismissRoot = null;

  function render(force = false) {
    const recap = getRecap?.() ?? null;
    const visible = isLifegraphVisible?.() === true && recap != null;
    root.visible = visible;
    root.eventMode = visible ? "static" : "none";
    if (!visible) {
      signature = "";
      clearChildren(root);
      dismissRoot = null;
      return;
    }
    const ended = recap.endedReason === "died" || recap.endedReason === "retired";
    const nextSignature = JSON.stringify(recap);
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    dismissRoot = null;

    const compact = recap.queuedLevelUp === true && !ended;
    const panel = compact ? COMPACT : BLOCKING;
    if (!compact) {
      const blocker = new PIXI.Graphics();
      blocker.beginFill(0x171713, 0.72).drawRect(0, 0, app.screen.width, app.screen.height).endFill();
      blocker.eventMode = "static";
      blocker.on("pointerdown", (event) => event?.stopPropagation?.());
      root.addChild(blocker);
    }
    const bg = new PIXI.Graphics();
    roundedRect(bg, panel.x, panel.y, panel.width, panel.height, 16,
      0x292f2b, recap.endedReason === "died" ? PALETTE.red : PALETTE.accent, 3);
    bg.eventMode = "static";
    bg.on("pointertap", (event) => event?.stopPropagation?.());
    root.addChild(bg);

    const title = recap.endedReason === "died" ? "THE VASSAL HAS DIED"
      : recap.endedReason === "retired" ? "A LIFE COMPLETED"
        : "TURNING POINT RESOLVED";
    root.addChild(createText(title, {
      ...TEXT_STYLES.header, fontSize: compact ? 24 : 32,
      fill: recap.endedReason === "died" ? PALETTE.red : PALETTE.accent,
    }, panel.x + 36, panel.y + 22));

    if (recap.endedReason === "died") {
      root.addChild(createText(deathCopy(recap.deathCause), {
        ...TEXT_STYLES.body, fontSize: 20, fill: PALETTE.text,
        wordWrap: true, wordWrapWidth: panel.width - 72,
      }, panel.x + 36, panel.y + 78));
    } else if (recap.endedReason === "retired") {
      root.addChild(createText("This vassal finished their chronicle and retired.", {
        ...TEXT_STYLES.body, fontSize: 20, fill: PALETTE.text,
        wordWrap: true, wordWrapWidth: panel.width - 72,
      }, panel.x + 36, panel.y + 78));
    } else {
      const summary = [
        recap.timeLabel ? `Time passed  ${recap.timeLabel}` : null,
        `+${recap.prestigeIncome ?? 0} Prestige`,
        `+${recap.developmentIncome ?? 0} EXP`,
      ].filter(Boolean).join("    ·    ");
      root.addChild(createText(summary, {
        ...TEXT_STYLES.title, fontSize: compact ? 20 : 24, fill: PALETTE.text,
        wordWrap: true, wordWrapWidth: panel.width - 280,
      }, panel.x + 36, panel.y + (compact ? 62 : 90)));
    }

    const buttonLabel = ended ? "RETURN TO MAP" : "CONTINUE";
    dismissRoot = addButton(root, {
      x: panel.x + panel.width - 280, y: panel.y + panel.height - 64,
      width: 244, height: 44,
    }, buttonLabel, () => onDismiss?.(recap));
  }

  return {
    init: () => render(true),
    update: () => render(),
    refresh: () => render(true),
    resize: () => render(true),
    isOpen: () => root.visible,
    getDismissClickPoint: () => root.visible && dismissRoot?.toGlobal
      ? dismissRoot.toGlobal(new PIXI.Point(
        dismissRoot.hitArea.width / 2, dismissRoot.hitArea.height / 2
      )) : null,
    getSemanticSnapshot: () => ({
      open: root.visible,
      recap: getRecap?.() ?? null,
    }),
  };
}
