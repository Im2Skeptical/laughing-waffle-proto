// Shared carved-stone face for the navigation pad and Lifegraph Confirm.
import { getStoneTexture, RELIC } from './chronicle-skin.js';

function addArc(points, x, y, radius, from, to, steps = 24) {
  for (let step = 0; step <= steps; step++) {
    const angle = from + (to - from) * step / steps;
    points.push(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
}

// The hit area uses this same contour, so rounded corners stay inert.
export function dockPadContour(width, height, shape) {
  const points = [];
  const radius = height / 2;
  if (shape === 'whole') {
    addArc(points, width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
    addArc(points, radius, radius, radius, Math.PI / 2, Math.PI * 1.5);
  } else {
    const seamRadius = 10;
    addArc(points, width - seamRadius, seamRadius, seamRadius, -Math.PI / 2, 0, 6);
    addArc(points, width - seamRadius, height - seamRadius, seamRadius, 0, Math.PI / 2, 6);
    addArc(points, radius, radius, radius, Math.PI / 2, Math.PI * 1.5);
    if (shape === 'right') {
      for (let i = 0; i < points.length; i += 2) points[i] = width - points[i];
    }
  }
  return points;
}

function insetContour(points, width, height, inset, offsetY = 0) {
  return points.map((value, index) => index % 2
    ? inset + value * (height - inset * 2) / height + offsetY
    : inset + value * (width - inset * 2) / width);
}

export function paintDockPadFace(bg, { width, height, contour, colors, hovered, pressed }) {
  bg.clear();
  bg.beginFill(RELIC.shadow, 0.85)
    .drawPolygon(insetContour(contour, width, height, 0, 5)).endFill();
  bg.lineStyle(3, hovered ? colors.ink : colors.rim, 1)
    .beginTextureFill({
      texture: getStoneTexture(),
      color: pressed ? RELIC.stone : hovered ? colors.hoverFill ?? colors.fill : colors.fill,
    })
    .drawPolygon(contour).endFill();
  bg.lineStyle(2, colors.ink, hovered ? 0.55 : 0.25)
    .drawPolygon(insetContour(contour, width, height, 5));
}

export function drawDockCheckIcon(g, color) {
  g.lineStyle(2.4, color, 1).moveTo(-15, 0).lineTo(-4, 11).lineTo(16, -12);
}
