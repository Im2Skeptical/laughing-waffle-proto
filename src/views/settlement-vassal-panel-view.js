import {
  getSettlementCurrentVassal,
  getSettlementVisibleVassalLifeEvents,
  getSettlementYearDurationSec,
} from "../model/settlement-state.js";
import {
  getSettlementVassalAgeYearsAtSecond,
} from "../model/settlement-vassal-exec.js";
import {
  capitalizeLabel,
  formatVassalDeathCause,
  getVassalProfessionLabel,
  getVassalTraitLabel,
} from "./settlement-formatters.js";
import { drawMiniPracticeCard } from "./settlement-agenda-view.js";
import { drawDeterministicBust } from "./settlement-elder-bust-view.js";
import { SETTLEMENT_VASSAL_PANEL_LAYOUT } from "./settlement-layout.js";
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
    roundedRect(
      row,
      rect.x,
      rowY,
      rect.width,
      rowHeight,
      18,
      PALETTE.eventLogRowFill,
      PALETTE.eventLogRowStroke,
      2
    );
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
        `Age ${Math.floor(event?.ageYears ?? 0)} â€¢ Year ${
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

export function drawVassalPanel(
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
  roundedRect(
    panelBg,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    26,
    PALETTE.panelSoft,
    PALETTE.stroke,
    4
  );
  container.addChild(panelBg);
  const layout = SETTLEMENT_VASSAL_PANEL_LAYOUT;
  container.addChild(
    createText(
      "Vassal",
      TEXT_STYLES.header,
      rect.x + rect.width * 0.5,
      rect.y + layout.headerY,
      0.5,
      0.5
    )
  );

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
  const titleLabel = `${capitalizeLabel(currentVassal.currentClassId)} â€¢ Age ${ageYears}`;
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
        fill: currentVassal.isDead
          ? PALETTE.vassalDead
          : currentVassal.isElder
            ? PALETTE.active
            : PALETTE.passiveBorder,
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
  container.addChild(
    createText(
      "Agenda",
      TEXT_STYLES.title,
      agendaRect.x + layout.agenda.titleXInset,
      agendaRect.y + layout.agenda.titleYOffset
    )
  );
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
  container.addChild(
    createText(
      "Stats",
      TEXT_STYLES.title,
      statsRect.x + layout.stats.titleXInset,
      statsRect.y + layout.stats.titleYOffset
    )
  );
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
  container.addChild(
    createText(
      "Event Log",
      TEXT_STYLES.title,
      eventRect.x + layout.eventLog.titleXInset,
      eventRect.y + layout.eventLog.titleYOffset
    )
  );
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
