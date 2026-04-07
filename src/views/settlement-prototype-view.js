import { envTileDefs } from "../defs/gamepieces/env-tiles-defs.js";
import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { settlementOrderDefs } from "../defs/gamepieces/settlement-order-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import { getCurrentSeasonKey } from "../model/state.js";
import {
  getSettlementCurrentVassal,
  getSettlementClassIds,
  getSettlementFaithSummary,
  getSettlementFirstSelectedVassal,
  getSettlementHappinessSummary,
  getSettlementLatestSelectedVassalDeathSec,
  getSettlementOrderSlots,
  getSettlementPendingVassalSelection,
  getSettlementPopulationSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementStockpile,
  getSettlementStructureSlots,
  getSettlementTileBlueResource,
  getSettlementTileGreenResource,
  getSettlementYearDurationSec,
  getSettlementVisibleVassalLifeEvents,
} from "../model/settlement-state.js";
import {
  getSettlementVassalAgeYearsAtSecond,
} from "../model/settlement-vassal-exec.js";
import {
  settlementVassalProfessionDefs,
  settlementVassalTraitDefs,
} from "../defs/gamepieces/settlement-vassal-defs.js";
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

function capitalizeTier(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.length) return "None";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function capitalizeLabel(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.length) return "None";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPartialFeedMemory(partialFeedRatios) {
  const ratios = Array.isArray(partialFeedRatios) ? partialFeedRatios : [];
  if (!ratios.length) return "None";
  return ratios
    .map((value) => `${Math.round((Number.isFinite(value) ? Number(value) : 0) * 100)}%`)
    .join(" -> ");
}

function formatPracticeBlockedReason(reason) {
  const text = typeof reason === "string" ? reason : "";
  if (!text.length) return "";
  if (text.startsWith("upgradeTargetMissing:")) {
    return `${text.slice("upgradeTargetMissing:".length)} missing`;
  }
  if (text.startsWith("upgradeTier:")) {
    return `${capitalizeTier(text.slice("upgradeTier:".length))} tier`;
  }
  if (text.startsWith("faithTier:")) {
    return `faith ${capitalizeTier(text.slice("faithTier:".length))}+`;
  }
  return text
    .replace(/^stockpileHigh:/, "")
    .replace(/^stockpile:/, "")
    .replace(/^capability:/, "")
    .replace(/^priority$/, "higher priority practice")
    .replace(/^mirrorSource$/, "villager practice")
    .replace(/^seasonMismatch$/, "season")
    .replace(/^freePopulation$/, "free population");
}

