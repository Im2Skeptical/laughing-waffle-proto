// time-controls-pixi.js
// Secondary transport controls flank the primary sun/moon wheels.

import { createTimeLeverView } from "./time-lever-pixi.js";
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { VIEWPORT_DESIGN_WIDTH } from "./layout-pixi.js";

const BUTTON_WIDTH = 104;
const BUTTON_HEIGHT = 64;
const BASIC_TIME_LEVER_UI_MAX_ABS_SPEED = 4;
const BASIC_TIME_LEVER_LOCK_SPEEDS = Object.freeze([-4, -2, 2, 4]);
const BASIC_TIME_LEVER_LOCK_SNAP_NORM_RADIUS = 0.07;

export const TIME_CONTROLS_LAYOUT = {
  enabled: true,
  zIndex: 2,
  screenPadding: 16,
  diskTextureRadiusPx: 220,
};

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function makeButton(layer, label, onClick) {
  const container = new PIXI.Container();

  const bg = new PIXI.Graphics();
  paintRelicPanel(bg,0,0,BUTTON_WIDTH,BUTTON_HEIGHT,RELIC.stone,RELIC.brass,2);

  const text = new PIXI.Text(label, {
    fill: 0xffffff,
    fontSize: 24,
  });
  text.anchor.set(0.5, 0.5);
  text.position.set(BUTTON_WIDTH * 0.5, BUTTON_HEIGHT * 0.5);

  container.addChild(bg, text);
  container.eventMode = "static";
  container.cursor = "pointer";

  container.on("pointerover", () => {
    bg.tint = 0x888888;
  });
  container.on("pointerout", () => {
    bg.tint = 0xffffff;
  });
  container.on("pointertap", () => {
    onClick?.();
  });

  layer?.addChild(container);
  return container;
}

function getControlsAnchor(layout, sunMoonLayout, app) {
  const seasonX = Number.isFinite(sunMoonLayout?.season?.x)
    ? sunMoonLayout.season.x
    : Math.floor(app?.screen?.width ?? VIEWPORT_DESIGN_WIDTH) - 220;
  const seasonY = Number.isFinite(sunMoonLayout?.season?.y)
    ? sunMoonLayout.season.y
    : 400;
  const seasonScale = Number.isFinite(sunMoonLayout?.season?.scale)
    ? Math.max(0, sunMoonLayout.season.scale)
    : 0.75;
  const diskRadiusPx = Math.max(48, Number(layout?.diskTextureRadiusPx ?? 256));
  return {
    x: seasonX,
    y: seasonY,
    radius: diskRadiusPx * seasonScale,
  };
}

