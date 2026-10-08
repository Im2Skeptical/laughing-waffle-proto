import { PALETTE } from './settlement-theme.js';

// Bake the soft rim once. Pulsing its opacity never redraws graph geometry or
// adds a filter pass, and this overlay cannot intercept the highlighted inputs.
export function createRunCompleteEmphasisView(parent, targets) {
  const root = new PIXI.Container();
  root.eventMode = 'none';
  parent.addChild(root);
  for (const { rect, shape } of targets) {
    const glow = new PIXI.Graphics();
    glow.eventMode = 'none';
    for (const [width, alpha] of [[30, .035], [18, .08], [10, .18], [3, .85]]) {
      glow.lineStyle(width, PALETTE.accent, alpha);
      if (shape === 'circle') glow.drawCircle(rect.x + rect.width / 2, rect.y + rect.height / 2,
        Math.min(rect.width, rect.height) / 2);
      else glow.drawRoundedRect(rect.x, rect.y, rect.width, rect.height, 6);
    }
    if (shape !== 'circle') glow.beginFill(PALETTE.accent, .055)
      .drawRect(rect.x, rect.y, rect.width, rect.height).endFill();
    root.addChild(glow);
  }
  let pulse = 0;
  return {
    update(elapsedMs) {
      pulse = .35 + .65 * (.5 - .5 * Math.cos(elapsedMs / 1800 * Math.PI * 2));
      root.alpha = pulse;
    },
    getSnapshot: () => ({ targets, pulse }),
  };
}
