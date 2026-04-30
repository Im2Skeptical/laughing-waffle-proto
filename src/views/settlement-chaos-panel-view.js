import { GAMEPIECE_HOVER_SCALE } from "./layout-pixi.js";
import { capitalizeLabel, capitalizeTier } from "./settlement-formatters.js";
import { SETTLEMENT_CHAOS_PANEL_LAYOUT } from "./settlement-layout.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import {
  createText,
  createWrappedText,
  roundedRect,
} from "./settlement-view-primitives.js";

function drawSubPanel(container, rect, fill = PALETTE.cardMuted, outline = PALETTE.stroke) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 18, fill, outline, 2);
  container.addChild(gfx);
  return gfx;
}

function formatSignedInt(value) {
  const amount = Number.isFinite(value) ? Math.floor(value) : 0;
  return amount > 0 ? `+${amount}` : `${amount}`;
}

function drawRedGodSigil(container, x, y, summary) {
  const root = new PIXI.Container();
  root.x = x;
  root.y = y;

  const radius = 32;
  const cadenceSec = Math.max(1, Math.floor(summary?.cadenceSec ?? 1));
  const countdownSec = Math.max(0, Math.floor(summary?.spawnCountdownSec ?? 0));
  const elapsedRatio = Math.max(0, Math.min(1, 1 - countdownSec / cadenceSec));
  const endAngle = -Math.PI / 2 + Math.PI * 2 * elapsedRatio;

  const outer = new PIXI.Graphics();
  outer.lineStyle(4, PALETTE.black, 0.95);
  outer.beginFill(PALETTE.black, 0.22);
  outer.drawCircle(0, 0, radius + 8);
  outer.endFill();
  root.addChild(outer);

  const ringBg = new PIXI.Graphics();
  ringBg.lineStyle(6, PALETTE.stroke, 0.65);
  ringBg.arc(0, 0, radius + 2, -Math.PI / 2, Math.PI * 1.5);
  root.addChild(ringBg);

  const ring = new PIXI.Graphics();
  ring.lineStyle(6, PALETTE.red, 0.95);
  ring.arc(0, 0, radius + 2, -Math.PI / 2, endAngle);
  root.addChild(ring);

  const core = new PIXI.Graphics();
  core.beginFill(PALETTE.red, 0.28);
  core.drawCircle(0, 0, radius - 8);
  core.endFill();
  root.addChild(core);

  const emblem = new PIXI.Graphics();
  emblem.lineStyle(2, PALETTE.accent, 0.95);
  emblem.beginFill(PALETTE.red, 0.9);
  emblem.drawPolygon([
    -10, -18,
    2, -2,
    -6, -2,
    10, 18,
    -2, 4,
    6, 4,
  ]);
  emblem.endFill();
  emblem.beginFill(PALETTE.black, 0.85);
  emblem.drawPolygon([
    -20, -6,
    -8, -16,
    -10, -2,
  ]);
  emblem.drawPolygon([
    20, 6,
    8, 16,
    10, 2,
  ]);
  emblem.endFill();
  root.addChild(emblem);

  container.addChild(root);
}

function drawChaosPoolSigil(container, x, y) {
  const root = new PIXI.Container();
  root.x = x;
  root.y = y;

  const radius = 24;
  const ringWidth = 7;
  const segments = [
    { start: -Math.PI / 2, end: 0, color: PALETTE.red },
    { start: 0, end: Math.PI / 2, color: PALETTE.green },
    { start: Math.PI / 2, end: Math.PI, color: PALETTE.blue },
    { start: Math.PI, end: Math.PI * 1.5, color: PALETTE.black },
  ];

  const outer = new PIXI.Graphics();
  outer.lineStyle(2, PALETTE.stroke, 0.9);
  outer.beginFill(PALETTE.chaosPoolOuter, 0.95);
  outer.drawCircle(0, 0, radius + 7);
  outer.endFill();
  root.addChild(outer);

  for (const segment of segments) {
    const arc = new PIXI.Graphics();
    arc.lineStyle(ringWidth, segment.color, 0.95);
    arc.arc(0, 0, radius, segment.start, segment.end);
    root.addChild(arc);
  }

  const core = new PIXI.Graphics();
  core.beginFill(PALETTE.chaosPoolCore, 1);
  core.drawCircle(0, 0, radius - 8);
  core.endFill();
  root.addChild(core);

  const spark = new PIXI.Graphics();
  spark.lineStyle(2, PALETTE.accent, 0.95);
  spark.drawPolygon([
    -5, -9,
    1, -1,
    -3, -1,
    5, 9,
    -1, 2,
    3, 2,
  ]);
  root.addChild(spark);

  container.addChild(root);
  return root;
}

