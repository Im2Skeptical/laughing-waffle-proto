import { getRedGodFaithMitigationRule } from "../model/settlement-chaos.js";
import { capitalizeLabel, capitalizeTier } from "./settlement-formatters.js";
import { SETTLEMENT_CLASS_SUMMARY_CARD_LAYOUT } from "./settlement-layout.js";
import {
  FAITH_TIER_COLORS,
  FAITH_TIER_ORDER,
  HAPPINESS_STATE_COLORS,
  HAPPINESS_STATE_ORDER,
  PALETTE,
  TEXT_STYLES,
} from "./settlement-theme.js";
import {
  createText,
  createWrappedText,
  roundedRect,
} from "./settlement-view-primitives.js";

function getFaithTierRank(tier) {
  return FAITH_TIER_ORDER.indexOf(typeof tier === "string" ? tier : "");
}

function getFaithTierColor(tier) {
  return FAITH_TIER_COLORS[tier] ?? PALETTE.inactive;
}

function getHappinessStateColor(status) {
  return HAPPINESS_STATE_COLORS[status] ?? PALETTE.inactive;
}

function drawClassStatPill(container, x, y, width, label, value, fill) {
  const layout = SETTLEMENT_CLASS_SUMMARY_CARD_LAYOUT.statPill;
  const height = layout.height;
  const pill = new PIXI.Graphics();
  roundedRect(pill, x, y, width, height, 10, fill, PALETTE.stroke, 1);
  container.addChild(pill);
  container.addChild(
    createText(
      label,
      {
        ...TEXT_STYLES.muted,
        fontSize: 8,
      },
      x + layout.labelXInset,
      y + layout.labelYOffset
    )
  );
  container.addChild(
    createText(
      String(value),
      {
        ...TEXT_STYLES.body,
        fontSize: 11,
        fontWeight: "bold",
      },
      x + width - layout.valueRightInset,
      y + height * 0.5,
      1,
      0.5
    )
  );
}

function drawFaithTrack(container, rect, faith) {
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;

  const panel = new PIXI.Graphics();
  roundedRect(panel, 0, 0, rect.width, rect.height, 14, PALETTE.faithPanel, PALETTE.stroke, 1);
  root.addChild(panel);
  root.addChild(
    createText(
      "Faith",
      {
        ...TEXT_STYLES.muted,
        fontSize: 9,
        fontWeight: "bold",
      },
      10,
      5
    )
  );

  const currentTier = typeof faith?.tier === "string" ? faith.tier : "bronze";
  const currentRank = Math.max(0, getFaithTierRank(currentTier));
  const nodeY = rect.height <= 36 ? 18 : Math.max(16, Math.floor(rect.height * 0.52));
  const nodeRadius = rect.height <= 34 ? 6 : 7;
  const startX = 20;
  const endX = rect.width - 20;
  const stepX = (endX - startX) / Math.max(1, FAITH_TIER_ORDER.length - 1);

  for (let index = 0; index < FAITH_TIER_ORDER.length - 1; index += 1) {
    const currentX = startX + stepX * index;
    const nextX = startX + stepX * (index + 1);
    const segment = new PIXI.Graphics();
    const leftActive = index <= currentRank - 1;
    const rightActive = index + 1 <= currentRank;
    segment.lineStyle(4, leftActive || rightActive ? PALETTE.active : PALETTE.stroke, 0.95);
    segment.moveTo(currentX, nodeY);
    segment.lineTo(nextX, nodeY);
    root.addChild(segment);
  }

  for (let index = 0; index < FAITH_TIER_ORDER.length; index += 1) {
    const tier = FAITH_TIER_ORDER[index];
    const tierX = startX + stepX * index;
    const active = index <= currentRank;
    const node = new PIXI.Graphics();
    node.lineStyle(2, getFaithTierColor(tier), active ? 1 : 0.55);
    node.beginFill(active ? getFaithTierColor(tier) : PALETTE.cardMuted, active ? 1 : 0.6);
    node.drawCircle(tierX, nodeY, nodeRadius);
    node.endFill();
    root.addChild(node);

    const tierLabel = createText(
      tier === "diamond" ? "Dia" : capitalizeTier(tier).slice(0, 3),
      {
        ...TEXT_STYLES.muted,
        fontSize: 7,
        fontWeight: index === currentRank ? "bold" : "normal",
        fill: active ? PALETTE.text : PALETTE.textMuted,
      },
      tierX,
      nodeY + nodeRadius + 2,
      0.5,
      0
    );
    root.addChild(tierLabel);

    const chaosMitigation = getRedGodFaithMitigationRule(tier);
    if (chaosMitigation.amount > 0) {
      const badgeWidth = 34;
      const badgeHeight = 12;
      const badge = new PIXI.Graphics();
      roundedRect(
        badge,
        tierX - badgeWidth * 0.5,
        4,
        badgeWidth,
        badgeHeight,
        7,
        tier === currentTier ? PALETTE.active : PALETTE.faithMitigationInactive,
        PALETTE.active,
        1
      );
      root.addChild(badge);
      root.addChild(
        createText(
          `-${chaosMitigation.amount}`,
          {
            ...TEXT_STYLES.body,
            fontSize: 8,
            fontWeight: "bold",
          },
          tierX,
          4 + badgeHeight * 0.5,
          0.5,
          0.5
        )
      );
    }
  }

  const currentMitigation = getRedGodFaithMitigationRule(currentTier);
  const riskLabel =
    currentMitigation.amount > 0
      ? `redGod -${currentMitigation.label}`
      : "No chaos mitigation";
  root.addChild(
    createText(
      riskLabel,
      {
        ...TEXT_STYLES.body,
        fontSize: 8,
        fontWeight: "bold",
        fill: currentMitigation.amount > 0 ? PALETTE.active : PALETTE.passiveBorder,
      },
      rect.width - 10,
      5,
      1,
      0
    )
  );

  container.addChild(root);
  return root;
}

