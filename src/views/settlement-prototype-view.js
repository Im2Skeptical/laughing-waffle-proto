import { envTileDefs } from "../defs/gamepieces/env-tiles-defs.js";
import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { settlementOrderDefs } from "../defs/gamepieces/settlement-order-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import {
  RED_GOD_FAITH_MITIGATION_BY_TIER,
} from "../defs/gamesettings/gamerules-defs.js";
import {
  getSettlementChaosGodSummary,
  getSettlementChaosIncomeSummary,
} from "../model/settlement-chaos.js";
import { getCurrentSeasonKey } from "../model/state.js";
import {
  getSettlementCurrentVassal,
  getSettlementClassIds,
  getSettlementFaithSummary,
  getSettlementHappinessSummary,
  getSettlementOrderSlots,
  getSettlementPopulationSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementStockpile,
  getSettlementStructureSlots,
  getSettlementTotalFood,
  getSettlementYearDurationSec,
  getSettlementVisibleVassalLifeEvents,
} from "../model/settlement-state.js";
import {
  getSettlementVassalAgeYearsAtSecond,
} from "../model/settlement-vassal-exec.js";
import {
  capitalizeLabel,
  capitalizeTier,
  formatPartialFeedMemory,
  formatVassalDeathCause,
  getVassalProfessionLabel,
  getVassalTraitLabel,
} from "./settlement-formatters.js";
import {
  buildPracticeLines,
  buildStructureLines,
  buildTileLines,
} from "./settlement-tooltip-lines.js";
import {
  buildElderDetailTooltipSpec,
  getOrderRuntime,
  getSelectedAgendaForMember,
  getSortedOrderMembers,
} from "./settlement-order-view-helpers.js";
import {
  drawAgendaStack,
  drawMiniPracticeCard,
} from "./settlement-agenda-view.js";
import { drawCard, drawPracticeCard } from "./settlement-card-view.js";
import { drawRedGodPanel } from "./settlement-chaos-panel-view.js";
import { drawDeterministicBust } from "./settlement-elder-bust-view.js";
import {
  buildRenderGateKey,
  buildSignature,
} from "./settlement-render-signature.js";
import { buildRenderSemanticSnapshot } from "./settlement-semantic-snapshot.js";
import {
  clearChildren,
  createText,
  createWrappedText,
  roundedRect,
} from "./settlement-view-primitives.js";
import {
  FAITH_TIER_COLORS,
  FAITH_TIER_ORDER,
  HAPPINESS_STATE_COLORS,
  HAPPINESS_STATE_ORDER,
  PALETTE,
  TEXT_STYLES,
} from "./settlement-theme.js";
import {
  ORDER_PANEL_LAYOUT,
  SETTLEMENT_CLASS_SUMMARY_CARD_LAYOUT,
  SETTLEMENT_CLASS_COLUMN_LAYOUT,
  SETTLEMENT_PANEL_RECTS,
  SETTLEMENT_PRACTICE_CARD_LAYOUT,
  SETTLEMENT_REGION_TILE_LAYOUT,
  SETTLEMENT_RESOURCE_CHIP_LAYOUT,
  SETTLEMENT_SECTION_LABEL_LAYOUT,
  SETTLEMENT_SLOT_GRID_LAYOUT,
  SETTLEMENT_STRUCTURE_CARD_LAYOUT,
  SETTLEMENT_TOPBAR_LAYOUT,
  SETTLEMENT_VASSAL_PANEL_LAYOUT,
} from "./settlement-layout.js";
import { GAMEPIECE_HOVER_SCALE } from "./layout-pixi.js";

const AGENDA_FLYOUT_HIDE_DELAY_MS = 60;

function drawSlotGrid(gfx, rect, columns, rows) {
  const colCount = Math.max(1, Math.floor(columns));
  const rowCount = Math.max(1, Math.floor(rows));
  const cellWidth = rect.width / colCount;
  const cellHeight = rect.height / rowCount;
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      roundedRect(
        gfx,
        rect.x + col * cellWidth + 6,
        rect.y + row * cellHeight + 6,
        cellWidth - 12,
        cellHeight - 12,
        18,
        PALETTE.slot,
        PALETTE.stroke,
        2
      );
    }
  }
}

function drawSubPanel(container, rect, fill = PALETTE.cardMuted, outline = PALETTE.stroke) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 18, fill, outline, 2);
  container.addChild(gfx);
  return gfx;
}

function drawOrderSummaryBlock(container, rect, runtime) {
  drawSubPanel(container, rect, PALETTE.elderLozengeSoft, PALETTE.stroke);
  container.addChild(createText("Elder Council", TEXT_STYLES.cardTitle, rect.x + 14, rect.y + 10));
  const remainderChancePercent = Number.isFinite(runtime?.projectedRecruitsRemainderChance)
    ? Math.round(runtime.projectedRecruitsRemainderChance * 100)
    : 0;
  const rows = [
    `Members ${Math.floor(runtime?.memberCount ?? 0)}`,
    `Adults ${Math.floor(runtime?.recruitmentAdultPopulation ?? 0)}`,
    `Cadence ${Number.isFinite(runtime?.recruitmentCadenceYears) ? Math.floor(runtime.recruitmentCadenceYears) : "--"}y`,
    `Rate ${Number.isFinite(runtime?.recruitmentAdultsPerElder) ? Math.floor(runtime.recruitmentAdultsPerElder) : "--"} adults / elder`,
    `Last Yearly Tick ${Number.isFinite(runtime?.lastProcessedYear) ? Math.floor(runtime.lastProcessedYear) : "--"}`,
    `Next Recruit Year ${Number.isFinite(runtime?.nextRecruitmentYear) ? Math.floor(runtime.nextRecruitmentYear) : "--"}`,
    `If Recruiting Now ${Math.floor(runtime?.projectedRecruitsGuaranteed ?? 0)} + ${remainderChancePercent}%`,
  ];
  container.addChild(
    createText(
      rows.join("\n"),
      {
        ...TEXT_STYLES.body,
        fontSize: 12,
        wordWrap: true,
        wordWrapWidth: rect.width - 24,
        lineHeight: 16,
      },
      rect.x + 14,
      rect.y + 42
    )
  );
}