export function createTimeControlsView({
  app,
  layer,
  getGameState,
  togglePause,
  isPausePending,
  getCommitPreviewState,
  onCommitPreview,
  getReturnToPresentState,
  onReturnToPresent,
  getTimeScale,
  setTimeScaleTarget,
  layout = TIME_CONTROLS_LAYOUT,
  sunMoonLayout = null,
} = {}) {
  const root = new PIXI.Container();
  root.sortableChildren = true;
  root.zIndex = Number.isFinite(layout?.zIndex) ? layout.zIndex : 2;
  layer?.addChild(root);

  const pauseButton = makeButton(root, "Pause", () => {
    togglePause?.();
  });
  let actionButtonMode = "commit";
  let actionButtonTargetSec = null;
  const commitButton = makeButton(root, "Commit", () => {
    if (actionButtonMode === "present") {
      if (Number.isFinite(actionButtonTargetSec)) {
        onReturnToPresent?.(actionButtonTargetSec);
        return;
      }
      onReturnToPresent?.();
      return;
    }
    onCommitPreview?.();
  });
  const timeLeverView = createTimeLeverView({
    app,
    layer: root,
    getTimeScale,
    setTimeScaleTarget,
    uiMaxAbsSpeed: BASIC_TIME_LEVER_UI_MAX_ABS_SPEED,
    lockSpeeds: BASIC_TIME_LEVER_LOCK_SPEEDS,
    lockSnapNormRadius: BASIC_TIME_LEVER_LOCK_SNAP_NORM_RADIUS,
    width: 64,
    height: 200,
    handleWidth: 52,
    handleHeight: 32,
    labelFontSize: 18,
  });

  function applyLayout() {
    if (!app?.screen) return;
    const anchor = getControlsAnchor(layout, sunMoonLayout, app);
    const screenPadding = Math.max(0, Number(layout?.screenPadding ?? 16));
    // Keep the wheel unobstructed and all controls fixed when Present appears.
    timeLeverView.container.position.set(
      clamp(anchor.x + anchor.radius + 20, screenPadding,
        app.screen.width - timeLeverView.width - screenPadding), anchor.y - 100);
    const buttonX = anchor.x - anchor.radius - 18 - BUTTON_WIDTH;
    pauseButton.position.set(buttonX, anchor.y - BUTTON_HEIGHT - 8);
    commitButton.position.set(buttonX, anchor.y + 8);
  }
  function update(frameDt) {
    const enabled = layout?.enabled !== false;
    root.visible = enabled;
    if (!enabled) return;

    const state = typeof getGameState === "function" ? getGameState() : null;
    if (!state) return;

    const pausePending =
      typeof isPausePending === "function" ? !!isPausePending() : false;
    const pauseLabel = pauseButton.children[1];
    const pauseBg = pauseButton.children[0];

    if (state.paused) {
      pauseLabel.text = "Paused";
      pauseBg.tint = 0xffffff;
    } else if (pausePending) {
      pauseLabel.text = "Pausing...";
      pauseBg.tint = 0xffcc66;
    } else {
      pauseLabel.text = "Pause";
      pauseBg.tint = 0xffffff;
    }

    const commitState =
      typeof getCommitPreviewState === "function"
        ? getCommitPreviewState()
        : null;
    const returnState =
      typeof getReturnToPresentState === "function"
        ? getReturnToPresentState()
        : null;
    const showCommit = !!commitState?.visible;
    const showReturn = !showCommit && !!returnState?.visible;
    const showActionButton = showCommit || showReturn;
    const canCommit =
      showCommit &&
      commitState?.enabled !== false &&
      typeof onCommitPreview === "function";
    const canReturn =
      showReturn &&
      returnState?.enabled !== false &&
      typeof onReturnToPresent === "function";
    const canAction = showCommit ? canCommit : canReturn;
    actionButtonMode = showReturn ? "present" : "commit";
    actionButtonTargetSec =
      showReturn && Number.isFinite(returnState?.targetSec)
        ? Math.floor(returnState.targetSec)
        : null;

    commitButton.visible = showActionButton;
    commitButton.eventMode = canAction ? "static" : "none";
    commitButton.cursor = canAction ? "pointer" : "default";
    const commitBg = commitButton.children[0];
    const commitLabel = commitButton.children[1];
    if (commitLabel) {
      commitLabel.text = showReturn ? "Present" : "Commit";
    }
    if (commitBg) {
      commitBg.tint = canAction ? 0xffffff : 0x666666;
    }

    timeLeverView.update(state, frameDt);
    applyLayout();
  }

  function init() {
    applyLayout();
  }

  function refresh() {
    applyLayout();
  }

  return {
    init,
    refresh,
    update,
    getTimeLeverScreenRect: () => {
      if (
        !root.visible ||
        !timeLeverView.container.visible ||
        typeof timeLeverView.container.getBounds !== "function"
      ) {
        return null;
      }
      const bounds = timeLeverView.getTrackBounds();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    },
    getActionButtonClickPoint: () => {
      if (!root.visible || !commitButton.visible || typeof commitButton.toGlobal !== "function") {
        return null;
      }
      const point = commitButton.toGlobal(new PIXI.Point(BUTTON_WIDTH * 0.5, BUTTON_HEIGHT * 0.5));
      return { x: point.x, y: point.y };
    },
    getScreenRect: () =>
      !root.visible || typeof root.getBounds !== "function"
        ? null
        : root.getBounds(),
  };
}
