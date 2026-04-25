import { settlementOrderDefs } from "../defs/gamepieces/settlement-order-defs.js";
import { GAMEPIECE_HOVER_SCALE } from "./layout-pixi.js";
import { drawAgendaStack } from "./settlement-agenda-view.js";
import { drawDeterministicBust } from "./settlement-elder-bust-view.js";
import { capitalizeLabel } from "./settlement-formatters.js";
import { ORDER_PANEL_LAYOUT } from "./settlement-layout.js";
import {
  buildElderDetailTooltipSpec,
  getOrderRuntime,
  getSelectedAgendaForMember,
  getSortedOrderMembers,
} from "./settlement-order-view-helpers.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import {
  createText,
  roundedRect,
} from "./settlement-view-primitives.js";

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

export function drawOrderPanel(
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