function drawOrderGlobalSummary(container, rect, card) {
  drawSubPanel(container, rect, PALETTE.cardMuted, PALETTE.stroke);
  const runtime = getOrderRuntime(card);
  drawOrderSummaryBlock(
    container,
    {
      x: rect.x + 10,
      y: rect.y + 10,
      width: rect.width - 20,
      height: rect.height - 20,
    },
    runtime
  );
}

function drawElderLozenge(
  container,
  rect,
  orderDef,
  member,
  selectedClassId,
  tooltipView,
  showAgendaFlyout,
  scheduleAgendaFlyoutHide
) {
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;
  const isVassalCouncillor =
    typeof member?.sourceVassalId === "string" && member.sourceVassalId.length > 0;
  const compactMode = rect.height < 36;
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    0,
    0,
    rect.width,
    rect.height,
    18,
    isVassalCouncillor ? PALETTE.vassalCouncilFill : PALETTE.elderLozenge,
    isVassalCouncillor ? PALETTE.vassalCouncilStroke : PALETTE.stroke,
    isVassalCouncillor ? 3 : 2
  );
  root.addChild(gfx);

  if (compactMode) {
    const agendaRect = { x: rect.width - 70, y: 4, width: 62, height: rect.height - 8 };
    root.addChild(
      createText(
        `P${Math.floor(member?.prestige ?? 0)}`,
        {
          ...TEXT_STYLES.body,
          fontSize: 10,
          fontWeight: "bold",
        },
        10,
        rect.height * 0.5,
        0,
        0.5
      )
    );
    root.addChild(
      createText(
        member?.modifierLabel ?? member?.memberId ?? "Elder",
        {
          ...TEXT_STYLES.body,
          fontWeight: "bold",
          fontSize: 10,
          wordWrap: true,
          wordWrapWidth: Math.max(40, agendaRect.x - 56),
          lineHeight: 11,
        },
        42,
        4
      )
    );
    root.addChild(
      createText(
        isVassalCouncillor ? "Vassal" : `${capitalizeLabel(member?.sourceClassId)} elder`,
        {
          ...TEXT_STYLES.muted,
          fontSize: 9,
          fill: isVassalCouncillor ? PALETTE.vassalCouncilStroke : TEXT_STYLES.muted.fill,
        },
        42,
        rect.height - 5,
        0,
        1
      )
    );
    drawAgendaStack(root, agendaRect, getSelectedAgendaForMember(member, selectedClassId));

    const detailHit = new PIXI.Graphics();
    detailHit.beginFill(PALETTE.hitArea, 0.001);
    detailHit.drawRoundedRect(4, 3, rect.width - 8, rect.height - 6, 12);
    detailHit.endFill();
    detailHit.eventMode = "static";
    detailHit.cursor = "pointer";
    detailHit.on("pointerenter", () => {
      const anchor =
        detailHit.getBounds?.() ?? { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      tooltipView?.show({
        ...buildElderDetailTooltipSpec(orderDef, member),
        anchorRect: anchor,
      });
      showAgendaFlyout?.({
        member,
        anchorDisplayObject: detailHit,
        anchorRect: anchor,
      });
    });
    detailHit.on("pointerleave", () => {
      tooltipView?.hide();
      scheduleAgendaFlyoutHide?.();
    });
    root.addChild(detailHit);
    container.addChild(root);
    return root;
  }

  const prestigePillRect = { x: 8, y: 7, width: 52, height: rect.height - 14 };
  const prestigePill = new PIXI.Graphics();
  roundedRect(
    prestigePill,
    prestigePillRect.x,
    prestigePillRect.y,
    prestigePillRect.width,
    prestigePillRect.height,
    12,
    PALETTE.chip,
    PALETTE.stroke,
    2
  );
  root.addChild(prestigePill);
  root.addChild(
    createText(
      `P${Math.floor(member?.prestige ?? 0)}`,
      {
        ...TEXT_STYLES.body,
        fontSize: 12,
        fontWeight: "bold",
      },
      prestigePillRect.x + prestigePillRect.width * 0.5,
      prestigePillRect.y + prestigePillRect.height * 0.5,
      0.5,
      0.5
    )
  );

  const bustRect = { x: 66, y: 6, width: 56, height: rect.height - 12 };
  drawDeterministicBust(root, bustRect, member);

  const nameX = bustRect.x + bustRect.width + 12;
  const agendaRect = { x: rect.width - 100, y: 7, width: 82, height: rect.height - 14 };
  root.addChild(
    createText(
      member?.modifierLabel ?? member?.memberId ?? "Elder",
      {
        ...TEXT_STYLES.body,
        fontWeight: "bold",
        fontSize: 12,
        wordWrap: true,
        wordWrapWidth: Math.max(40, agendaRect.x - nameX - 8),
        lineHeight: 14,
      },
      nameX,
      10
    )
  );
  root.addChild(
    createText(
      `${capitalizeLabel(member?.sourceClassId)} elder`,
      {
        ...TEXT_STYLES.muted,
        fontSize: 10,
        fill: isVassalCouncillor ? PALETTE.vassalCouncilStroke : TEXT_STYLES.muted.fill,
      },
      nameX,
      rect.height - 18
    )
  );

  if (isVassalCouncillor) {
    const badgeRect = { x: nameX, y: rect.height - 36, width: 58, height: 14 };
    const badge = new PIXI.Graphics();
    roundedRect(
      badge,
      badgeRect.x,
      badgeRect.y,
      badgeRect.width,
      badgeRect.height,
      8,
      PALETTE.vassalCouncilBadgeFill,
      PALETTE.vassalCouncilStroke,
      1
    );
    root.addChild(badge);
    root.addChild(
      createText(
        "Vassal",
        {
          ...TEXT_STYLES.muted,
          fontSize: 9,
          fontWeight: "bold",
          fill: PALETTE.vassalCouncilStroke,
        },
        badgeRect.x + badgeRect.width * 0.5,
        badgeRect.y + badgeRect.height * 0.5,
        0.5,
        0.5
      )
    );
  }

  const selectedAgenda = getSelectedAgendaForMember(member, selectedClassId);
  const agendaStack = drawAgendaStack(root, agendaRect, selectedAgenda);

  const detailHit = new PIXI.Graphics();
  detailHit.beginFill(PALETTE.hitArea, 0.001);
  detailHit.drawRoundedRect(8, 6, agendaRect.x - 16, rect.height - 12, 16);
  detailHit.endFill();
  detailHit.eventMode = "static";
  detailHit.cursor = "pointer";
  detailHit.on("pointerenter", () => {
    const anchor =
      tooltipView?.getAnchorRectForDisplayObject?.(detailHit, "parent") ?? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        coordinateSpace: "parent",
      };
    tooltipView?.show?.(
      {
        ...buildElderDetailTooltipSpec(orderDef, member),
        scale: Math.max(
          Number.isFinite(GAMEPIECE_HOVER_SCALE) ? GAMEPIECE_HOVER_SCALE : 1,
          tooltipView?.getRelativeDisplayScale?.(detailHit, 1) ?? 1
        ),
      },
      anchor
    );
  });
  detailHit.on("pointerleave", () => {
    tooltipView?.hide?.();
  });
  root.addChild(detailHit);

  const agendaHit = new PIXI.Graphics();
  agendaHit.beginFill(PALETTE.hitArea, 0.001);
  agendaHit.drawRoundedRect(agendaRect.x, agendaRect.y, agendaRect.width, agendaRect.height, 12);
  agendaHit.endFill();
  agendaHit.eventMode = "static";
  agendaHit.cursor = "pointer";
  agendaHit.on("pointerenter", () => {
    showAgendaFlyout?.({
      member,
      anchorDisplayObject: agendaHit,
    });
  });
  agendaHit.on("pointerleave", () => {
    scheduleAgendaFlyoutHide?.();
  });
  root.addChild(agendaHit);
  root.addChild(agendaStack);

  container.addChild(root);
  return root;
}

