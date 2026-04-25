export function roundedRect(
  gfx,
  x,
  y,
  width,
  height,
  radius,
  fill,
  stroke,
  strokeWidth = 3,
  fillAlpha = 1,
  strokeAlpha = 0.95
) {
  gfx.lineStyle(strokeWidth, stroke, strokeAlpha);
  gfx.beginFill(fill, fillAlpha);
  gfx.drawRoundedRect(x, y, width, height, radius);
  gfx.endFill();
}

export function clearChildren(container) {
  const children = Array.isArray(container?.children) ? [...container.children] : [];
  for (const child of children) {
    container.removeChild(child);
    child.destroy?.({ children: true });
  }
}

export function createText(label, style, x, y, anchorX = 0, anchorY = 0) {
  const text = new PIXI.Text(label, style);
  text.anchor.set(anchorX, anchorY);
  text.x = x;
  text.y = y;
  return text;
}

export function createWrappedText(label, style, x, y, maxWidth, anchorX = 0, anchorY = 0) {
  return createText(
    label,
    {
      ...style,
      wordWrap: true,
      wordWrapWidth: Math.max(1, Math.floor(maxWidth ?? 1)),
    },
    x,
    y,
    anchorX,
    anchorY
  );
}
