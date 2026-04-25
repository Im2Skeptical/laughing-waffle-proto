import {
  ELDER_BUST_ACCENT_TONES,
  ELDER_BUST_SKIN_TONES,
  PALETTE,
} from "./settlement-theme.js";
import { roundedRect } from "./settlement-view-primitives.js";

function hashString(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDeterministicBustSeedParts(member) {
  const sourceVassalId =
    typeof member?.sourceVassalId === "string" && member.sourceVassalId.length > 0
      ? member.sourceVassalId
      : null;
  if (sourceVassalId) {
    return ["vassal", sourceVassalId];
  }
  return [
    "member",
    member?.memberId ?? "",
    member?.modifierId ?? "",
    member?.sourceClassId ?? "",
    member?.joinedYear ?? 0,
  ];
}

export function drawDeterministicBust(container, rect, member) {
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;
  const seed = hashString(getDeterministicBustSeedParts(member).join("|"));
  const skinTone = ELDER_BUST_SKIN_TONES[seed % ELDER_BUST_SKIN_TONES.length];
  const accentTone =
    ELDER_BUST_ACCENT_TONES[Math.floor(seed / 7) % ELDER_BUST_ACCENT_TONES.length];
  const darkTone = PALETTE.bustDark;

  const backdrop = new PIXI.Graphics();
  roundedRect(
    backdrop,
    0,
    0,
    rect.width,
    rect.height,
    Math.min(18, Math.floor(rect.height * 0.35)),
    PALETTE.bustBackdrop,
    PALETTE.stroke,
    2
  );
  root.addChild(backdrop);

  const shoulderVariant = Math.floor(seed / 13) % 3;
  const shoulders = new PIXI.Graphics();
  shoulders.beginFill(accentTone, 0.95);
  if (shoulderVariant === 0) {
    shoulders.drawRoundedRect(rect.width * 0.12, rect.height * 0.52, rect.width * 0.76, rect.height * 0.32, 10);
  } else if (shoulderVariant === 1) {
    shoulders.moveTo(rect.width * 0.1, rect.height * 0.82);
    shoulders.lineTo(rect.width * 0.28, rect.height * 0.52);
    shoulders.lineTo(rect.width * 0.72, rect.height * 0.52);
    shoulders.lineTo(rect.width * 0.9, rect.height * 0.82);
  } else {
    shoulders.drawEllipse(rect.width * 0.5, rect.height * 0.73, rect.width * 0.34, rect.height * 0.18);
  }
  shoulders.endFill();
  root.addChild(shoulders);

  const headVariant = Math.floor(seed / 29) % 3;
  const head = new PIXI.Graphics();
  head.beginFill(skinTone, 1);
  if (headVariant === 0) {
    head.drawEllipse(rect.width * 0.5, rect.height * 0.33, rect.width * 0.17, rect.height * 0.2);
  } else if (headVariant === 1) {
    head.drawRoundedRect(rect.width * 0.33, rect.height * 0.13, rect.width * 0.34, rect.height * 0.42, 12);
  } else {
    head.drawCircle(rect.width * 0.5, rect.height * 0.32, Math.min(rect.width, rect.height) * 0.18);
  }
  head.endFill();
  root.addChild(head);

  const hairVariant = Math.floor(seed / 53) % 4;
  const hair = new PIXI.Graphics();
  hair.beginFill(darkTone, 0.96);
  if (hairVariant === 0) {
    hair.drawEllipse(rect.width * 0.5, rect.height * 0.23, rect.width * 0.2, rect.height * 0.13);
  } else if (hairVariant === 1) {
    hair.drawRoundedRect(rect.width * 0.3, rect.height * 0.09, rect.width * 0.4, rect.height * 0.16, 10);
  } else if (hairVariant === 2) {
    hair.moveTo(rect.width * 0.26, rect.height * 0.22);
    hair.lineTo(rect.width * 0.5, rect.height * 0.03);
    hair.lineTo(rect.width * 0.74, rect.height * 0.22);
  } else {
    hair.drawEllipse(rect.width * 0.5, rect.height * 0.2, rect.width * 0.22, rect.height * 0.1);
    hair.drawRect(rect.width * 0.46, rect.height * 0.13, rect.width * 0.08, rect.height * 0.08);
  }
  hair.endFill();
  root.addChild(hair);

  if ((Math.floor(seed / 89) % 2) === 0) {
    const beard = new PIXI.Graphics();
    beard.beginFill(darkTone, 0.92);
    beard.moveTo(rect.width * 0.38, rect.height * 0.42);
    beard.lineTo(rect.width * 0.62, rect.height * 0.42);
    beard.lineTo(rect.width * 0.5, rect.height * 0.58);
    beard.endFill();
    root.addChild(beard);
  } else {
    const diadem = new PIXI.Graphics();
    diadem.lineStyle(2, PALETTE.accent, 0.9);
    diadem.moveTo(rect.width * 0.32, rect.height * 0.19);
    diadem.lineTo(rect.width * 0.68, rect.height * 0.19);
    root.addChild(diadem);
  }

  container.addChild(root);
  return root;
}