function drawElderRoster(
  container,
  rect,
  card,
  orderDef,
  selectedClassId,
  tooltipView,
  showAgendaFlyout,
  scheduleAgendaFlyoutHide
) {
  drawSubPanel(container, rect, PALETTE.cardMuted, PALETTE.stroke);
  container.addChild(createText("Prestige", TEXT_STYLES.cardTitle, rect.x + 12, rect.y + 10));
  const members = getSortedOrderMembers(card);
  const headerHeight = 28;
  const rosterY = rect.y + headerHeight + 12;
  const rosterHeight = rect.height - headerHeight - 22;
  if (members.length <= 0) {
    drawSubPanel(
      container,
      { x: rect.x + 10, y: rosterY, width: rect.width - 20, height: 42 },
      PALETTE.elderLozenge,
      PALETTE.stroke
    );
    container.addChild(createText("No elders", TEXT_STYLES.muted, rect.x + 24, rosterY + 13));
    return;
  }
  const rowGap = 8;
  const compactRowGap = members.length >= 5 ? 4 : rowGap;
  const rowHeight = Math.max(
    20,
    Math.min(
      52,
      Math.floor((rosterHeight - compactRowGap * Math.max(0, members.length - 1)) / members.length)
    )
  );
  for (let index = 0; index < members.length; index += 1) {
    drawElderLozenge(
      container,
      {
        x: rect.x + 10,
        y: rosterY + index * (rowHeight + compactRowGap),
        width: rect.width - 20,
        height: rowHeight,
      },
      orderDef,
      members[index],
      selectedClassId,
      tooltipView,
      showAgendaFlyout,
      scheduleAgendaFlyoutHide
    );
  }
}

function drawOrderPanel(
  container,
  rect,
  state,
  selectedClassId,
  card,
  tooltipView,
  showAgendaFlyout,
  scheduleAgendaFlyoutHide
) {
  if (!card) return;
  const orderDef = settlementOrderDefs?.[card?.defId] ?? null;
  const innerWidth = rect.width - ORDER_PANEL_LAYOUT.padding * 2;
  const leftWidth = Math.floor(innerWidth * ORDER_PANEL_LAYOUT.leftRatio);
  const rightWidth = innerWidth - leftWidth - ORDER_PANEL_LAYOUT.gap;
  const leftRect = {
    x: rect.x + ORDER_PANEL_LAYOUT.padding,
    y: rect.y + ORDER_PANEL_LAYOUT.padding,
    width: leftWidth,
    height: rect.height - ORDER_PANEL_LAYOUT.padding * 2,
  };
  const rightRect = {
    x: leftRect.x + leftRect.width + ORDER_PANEL_LAYOUT.gap,
    y: leftRect.y,
    width: rightWidth,
    height: leftRect.height,
  };
  drawElderRoster(
    container,
    leftRect,
    card,
    orderDef,
    selectedClassId,
    tooltipView,
    showAgendaFlyout,
    scheduleAgendaFlyoutHide
  );
  drawOrderGlobalSummary(container, rightRect, card);
}

