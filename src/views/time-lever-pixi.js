// time-lever-pixi.js
// Vertical secondary transport: up advances, down rewinds, centre holds.
import { paintRelicPanel, RELIC, drawHourglass } from './chronicle-skin.js';

export function createTimeLeverView({
  app,
  layer,
  getTimeScale,
  setTimeScaleTarget,
  width = 64,
  height = 200,
  handleWidth = 52,
  handleHeight = 32,
  margin = 4,
  curve = 1.5,
  stickySpeed = 0.5,
  uiMaxAbsSpeed = 4,
  lockSpeeds = [-4, -2, 2, 4],
  lockSnapNormRadius = 0.07,
  labelGap = 4,
  labelFontSize = 12,
} = {}) {
  const timeLever = new PIXI.Container();
  const leverTrack = new PIXI.Graphics();
  const leverHandle = new PIXI.Graphics();
  const leverHit = new PIXI.Graphics();
  const leverLabel = new PIXI.Text("", {
    fill: 0xffffff,
    fontSize: labelFontSize,
  });
  timeLever.addChild(leverTrack, leverHandle, leverHit, leverLabel);
  if (layer) layer.addChild(timeLever);

  const LABEL_HEIGHT = 18;
  const fullHeight = height + labelGap + LABEL_HEIGHT;

  let leverDragging = false;
  let leverDragNorm = 0;
  let leverDragSpeed = 1;
  let lastHandleColor = null;
  let lastTrackSignature = "";

  timeLever.visible =
    typeof getTimeScale === "function" || typeof setTimeScaleTarget === "function";

  function getTimeScaleMax() {
    const ts = typeof getTimeScale === "function" ? getTimeScale() : null;
    const max = ts && Number.isFinite(ts.max) ? ts.max : 16;
    return Math.max(1, Math.floor(max));
  }

  function getActiveUiMaxSpeed() {
    const engineMax = getTimeScaleMax();
    const uiMax = Number.isFinite(uiMaxAbsSpeed)
      ? Math.max(1, Math.floor(uiMaxAbsSpeed))
      : 4;
    return Math.min(engineMax, uiMax);
  }

  function clampNorm(norm) {
    if (!Number.isFinite(norm)) return 0;
    return Math.max(-1, Math.min(1, norm));
  }

  function leverNormToSpeed(norm) {
    const maxSpeed = getActiveUiMaxSpeed();
    const n = Math.max(-1, Math.min(1, norm));
    const t = Math.pow(Math.abs(n), curve);
    return Math.sign(n) * t * maxSpeed;
  }

  function speedToLeverNorm(speed) {
    const maxSpeed = getActiveUiMaxSpeed();
    const s = Number.isFinite(speed) ? speed : 1;
    return Math.sign(s) * Math.pow(Math.min(1, Math.abs(s) / maxSpeed), 1 / curve);
  }

  function leverNormToHandleY(norm) {
    const minY = margin;
    const maxY = height - margin - handleHeight;
    const t = (1 - clampNorm(norm)) / 2;
    return minY + t * (maxY - minY);
  }

  function leverNormToTrackY(norm) {
    return leverNormToHandleY(norm) + handleHeight * 0.5;
  }

  function getActiveLockSpeeds() {
    const maxSpeed = getActiveUiMaxSpeed();
    const source = Array.isArray(lockSpeeds) ? lockSpeeds : [];
    const unique = new Set();
    for (const value of source) {
      if (!Number.isFinite(value)) continue;
      const speed = Number(value);
      if (speed === 0) continue;
      if (Math.abs(speed) > maxSpeed) continue;
      unique.add(speed);
    }
    return Array.from(unique).sort((a, b) => a - b);
  }

  function applyLockSnap(rawNorm) {
    const norm = clampNorm(rawNorm);
    const radius = Number.isFinite(lockSnapNormRadius)
      ? Math.max(0, Number(lockSnapNormRadius))
      : 0;
    if (radius <= 0) return norm;

    const activeLocks = getActiveLockSpeeds();
    if (!activeLocks.length) return norm;

    let closestNorm = norm;
    let closestDist = Number.POSITIVE_INFINITY;
    for (const speed of activeLocks) {
      const lockNorm = speedToLeverNorm(speed);
      const dist = Math.abs(lockNorm - norm);
      if (dist < closestDist) {
        closestNorm = lockNorm;
        closestDist = dist;
      }
    }

    return closestDist <= radius ? closestNorm : norm;
  }

  function drawTimeLeverBase() {
    const maxSpeed = getActiveUiMaxSpeed();
    const activeLocks = getActiveLockSpeeds();
    const signature = `${maxSpeed}|${activeLocks.join(",")}`;
    if (signature === lastTrackSignature) return;
    lastTrackSignature = signature;

    leverTrack.clear();
    paintRelicPanel(leverTrack,0,0,width,height,RELIC.stone,RELIC.brass,2);
    leverTrack.beginFill(RELIC.shadow).drawRect(width*.4,8,width*.2,height-16).endFill();
    leverTrack.lineStyle(1, 0x333333, 0.7);
    leverTrack.moveTo(6, height / 2);
    leverTrack.lineTo(width - 6, height / 2);

    for (const speed of activeLocks) {
      const notchY = leverNormToTrackY(speedToLeverNorm(speed));
      const isMajor = Math.abs(speed) >= 4;
      const notchInset = isMajor ? 7 : 9;
      const notchColor = isMajor ? 0xe4dcc5 : 0xc4baa1;
      const notchAlpha = isMajor ? 0.92 : 0.78;
      const notchWidth = isMajor ? 2 : 1;
      leverTrack.lineStyle(notchWidth, notchColor, notchAlpha);
      leverTrack.moveTo(notchInset, notchY);
      leverTrack.lineTo(width - notchInset, notchY);
    }

    leverHit.clear();
    leverHit.beginFill(0xffffff);
    leverHit.drawRect(0, 0, width, height);
    leverHit.endFill();
    leverHit.alpha = 0;
    leverHit.hitArea = new PIXI.Rectangle(-10,0,width+20,height);
  }

  function drawLeverHandle(color) {
    leverHandle.clear();
    paintRelicPanel(leverHandle,0,0,handleWidth,handleHeight,RELIC.raised,color,2);
    drawHourglass(leverHandle,handleWidth/2,handleHeight/2,handleHeight*.57,color);
  }

  function updateTimeLever(state) {
    if (!timeLever.visible) return;
    drawTimeLeverBase();

    const ts = typeof getTimeScale === "function" ? getTimeScale() : null;
    const speed = ts && Number.isFinite(ts.current) ? ts.current : 1;
    const displaySpeed = leverDragging ? leverDragSpeed : speed;
    const norm = leverDragging ? leverDragNorm : speedToLeverNorm(displaySpeed);

    leverHandle.x = (width - handleWidth) / 2;
    leverHandle.y = leverNormToHandleY(norm);

    let color = RELIC.gold;
    if (Math.abs(displaySpeed) < stickySpeed) {
      color = RELIC.bone;
    } else if (displaySpeed < 0) {
      color = RELIC.red;
    } else if (displaySpeed > 1.05) {
      color = RELIC.teal;
    }

    if (color !== lastHandleColor) {
      drawLeverHandle(color);
      lastHandleColor = color;
    }

    const speedAbs = Math.abs(displaySpeed);
    const speedText = `${displaySpeed < 0 ? "-" : ""}x${speedAbs.toFixed(1)}`;
    const showPauseHint = speedAbs < stickySpeed && !leverDragging;
    leverLabel.text = state?.followingForecast ? 'AUTO' :
      showPauseHint || state?.paused ? 'HOLD' : speedText;
    leverLabel.x = (width - leverLabel.width) / 2;
    leverLabel.y = height + labelGap;
  }

  function updateLeverFromPointer(globalPos) {
    const local = timeLever.toLocal(globalPos);
    const minY = margin;
    const maxY = height - margin - handleHeight;
    const handleY = Math.max(
      minY,
      Math.min(maxY, local.y - handleHeight / 2)
    );
    const ratio = (handleY - minY) / Math.max(1, maxY - minY);
    const norm = 1 - ratio * 2;
    const snappedNorm = applyLockSnap(norm);
    leverDragNorm = snappedNorm;
    leverDragSpeed = leverNormToSpeed(snappedNorm);

    if (typeof setTimeScaleTarget === "function") {
      setTimeScaleTarget(leverDragSpeed, { unpause: leverDragSpeed !== 0 });
    }
  }

  function endLeverDrag() {
    if (!leverDragging) return;
    leverDragging = false;

    const shouldPause = Math.abs(leverDragSpeed) < stickySpeed;
    if (typeof setTimeScaleTarget === "function") {
      if (shouldPause) {
        setTimeScaleTarget(0, { requestPause: true });
      } else {
        setTimeScaleTarget(leverDragSpeed, { unpause: true });
      }
    }
  }

  if (typeof setTimeScaleTarget === "function") {
    leverHit.eventMode = "static";
    leverHit.cursor = "pointer";
    leverHit.on("pointerdown", (e) => {
      leverDragging = true;
      updateLeverFromPointer(e.global);
    });
    app?.stage?.on("pointermove", (e) => {
      if (!leverDragging) return;
      updateLeverFromPointer(e.global);
    });
    app?.stage?.on("pointerup", endLeverDrag);
    app?.stage?.on("pointerupoutside", endLeverDrag);
  } else {
    leverHit.eventMode = "none";
  }

  drawTimeLeverBase();
  drawLeverHandle(0xdddddd);

  return {
    container: timeLever,
    width,
    trackHeight: height,
    height: fullHeight,
    getTrackBounds: () => leverHit.getBounds(),
    update: updateTimeLever,
  };
}