function getChaosIncomeTooltipSpec(incomeSummary) {
  const summary = incomeSummary && typeof incomeSummary === "object" ? incomeSummary : null;
  const mitigationLines = [];
  for (const entry of Array.isArray(summary?.byClass) ? summary.byClass : []) {
    const classLabel = capitalizeLabel(entry?.classId);
    const tierLabel = capitalizeTier(entry?.faithTier);
    const population = Math.max(0, Math.floor(entry?.population ?? 0));
    const mitigationLabel =
      typeof entry?.mitigationLabel === "string" && entry.mitigationLabel.length > 0
        ? entry.mitigationLabel
        : `${Math.max(0, Math.floor(entry?.mitigationPerPop ?? 0))} / pop`;
    const mitigation = Math.max(0, Math.floor(entry?.mitigation ?? 0));
    if (mitigation > 0) {
      mitigationLines.push(
        `${classLabel}: ${tierLabel} faith, ${population} pop at ${mitigationLabel} = -${mitigation}`
      );
    } else {
      mitigationLines.push(`${classLabel}: ${tierLabel} faith, ${population} pop -> -0`);
    }
  }
  if (!mitigationLines.length) {
    mitigationLines.push("No population faith mitigation.");
  }
  const growthRatePercent = Math.round(Math.max(0, Number(summary?.growthRate ?? 0)) * 100);
  return {
    title: "Chaos Income",
    lines: [
      `Current income: ${formatSignedInt(summary?.totalIncome ?? 0)} per second`,
      `Base pressure: +${Math.max(0, Math.floor(summary?.baseIncome ?? 0))}`,
      `Growth: ${growthRatePercent}% every ${Math.max(1, Math.floor(summary?.growthYears ?? 1))} years (${Math.max(0, Math.floor(summary?.growthSteps ?? 0))} steps)`,
      `Faith mitigation: -${Math.max(0, Math.floor(summary?.totalMitigation ?? 0))}`,
      ...mitigationLines,
    ],
    maxWidth: 340,
  };
}

function drawChaosStatPill(container, rect, label, valueText, accentColor, opts = {}) {
  const options = opts && typeof opts === "object" ? opts : {};
  const compactMode = rect.height < 34;
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;

  const bg = new PIXI.Graphics();
  roundedRect(bg, 0, 0, rect.width, rect.height, 14, PALETTE.chaosCardFill, PALETTE.stroke, 2);
  root.addChild(bg);

  const accent = new PIXI.Graphics();
  roundedRect(accent, 8, 8, 8, rect.height - 16, 4, accentColor, accentColor, 0);
  root.addChild(accent);

  root.addChild(
    createText(
      label,
      {
        ...TEXT_STYLES.muted,
        fontSize: compactMode ? 8 : 9,
        fontWeight: "bold",
      },
      24,
      compactMode ? 4 : 8
    )
  );
  root.addChild(
    createText(
      valueText,
      {
        ...TEXT_STYLES.body,
        fontSize: compactMode ? 13 : 18,
        fontWeight: "bold",
      },
      rect.width - 12,
      compactMode ? rect.height - 5 : rect.height - 11,
      1,
      1
    )
  );

  if (
    compactMode !== true &&
    Array.isArray(options.segmentValues) &&
    options.segmentValues.length > 0
  ) {
    const total = options.segmentValues.reduce(
      (sum, segment) => sum + Math.max(0, Math.floor(segment?.value ?? 0)),
      0
    );
    const stripX = 24;
    const stripY = rect.height - 11;
    const stripWidth = rect.width - 36;
    const stripBg = new PIXI.Graphics();
    roundedRect(stripBg, stripX, stripY, stripWidth, 5, 2, PALETTE.chaosStatMeterTrack, PALETTE.stroke, 1);
    root.addChild(stripBg);
    if (total > 0) {
      let cursorX = stripX + 1;
      const innerWidth = stripWidth - 2;
      options.segmentValues.forEach((segment, index) => {
        const safeValue = Math.max(0, Math.floor(segment?.value ?? 0));
        if (safeValue <= 0) return;
        const remainingValues = options.segmentValues
          .slice(index + 1)
          .reduce((sum, item) => sum + Math.max(0, Math.floor(item?.value ?? 0)), 0);
        const remainingWidth = stripX + 1 + innerWidth - cursorX;
        const width =
          index === options.segmentValues.length - 1 || remainingValues <= 0
            ? remainingWidth
            : Math.max(2, Math.round((safeValue / total) * innerWidth));
        const segmentGfx = new PIXI.Graphics();
        roundedRect(
          segmentGfx,
          cursorX,
          stripY + 1,
          Math.min(width, remainingWidth),
          3,
          1,
          Number.isFinite(segment?.color) ? segment.color : accentColor,
          Number.isFinite(segment?.color) ? segment.color : accentColor,
          0
        );
        root.addChild(segmentGfx);
        cursorX += Math.min(width, remainingWidth);
      });
    }
  }

  if (options.tooltipView && options.tooltipSpec) {
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    root.on("pointerenter", () => {
      const anchor =
        options.tooltipView.getAnchorRectForDisplayObject?.(root, "parent") ?? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          coordinateSpace: "parent",
        };
      options.tooltipView.show?.(
        {
          ...options.tooltipSpec,
          scale: Math.max(
            Number.isFinite(GAMEPIECE_HOVER_SCALE) ? GAMEPIECE_HOVER_SCALE : 1,
            options.tooltipView.getRelativeDisplayScale?.(root, 1) ?? 1
          ),
        },
        anchor
      );
    });
    root.on("pointerleave", () => {
      options.tooltipView.hide?.();
    });
  }

  container.addChild(root);
  return root;
}