function drawStreakTrack(container, rect, label, activeCount, threshold, activeFill, baseFill) {
  const safeThreshold = Math.max(1, Math.floor(threshold ?? 1));
  const safeCount = Math.max(0, Math.floor(activeCount ?? 0));
  container.addChild(
    createText(
      label,
      {
        ...TEXT_STYLES.muted,
        fontSize: 9,
      },
      rect.x,
      rect.y + 1
    )
  );
  const labelWidth = 28;
  const barX = rect.x + labelWidth;
  const barWidth = rect.width - labelWidth;
  const gap = 4;
  const segmentWidth = Math.max(
    6,
    Math.floor((barWidth - gap * Math.max(0, safeThreshold - 1)) / safeThreshold)
  );
  for (let index = 0; index < safeThreshold; index += 1) {
    const segment = new PIXI.Graphics();
    roundedRect(
      segment,
      barX + index * (segmentWidth + gap),
      rect.y,
      segmentWidth,
      rect.height,
      5,
      index < safeCount ? activeFill : baseFill,
      index < safeCount ? activeFill : PALETTE.stroke,
      1
    );
    container.addChild(segment);
  }
  container.addChild(
    createText(
      `${Math.min(safeCount, safeThreshold)}/${safeThreshold}`,
      {
        ...TEXT_STYLES.body,
        fontSize: 9,
        fontWeight: "bold",
      },
      rect.x + rect.width + 2,
      rect.y + rect.height * 0.5,
      0,
      0.5
    )
  );
}

function drawCompactPipRow(container, x, y, label, activeCount, threshold, activeFill, inactiveFill) {
  const safeThreshold = Math.max(1, Math.floor(threshold ?? 1));
  const safeCount = Math.max(0, Math.floor(activeCount ?? 0));
  container.addChild(
    createText(
      label,
      {
        ...TEXT_STYLES.muted,
        fontSize: 8,
        fontWeight: "bold",
      },
      x,
      y + 1
    )
  );
  for (let index = 0; index < safeThreshold; index += 1) {
    const pip = new PIXI.Graphics();
    roundedRect(
      pip,
      x + 12 + index * 10,
      y,
      8,
      8,
      4,
      index < safeCount ? activeFill : inactiveFill,
      index < safeCount ? activeFill : PALETTE.stroke,
      1
    );
    container.addChild(pip);
  }
  container.addChild(
    createText(
      `${Math.min(safeCount, safeThreshold)}/${safeThreshold}`,
      {
        ...TEXT_STYLES.body,
        fontSize: 8,
        fontWeight: "bold",
      },
      x + 12 + safeThreshold * 10 + 2,
      y + 4,
      0,
      0.5
    )
  );
}

