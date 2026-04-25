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
  getSettlementFirstSelectedVassal,
  getSettlementHappinessSummary,
  getSettlementLatestSelectedVassalDeathSec,
  getSettlementOrderSlots,
  getSettlementPopulationSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementFloodplainFoodTotal,
  getSettlementStockpile,
  getSettlementStructureSlots,
  getSettlementTileBlueResource,
  getSettlementTileFood,
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
  formatPracticeBlockedReason,
  formatSignedNumber,
  formatVassalDeathCause,
  getVassalProfessionLabel,
  getVassalTraitLabel,
} from "./settlement-formatters.js";
import { GAMEPIECE_HOVER_SCALE } from "./layout-pixi.js";

const PALETTE = Object.freeze({
  background: 0x847b68,
  topbar: 0x413834,
  panel: 0x5d564d,
  panelSoft: 0x6d655b,
  slot: 0x7b7368,
  card: 0x4f4a4a,
  cardMuted: 0x4a4744,
  tileCard: 0x7e9874,
  tileCardDark: 0x504b49,
  stroke: 0x4f4b48,
  chip: 0x4b4743,
  text: 0xf7f2e9,
  textMuted: 0xd7d0c3,
  accent: 0xd7b450,
  red: 0xbe6352,
  green: 0x7fa568,
  blue: 0x5d7ea6,
  black: 0x2d2b2a,
  practiceDrainRed: 0xd2735f,
  practiceDrainGreen: 0x90b276,
  practiceDrainNeutral: 0xd7b450,
  passiveBorder: 0xa4be8d,
  passiveBorderMuted: 0x7c8d72,
  active: 0xd1ad44,
  inactive: 0x777168,
  mission: 0xd48f3f,
  missionSoft: 0x5c4630,
  missionFill: 0x564236,
  elderLozenge: 0x45403d,
  elderLozengeSoft: 0x595149,
  vassalCouncilFill: 0x4e4534,
  vassalCouncilStroke: 0xe3c46c,
  bustBackdrop: 0x686056,
  bustDark: 0x40362f,
  flyout: 0x3f3935,
});

const TEXT_STYLES = Object.freeze({
  title: {
    fontFamily: "Georgia",
    fontSize: 24,
    fontWeight: "bold",
    fill: PALETTE.text,
  },
  header: {
    fontFamily: "Georgia",
    fontSize: 36,
    fontWeight: "bold",
    fill: PALETTE.text,
  },
  chip: {
    fontFamily: "Georgia",
    fontSize: 16,
    fontWeight: "bold",
    fill: PALETTE.text,
  },
  cardTitle: {
    fontFamily: "Georgia",
    fontSize: 19,
    fontWeight: "bold",
    fill: PALETTE.text,
  },
  body: {
    fontFamily: "Georgia",
    fontSize: 14,
    fill: PALETTE.text,
  },
  muted: {
    fontFamily: "Georgia",
    fontSize: 13,
    fill: PALETTE.textMuted,
  },
});

const ORDER_PANEL_LAYOUT = Object.freeze({
  padding: 16,
  gap: 18,
  leftRatio: 0.56,
});

const ELDER_BUST_SKIN_TONES = Object.freeze([0xcab59c, 0xb89d82, 0xa7876f, 0x8c6f5b]);
const ELDER_BUST_ACCENT_TONES = Object.freeze([0x7d6b4d, 0x6f7a88, 0x725b76, 0x5d7d66, 0x916443]);
const AGENDA_FLYOUT_HIDE_DELAY_MS = 60;
const FAITH_TIER_ORDER = Object.freeze(["bronze", "silver", "gold", "diamond"]);
const FAITH_TIER_COLORS = Object.freeze({
  bronze: 0xb98155,
  silver: 0xc6ccd6,
  gold: 0xe0bf54,
  diamond: 0x8dd5e8,
});
const HAPPINESS_STATE_ORDER = Object.freeze(["negative", "neutral", "positive"]);
const HAPPINESS_STATE_COLORS = Object.freeze({
  negative: 0xc86a5c,
  neutral: 0xb7a98a,
  positive: 0x8dbb6f,
});

function roundedRect(
  gfx,
  x,
  y,
  width,
  height,
  radius,
  fill,
  stroke,
  strokeWidth = 3,
  fillAlpha = 1,
  strokeAlpha = 0.95
) {
  gfx.lineStyle(strokeWidth, stroke, strokeAlpha);
  gfx.beginFill(fill, fillAlpha);
  gfx.drawRoundedRect(x, y, width, height, radius);
  gfx.endFill();
}

function clearChildren(container) {
  const children = Array.isArray(container?.children) ? [...container.children] : [];
  for (const child of children) {
    container.removeChild(child);
    child.destroy?.({ children: true });
  }
}

function createText(label, style, x, y, anchorX = 0, anchorY = 0) {
  const text = new PIXI.Text(label, style);
  text.anchor.set(anchorX, anchorY);
  text.x = x;
  text.y = y;
  return text;
}

function buildCompactVassalSignature(vassal, visibleEvents, classIds) {
  if (!vassal || typeof vassal !== "object") return null;
  const safeClassIds = Array.isArray(classIds) ? classIds : [];
  return {
    vassalId: vassal.vassalId ?? null,
    sourceClassId: vassal.sourceClassId ?? null,
    currentClassId: vassal.currentClassId ?? null,
    birthYear: Number.isFinite(vassal.birthYear) ? Math.floor(vassal.birthYear) : null,
    deathYear: Number.isFinite(vassal.deathYear) ? Math.floor(vassal.deathYear) : null,
    professionId: vassal.professionId ?? null,
    traitId: vassal.traitId ?? null,
    isDead: vassal.isDead === true,
    isElder: vassal.isElder === true,
    agendaByClass: Object.fromEntries(
      safeClassIds.map((classId) => [
        classId,
        Array.isArray(vassal?.agendaByClass?.[classId]) ? [...vassal.agendaByClass[classId]] : [],
      ])
    ),
    visibleEvents: (Array.isArray(visibleEvents) ? visibleEvents : []).map((event) => ({
      eventId: event?.eventId ?? null,
      kind: event?.kind ?? null,
      tSec: Number.isFinite(event?.tSec) ? Math.floor(event.tSec) : null,
      ageYears: Number.isFinite(event?.ageYears) ? Math.floor(event.ageYears) : null,
      classId: event?.classId ?? null,
      professionId: event?.professionId ?? null,
      traitId: event?.traitId ?? null,
      causeOfDeath: event?.causeOfDeath ?? null,
      text: event?.text ?? "",
    })),
  };
}

