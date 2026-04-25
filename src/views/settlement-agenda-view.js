import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createText, roundedRect } from "./settlement-view-primitives.js";

export function getPracticeDrainColor(card) {
  switch (card?.defId) {
    case "floodRites":
      return PALETTE.practiceDrainRed;
    case "riverRecessionFarming":
      return PALETTE.practiceDrainGreen;
    default:
      return PALETTE.practiceDrainNeutral;
  }
}

function getMiniPracticeStyle(defId, opts = null) {
  const options = opts && typeof opts === "object" ? opts : {};
  const def = settlementPracticeDefs?.[defId] ?? null;
  const passive = def?.practiceMode === "passive";
  const isMission = def?.completionBehavior === "removePractice";
  if (!defId || !def) {
    return {
      fill: PALETTE.slot,
      outline: PALETTE.stroke,
      radius: 10,
      passive: false,
      title: options.emptyLabel ?? "No agenda",
      badgeLabel: null,
      badgeFill: PALETTE.chip,
      badgeOutline: PALETTE.stroke,
    };
  }
  let outline = passive ? PALETTE.passiveBorderMuted : PALETTE.stroke;
  let fill = passive ? PALETTE.panelSoft : PALETTE.card;
  if (defId === "floodRites") {
    outline = PALETTE.practiceDrainRed;
    fill = PALETTE.practiceFloodFill;
  } else if (defId === "riverRecessionFarming") {
    outline = PALETTE.practiceDrainGreen;
    fill = PALETTE.practiceRiverFill;
  } else if (defId === "openToStrangers") {
    outline = PALETTE.passiveBorder;
    fill = PALETTE.practiceStrangerFill;
  } else if (defId === "asTheRomans") {
    outline = PALETTE.active;
    fill = PALETTE.practiceRomanFill;
  }
  if (isMission) {
    outline = PALETTE.mission;
    fill = passive ? PALETTE.missionSoft : PALETTE.missionFill;
  }
  return {
    fill,
    outline,
    radius: passive ? 10 : 12,
    passive,
    title: def?.name ?? defId,
    badgeLabel: isMission ? "Mission" : null,
    badgeFill: PALETTE.missionSoft,
    badgeOutline: PALETTE.mission,
  };
}

export function drawMiniPracticeCard(container, rect, defId, opts = null) {
  const options = opts && typeof opts === "object" ? opts : {};
  const style = getMiniPracticeStyle(defId, options);
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;

  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    0,
    0,
    rect.width,
    rect.height,
    style.radius,
    style.fill,
    style.outline,
    style.passive ? 3 : 2
  );
  root.addChild(gfx);

  const title = createText(
    style.title,
    {
      ...TEXT_STYLES.body,
      fontSize: options.fontSize ?? 10,
      fontWeight: "bold",
      wordWrap: true,
      wordWrapWidth: rect.width - 10,
      lineHeight: options.lineHeight ?? 12,
    },
    5,
    5
  );
  root.addChild(title);

  if (style.badgeLabel) {
    const badgeHeight = Math.max(12, Math.floor((options.fontSize ?? 10) + 4));
    const badgeWidth = Math.min(rect.width - 10, style.badgeLabel.length * 6 + 14);
    const badgeX = Math.max(4, rect.width - badgeWidth - 4);
    const badge = new PIXI.Graphics();
    roundedRect(
      badge,
      badgeX,
      4,
      badgeWidth,
      badgeHeight,
      8,
      style.badgeFill,
      style.badgeOutline,
      1
    );
    root.addChild(badge);
    root.addChild(
      createText(
        style.badgeLabel,
        {
          ...TEXT_STYLES.muted,
          fontSize: Math.max(8, (options.fontSize ?? 10) - 1),
          fontWeight: "bold",
          fill: PALETTE.accent,
        },
        badgeX + badgeWidth * 0.5,
        4 + badgeHeight * 0.5,
        0.5,
        0.5
      )
    );
  }

  container.addChild(root);
  return root;
}

export function drawAgendaStack(container, rect, agendaDefIds) {
  const agenda = Array.isArray(agendaDefIds) ? agendaDefIds : [];
  const stack = new PIXI.Container();
  stack.x = rect.x;
  stack.y = rect.y;

  if (agenda.length <= 0) {
    drawMiniPracticeCard(
      stack,
      { x: 0, y: 0, width: rect.width, height: rect.height },
      null,
      { emptyLabel: "No agenda", fontSize: 10, lineHeight: 12 }
    );
    container.addChild(stack);
    return stack;
  }

  const visibleCount = Math.min(3, agenda.length);
  const xOffset = Math.max(4, Math.floor(rect.width * 0.08));
  const yOffset = 4;
  for (let index = visibleCount - 1; index >= 0; index -= 1) {
    const width = Math.max(rect.width - xOffset * index, rect.width * 0.72);
    const height = Math.max(rect.height - yOffset * index, rect.height * 0.72);
    drawMiniPracticeCard(
      stack,
      { x: xOffset * index, y: yOffset * index, width, height },
      agenda[index],
      { fontSize: 9, lineHeight: 11 }
    );
  }

  if (agenda.length > visibleCount) {
    stack.addChild(
      createText(
        `+${agenda.length - visibleCount}`,
        {
          ...TEXT_STYLES.muted,
          fontSize: 10,
          fontWeight: "bold",
        },
        rect.width - 2,
        rect.height - 1,
        1,
        1
      )
    );
  }

  container.addChild(stack);
  return stack;
}