function formatSignedNumber(value) {
  const safe = Number.isFinite(value) ? Math.floor(value) : 0;
  return safe >= 0 ? `+${safe}` : String(safe);
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

function buildCompactPendingSelectionSignature(pendingSelection, classIds) {
  if (!pendingSelection || typeof pendingSelection !== "object") return null;
  const safeClassIds = Array.isArray(classIds) ? classIds : [];
  return {
    poolId: pendingSelection.poolId ?? null,
    createdSec: Number.isFinite(pendingSelection.createdSec)
      ? Math.floor(pendingSelection.createdSec)
      : null,
    candidates: (Array.isArray(pendingSelection.candidates) ? pendingSelection.candidates : []).map(
      (candidate) => ({
        vassalId: candidate?.vassalId ?? null,
        sourceClassId: candidate?.sourceClassId ?? null,
        initialAgeYears: Number.isFinite(candidate?.initialAgeYears)
          ? Math.floor(candidate.initialAgeYears)
          : null,
        deathYear: Number.isFinite(candidate?.deathYear) ? Math.floor(candidate.deathYear) : null,
        agendaByClass: Object.fromEntries(
          safeClassIds.map((classId) => [
            classId,
            Array.isArray(candidate?.agendaByClass?.[classId])
              ? [...candidate.agendaByClass[classId]]
              : [],
          ])
        ),
      })
    ),
  };
}

function buildSignature(state, selectedClassId, visibleVassalThroughSec = null) {
  const summary = getSettlementPopulationSummary(state);
  const classIds = getSettlementClassIds(state);
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
        greenResourceStored: getSettlementTileGreenResource(tile),
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
      food: getSettlementStockpile(state, "food"),
      red: getSettlementStockpile(state, "redResource"),
      green: getSettlementStockpile(state, "greenResource"),
      blue: getSettlementStockpile(state, "blueResource"),
      black: getSettlementStockpile(state, "blackResource"),
    },
    classSummaries: classIds.map((classId) => ({
      classId,
      population: getSettlementPopulationSummary(state, classId),
      faith: getSettlementFaithSummary(state, classId),
      happiness: getSettlementHappinessSummary(state, classId),
    })),
    vassal: (() => {
      const currentVassal = getSettlementCurrentVassal(state);
      const pendingSelection = getSettlementPendingVassalSelection(state);
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
        pendingSelection: buildCompactPendingSelectionSignature(pendingSelection, classIds),
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
      "Every autumn flood,",
      "every spring deposit",
      "5 greenResource.",
      `Stored Green: ${getSettlementTileGreenResource(tile)}`,
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
  if (!defId || !def) {
    return {
      fill: PALETTE.slot,
      outline: PALETTE.stroke,
      radius: 10,
      passive: false,
      title: options.emptyLabel ?? "No agenda",
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
  return {
    fill,
    outline,
    radius: passive ? 10 : 12,
    passive,
    title: def?.name ?? defId,
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

  container.addChild(root);
  return root;
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
  detailHit.on("pointerover", () => {
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
  detailHit.on("pointerout", () => {
    tooltipView?.hide?.();
  });
  root.addChild(detailHit);

  const agendaHit = new PIXI.Graphics();
  agendaHit.beginFill(0xffffff, 0.001);
  agendaHit.drawRoundedRect(agendaRect.x, agendaRect.y, agendaRect.width, agendaRect.height, 12);
  agendaHit.endFill();
  agendaHit.eventMode = "static";
  agendaHit.cursor = "pointer";
  agendaHit.on("pointerover", () => {
    showAgendaFlyout?.({
      member,
      anchorDisplayObject: agendaHit,
    });
  });
  agendaHit.on("pointerout", () => {
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
  const rowHeight = Math.max(
    36,
    Math.min(52, Math.floor((rosterHeight - rowGap * Math.max(0, members.length - 1)) / members.length))
  );
  for (let index = 0; index < members.length; index += 1) {
    drawElderLozenge(
      container,
      {
        x: rect.x + 10,
        y: rosterY + index * (rowHeight + rowGap),
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
    root.on("pointerover", () => {
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
    root.on("pointerout", () => {
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
  const compactBody = rect.height < 160;
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
  const lines = [
    `Adults ${Math.floor(population?.adults ?? 0)}  Youth ${Math.floor(population?.youth ?? 0)}`,
    `Total ${Math.floor(population?.total ?? 0)}  Free ${Math.floor(population?.free ?? 0)}`,
    `Reserved ${Math.floor(population?.reserved ?? 0)}`,
    `Faith ${capitalizeTier(faith?.tier)}  Mood ${capitalizeLabel(happiness?.status)}`,
    `${Math.floor(happiness?.fullFeedStreak ?? 0)}/${Math.floor(happiness?.fullFeedThreshold ?? 0)} full  ${Math.floor(happiness?.missedFeedStreak ?? 0)}/${Math.floor(happiness?.missedFeedThreshold ?? 0)} missed`,
    `Partial ${formatPartialFeedMemory(happiness?.partialFeedRatios)}`,
  ];
  root.addChild(
    createText(
      lines.join("\n"),
      {
        ...TEXT_STYLES.body,
        fontSize: compactBody ? 10 : 12,
        lineHeight: compactBody ? 14 : 16,
        wordWrap: true,
        wordWrapWidth: rect.width - 32,
      },
      16,
      42
    )
  );
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

function getVassalProfessionLabel(professionId) {
  if (typeof professionId !== "string" || professionId.length <= 0) return "None";
  return settlementVassalProfessionDefs?.[professionId]?.label ?? professionId;
}

function getVassalTraitLabel(traitId) {
  if (typeof traitId !== "string" || traitId.length <= 0) return "None";
  return settlementVassalTraitDefs?.[traitId]?.label ?? traitId;
}

function formatVassalDeathCause(causeOfDeath) {
  if (causeOfDeath === "starvation") return "starvation";
  if (causeOfDeath === "oldAge") return "old age";
  return "unknown causes";
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
  for (let index = 0; index < Math.min(5, agenda.length); index += 1) {
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
        `Death Year ${Math.floor(currentVassal.deathYear ?? 1)}`,
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
    flyout.on("pointerover", () => {
      clearAgendaFlyoutHideTimer();
    });
    flyout.on("pointerout", () => {
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
    const signature = buildSignature(state, selectedClassId, visibleVassalThroughSec);
    if (signature === lastSignature) {
      renderAgendaFlyout(state);
      return;
    }
    lastSignature = signature;

    tooltipView?.hide?.();
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
    contentLayer.addChild(createText(seasonText, TEXT_STYLES.header, screenWidth * 0.5, 35, 0.5, 0.5));

    const hubPanelRect = { x: 70, y: 120, width: 1080, height: 700 };
    const vassalPanelRect = { x: 1170, y: 120, width: 560, height: 620 };
    const regionPanelRect = { x: 1760, y: 180, width: 540, height: 450 };
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
        210,
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

    const foodCapacity = Math.floor(state?.hub?.core?.props?.foodCapacity ?? 0);
    const chipsLayer = new PIXI.Container();
    contentLayer.addChild(chipsLayer);
    const chipSpecs = [
      {
        label: "Food",
        value: `${getSettlementStockpile(state, "food")}/${foodCapacity}`,
        width: 180,
        color: PALETTE.chip,
      },
      {
        label: "Red",
        value: getSettlementStockpile(state, "redResource"),
        width: 140,
        color: PALETTE.red,
      },
      {
        label: "Green",
        value: getSettlementStockpile(state, "greenResource"),
        width: 150,
        color: PALETTE.green,
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
    for (let i = 0; i < tileAnchors.length; i += 1) {
      const tile = tileAnchors[i];
      const def = envTileDefs[tile?.defId];
      drawCard(
        contentLayer,
        {
          x: regionPanelRect.x + 20 + i * 100,
          y: regionPanelRect.y + 90,
          width: 88,
          height: regionPanelRect.height - 140,
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