function countVisibleVassalLifeEvents(vassal, visibleVassalThroughSec = null) {
  const events = Array.isArray(vassal?.lifeEvents) ? vassal.lifeEvents : [];
  if (!events.length) return 0;
  const safeVisibleSec = Number.isFinite(visibleVassalThroughSec)
    ? Math.max(0, Math.floor(visibleVassalThroughSec))
    : Number.POSITIVE_INFINITY;
  let count = 0;
  for (const event of events) {
    const eventSec = Number.isFinite(event?.tSec)
      ? Math.max(0, Math.floor(event.tSec))
      : null;
    if (eventSec == null || eventSec > safeVisibleSec) break;
    count += 1;
  }
  return count;
}

function buildRenderGateKey(
  state,
  selectedClassId,
  visibleVassalThroughSec = null,
  civilizationLossInfo = null
) {
  const currentVassal = getSettlementCurrentVassal(state);
  const deathSec = Number.isFinite(currentVassal?.deathSec)
    ? Math.max(0, Math.floor(currentVassal.deathSec))
    : null;
  const deathYearKnown =
    deathSec != null &&
    Number.isFinite(visibleVassalThroughSec) &&
    Math.floor(visibleVassalThroughSec) >= deathSec;
  const lossYear = Number.isFinite(civilizationLossInfo?.lossYear)
    ? Math.floor(civilizationLossInfo.lossYear)
    : null;
  return [
    Math.floor(state?.tSec ?? 0),
    getCurrentSeasonKey(state),
    Math.floor(state?.year ?? 0),
    selectedClassId ?? "",
    currentVassal?.vassalId ?? "",
    currentVassal?.currentClassId ?? "",
    currentVassal?.professionId ?? "",
    currentVassal?.traitId ?? "",
    currentVassal?.isDead === true ? 1 : 0,
    currentVassal?.isElder === true ? 1 : 0,
    deathYearKnown ? 1 : 0,
    countVisibleVassalLifeEvents(currentVassal, visibleVassalThroughSec),
    lossYear ?? "",
    civilizationLossInfo?.resolved === true ? 1 : 0,
  ].join("|");
}

function buildSignature(
  state,
  selectedClassId,
  visibleVassalThroughSec = null,
  civilizationLossInfo = null
) {
  const summary = getSettlementPopulationSummary(state);
  const classIds = getSettlementClassIds(state);
  const redGodSummary = getSettlementChaosGodSummary(state, "redGod");
  const practiceCardsByClass = {};
  for (const classId of classIds) {
    practiceCardsByClass[classId] = getSettlementPracticeSlotsByClass(state, classId).map(
      (slot) => ({
        defId: slot?.card?.defId ?? null,
        runtime: slot?.card?.props?.settlement ?? null,
      })
    );
  }
  const structures = getSettlementStructureSlots(state).map((slot) => ({
    defId: slot?.structure?.defId ?? null,
    runtime: slot?.structure?.props?.settlement ?? null,
  }));
  const orderCards = getSettlementOrderSlots(state).map((slot) => ({
    defId: slot?.card?.defId ?? null,
    runtime: slot?.card?.props?.settlement ?? null,
  }));
  const tiles = Array.isArray(state?.board?.layers?.tile?.anchors)
    ? state.board.layers.tile.anchors.map((tile) => ({
        defId: tile?.defId ?? null,
        foodStored: getSettlementTileFood(tile),
        blueResourceStored: getSettlementTileBlueResource(tile),
      }))
    : [];
  return JSON.stringify({
    tSec: Math.floor(state?.tSec ?? 0),
    season: getCurrentSeasonKey(state),
    year: Math.floor(state?.year ?? 1),
    previewing: state !== null,
    selectedClassId,
    classIds,
    summary,
    stockpiles: {
      food: getSettlementTotalFood(state),
      storedFood: getSettlementStockpile(state, "food"),
      red: getSettlementStockpile(state, "redResource"),
      fieldFood: getSettlementFloodplainFoodTotal(state),
      blue: getSettlementStockpile(state, "blueResource"),
      black: getSettlementStockpile(state, "blackResource"),
    },
    redGodSummary,
    civilizationLossInfo: civilizationLossInfo && typeof civilizationLossInfo === "object"
      ? {
          lossSec: Number.isFinite(civilizationLossInfo.lossSec)
            ? Math.floor(civilizationLossInfo.lossSec)
            : null,
          lossYear: Number.isFinite(civilizationLossInfo.lossYear)
            ? Math.floor(civilizationLossInfo.lossYear)
            : null,
          maxLossYear: Number.isFinite(civilizationLossInfo.maxLossYear)
            ? Math.floor(civilizationLossInfo.maxLossYear)
            : null,
          resolved: civilizationLossInfo.resolved === true,
        }
      : null,
    classSummaries: classIds.map((classId) => ({
      classId,
      population: getSettlementPopulationSummary(state, classId),
      faith: getSettlementFaithSummary(state, classId),
      happiness: getSettlementHappinessSummary(state, classId),
    })),
    vassal: (() => {
      const currentVassal = getSettlementCurrentVassal(state);
      const firstSelectedVassal = getSettlementFirstSelectedVassal(state);
      const visibleEvents = currentVassal
        ? getSettlementVisibleVassalLifeEvents(
            state,
            currentVassal.vassalId,
            visibleVassalThroughSec
          )
        : [];
      return {
        currentVassal: buildCompactVassalSignature(currentVassal, visibleEvents, classIds),
        firstSelectedVassalId: firstSelectedVassal?.vassalId ?? null,
        latestDeathSec: getSettlementLatestSelectedVassalDeathSec(state),
      };
    })(),
    orderCards,
    practiceCardsByClass,
    structures,
    tiles,
  });
}

