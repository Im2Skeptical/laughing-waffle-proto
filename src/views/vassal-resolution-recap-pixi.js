import { addInteractionFeedback } from "./interaction-feedback.js";
import { VASSAL_LIFE_TUNING } from "../defs/gamepieces/vassal-life-map-defs.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createConsequentialTimeView } from './consequential-time-pixi.js';

const PANEL = Object.freeze({ x: 612, y: 130, width: 1200, height: 810 });

function addButton(parent, rect, label, onPress) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8, 0x40533b, PALETTE.accent, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title, fontSize: 28, fill: PALETTE.text,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  addInteractionFeedback(root, {x:0,y:0,width:rect.width,height:rect.height}, {
    onActivate:onPress,
  });
  parent.addChild(root);
  return root;
}

function deathCopy(cause) {
  if (cause === "relic") return "They died searching for a Relic.";
  if (cause === "crisis") {
    return "They died taking a lethal risk on this turning point.";
  }
  if (cause === "naturalMortality") {
    return "They died of age after the time spent on this turning point.";
  }
  return "They died during this turning point.";
}

function changeLine(parent, x, y, label, before, after, unit = "") {
  const changed = before !== after;
  parent.addChild(
    createText(label, {
      ...TEXT_STYLES.chip, fontSize: 24, fill: PALETTE.textMuted,
    }, x, y),
    createText(`${before}${unit}  →  ${after}${unit}`, {
      ...TEXT_STYLES.title, fontSize: 34,
      fill: changed ? PALETTE.accent : PALETTE.text,
    }, x, y + 34)
  );
}

export function createVassalResolutionRecapView({
  app, layer, getRecap, isLifegraphVisible, onDismiss, tooltipView,
} = {}) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 185;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let dismissRoot = null;
  let wasVisible = false;
  let clockView = null;
  let clockStartedAt = null;

  function render(force = false, prepared = null) {
    const recap = prepared ?? getRecap?.() ?? null;
    const ended = recap?.endedReason === "died" || recap?.endedReason === "retired";
    const visible = !prepared && recap != null && (ended || isLifegraphVisible?.() === true);
    if (visible && !wasVisible) clockStartedAt = performance.now();
    if (visible && !wasVisible) tooltipView?.hide?.({ force: true });
    wasVisible = visible;
    root.visible = visible;
    root.eventMode = visible ? "static" : "none";
    if (!recap) return;
    const nextSignature = JSON.stringify(recap);
    if (visible && nextSignature !== signature) clockStartedAt = performance.now();
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    clockView = null;
    dismissRoot = null;

    const blocker = new PIXI.Graphics();
    blocker.beginFill(0x171713, 0.62).drawRect(0, 0, app.screen.width, app.screen.height).endFill();
    blocker.eventMode = "static";
    blocker.on("pointerdown", (event) => event?.stopPropagation?.());
    root.addChild(blocker);
    const bg = new PIXI.Graphics();
    roundedRect(bg, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 16,
      0x292f2b, recap.endedReason === "died" ? PALETTE.red : PALETTE.accent, 3);
    bg.eventMode = "static";
    bg.on("pointertap", (event) => event?.stopPropagation?.());
    root.addChild(bg);

    const title = recap.endedReason === "died" ? "THE VASSAL HAS DIED"
      : recap.endedReason === "retired" ? "A LIFE COMPLETED"
        : "TURNING POINT RESOLVED";
    root.addChild(createText(title, {
      ...TEXT_STYLES.header, fontSize: 42,
      fill: recap.endedReason === "died" ? PALETTE.red : PALETTE.accent,
    }, PANEL.x + PANEL.width / 2, PANEL.y + 30, .5));

    if (recap.endedReason === "died") {
      root.addChild(createText(deathCopy(recap.deathCause), {
        ...TEXT_STYLES.body, fontSize: 28, fill: PALETTE.text,
        wordWrap: true, wordWrapWidth: PANEL.width - 88,
      }, PANEL.x + 44, PANEL.y + 88));
    } else if (recap.endedReason === "retired") {
      root.addChild(createText("This vassal finished their chronicle and retired.", {
        ...TEXT_STYLES.body, fontSize: 28, fill: PALETTE.text,
        wordWrap: true, wordWrapWidth: PANEL.width - 88,
      }, PANEL.x + 44, PANEL.y + 88));
    } else {
      const threshold = recap.expThreshold ?? VASSAL_LIFE_TUNING.developmentThreshold;
      changeLine(root, PANEL.x + 44, PANEL.y + 592, "AGE", recap.ageBefore ?? 0, recap.ageAfter ?? 0);
      changeLine(root, PANEL.x + 360, PANEL.y + 592, "PRESTIGE", recap.prestigeBefore ?? 0, recap.prestigeAfter ?? 0);
      changeLine(root, PANEL.x + 700, PANEL.y + 592, "EXP",
        `${recap.expBefore ?? 0}/${threshold}`, `${recap.expAfter ?? 0}/${threshold}`);
      if (recap.queuedLevelUp) {
        const count = recap.earnedLevelCount || 1;
        root.addChild(createText(count === 1 ? "Level up earned" : `${count} level ups earned`, {
          ...TEXT_STYLES.header, fontSize: 28, fill: PALETTE.green,
        }, PANEL.x + 44, PANEL.y + 710));
      }
    }

    if (recap.clock) {
      clockView = createConsequentialTimeView(root, recap.clock, {
        x: PANEL.x + 44, y: PANEL.y + 138, width: PANEL.width - 88,
      });
      clockView.update(0);
    }

    const buttonLabel = ended ? "RETURN TO MAP"
      : recap.queuedLevelUp ? "CONTINUE TO LEVEL UP" : "CONTINUE";
    dismissRoot = addButton(root, {
      x: PANEL.x + PANEL.width - 430, y: PANEL.y + PANEL.height - 100,
      width: 386, height: 68,
    }, buttonLabel, () => onDismiss?.(recap));
  }

  return {
    prepare(recap) {
      render(false, recap);
      return app.renderer?.prepare?.upload(root);
    },
    init: () => render(true),
    update: () => {
      render();
      if (root.visible && clockView) {
        clockView.update(performance.now() - clockStartedAt);
      }
    },
    refresh: () => render(),
    resize: () => render(true),
    isOpen: () => root.visible,
    getDismissClickPoint: () => root.visible && dismissRoot?.toGlobal
      ? dismissRoot.toGlobal(new PIXI.Point(
        dismissRoot.hitArea.width / 2, dismissRoot.hitArea.height / 2
      )) : null,
    getSemanticSnapshot: () => ({
      open: root.visible,
      continueState: dismissRoot?.interactionState ?? null,
      recap: getRecap?.() ?? null,
      clock: clockView?.getSnapshot?.() ?? null,
    }),
  };
}
