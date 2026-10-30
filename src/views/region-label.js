import { createText } from './settlement-view-primitives.js';

const COMPASS = { North: 'N', Northern: 'N', South: 'S', Southern: 'S', East: 'E', Eastern: 'E', West: 'W', Western: 'W', Northeast: 'NE', Northeastern: 'NE', Northwest: 'NW', Northwestern: 'NW', Southeast: 'SE', Southeastern: 'SE', Southwest: 'SW', Southwestern: 'SW', Central: 'C' };
export function compactRegionName(name) {
  return String(name ?? '').replace(/^[A-Za-z]+\b/, word => COMPASS[word] ?? word);
}

// Prefer the full name, abbreviate its compass only if needed, then wrap/fit.
// Accessible text always retains the complete name.
export function createRegionLabel(name, style, x, y, maxWidth, maxHeight, anchorX = 0, anchorY = 0) {
  const label = createText(name, style, x, y, anchorX, anchorY);
  if (label.width > maxWidth) label.text = compactRegionName(name);
  if (label.width > maxWidth && maxHeight > style.fontSize * 1.8) {
    label.style.wordWrap = true;
    label.style.wordWrapWidth = maxWidth;
  }
  label.scale.set(Math.min(1, maxWidth / Math.max(1, label.width), maxHeight / Math.max(1, label.height)));
  label.accessibleTitle = name;
  label.eventMode = 'none';
  return label;
}