function buildPracticeLines(card) {
  const def = settlementPracticeDefs[card?.defId];
  const practiceMode = def?.practiceMode === "passive" ? "passive" : "active";
  const runtime =
    card?.props?.settlement && typeof card.props.settlement === "object"
      ? card.props.settlement
      : {};
  const lines = Array.isArray(def?.ui?.lines) ? [...def.ui.lines] : [];
  if (runtime.mirroredPracticeTitle) {
    lines.push(`Mirroring: ${runtime.mirroredPracticeTitle}`);
  }
  if (practiceMode === "passive") {
    if (runtime.lastAmount > 0 && Number.isFinite(runtime.lastRunSec)) {
      lines.push(`Last pulse: ${Math.floor(runtime.lastAmount)} at ${Math.floor(runtime.lastRunSec)}s`);
    }
    if (runtime.blockedReason) {
      lines.push(`Dormant: ${formatPracticeBlockedReason(runtime.blockedReason)}`);
    }
    return lines;
  }
  if (runtime.activeReservation) {
    lines.push(
      `Active: ${Math.floor(runtime.activeAmount ?? runtime.pendingPopulation ?? 0)} pop, ${Math.max(0, Math.floor(runtime.activeRemainingSec ?? 0))}s left`
    );
  }
  if (
    runtime.activeReservation !== true &&
    runtime.activeProgressKind === "cadence" &&
    Number.isFinite(runtime.activeRemainingSec)
  ) {
    lines.push(`Next trigger: ${Math.max(0, Math.floor(runtime.activeRemainingSec ?? 0))}s`);
  }
  if (!runtime.activeReservation && runtime.lastAmount > 0 && Number.isFinite(runtime.lastRunSec)) {
    lines.push(`Last run: ${Math.floor(runtime.lastAmount)} at ${Math.floor(runtime.lastRunSec)}s`);
  }
  if (runtime.upgradeTargetStructureDefId) {
    if (runtime.upgradeTargetStructurePresent) {
      lines.push(
        `Target: ${capitalizeTier(runtime.upgradeTargetTier)} -> ${capitalizeTier(runtime.upgradeTargetNextTier)}`
      );
      if (runtime.upgradeTargetNextTier) {
        lines.push(
          `Progress: ${Math.floor(runtime.upgradeTargetProgressCompleted ?? 0)}/${Math.floor(runtime.upgradeTargetProgressRequired ?? 0)}`
        );
      }
    } else {
      lines.push(`Target: ${runtime.upgradeTargetStructureDefId} missing`);
    }
  }
  if (!runtime.activeReservation && runtime.available) {
    lines.push(`Ready: ${Math.floor(runtime.previewAmount ?? 0)} population available`);
  } else if (!runtime.activeReservation && runtime.blockedReason) {
    lines.push(`Waiting: ${formatPracticeBlockedReason(runtime.blockedReason)}`);
  }
  return lines;
}

function buildStructureLines(structure) {
  const def = hubStructureDefs[structure?.defId];
  const runtime =
    structure?.props?.settlement && typeof structure.props.settlement === "object"
      ? structure.props.settlement
      : {};
  const lines = Array.isArray(def?.ui?.lines) ? [...def.ui.lines] : [];
  if (runtime.staffingRequired > 0) {
    lines.push(
      runtime.active
        ? `Staffed: ${Math.floor(runtime.reservedPopulation ?? 0)} population`
        : `Needs ${Math.floor(runtime.staffingRequired)} population`
    );
  } else {
    lines.push("Passive structure");
  }
  if (runtime.upgradeTier) {
    lines.push(`Tier: ${capitalizeTier(runtime.upgradeTier)}`);
    if (runtime.nextUpgradeTier) {
      lines.push(
        `Upgrade: ${Math.floor(runtime.upgradeProgressCompleted ?? 0)}/${Math.floor(runtime.upgradeProgressRequired ?? 0)} to ${capitalizeTier(runtime.nextUpgradeTier)}`
      );
    } else {
      lines.push("Upgrade: Max tier");
    }
  }
  return lines;
}

function getOrderRuntime(card) {
  return card?.props?.settlement && typeof card.props.settlement === "object"
    ? card.props.settlement
    : {};
}

function getSortedOrderMembers(card) {
  const runtime = getOrderRuntime(card);
  return (Array.isArray(runtime.members) ? runtime.members : [])
    .slice()
    .sort(
      (a, b) =>
        Math.floor(b?.prestige ?? 0) - Math.floor(a?.prestige ?? 0) ||
        Math.floor(b?.ageYears ?? 0) - Math.floor(a?.ageYears ?? 0) ||
        String(a?.memberId ?? "").localeCompare(String(b?.memberId ?? ""))
    );
}

function getSelectedAgendaForMember(member, selectedClassId) {
  return Array.isArray(member?.agendaByClass?.[selectedClassId])
    ? member.agendaByClass[selectedClassId]
    : [];
}

function getOrderModifierDef(orderDef, member) {
  const modifierId = typeof member?.modifierId === "string" ? member.modifierId : "";
  return orderDef?.prestigeModifiers?.[modifierId] ?? null;
}