function drawPartialMemoryBars(container, rect, partialFeedRatios) {
  const ratios = Array.isArray(partialFeedRatios) ? partialFeedRatios : [];
  const compact = rect.width <= 40;
  if (!compact) {
    container.addChild(
      createText(
        "Partial",
        {
          ...TEXT_STYLES.muted,
          fontSize: 9,
        },
        rect.x,
        rect.y + 1
      )
    );
  }
  const labelWidth = compact ? 0 : 32;
  const barsX = rect.x + labelWidth;
  const availableWidth = Math.max(20, rect.width - labelWidth);
  const barWidth = 10;
  const gap = 5;
  const count = Math.max(1, ratios.length);
  const totalWidth = count * barWidth + Math.max(0, count - 1) * gap;
  let startX = barsX;
  if (totalWidth < availableWidth) {
    startX += Math.floor((availableWidth - totalWidth) * 0.5);
  }
  for (let index = 0; index < ratios.length; index += 1) {
    const ratio = Math.max(0, Math.min(1, Number(ratios[index] ?? 0)));
    const bar = new PIXI.Graphics();
    roundedRect(
      bar,
      startX + index * (barWidth + gap),
      rect.y + 2,
      barWidth,
      rect.height - 4,
      4,
      PALETTE.memoryBarBase,
      PALETTE.stroke,
      1
    );
    container.addChild(bar);

    const fillHeight = Math.max(2, Math.floor((rect.height - 8) * ratio));
    const fill = new PIXI.Graphics();
    roundedRect(
      fill,
      startX + index * (barWidth + gap) + 2,
      rect.y + rect.height - 4 - fillHeight,
      barWidth - 4,
      fillHeight,
      3,
      ratio >= 0.5 ? PALETTE.passiveBorder : PALETTE.red,
      ratio >= 0.5 ? PALETTE.passiveBorder : PALETTE.red,
      0
    );
    container.addChild(fill);
  }
  if (!ratios.length) {
    container.addChild(
      createText(
        "none",
        {
          ...TEXT_STYLES.body,
          fontSize: 8,
        },
        rect.x + rect.width - 2,
        rect.y + rect.height * 0.5,
        1,
        0.5
      )
    );
  }
}

function drawMoodPanel(container, rect, happiness) {
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;

  const panel = new PIXI.Graphics();
  roundedRect(panel, 0, 0, rect.width, rect.height, 14, PALETTE.moodPanel, PALETTE.stroke, 1);
  root.addChild(panel);

  root.addChild(
    createText(
      "Mood",
      {
        ...TEXT_STYLES.muted,
        fontSize: 9,
        fontWeight: "bold",
      },
      10,
      5
    )
  );

  const status = typeof happiness?.status === "string" ? happiness.status : "neutral";
  const compactMode = rect.height < 48;
  const moodX = 42;
  const moodY = 4;
  const cellWidth = compactMode ? 32 : 38;
  const cellGap = compactMode ? 3 : 4;
  for (let index = 0; index < HAPPINESS_STATE_ORDER.length; index += 1) {
    const moodId = HAPPINESS_STATE_ORDER[index];
    const selected = moodId === status;
    const cell = new PIXI.Graphics();
    roundedRect(
      cell,
      moodX + index * (cellWidth + cellGap),
      moodY,
      cellWidth,
      compactMode ? 16 : 18,
      9,
      selected ? getHappinessStateColor(moodId) : PALETTE.cardMuted,
      getHappinessStateColor(moodId),
      1
    );
    root.addChild(cell);
    root.addChild(
      createText(
        moodId === "negative" ? "Neg" : moodId === "positive" ? "Pos" : "Mid",
        {
          ...TEXT_STYLES.body,
          fontSize: 8,
          fontWeight: selected ? "bold" : "normal",
          fill: selected ? PALETTE.black : PALETTE.text,
        },
        moodX + index * (cellWidth + cellGap) + cellWidth * 0.5,
        moodY + (compactMode ? 8 : 9),
        0.5,
        0.5
      )
    );
  }

  if (compactMode) {
    drawCompactPipRow(
      root,
      10,
      24,
      "+",
      happiness?.fullFeedStreak,
      happiness?.fullFeedThreshold,
      PALETTE.passiveBorder,
      PALETTE.moodFullBase
    );
    drawCompactPipRow(
      root,
      Math.max(92, Math.floor(rect.width * 0.5) - 10),
      24,
      "-",
      happiness?.missedFeedStreak,
      happiness?.missedFeedThreshold,
      PALETTE.red,
      PALETTE.moodMissBase
    );
  } else {
    drawStreakTrack(
      root,
      { x: 10, y: 26, width: rect.width - 54, height: 8 },
      "Full",
      happiness?.fullFeedStreak,
      happiness?.fullFeedThreshold,
      PALETTE.passiveBorder,
      PALETTE.moodFullBase
    );
    drawStreakTrack(
      root,
      { x: 10, y: 40, width: rect.width - 54, height: 8 },
      "Miss",
      happiness?.missedFeedStreak,
      happiness?.missedFeedThreshold,
      PALETTE.red,
      PALETTE.moodMissBase
    );
    drawPartialMemoryBars(
      root,
      { x: rect.width - 44, y: 22, width: 34, height: 30 },
      happiness?.partialFeedRatios
    );
  }

  container.addChild(root);
  return root;
}