export function drawRedGodPanel(container, rect, summary, incomeSummary, tooltipView) {
  const layout = SETTLEMENT_CHAOS_PANEL_LAYOUT;
  drawSubPanel(container, rect, PALETTE.panel, PALETTE.stroke);
  container.addChild(
    createText(
      "Chaos",
      TEXT_STYLES.title,
      rect.x + rect.width * 0.5,
      rect.y + layout.titleY,
      0.5,
      0
    )
  );

  const sharedRect = {
    x: rect.x + layout.shared.xInset,
    y: rect.y + layout.shared.yOffset,
    width: rect.width - layout.shared.widthInset,
    height: layout.shared.height,
  };
  const godRect = {
    x: rect.x + layout.god.xInset,
    y: rect.y + layout.god.yOffset,
    width: rect.width - layout.god.widthInset,
    height: rect.height - layout.god.heightInset,
  };

  drawSubPanel(container, sharedRect, PALETTE.chaosSharedPanel, PALETTE.stroke);
  drawChaosPoolSigil(
    container,
    sharedRect.x + layout.shared.sigilXOffset,
    sharedRect.y + Math.floor(sharedRect.height * 0.5)
  );
  container.addChild(
    createText(
      "Shared Pool",
      {
        ...TEXT_STYLES.muted,
        fontSize: 10,
        fontWeight: "bold",
      },
      sharedRect.x + layout.shared.labelXOffset,
      sharedRect.y + layout.shared.labelYOffset
    )
  );

  drawChaosStatPill(
    container,
    {
      x: sharedRect.x + layout.shared.power.xOffset,
      y: sharedRect.y + layout.shared.power.yOffset,
      width: layout.shared.power.width,
      height: layout.shared.power.height,
    },
    "Chaos Power",
    `${Math.floor(summary?.chaosPower ?? 0)}`,
    PALETTE.red
  );
  drawChaosStatPill(
    container,
    {
      x: sharedRect.x + layout.shared.income.xOffset,
      y: sharedRect.y + layout.shared.income.yOffset,
      width: layout.shared.income.width,
      height: layout.shared.income.height,
    },
    "Chaos Income",
    `${formatSignedInt(incomeSummary?.totalIncome ?? summary?.chaosIncome ?? 0)}/s`,
    PALETTE.accent,
    {
      segmentValues: [
        {
          value: Math.max(0, Math.floor(incomeSummary?.baseIncome ?? 0)),
          color: PALETTE.red,
        },
        {
          value: Math.max(0, Math.floor(incomeSummary?.totalMitigation ?? 0)),
          color: PALETTE.active,
        },
      ],
      tooltipView,
      tooltipSpec: getChaosIncomeTooltipSpec(incomeSummary),
    }
  );

  drawSubPanel(container, godRect, PALETTE.chaosGodPanel, PALETTE.stroke);
  drawRedGodSigil(
    container,
    godRect.x + layout.god.sigilXOffset,
    godRect.y + Math.floor(godRect.height * 0.5),
    summary
  );
  container.addChild(
    createText(
      "RedGod",
      {
        ...TEXT_STYLES.cardTitle,
        fontSize: 16,
      },
      godRect.x + layout.god.textXOffset,
      godRect.y + layout.god.titleYOffset
    )
  );
  container.addChild(
    createWrappedText(
      "First active chaos god",
      {
        ...TEXT_STYLES.muted,
        fontSize: 9,
      },
      godRect.x + layout.god.textXOffset,
      godRect.y + layout.god.subtitleYOffset,
      layout.god.statXOffset - layout.god.textXOffset - 8
    )
  );
  drawChaosStatPill(
    container,
    {
      x: godRect.x + layout.god.statXOffset,
      y: godRect.y + layout.god.nextSpawnYOffset,
      width: layout.god.statWidth,
      height: layout.god.statHeight,
    },
    "Next Spawn",
    `+${Math.floor(summary?.nextSpawnCount ?? 0)} in ${Math.floor(summary?.spawnCountdownSec ?? 0)}s`,
    PALETTE.chaosSpawnAccent
  );
  drawChaosStatPill(
    container,
    {
      x: godRect.x + layout.god.statXOffset,
      y: godRect.y + layout.god.monstersYOffset,
      width: layout.god.statWidth,
      height: layout.god.statHeight,
    },
    "Monsters",
    `${Math.floor(summary?.monsterCount ?? 0)} / ${Math.floor(summary?.monsterWinCount ?? 100)}`,
    PALETTE.red
  );
}