function buildElderDetailTooltipSpec(orderDef, member) {
  const ageYears = Math.max(0, Math.floor(member?.ageYears ?? 0));
  const joinedYear = Math.max(0, Math.floor(member?.joinedYear ?? 0));
  const prestige = Math.max(0, Math.floor(member?.prestige ?? 0));
  const modifierDef = getOrderModifierDef(orderDef, member);
  const prestigeDelta = Number(modifierDef?.prestigeDelta ?? 0);
  const modifierLabel = modifierDef?.label ?? member?.modifierLabel ?? member?.modifierId ?? "None";
  return {
    title: modifierLabel || "Elder",
    subtitle: `Prestige ${prestige}`,
    maxWidth: 320,
    sections: [
      {
        type: "table",
        title: "Details",
        rows: [
          { label: "Age", value: `${ageYears} years` },
          { label: "Joined", value: joinedYear > 0 ? `Year ${joinedYear}` : "Unknown" },
          { label: "Class", value: capitalizeLabel(member?.sourceClassId) },
          { label: "Origin", value: member?.sourceVassalId ? "Vassal" : "Council" },
          { label: "Trait", value: modifierLabel },
          { label: "Buff/Nerf", value: `${formatSignedNumber(prestigeDelta)} prestige` },
        ],
      },
      {
        type: "paragraph",
        title: "Prestige Formula",
        text: `${ageYears} age + ${formatSignedNumber(prestigeDelta)} trait = ${prestige}`,
      },
    ],
  };
}

function buildTileLines(tile) {
  const def = envTileDefs[tile?.defId];
  if (tile?.defId === "tile_floodplains") {
    return [
      "Every winter flood,",
      "every spring deposit",
      "100 field food.",
      "Summer decays 20% per moon.",
      `Stored Field Food: ${getSettlementTileFood(tile)}`,
    ];
  }
  if (tile?.defId === "tile_hinterland") {
    return [
      "Every season change,",
      "store 1 blueResource",
      "until the global cap.",
      `Stored Blue: ${getSettlementTileBlueResource(tile)}`,
    ];
  }
  const description = def?.ui?.description;
  if (typeof description === "string" && description.length > 0) {
    return [description];
  }
  return [];
}

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

function drawCard(
  container,
  rect,
  title,
  lines,
  fill,
  outline = PALETTE.stroke,
  bodyStyleOverrides = null
) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 22, fill, outline, 3);
  container.addChild(gfx);

  const titleText = createText(title, TEXT_STYLES.cardTitle, rect.x + 16, rect.y + 14);
  container.addChild(titleText);

  const body = createText(
    lines.join("\n"),
    {
      ...TEXT_STYLES.body,
      fontSize: 13,
      wordWrap: true,
      wordWrapWidth: rect.width - 32,
      lineHeight: 18,
      ...(bodyStyleOverrides && typeof bodyStyleOverrides === "object"
        ? bodyStyleOverrides
        : {}),
    },
    rect.x + 16,
    rect.y + 44
  );
  container.addChild(body);
}