export function drawClassSummaryCard(
  rect,
  classId,
  population,
  faith,
  happiness,
  selected,
  onTap = null
) {
  const layout = SETTLEMENT_CLASS_SUMMARY_CARD_LAYOUT;
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    0,
    0,
    rect.width,
    rect.height,
    layout.radius,
    selected ? PALETTE.panel : PALETTE.cardMuted,
    selected ? PALETTE.active : PALETTE.stroke,
    selected ? layout.selectedStrokeWidth : layout.strokeWidth
  );
  root.x = rect.x;
  root.y = rect.y;
  root.addChild(gfx);
  root.addChild(
    createWrappedText(
      capitalizeLabel(classId),
      TEXT_STYLES.cardTitle,
      layout.title.x,
      layout.title.y,
      layout.title.maxWidth
    )
  );
  root.addChild(
    createWrappedText(
      `Total ${Math.floor(population?.total ?? 0)}   Reserved ${Math.floor(population?.reserved ?? 0)}`,
      {
        ...TEXT_STYLES.muted,
        fontSize: 9,
      },
      rect.width - layout.population.rightInset,
      layout.population.y,
      layout.population.maxWidth,
      1,
      0
    )
  );

  const statsY = layout.stats.y;
  const statGap = layout.stats.gap;
  const statWidth = Math.floor(
    (rect.width - layout.stats.xInset * 2 - statGap * (layout.stats.count - 1)) /
      layout.stats.count
  );
  drawClassStatPill(
    root,
    layout.stats.xInset,
    statsY,
    statWidth,
    "Adults",
    Math.floor(population?.adults ?? 0),
    PALETTE.classAdultsFill
  );
  drawClassStatPill(
    root,
    layout.stats.xInset + statWidth + statGap,
    statsY,
    statWidth,
    "Youth",
    Math.floor(population?.youth ?? 0),
    PALETTE.classYouthFill
  );
  drawClassStatPill(
    root,
    layout.stats.xInset + (statWidth + statGap) * 2,
    statsY,
    statWidth,
    "Free",
    Math.floor(population?.free ?? 0),
    PALETTE.classFreeFill
  );

  drawFaithTrack(
    root,
    {
      x: layout.faith.xInset,
      y: layout.faith.y,
      width: rect.width - layout.faith.widthInset,
      height: layout.faith.height,
    },
    faith
  );
  drawMoodPanel(
    root,
    {
      x: layout.mood.xInset,
      y: layout.mood.y,
      width: rect.width - layout.mood.widthInset,
      height: Math.max(layout.mood.minHeight, rect.height - layout.mood.heightInset),
    },
    happiness
  );
  if (typeof onTap === "function") {
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    root.on("pointertap", () => onTap());
  }
  return root;
}
