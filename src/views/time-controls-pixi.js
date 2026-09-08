// time-controls-pixi.js
// Secondary transport controls flank the primary sun/moon wheels.

import { createTimeLeverView } from "./time-lever-pixi.js";
import { VIEWPORT_DESIGN_WIDTH } from "./layout-pixi.js";

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
  getTimeScale,
  setTimeScaleTarget,
  layout = TIME_CONTROLS_LAYOUT,
  sunMoonLayout = null,
} = {}) {
  const root = new PIXI.Container();
  root.sortableChildren = true;
  root.zIndex = Number.isFinite(layout?.zIndex) ? layout.zIndex : 2;
  layer?.addChild(root);

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
    // The Present control belongs to the shared navigation dock.
    timeLeverView.container.position.set(
      clamp(anchor.x - anchor.radius - 20 - timeLeverView.width, screenPadding,
        app.screen.width - timeLeverView.width - screenPadding), anchor.y - 100);
  }
  function update(frameDt) {
    const enabled = layout?.enabled !== false;
    root.visible = enabled;
    if (!enabled) return;

    const state = typeof getGameState === "function" ? getGameState() : null;
    if (!state) return;

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
    getScreenRect: () =>
      !root.visible || typeof root.getBounds !== "function"
        ? null
        : root.getBounds(),
  };
}