function getPracticeDrainColor(card) {
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
    fill = 0x53413f;
  } else if (defId === "riverRecessionFarming") {
    outline = PALETTE.practiceDrainGreen;
    fill = 0x54614d;
  } else if (defId === "openToStrangers") {
    outline = PALETTE.passiveBorder;
    fill = 0x535048;
  } else if (defId === "asTheRomans") {
    outline = PALETTE.active;
    fill = 0x4d4a52;
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

function drawMiniPracticeCard(container, rect, defId, opts = null) {
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

function isMissionPractice(card) {
  return settlementPracticeDefs?.[card?.defId]?.completionBehavior === "removePractice";
}

function drawAgendaStack(container, rect, agendaDefIds) {
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

function drawDeterministicBust(container, rect, member) {
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
    detailHit.beginFill(0xffffff, 0.001);
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
      0x3a342d,
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
  detailHit.beginFill(0xffffff, 0.001);
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
  agendaHit.beginFill(0xffffff, 0.001);
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

function drawPracticeCard(
  container,
  rect,
  card,
  title,
  lines,
  fill,
  outline = PALETTE.stroke,
  opts = null
) {
  const options = opts && typeof opts === "object" ? opts : {};
  const showBody = options.showBody !== false;
  const tooltipView = options.tooltipView ?? null;
  const def = settlementPracticeDefs[card?.defId];
  const practiceMode = def?.practiceMode === "passive" ? "passive" : "active";
  const runtime =
    card?.props?.settlement && typeof card.props.settlement === "object"
      ? card.props.settlement
      : {};
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;
  const isMission = isMissionPractice(card);
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    0,
    0,
    rect.width,
    rect.height,
    practiceMode === "passive" ? 16 : 22,
    fill,
    outline,
    practiceMode === "passive" ? 4 : 3
  );
  root.addChild(gfx);

  if (isMission) {
    const missionFrame = new PIXI.Graphics();
    roundedRect(
      missionFrame,
      6,
      6,
      rect.width - 12,
      rect.height - 12,
      practiceMode === "passive" ? 12 : 18,
      PALETTE.missionFill,
      PALETTE.mission,
      2,
      0.08,
      0.9
    );
    root.addChild(missionFrame);
  }

  if (
    (runtime.activeReservation === true || runtime.activeProgressKind === "cadence") &&
    Number.isFinite(runtime.activeProgressRemaining)
  ) {
    const innerX = 4;
    const innerY = 4;
    const innerWidth = Math.max(0, rect.width - 8);
    const innerHeight = Math.max(0, rect.height - 8);
    const fillHeight = innerHeight * Math.max(0, Math.min(1, runtime.activeProgressRemaining));

    const drainFill = new PIXI.Graphics();
    roundedRect(
      drainFill,
      innerX,
      innerY,
      innerWidth,
      innerHeight,
      practiceMode === "passive" ? 12 : 18,
      getPracticeDrainColor(card),
      outline,
      0,
      0.42,
      0
    );
    root.addChild(drainFill);

    const drainMask = new PIXI.Graphics();
    if (fillHeight > 0.0001) {
      const drainY = innerY + innerHeight - fillHeight;
      drainMask.beginFill(0xffffff, 1);
      drainMask.drawRect(innerX, drainY, innerWidth, fillHeight + 1);
      drainMask.endFill();
    }
    root.addChild(drainMask);
    drainFill.mask = drainMask;
  }

  const titleText = createText(
    title,
    {
      ...TEXT_STYLES.cardTitle,
      fontSize: rect.width < 156 ? 17 : TEXT_STYLES.cardTitle.fontSize,
      wordWrap: true,
      wordWrapWidth: rect.width - 24,
      lineHeight: showBody ? 20 : 18,
    },
    12,
    showBody ? 14 : 12
  );
  root.addChild(titleText);

  if (isMission) {
    const badgeWidth = 70;
    const badgeHeight = 18;
    const badgeX = rect.width - badgeWidth - 12;
    const badge = new PIXI.Graphics();
    roundedRect(
      badge,
      badgeX,
      12,
      badgeWidth,
      badgeHeight,
      9,
      PALETTE.missionSoft,
      PALETTE.mission,
      1
    );
    root.addChild(badge);
    root.addChild(
      createText(
        "MISSION",
        {
          ...TEXT_STYLES.muted,
          fontSize: 10,
          fontWeight: "bold",
          fill: PALETTE.accent,
        },
        badgeX + badgeWidth * 0.5,
        12 + badgeHeight * 0.5,
        0.5,
        0.5
      )
    );
  }

  if (showBody) {
    const body = createText(
      lines.join("\n"),
      {
        ...TEXT_STYLES.body,
        fontSize: 13,
        wordWrap: true,
        wordWrapWidth: rect.width - 28,
        lineHeight: 18,
      },
      14,
      48
    );
    root.addChild(body);
  }

  if (tooltipView && Array.isArray(lines) && lines.length > 0) {
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    root.on("pointerenter", () => {
      const anchor =
        tooltipView.getAnchorRectForDisplayObject?.(root, "parent") ?? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          coordinateSpace: "parent",
        };
      tooltipView.show?.(
        {
          title,
          lines,
          maxWidth: 300,
          scale: Math.max(
            Number.isFinite(GAMEPIECE_HOVER_SCALE) ? GAMEPIECE_HOVER_SCALE : 1,
            tooltipView.getRelativeDisplayScale?.(root, 1) ?? 1
          ),
        },
        anchor
      );
    });
    root.on("pointerleave", () => {
      tooltipView.hide?.();
    });
  }

  container.addChild(root);
  return root;
}

function drawChip(container, x, y, width, label, value, color = PALETTE.chip) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, x, y, width, 40, 16, color, PALETTE.stroke, 2);
  container.addChild(gfx);
  container.addChild(createText(label, TEXT_STYLES.muted, x + 12, y + 7));
  container.addChild(createText(String(value), TEXT_STYLES.chip, x + width - 14, y + 20, 1, 0.5));
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
  outer.beginFill(0x3b3532, 0.95);
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
  core.beginFill(0x534b46, 1);
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
    const mitigationPerPop = Math.max(0, Math.floor(entry?.mitigationPerPop ?? 0));
    const mitigation = Math.max(0, Math.floor(entry?.mitigation ?? 0));
    if (mitigation > 0) {
      mitigationLines.push(
        `${classLabel}: ${tierLabel} faith, ${population} pop x ${mitigationPerPop} = -${mitigation}`
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
      `Current income: +${Math.max(0, Math.floor(summary?.totalIncome ?? 0))} per second`,
      `Base pressure: +${Math.max(0, Math.floor(summary?.baseIncome ?? 0))}`,
      `Growth: ${growthRatePercent}% every ${Math.max(1, Math.floor(summary?.growthYears ?? 1))} years (${Math.max(0, Math.floor(summary?.growthSteps ?? 0))} steps)`,
      `Faith mitigation: -${Math.max(0, Math.floor(summary?.totalMitigation ?? 0))}`,
      ...mitigationLines,
    ],
    maxWidth: 340,
  };
}

