// Vassal impact panel for personal-choice node decisions.

import { createText } from "../settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";

export function renderVassalProjection(parent, projection, rect) {
  parent.addChild(createText("VASSAL IMPACT", {
    ...TEXT_STYLES.header, fontSize: 22,
  }, rect.x, rect.y));
  if (!projection) return;
  parent.addChild(createText("CURRENT", {
    ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted,
  }, rect.x, rect.y + 42));
  parent.addChild(createText("AFTER CHOICE", {
    ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.accent,
  }, rect.x + 430, rect.y + 42));
  projection.baseline.stats.forEach((before, index) => {
    const after = projection.immediate.stats[index];
    const changed = before.value !== after.value;
    const y = rect.y + 76 + index * 82;
    parent.addChild(
      createText(`${before.label}  ${before.value}`, {
        ...TEXT_STYLES.title, fontSize: 18,
      }, rect.x, y),
      createText(before.powerLabel, {
        ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 390,
      }, rect.x, y + 27),
      createText(`${after.label}  ${before.value}${changed ? ` → ${after.value}` : ""}`, {
        ...TEXT_STYLES.title, fontSize: 18, fill: changed ? PALETTE.accent : PALETTE.text,
      }, rect.x + 430, y),
      createText(after.powerLabel, {
        ...TEXT_STYLES.body, fontSize: 13, fill: changed ? PALETTE.accent : PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 390,
      }, rect.x + 430, y + 27)
    );
  });
  const resourceY = rect.y + 420;
  parent.addChild(
    createText(`Prestige  ${projection.baseline.prestige} → ${projection.immediate.prestige}`, {
      ...TEXT_STYLES.title, fontSize: 18,
      fill: projection.baseline.prestige !== projection.immediate.prestige ? PALETTE.accent : PALETTE.text,
    }, rect.x, resourceY),
    createText(`EXP  ${projection.baseline.developmentProgress} / 10`, {
      ...TEXT_STYLES.title, fontSize: 18,
    }, rect.x, resourceY + 34),
    createText("IF THIS VASSAL SURVIVES COMPLETION", {
      ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.green,
    }, rect.x, resourceY + 86),
    createText(`+${projection.ifSurvives.prestigeIncome} Prestige  ·  +${projection.ifSurvives.developmentIncome} EXP  ·  ends at ${projection.ifSurvives.developmentProgress}/10${projection.ifSurvives.earnedLevelCount ? `  ·  ${projection.ifSurvives.earnedLevelCount} level up` : ""}`, {
      ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.text,
      wordWrap: true, wordWrapWidth: rect.width,
    }, rect.x, resourceY + 116)
  );
}