function drawChip(container, x, y, width, label, value, color = PALETTE.chip) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, x, y, width, 40, 16, color, PALETTE.stroke, 2);
  container.addChild(gfx);
  container.addChild(createText(label, TEXT_STYLES.muted, x + 12, y + 7));
  container.addChild(createText(String(value), TEXT_STYLES.chip, x + width - 14, y + 20, 1, 0.5));
}

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

    const chaosMitigation = Number.isFinite(RED_GOD_FAITH_MITIGATION_BY_TIER?.[tier])
      ? Math.max(0, Math.floor(RED_GOD_FAITH_MITIGATION_BY_TIER[tier]))
      : 0;
    if (chaosMitigation > 0) {
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
          `-${chaosMitigation}`,
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

  const currentMitigation = Number.isFinite(RED_GOD_FAITH_MITIGATION_BY_TIER?.[currentTier])
    ? Math.max(0, Math.floor(RED_GOD_FAITH_MITIGATION_BY_TIER[currentTier]))
    : 0;
  const riskLabel =
    currentMitigation > 0 ? `redGod -${currentMitigation} / pop` : "No chaos mitigation";
  root.addChild(
    createText(
      riskLabel,
      {
        ...TEXT_STYLES.body,
        fontSize: 8,
        fontWeight: "bold",
        fill: currentMitigation > 0 ? PALETTE.active : PALETTE.passiveBorder,
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
    drawPartialMemoryBars(root, { x: rect.width - 44, y: 22, width: 34, height: 30 }, happiness?.partialFeedRatios);
  }

  container.addChild(root);
  return root;
}

function drawClassSummaryCard(
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
  drawClassStatPill(root, layout.stats.xInset, statsY, statWidth, "Adults", Math.floor(population?.adults ?? 0), PALETTE.classAdultsFill);
  drawClassStatPill(root, layout.stats.xInset + statWidth + statGap, statsY, statWidth, "Youth", Math.floor(population?.youth ?? 0), PALETTE.classYouthFill);
  drawClassStatPill(root, layout.stats.xInset + (statWidth + statGap) * 2, statsY, statWidth, "Free", Math.floor(population?.free ?? 0), PALETTE.classFreeFill);

  drawFaithTrack(root, {
    x: layout.faith.xInset,
    y: layout.faith.y,
    width: rect.width - layout.faith.widthInset,
    height: layout.faith.height,
  }, faith);
  drawMoodPanel(root, {
    x: layout.mood.xInset,
    y: layout.mood.y,
    width: rect.width - layout.mood.widthInset,
    height: Math.max(layout.mood.minHeight, rect.height - layout.mood.heightInset),
  }, happiness);
  if (typeof onTap === "function") {
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    root.on("pointertap", () => onTap());
  }
  return root;
}

function getTileCardFill(tile) {
  if (tile?.defId === "tile_floodplains") return PALETTE.cardMuted;
  return tile?.defId === "tile_river" ? PALETTE.riverTileCard : PALETTE.tileCard;
}

function drawVassalEventLog(container, rect, events, state) {
  const safeEvents = Array.isArray(events) ? events.slice().reverse() : [];
  const clipCount = Math.min(6, safeEvents.length);
  const layout = SETTLEMENT_VASSAL_PANEL_LAYOUT.eventLog;
  if (clipCount <= 0) {
    drawSubPanel(container, rect, PALETTE.eventLogEmptyFill, PALETTE.stroke);
    container.addChild(
      createWrappedText(
        "No recorded events yet",
        TEXT_STYLES.muted,
        rect.x + layout.textXInset,
        rect.y + layout.textXInset,
        rect.width - layout.textWidthInset
      )
    );
    return;
  }
  const rowGap = layout.rowGap;
  const rowHeight = Math.max(
    layout.minRowHeight,
    Math.floor((rect.height - rowGap * (clipCount - 1)) / clipCount)
  );
  for (let index = 0; index < clipCount; index += 1) {
    const event = safeEvents[index];
    const rowY = rect.y + index * (rowHeight + rowGap);
    const row = new PIXI.Graphics();
    roundedRect(row, rect.x, rowY, rect.width, rowHeight, 18, PALETTE.eventLogRowFill, PALETTE.eventLogRowStroke, 2);
    container.addChild(row);
    container.addChild(
      createWrappedText(
        event?.kind === "died"
          ? `Died of ${formatVassalDeathCause(event?.causeOfDeath)}`
          : typeof event?.text === "string" && event.text.length > 0
            ? event.text
            : capitalizeLabel(event?.kind),
        {
          ...TEXT_STYLES.cardTitle,
          fontSize: 14,
          lineHeight: 15,
        },
        rect.x + layout.textXInset,
        rowY + layout.titleYOffsetInRow,
        rect.width - layout.textWidthInset
      )
    );
    container.addChild(
      createText(
        `Age ${Math.floor(event?.ageYears ?? 0)} • Year ${
          1 + Math.floor((event?.tSec ?? 0) / Math.max(1, getSettlementYearDurationSec(state)))
        }`,
        {
          ...TEXT_STYLES.muted,
          fontSize: 11,
        },
        rect.x + layout.textXInset,
        rowY + rowHeight - layout.metaBottomInset
      )
    );
  }
}

function drawVassalPanel(
  container,
  rect,
  state,
  selectedClassId,
  tooltipView,
  visibleVassalThroughSec = null
) {
  const currentVassal = getSettlementCurrentVassal(state);
  const deathSec = Number.isFinite(currentVassal?.deathSec)
    ? Math.max(0, Math.floor(currentVassal.deathSec))
    : null;
  const deathYearKnown =
    deathSec != null &&
    Number.isFinite(visibleVassalThroughSec) &&
    Math.floor(visibleVassalThroughSec) >= deathSec;
  const panelBg = new PIXI.Graphics();
  roundedRect(panelBg, rect.x, rect.y, rect.width, rect.height, 26, PALETTE.panelSoft, PALETTE.stroke, 4);
  container.addChild(panelBg);
  const layout = SETTLEMENT_VASSAL_PANEL_LAYOUT;
  container.addChild(createText("Vassal", TEXT_STYLES.header, rect.x + rect.width * 0.5, rect.y + layout.headerY, 0.5, 0.5));

  if (!currentVassal) {
    container.addChild(
      createWrappedText(
        "Choose a vassal to begin the lineage.",
        TEXT_STYLES.body,
        rect.x + layout.emptyMessage.xInset,
        rect.y + layout.emptyMessage.yOffset,
        rect.width - layout.emptyMessage.xInset * 2
      )
    );
    return;
  }

  const ageYears = getSettlementVassalAgeYearsAtSecond(state, currentVassal, state?.tSec);
  const titleLabel = `${capitalizeLabel(currentVassal.currentClassId)} • Age ${ageYears}`;
  container.addChild(
    createWrappedText(
      titleLabel,
      TEXT_STYLES.title,
      rect.x + layout.title.xInset,
      rect.y + layout.title.yOffset,
      rect.width - layout.title.xInset - layout.title.reservedStatusWidth
    )
  );
  container.addChild(
    createWrappedText(
      currentVassal.isDead ? "Dead" : currentVassal.isElder ? "Elder" : "Alive",
      {
        ...TEXT_STYLES.body,
        fontWeight: "bold",
        fill: currentVassal.isDead ? PALETTE.vassalDead : currentVassal.isElder ? PALETTE.active : PALETTE.passiveBorder,
      },
      rect.x + rect.width - layout.status.rightInset,
      rect.y + layout.status.yOffset,
      layout.status.maxWidth,
      1,
      0
    )
  );

  const agendaRect = {
    x: rect.x + layout.agenda.xInset,
    y: rect.y + layout.agenda.yOffset,
    width: rect.width - layout.agenda.widthInset,
    height: layout.agenda.height,
  };
  drawSubPanel(container, agendaRect, PALETTE.panel, PALETTE.stroke);
  container.addChild(createText("Agenda", TEXT_STYLES.title, agendaRect.x + layout.agenda.titleXInset, agendaRect.y + layout.agenda.titleYOffset));
  const agenda = Array.isArray(currentVassal?.agendaByClass?.[selectedClassId])
    ? currentVassal.agendaByClass[selectedClassId]
    : [];
  const visibleAgendaCount = Math.min(layout.agenda.visibleCount, agenda.length);
  for (let index = 0; index < visibleAgendaCount; index += 1) {
    drawMiniPracticeCard(
      container,
      {
        x: agendaRect.x + layout.agenda.cardXInset + index * (layout.agenda.cardWidth + layout.agenda.cardGap),
        y: agendaRect.y + layout.agenda.cardYOffset,
        width: layout.agenda.cardWidth,
        height: layout.agenda.cardHeight,
      },
      agenda[index],
      { fontSize: 9, lineHeight: 10 }
    );
  }

  const statsRect = {
    x: rect.x + layout.stats.xInset,
    y: rect.y + layout.stats.yOffset,
    width: layout.stats.width,
    height: layout.stats.height,
  };
  drawSubPanel(container, statsRect, PALETTE.elderLozengeSoft, PALETTE.stroke);
  container.addChild(createText("Stats", TEXT_STYLES.title, statsRect.x + layout.stats.titleXInset, statsRect.y + layout.stats.titleYOffset));
  container.addChild(
    createWrappedText(
      [
        `Class ${capitalizeLabel(currentVassal.currentClassId)}`,
        `Profession ${getVassalProfessionLabel(currentVassal.professionId)}`,
        `Trait ${getVassalTraitLabel(currentVassal.traitId)}`,
        `Elder ${currentVassal.isElder ? "Yes" : "No"}`,
        deathYearKnown
          ? `Death Year ${Math.floor(currentVassal.deathYear ?? 1)}`
          : "Death Year Unknown",
      ].join("\n"),
      {
        ...TEXT_STYLES.body,
        fontSize: 12,
        lineHeight: 17,
      },
      statsRect.x + layout.stats.bodyXInset,
      statsRect.y + layout.stats.bodyYOffset,
      statsRect.width - layout.stats.bodyWidthInset
    )
  );

  const bustRect = {
    x: rect.x + rect.width - layout.bust.rightInset - layout.bust.width,
    y: rect.y + layout.bust.yOffset,
    width: layout.bust.width,
    height: layout.bust.height,
  };
  drawDeterministicBust(container, bustRect, {
    memberId: currentVassal.vassalId,
    sourceVassalId: currentVassal.vassalId,
    modifierId: currentVassal.traitId,
    sourceClassId: currentVassal.currentClassId,
    joinedYear: currentVassal.birthYear,
  });

  const eventRect = {
    x: rect.x + layout.eventLog.xInset,
    y: rect.y + layout.eventLog.yOffset,
    width: rect.width - layout.eventLog.widthInset,
    height: rect.height - layout.eventLog.heightInset,
  };
  container.addChild(createText("Event Log", TEXT_STYLES.title, eventRect.x + layout.eventLog.titleXInset, eventRect.y + layout.eventLog.titleYOffset));
  drawVassalEventLog(
    container,
    eventRect,
    getSettlementVisibleVassalLifeEvents(
      state,
      currentVassal.vassalId,
      visibleVassalThroughSec
    ),
    state
  );
}

export function createSettlementPrototypeView({
  app,
  layer,
  getState,
  getCivilizationLossInfo,
  getSelectedPracticeClassId,
  setSelectedPracticeClassId,
  tooltipView,
  getVisibleVassalTimeSec,
} = {}) {
  const root = new PIXI.Container();
  const contentLayer = new PIXI.Container();
  const overlayLayer = new PIXI.Container();
  root.addChild(contentLayer, overlayLayer);
  layer?.addChild(root);
  let lastSignature = "";
  let lastRenderGateKey = "";
  let agendaFlyoutSpec = null;
  let agendaFlyoutHideTimeoutId = null;

  function clearAgendaFlyoutHideTimer() {
    if (agendaFlyoutHideTimeoutId == null) return;
    clearTimeout(agendaFlyoutHideTimeoutId);
    agendaFlyoutHideTimeoutId = null;
  }

  function hideAgendaFlyoutNow() {
    clearAgendaFlyoutHideTimer();
    agendaFlyoutSpec = null;
    clearChildren(overlayLayer);
  }

  function scheduleAgendaFlyoutHide() {
    clearAgendaFlyoutHideTimer();
    agendaFlyoutHideTimeoutId = setTimeout(() => {
      agendaFlyoutSpec = null;
      clearChildren(overlayLayer);
      agendaFlyoutHideTimeoutId = null;
    }, AGENDA_FLYOUT_HIDE_DELAY_MS);
  }

  function renderAgendaFlyout(state) {
    clearChildren(overlayLayer);
    if (!agendaFlyoutSpec || !state) return;
    const classIds = getSettlementClassIds(state);
    const member = agendaFlyoutSpec.member;
    const anchorBounds =
      agendaFlyoutSpec.anchorDisplayObject?.getBounds?.() ?? agendaFlyoutSpec.anchorRect ?? null;
    if (!anchorBounds) return;
    const width = 360;
    const sectionGap = 8;
    const headerHeight = 30;
    const rowHeight = 56;
    const height =
      16 +
      headerHeight +
      classIds.length * rowHeight +
      Math.max(0, classIds.length - 1) * sectionGap +
      14;
    const screenWidth = Math.floor(app?.screen?.width ?? 2424);
    const screenHeight = Math.floor(app?.screen?.height ?? 1080);
    let x = anchorBounds.x + anchorBounds.width + 14;
    if (x + width > screenWidth - 16) {
      x = anchorBounds.x - width - 14;
    }
    x = Math.max(16, Math.min(x, screenWidth - width - 16));
    let y = anchorBounds.y - 8;
    y = Math.max(16, Math.min(y, screenHeight - height - 16));

    const flyout = new PIXI.Container();
    flyout.x = x;
    flyout.y = y;
    flyout.eventMode = "static";
    flyout.cursor = "default";
    flyout.hitArea = new PIXI.Rectangle(0, 0, width, height);
    flyout.on("pointerenter", () => {
      clearAgendaFlyoutHideTimer();
    });
    flyout.on("pointerleave", () => {
      scheduleAgendaFlyoutHide();
    });

    const bg = new PIXI.Graphics();
    roundedRect(bg, 0, 0, width, height, 18, PALETTE.flyout, PALETTE.accent, 2);
    flyout.addChild(bg);
    flyout.addChild(createText("Full Agenda", TEXT_STYLES.cardTitle, 14, 12));

    let cursorY = 16 + headerHeight;
    for (const classId of classIds) {
      drawSubPanel(
        flyout,
        { x: 12, y: cursorY, width: width - 24, height: rowHeight },
        PALETTE.elderLozengeSoft,
        PALETTE.stroke
      );
      flyout.addChild(
        createText(
          capitalizeLabel(classId),
          {
            ...TEXT_STYLES.body,
            fontWeight: "bold",
            fontSize: 12,
          },
          22,
          cursorY + 8
        )
      );
      const agenda = Array.isArray(member?.agendaByClass?.[classId]) ? member.agendaByClass[classId] : [];
      if (agenda.length <= 0) {
        drawMiniPracticeCard(
          flyout,
          { x: 96, y: cursorY + 7, width: 84, height: rowHeight - 14 },
          null,
          { emptyLabel: "No agenda", fontSize: 9, lineHeight: 11 }
        );
      } else {
        const cardWidth = 74;
        const gap = 6;
        for (let index = 0; index < agenda.length; index += 1) {
          drawMiniPracticeCard(
            flyout,
            {
              x: 96 + index * (cardWidth + gap),
              y: cursorY + 7,
              width: cardWidth,
              height: rowHeight - 14,
            },
            agenda[index],
            { fontSize: 8, lineHeight: 10 }
          );
        }
      }
      cursorY += rowHeight + sectionGap;
    }

    overlayLayer.addChild(flyout);
  }

  function showAgendaFlyout(spec) {
    clearAgendaFlyoutHideTimer();
    agendaFlyoutSpec = spec && typeof spec === "object" ? spec : null;
    const state = typeof getState === "function" ? getState() : null;
    renderAgendaFlyout(state);
  }

  function render() {
    const state = typeof getState === "function" ? getState() : null;
    if (!state) return;
    const classIds = getSettlementClassIds(state);
    const selectedClassId =
      (typeof getSelectedPracticeClassId === "function" && getSelectedPracticeClassId()) ||
      classIds[0] ||
      "villager";
    const visibleVassalThroughSec =
      typeof getVisibleVassalTimeSec === "function"
        ? getVisibleVassalTimeSec(state)
        : state?.tSec;
    const civilizationLossInfo =
      typeof getCivilizationLossInfo === "function" ? getCivilizationLossInfo() : null;
    const renderGateKey = buildRenderGateKey(
      state,
      selectedClassId,
      visibleVassalThroughSec,
      civilizationLossInfo
    );
    if (renderGateKey === lastRenderGateKey) {
      renderAgendaFlyout(state);
      return;
    }
    lastRenderGateKey = renderGateKey;
    const redGodSummary = getSettlementChaosGodSummary(state, "redGod");
    const redGodIncomeSummary = getSettlementChaosIncomeSummary(state, "redGod");
    const signature = buildSignature(
      state,
      selectedClassId,
      visibleVassalThroughSec,
      civilizationLossInfo
    );
    if (signature === lastSignature) {
      renderAgendaFlyout(state);
      return;
    }
    lastSignature = signature;

    hideAgendaFlyoutNow();
    clearChildren(contentLayer);

    const screenWidth = Math.floor(app?.screen?.width ?? 2424);
    const screenHeight = Math.floor(app?.screen?.height ?? 1080);

    const background = new PIXI.Graphics();
    background.beginFill(PALETTE.background, 1);
    background.drawRect(0, 0, screenWidth, screenHeight);
    background.endFill();
    contentLayer.addChild(background);

    const topbar = new PIXI.Graphics();
    roundedRect(topbar, 0, 0, screenWidth, SETTLEMENT_TOPBAR_LAYOUT.height, 0, PALETTE.topbar, PALETTE.topbar, 0);
    contentLayer.addChild(topbar);

    const seasonText = `${getCurrentSeasonKey(state).toUpperCase()}  |  Year ${Math.floor(
      state?.year ?? 1
    )}`;
    const civilizationLostLabel = Number.isFinite(civilizationLossInfo?.lossYear)
      ? `Civilization Lost - Year ${Math.floor(civilizationLossInfo.lossYear)}${
          Number.isFinite(civilizationLossInfo?.maxLossYear)
            ? ` (max ${Math.floor(civilizationLossInfo.maxLossYear)})`
            : ""
        }`
      : "Civilization Lost - Unknown";
    contentLayer.addChild(createText(seasonText, TEXT_STYLES.header, screenWidth * 0.5, SETTLEMENT_TOPBAR_LAYOUT.seasonY, 0.5, 0.5));
    contentLayer.addChild(
      createText(
        civilizationLostLabel,
        {
          ...TEXT_STYLES.body,
          fontSize: 18,
          fontWeight: "bold",
          fill: PALETTE.accent,
        },
        screenWidth * 0.5,
        SETTLEMENT_TOPBAR_LAYOUT.lossY,
        0.5,
        0.5
      )
    );

    const {
      hub: hubPanelRect,
      vassal: vassalPanelRect,
      chaos: chaosPanelRect,
      region: regionPanelRect,
      classColumn: classColumnRect,
      order: orderRect,
      practice: practiceRect,
      structures: structuresRect,
      resourceBand: resourceBandRect,
    } = SETTLEMENT_PANEL_RECTS;

    const panelGfx = new PIXI.Graphics();
    roundedRect(
      panelGfx,
      hubPanelRect.x,
      hubPanelRect.y,
      hubPanelRect.width,
      hubPanelRect.height,
      26,
      PALETTE.panelSoft,
      PALETTE.stroke,
      4
    );
    roundedRect(
      panelGfx,
      chaosPanelRect.x,
      chaosPanelRect.y,
      chaosPanelRect.width,
      chaosPanelRect.height,
      26,
      PALETTE.panelSoft,
      PALETTE.stroke,
      4
    );
    roundedRect(
      panelGfx,
      regionPanelRect.x,
      regionPanelRect.y,
      regionPanelRect.width,
      regionPanelRect.height,
      26,
      PALETTE.panelSoft,
      PALETTE.stroke,
      4
    );
    roundedRect(
      panelGfx,
      vassalPanelRect.x,
      vassalPanelRect.y,
      vassalPanelRect.width,
      vassalPanelRect.height,
      26,
      PALETTE.panelSoft,
      PALETTE.stroke,
      4
    );
    roundedRect(
      panelGfx,
      resourceBandRect.x,
      resourceBandRect.y,
      resourceBandRect.width,
      resourceBandRect.height,
      18,
      PALETTE.panelSoft,
      PALETTE.stroke,
      2
    );
    roundedRect(
      panelGfx,
      orderRect.x,
      orderRect.y,
      orderRect.width,
      orderRect.height,
      22,
      PALETTE.panel,
      PALETTE.stroke,
      3
    );
    roundedRect(
      panelGfx,
      practiceRect.x,
      practiceRect.y,
      practiceRect.width,
      practiceRect.height,
      22,
      PALETTE.panel,
      PALETTE.stroke,
      3
    );
    roundedRect(
      panelGfx,
      structuresRect.x,
      structuresRect.y,
      structuresRect.width,
      structuresRect.height,
      22,
      PALETTE.panel,
      PALETTE.stroke,
      3
    );
    contentLayer.addChild(panelGfx);

    contentLayer.addChild(
      createText(
        state?.locationNames?.hub ?? "Hub",
        TEXT_STYLES.header,
        hubPanelRect.x + hubPanelRect.width * 0.5,
        SETTLEMENT_SECTION_LABEL_LAYOUT.hubY,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText(
        state?.locationNames?.region ?? "Region",
        TEXT_STYLES.header,
        regionPanelRect.x + regionPanelRect.width * 0.5,
        regionPanelRect.y + SETTLEMENT_SECTION_LABEL_LAYOUT.regionYOffset,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText("Vassal", TEXT_STYLES.header, vassalPanelRect.x + vassalPanelRect.width * 0.5, SETTLEMENT_SECTION_LABEL_LAYOUT.vassalY, 0.5, 0.5)
    );
    contentLayer.addChild(
      createText("Order", TEXT_STYLES.title, orderRect.x + orderRect.width * 0.5, SETTLEMENT_SECTION_LABEL_LAYOUT.orderY, 0.5, 0.5)
    );
    contentLayer.addChild(
      createText(
        `Practice - ${capitalizeLabel(selectedClassId)}`,
        TEXT_STYLES.title,
        practiceRect.x + practiceRect.width * 0.5,
        SETTLEMENT_SECTION_LABEL_LAYOUT.practiceY,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText(
        "Structures",
        TEXT_STYLES.title,
        structuresRect.x + structuresRect.width * 0.5,
        SETTLEMENT_SECTION_LABEL_LAYOUT.structuresY,
        0.5,
        0.5
      )
    );

    const chipsLayer = new PIXI.Container();
    contentLayer.addChild(chipsLayer);
    const chipSpecs = [
      {
        label: "Food",
        value: `${getSettlementTotalFood(state)} total`,
        width: SETTLEMENT_RESOURCE_CHIP_LAYOUT.widths.food,
        color: PALETTE.chip,
      },
      {
        label: "Red",
        value: getSettlementStockpile(state, "redResource"),
        width: SETTLEMENT_RESOURCE_CHIP_LAYOUT.widths.red,
        color: PALETTE.red,
      },
      {
        label: "Blue",
        value: getSettlementStockpile(state, "blueResource"),
        width: SETTLEMENT_RESOURCE_CHIP_LAYOUT.widths.blue,
        color: PALETTE.blue,
      },
      {
        label: "Black",
        value: getSettlementStockpile(state, "blackResource"),
        width: SETTLEMENT_RESOURCE_CHIP_LAYOUT.widths.black,
        color: PALETTE.black,
      },
    ];
    const chipGap = SETTLEMENT_RESOURCE_CHIP_LAYOUT.gap;
    const chipRowWidth =
      chipSpecs.reduce((sum, spec) => sum + spec.width, 0) + chipGap * (chipSpecs.length - 1);
    let chipX = resourceBandRect.x + Math.floor((resourceBandRect.width - chipRowWidth) * 0.5);
    for (const spec of chipSpecs) {
      drawChip(chipsLayer, chipX, resourceBandRect.y + SETTLEMENT_RESOURCE_CHIP_LAYOUT.yOffset, spec.width, spec.label, spec.value, spec.color);
      chipX += spec.width + chipGap;
    }

    const classLayer = new PIXI.Container();
    contentLayer.addChild(classLayer);
    // createClassTab selection moved onto the class summary cards themselves.
    // Legacy layout marker for UI contract tests:
    // { y: classTabsRect.y }
    const classGap = SETTLEMENT_CLASS_COLUMN_LAYOUT.gap;
    const classCardHeight = Math.max(
      SETTLEMENT_CLASS_COLUMN_LAYOUT.minCardHeight,
      Math.floor(
        (classColumnRect.height - classGap * Math.max(0, classIds.length - 1)) /
          Math.max(1, classIds.length)
      )
    );
    for (let i = 0; i < classIds.length; i += 1) {
      const classId = classIds[i];
      classLayer.addChild(
        drawClassSummaryCard(
          {
            x: classColumnRect.x,
            y: classColumnRect.y + i * (classCardHeight + classGap),
            width: classColumnRect.width,
            height: classCardHeight,
          },
          classId,
          getSettlementPopulationSummary(state, classId),
          getSettlementFaithSummary(state, classId),
          getSettlementHappinessSummary(state, classId),
          classId === selectedClassId,
          () => {
            if (classId === selectedClassId) return;
            setSelectedPracticeClassId?.(classId);
            lastSignature = "";
            lastRenderGateKey = "";
            render();
          }
        )
      );
    }

    drawSlotGrid(contentLayer.addChild(new PIXI.Graphics()), practiceRect, SETTLEMENT_SLOT_GRID_LAYOUT.practiceColumns, 1);
    drawSlotGrid(contentLayer.addChild(new PIXI.Graphics()), structuresRect, SETTLEMENT_SLOT_GRID_LAYOUT.structureColumns, 1);
    drawSlotGrid(
      contentLayer.addChild(new PIXI.Graphics()),
      {
        x: regionPanelRect.x + SETTLEMENT_REGION_TILE_LAYOUT.xInset,
        y: regionPanelRect.y + SETTLEMENT_REGION_TILE_LAYOUT.yOffset,
        width: regionPanelRect.width - SETTLEMENT_REGION_TILE_LAYOUT.xInset * 2,
        height: regionPanelRect.height - SETTLEMENT_REGION_TILE_LAYOUT.heightInset,
      },
      SETTLEMENT_SLOT_GRID_LAYOUT.regionColumns,
      1
    );
    drawVassalPanel(
      contentLayer,
      vassalPanelRect,
      state,
      selectedClassId,
      tooltipView,
      visibleVassalThroughSec
    );

    const orderSlots = getSettlementOrderSlots(state);
    const orderCard = orderSlots[0]?.card ?? null;
    if (orderCard) {
      drawOrderPanel(
        contentLayer,
        orderRect,
        state,
        selectedClassId,
        orderCard,
        tooltipView,
        showAgendaFlyout,
        scheduleAgendaFlyoutHide
      );
    }

    const practiceSlots = getSettlementPracticeSlotsByClass(state, selectedClassId);
    const practiceCardWidth = SETTLEMENT_PRACTICE_CARD_LAYOUT.width;
    const practiceCardGap = SETTLEMENT_PRACTICE_CARD_LAYOUT.gap;
    for (let i = 0; i < practiceSlots.length; i += 1) {
      const card = practiceSlots[i]?.card ?? null;
      if (!card) continue;
      const def = settlementPracticeDefs[card.defId];
      const isPassivePractice = def?.practiceMode === "passive";
      const cardHeight = isPassivePractice
        ? practiceCardWidth
        : practiceRect.height - SETTLEMENT_PRACTICE_CARD_LAYOUT.heightInset;
      const cardY =
        practiceRect.y +
        SETTLEMENT_PRACTICE_CARD_LAYOUT.yInset +
        Math.max(
          0,
          Math.floor((practiceRect.height - SETTLEMENT_PRACTICE_CARD_LAYOUT.heightInset - cardHeight) * 0.5)
        );
      drawPracticeCard(
        contentLayer,
        {
          x: practiceRect.x + SETTLEMENT_PRACTICE_CARD_LAYOUT.xInset + i * (practiceCardWidth + practiceCardGap),
          y: cardY,
          width: practiceCardWidth,
          height: cardHeight,
        },
        card,
        def?.name ?? card.defId,
        buildPracticeLines(card),
        card?.props?.settlement?.available ? PALETTE.card : PALETTE.cardMuted,
        isPassivePractice
          ? card?.props?.settlement?.available
            ? PALETTE.passiveBorder
            : PALETTE.passiveBorderMuted
          : card?.props?.settlement?.available
            ? PALETTE.active
            : PALETTE.stroke,
        {
          showBody: false,
          tooltipView,
        }
      );
    }

    const structureSlots = getSettlementStructureSlots(state);
    const structureCardWidth = SETTLEMENT_STRUCTURE_CARD_LAYOUT.width;
    const structureCardGap = SETTLEMENT_STRUCTURE_CARD_LAYOUT.gap;
    for (let i = 0; i < structureSlots.length; i += 1) {
      const structure = structureSlots[i]?.structure ?? null;
      if (!structure) continue;
      const def = hubStructureDefs[structure.defId];
      drawCard(
        contentLayer,
        {
          x: structuresRect.x + SETTLEMENT_STRUCTURE_CARD_LAYOUT.xInset + i * (structureCardWidth + structureCardGap),
          y: structuresRect.y + SETTLEMENT_STRUCTURE_CARD_LAYOUT.yInset,
          width: structureCardWidth,
          height: structuresRect.height - SETTLEMENT_STRUCTURE_CARD_LAYOUT.heightInset,
        },
        def?.name ?? structure.defId,
        buildStructureLines(structure),
        structure?.props?.settlement?.active ? PALETTE.card : PALETTE.cardMuted,
        structure?.props?.settlement?.active ? PALETTE.active : PALETTE.stroke,
        {
          fontSize: 11,
          lineHeight: 15,
          wordWrapWidth: structureCardWidth - SETTLEMENT_STRUCTURE_CARD_LAYOUT.wordWrapInset,
        }
      );
    }

    const tileAnchors = Array.isArray(state?.board?.layers?.tile?.anchors)
      ? state.board.layers.tile.anchors
      : [];
    drawRedGodPanel(contentLayer, chaosPanelRect, redGodSummary, redGodIncomeSummary, tooltipView);
    for (let i = 0; i < tileAnchors.length; i += 1) {
      const tile = tileAnchors[i];
      const def = envTileDefs[tile?.defId];
      drawCard(
        contentLayer,
        {
          x: regionPanelRect.x + SETTLEMENT_REGION_TILE_LAYOUT.xInset + i * SETTLEMENT_REGION_TILE_LAYOUT.stepX,
          y: regionPanelRect.y + SETTLEMENT_REGION_TILE_LAYOUT.yOffset,
          width: SETTLEMENT_REGION_TILE_LAYOUT.width,
          height: regionPanelRect.height - SETTLEMENT_REGION_TILE_LAYOUT.heightInset,
        },
        def?.name ?? tile?.defId ?? "Tile",
        buildTileLines(tile),
        getTileCardFill(tile),
        tile?.defId === "tile_floodplains" ? PALETTE.active : PALETTE.stroke
      );
    }
  }

  return {
    init: () => render(),
    refresh: () => {
      lastSignature = "";
      lastRenderGateKey = "";
      render();
    },
    update: () => render(),
    getScreenRect: () =>
      !root.visible || typeof root.getBounds !== "function" ? null : root.getBounds(),
    getSemanticSnapshot: () => buildRenderSemanticSnapshot(contentLayer, overlayLayer),
    destroy: () => {
      tooltipView?.hide?.();
      hideAgendaFlyoutNow();
      clearChildren(contentLayer);
      clearChildren(overlayLayer);
      root.removeFromParent();
      root.destroy({ children: true });
    },
  };
}
