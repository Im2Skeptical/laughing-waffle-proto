// Mortality-estimate plate for the node-decision modal.

import { createText, roundedRect } from "../settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";

export function renderMortalityEstimate(parent, estimate, rect, enabled) {
  if (!estimate) return;
  const totalPercent = Math.round(estimate.totalDeathChance * 1000) / 10;
  const naturalPercent = Math.round(estimate.naturalDeathChance * 1000) / 10;
  const immediatePercent = Math.round(estimate.immediateDeathChance * 1000) / 10;
  const riskColor = estimate.totalDeathChance >= 0.25 ? 0xd58c7c
    : estimate.totalDeathChance > 0 ? PALETTE.accent : PALETTE.green;
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 10,
    enabled ? 0x353a35 : 0x30332f, riskColor, 2);
  parent.addChild(gfx,
    createText("MORTALITY ESTIMATE", {
      ...TEXT_STYLES.chip, fontSize: 12, fill: riskColor,
    }, rect.x + 14, rect.y + 10),
    createText(`${totalPercent}% chance of death`, {
      ...TEXT_STYLES.header, fontSize: 19, fill: enabled ? riskColor : PALETTE.textMuted,
    }, rect.x + 14, rect.y + 29),
    createText(`Time ${estimate.timeLabel}  ·  Age ${estimate.currentAge} → ${estimate.projectedAge}`, {
      ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 28,
    }, rect.x + 14, rect.y + 54)
  );
  const factors = [];
  if (immediatePercent) factors.push(`Selection ${immediatePercent}% now`);
  if (naturalPercent) factors.push(`Age after time ${naturalPercent}%`);
  parent.addChild(createText(factors.length
    ? factors.join("  ·  ")
    : "No immediate or age-based risk at this resolution.", {
    ...TEXT_STYLES.body, fontSize: 12, fill: PALETTE.textMuted,
    wordWrap: true, wordWrapWidth: rect.width - 28,
  }, rect.x + 14, rect.y + 74));
}