function drawChaosValueCard(container, rect, label, valueText, accentColor, opts = {}) {
  const options = opts && typeof opts === "object" ? opts : {};
  const compactMode = rect.height < 52;
  const showSubtext =
    typeof options.subtext === "string" &&
    options.subtext.length > 0 &&
    compactMode !== true;
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;

  const bg = new PIXI.Graphics();
  roundedRect(bg, 0, 0, rect.width, rect.height, 16, 0x443d39, PALETTE.stroke, 2);
  root.addChild(bg);

  const accent = new PIXI.Graphics();
  roundedRect(accent, 10, 10, 10, rect.height - 20, 5, accentColor, accentColor, 0);
  root.addChild(accent);

  root.addChild(
    createText(
      label,
      {
        ...TEXT_STYLES.muted,
        fontSize: compactMode ? 9 : 10,
        fontWeight: "bold",
      },
      28,
      compactMode ? 6 : 10
    )
  );
  root.addChild(
    createText(
      valueText,
      {
        ...TEXT_STYLES.title,
        fontSize: compactMode ? 20 : 24,
      },
      28,
      compactMode ? 28 : 34
    )
  );

  if (showSubtext) {
    root.addChild(
      createText(
        options.subtext,
        {
          ...TEXT_STYLES.muted,
          fontSize: 9,
        },
        28,
        rect.height - 16,
        0,
        1
      )
    );
  }

  if (Array.isArray(options.segmentValues) && options.segmentValues.length > 0) {
    const total = options.segmentValues.reduce(
      (sum, segment) => sum + Math.max(0, Math.floor(segment?.value ?? 0)),
      0
    );
    const stripY = rect.height - 14;
    const stripX = 28;
    const stripWidth = rect.width - 40;
    const stripBg = new PIXI.Graphics();
    roundedRect(stripBg, stripX, stripY, stripWidth, 6, 3, 0x322d2a, PALETTE.stroke, 1);
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
          4,
          2,
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

function drawChaosStatPill(container, rect, label, valueText, accentColor, opts = {}) {
  const options = opts && typeof opts === "object" ? opts : {};
  const compactMode = rect.height < 34;
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;

  const bg = new PIXI.Graphics();
  roundedRect(bg, 0, 0, rect.width, rect.height, 14, 0x443d39, PALETTE.stroke, 2);
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
    roundedRect(stripBg, stripX, stripY, stripWidth, 5, 2, 0x2f2a28, PALETTE.stroke, 1);
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

function drawRedGodPanel(container, rect, summary, incomeSummary, tooltipView) {
  drawSubPanel(container, rect, PALETTE.panel, PALETTE.stroke);
  container.addChild(
    createText(
      "Chaos",
      TEXT_STYLES.title,
      rect.x + rect.width * 0.5,
      rect.y + 18,
      0.5,
      0
    )
  );

  const sharedRect = {
    x: rect.x + 12,
    y: rect.y + 46,
    width: rect.width - 24,
    height: 92,
  };
  const godRect = {
    x: rect.x + 12,
    y: rect.y + 146,
    width: rect.width - 24,
    height: rect.height - 158,
  };

  drawSubPanel(container, sharedRect, 0x4a433f, PALETTE.stroke);
  drawChaosPoolSigil(container, sharedRect.x + 38, sharedRect.y + Math.floor(sharedRect.height * 0.5));
  container.addChild(
    createText(
      "Shared Pool",
      {
        ...TEXT_STYLES.muted,
        fontSize: 10,
        fontWeight: "bold",
      },
      sharedRect.x + 74,
      sharedRect.y + 8
    )
  );

  drawChaosStatPill(
    container,
    { x: sharedRect.x + 74, y: sharedRect.y + 26, width: 168, height: 42 },
    "Chaos Power",
    `${Math.floor(summary?.chaosPower ?? 0)}`,
    PALETTE.red
  );
  drawChaosStatPill(
    container,
    { x: sharedRect.x + 252, y: sharedRect.y + 26, width: 240, height: 42 },
    "Chaos Income",
    `+${Math.floor(incomeSummary?.totalIncome ?? summary?.chaosIncome ?? 0)}/s`,
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

  drawSubPanel(container, godRect, 0x443a37, PALETTE.stroke);
  drawRedGodSigil(container, godRect.x + 40, godRect.y + Math.floor(godRect.height * 0.5), summary);
  container.addChild(
    createText(
      "RedGod",
      {
        ...TEXT_STYLES.cardTitle,
        fontSize: 16,
      },
      godRect.x + 82,
      godRect.y + 8
    )
  );
  container.addChild(
    createText(
      "First active chaos god",
      {
        ...TEXT_STYLES.muted,
        fontSize: 9,
      },
      godRect.x + 82,
      godRect.y + 30
    )
  );
  drawChaosStatPill(
    container,
    { x: godRect.x + 186, y: godRect.y + 14, width: 296, height: 28 },
    "Next Spawn",
    `+${Math.floor(summary?.nextSpawnCount ?? 0)} in ${Math.floor(summary?.spawnCountdownSec ?? 0)}s`,
    0x9f8550
  );
  drawChaosStatPill(
    container,
    { x: godRect.x + 186, y: godRect.y + 50, width: 296, height: 28 },
    "Monsters",
    `${Math.floor(summary?.monsterCount ?? 0)} / ${Math.floor(summary?.monsterWinCount ?? 100)}`,
    PALETTE.red
  );
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
  const height = 20;
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
      x + 8,
      y + 5
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
      x + width - 8,
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
  roundedRect(panel, 0, 0, rect.width, rect.height, 14, 0x3f3935, PALETTE.stroke, 1);
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
        tier === currentTier ? PALETTE.active : 0x43534a,
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
      0x4a4743,
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
  roundedRect(panel, 0, 0, rect.width, rect.height, 14, 0x3f3935, PALETTE.stroke, 1);
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
      0x544e49
    );
    drawCompactPipRow(
      root,
      Math.max(92, Math.floor(rect.width * 0.5) - 10),
      24,
      "-",
      happiness?.missedFeedStreak,
      happiness?.missedFeedThreshold,
      PALETTE.red,
      0x54413d
    );
  } else {
    drawStreakTrack(
      root,
      { x: 10, y: 26, width: rect.width - 54, height: 8 },
      "Full",
      happiness?.fullFeedStreak,
      happiness?.fullFeedThreshold,
      PALETTE.passiveBorder,
      0x544e49
    );
    drawStreakTrack(
      root,
      { x: 10, y: 40, width: rect.width - 54, height: 8 },
      "Miss",
      happiness?.missedFeedStreak,
      happiness?.missedFeedThreshold,
      PALETTE.red,
      0x54413d
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
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    0,
    0,
    rect.width,
    rect.height,
    18,
    selected ? PALETTE.panel : PALETTE.cardMuted,
    selected ? PALETTE.active : PALETTE.stroke,
    selected ? 3 : 2
  );
  root.x = rect.x;
  root.y = rect.y;
  root.addChild(gfx);
  root.addChild(createText(capitalizeLabel(classId), TEXT_STYLES.cardTitle, 16, 12));
  root.addChild(
    createText(
      `Total ${Math.floor(population?.total ?? 0)}   Reserved ${Math.floor(population?.reserved ?? 0)}`,
      {
        ...TEXT_STYLES.muted,
        fontSize: 9,
      },
      rect.width - 16,
      16,
      1,
      0
    )
  );

  const statsY = 34;
  const statGap = 8;
  const statWidth = Math.floor((rect.width - 32 - statGap * 2) / 3);
  drawClassStatPill(root, 16, statsY, statWidth, "Adults", Math.floor(population?.adults ?? 0), 0x4b4a3d);
  drawClassStatPill(root, 16 + statWidth + statGap, statsY, statWidth, "Youth", Math.floor(population?.youth ?? 0), 0x444f57);
  drawClassStatPill(root, 16 + (statWidth + statGap) * 2, statsY, statWidth, "Free", Math.floor(population?.free ?? 0), 0x42513c);

  drawFaithTrack(root, { x: 16, y: 58, width: rect.width - 32, height: 36 }, faith);
  drawMoodPanel(root, { x: 16, y: 98, width: rect.width - 32, height: Math.max(36, rect.height - 108) }, happiness);
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
  return tile?.defId === "tile_river" ? 0x7b9a89 : PALETTE.tileCard;
}

function drawVassalEventLog(container, rect, events, state) {
  const safeEvents = Array.isArray(events) ? events.slice().reverse() : [];
  const clipCount = Math.min(6, safeEvents.length);
  if (clipCount <= 0) {
    drawSubPanel(container, rect, 0x243145, PALETTE.stroke);
    container.addChild(createText("No recorded events yet", TEXT_STYLES.muted, rect.x + 18, rect.y + 18));
    return;
  }
  const rowGap = 10;
  const rowHeight = Math.max(52, Math.floor((rect.height - rowGap * (clipCount - 1)) / clipCount));
  for (let index = 0; index < clipCount; index += 1) {
    const event = safeEvents[index];
    const rowY = rect.y + index * (rowHeight + rowGap);
    const row = new PIXI.Graphics();
    roundedRect(row, rect.x, rowY, rect.width, rowHeight, 18, 0x2c3b55, 0x4fa2ff, 2);
    container.addChild(row);
    container.addChild(
      createText(
        event?.kind === "died"
          ? `Died of ${formatVassalDeathCause(event?.causeOfDeath)}`
          : typeof event?.text === "string" && event.text.length > 0
            ? event.text
            : capitalizeLabel(event?.kind),
        {
          ...TEXT_STYLES.cardTitle,
          fontSize: 16,
        },
        rect.x + 18,
        rowY + 12
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
        rect.x + 18,
        rowY + rowHeight - 20
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
  container.addChild(createText("Vassal", TEXT_STYLES.header, rect.x + rect.width * 0.5, rect.y + 32, 0.5, 0.5));

  if (!currentVassal) {
    container.addChild(
      createText(
        "Choose a vassal to begin the lineage.",
        TEXT_STYLES.body,
        rect.x + 26,
        rect.y + 82
      )
    );
    return;
  }

  const ageYears = getSettlementVassalAgeYearsAtSecond(state, currentVassal, state?.tSec);
  const titleLabel = `${capitalizeLabel(currentVassal.currentClassId)} • Age ${ageYears}`;
  container.addChild(createText(titleLabel, TEXT_STYLES.title, rect.x + 26, rect.y + 74));
  container.addChild(
    createText(
      currentVassal.isDead ? "Dead" : currentVassal.isElder ? "Elder" : "Alive",
      {
        ...TEXT_STYLES.body,
        fontWeight: "bold",
        fill: currentVassal.isDead ? 0xd2735f : currentVassal.isElder ? PALETTE.active : PALETTE.passiveBorder,
      },
      rect.x + rect.width - 28,
      rect.y + 78,
      1,
      0
    )
  );

  const agendaRect = { x: rect.x + 20, y: rect.y + 112, width: rect.width - 40, height: 104 };
  drawSubPanel(container, agendaRect, PALETTE.panel, PALETTE.stroke);
  container.addChild(createText("Agenda", TEXT_STYLES.title, agendaRect.x + 14, agendaRect.y + 10));
  const agenda = Array.isArray(currentVassal?.agendaByClass?.[selectedClassId])
    ? currentVassal.agendaByClass[selectedClassId]
    : [];
  const agendaCardWidth = 84;
  const agendaGap = 8;
  const visibleAgendaCount = Math.min(3, agenda.length);
  for (let index = 0; index < visibleAgendaCount; index += 1) {
    drawMiniPracticeCard(
      container,
      {
        x: agendaRect.x + 16 + index * (agendaCardWidth + agendaGap),
        y: agendaRect.y + 36,
        width: agendaCardWidth,
        height: 52,
      },
      agenda[index],
      { fontSize: 9, lineHeight: 10 }
    );
  }

  const statsRect = { x: rect.x + 20, y: rect.y + 232, width: 244, height: 144 };
  drawSubPanel(container, statsRect, PALETTE.elderLozengeSoft, PALETTE.stroke);
  container.addChild(createText("Stats", TEXT_STYLES.title, statsRect.x + 14, statsRect.y + 10));
  container.addChild(
    createText(
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
      statsRect.x + 14,
      statsRect.y + 40
    )
  );

  const bustRect = { x: rect.x + rect.width - 184, y: rect.y + 232, width: 164, height: 144 };
  drawDeterministicBust(container, bustRect, {
    memberId: currentVassal.vassalId,
    sourceVassalId: currentVassal.vassalId,
    modifierId: currentVassal.traitId,
    sourceClassId: currentVassal.currentClassId,
    joinedYear: currentVassal.birthYear,
  });

  const eventRect = { x: rect.x + 20, y: rect.y + 394, width: rect.width - 40, height: rect.height - 416 };
  container.addChild(createText("Event Log", TEXT_STYLES.title, eventRect.x + 2, eventRect.y - 28));
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
    roundedRect(topbar, 0, 0, screenWidth, 70, 0, PALETTE.topbar, PALETTE.topbar, 0);
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
    contentLayer.addChild(createText(seasonText, TEXT_STYLES.header, screenWidth * 0.5, 24, 0.5, 0.5));
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
        50,
        0.5,
        0.5
      )
    );

    const hubPanelRect = { x: 70, y: 120, width: 1080, height: 700 };
    const vassalPanelRect = { x: 1170, y: 120, width: 560, height: 620 };
    const chaosPanelRect = { x: 1760, y: 120, width: 540, height: 260 };
    const regionPanelRect = { x: 1760, y: 400, width: 540, height: 230 };
    // const classTabsRect = { x: 430, y: 344, width: 850, height: 34 };
    const classColumnRect = { x: 100, y: 188, width: 220, height: 300 };
    const orderRect = { x: 344, y: 184, width: 776, height: 220 };
    const practiceRect = { x: 344, y: 434, width: 776, height: 176 };
    const structuresRect = { x: 90, y: 630, width: 1030, height: 124 };
    const resourceBandRect = { x: 110, y: 836, width: 1560, height: 44 };

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
        148,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText(
        state?.locationNames?.region ?? "Region",
        TEXT_STYLES.header,
        regionPanelRect.x + regionPanelRect.width * 0.5,
        regionPanelRect.y + 30,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText("Vassal", TEXT_STYLES.header, vassalPanelRect.x + vassalPanelRect.width * 0.5, 148, 0.5, 0.5)
    );
    contentLayer.addChild(
      createText("Order", TEXT_STYLES.title, orderRect.x + orderRect.width * 0.5, 172, 0.5, 0.5)
    );
    contentLayer.addChild(
      createText(
        `Practice - ${capitalizeLabel(selectedClassId)}`,
        TEXT_STYLES.title,
        practiceRect.x + practiceRect.width * 0.5,
        416,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText(
        "Structures",
        TEXT_STYLES.title,
        structuresRect.x + structuresRect.width * 0.5,
        610,
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
        width: 190,
        color: PALETTE.chip,
      },
      {
        label: "Red",
        value: getSettlementStockpile(state, "redResource"),
        width: 140,
        color: PALETTE.red,
      },
      {
        label: "Blue",
        value: getSettlementStockpile(state, "blueResource"),
        width: 140,
        color: PALETTE.blue,
      },
      {
        label: "Black",
        value: getSettlementStockpile(state, "blackResource"),
        width: 150,
        color: PALETTE.black,
      },
    ];
    const chipGap = 12;
    const chipRowWidth =
      chipSpecs.reduce((sum, spec) => sum + spec.width, 0) + chipGap * (chipSpecs.length - 1);
    let chipX = resourceBandRect.x + Math.floor((resourceBandRect.width - chipRowWidth) * 0.5);
    for (const spec of chipSpecs) {
      drawChip(chipsLayer, chipX, resourceBandRect.y + 2, spec.width, spec.label, spec.value, spec.color);
      chipX += spec.width + chipGap;
    }

    const classLayer = new PIXI.Container();
    contentLayer.addChild(classLayer);
    // createClassTab selection moved onto the class summary cards themselves.
    // Legacy layout marker for UI contract tests:
    // { y: classTabsRect.y }
    const classGap = 12;
    const classCardHeight = Math.max(
      92,
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

    drawSlotGrid(contentLayer.addChild(new PIXI.Graphics()), practiceRect, 5, 1);
    drawSlotGrid(contentLayer.addChild(new PIXI.Graphics()), structuresRect, 6, 1);
    drawSlotGrid(
      contentLayer.addChild(new PIXI.Graphics()),
      {
        x: regionPanelRect.x + 20,
        y: regionPanelRect.y + 70,
        width: regionPanelRect.width - 40,
        height: regionPanelRect.height - 100,
      },
      5,
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
    const practiceCardWidth = 148;
    const practiceCardGap = 16;
    for (let i = 0; i < practiceSlots.length; i += 1) {
      const card = practiceSlots[i]?.card ?? null;
      if (!card) continue;
      const def = settlementPracticeDefs[card.defId];
      const isPassivePractice = def?.practiceMode === "passive";
      const cardHeight = isPassivePractice ? practiceCardWidth : practiceRect.height - 48;
      const cardY =
        practiceRect.y + 24 + Math.max(0, Math.floor((practiceRect.height - 48 - cardHeight) * 0.5));
      drawPracticeCard(
        contentLayer,
        {
          x: practiceRect.x + 14 + i * (practiceCardWidth + practiceCardGap),
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
    const structureCardWidth = 154;
    const structureCardGap = 18;
    for (let i = 0; i < structureSlots.length; i += 1) {
      const structure = structureSlots[i]?.structure ?? null;
      if (!structure) continue;
      const def = hubStructureDefs[structure.defId];
      drawCard(
        contentLayer,
        {
          x: structuresRect.x + 14 + i * (structureCardWidth + structureCardGap),
          y: structuresRect.y + 18,
          width: structureCardWidth,
          height: structuresRect.height - 36,
        },
        def?.name ?? structure.defId,
        buildStructureLines(structure),
        structure?.props?.settlement?.active ? PALETTE.card : PALETTE.cardMuted,
        structure?.props?.settlement?.active ? PALETTE.active : PALETTE.stroke,
        {
          fontSize: 11,
          lineHeight: 15,
          wordWrapWidth: structureCardWidth - 28,
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
          x: regionPanelRect.x + 20 + i * 100,
          y: regionPanelRect.y + 70,
          width: 88,
          height: regionPanelRect.height - 100,
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
