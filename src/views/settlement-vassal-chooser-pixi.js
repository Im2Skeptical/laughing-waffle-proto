import { createCenteredModalFrame } from "./ui-helpers/centered-modal-frame.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";

const CLASS_LABELS = Object.freeze({
  villager: "Villager",
  stranger: "Stranger",
});

function capitalizeLabel(value) {
  const text = String(value ?? "");
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clearChildren(container) {
  const children = Array.isArray(container?.children) ? [...container.children] : [];
  for (const child of children) {
    container.removeChild(child);
    child.destroy?.({ children: true });
  }
}

function drawCardRect(gfx, x, y, width, height, fill, stroke) {
  gfx.lineStyle(3, stroke, 0.95);
  gfx.beginFill(fill, 0.98);
  gfx.drawRoundedRect(x, y, width, height, 24);
  gfx.endFill();
}

function getPracticeCardStyle(defId) {
  const def = settlementPracticeDefs?.[defId] ?? null;
  if (!def) {
    return {
      title: "No agenda",
      fill: 0x4b4743,
      stroke: 0x7a7469,
      passive: false,
      tierLabel: "",
    };
  }
  const passive = def.practiceMode === "passive";
  const developmentTier =
    typeof def?.orderDevelopmentTier === "string" ? def.orderDevelopmentTier : "base";
  if (developmentTier === "major") {
    return {
      title: String(def?.ui?.title ?? def?.name ?? defId),
      fill: 0x6b5740,
      stroke: 0xe3c46c,
      passive,
      tierLabel: "Major",
    };
  }
  return {
    title: String(def?.ui?.title ?? def?.name ?? defId),
    fill: passive ? 0x70815b : 0x4f4a45,
    stroke: passive ? 0xaed08d : 0xd7d0c3,
    passive,
    tierLabel: developmentTier === "minor" ? "Minor" : "",
  };
}

function createMiniPracticeCard(container, rect, defId, tooltipView) {
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;
  const style = getPracticeCardStyle(defId);
  const card = new PIXI.Graphics();
  card.lineStyle(style.passive ? 3 : 2, style.stroke, 0.92);
  card.beginFill(style.fill, 0.98);
  card.drawRoundedRect(0, 0, rect.width, rect.height, style.passive ? 12 : 10);
  card.endFill();
  root.addChild(card);

  const title = new PIXI.Text(style.title, {
    fontFamily: "Georgia",
    fontSize: 10,
    fontWeight: "bold",
    fill: 0xf7f2e9,
    wordWrap: true,
    wordWrapWidth: rect.width - 10,
    lineHeight: 12,
  });
  title.x = 5;
  title.y = 5;
  root.addChild(title);

  if (style.tierLabel) {
    const badge = new PIXI.Text(style.tierLabel, {
      fontFamily: "Georgia",
      fontSize: 9,
      fontWeight: "bold",
      fill: style.stroke,
    });
    badge.x = 5;
    badge.y = rect.height - 14;
    root.addChild(badge);
  }

  if (tooltipView && defId && settlementPracticeDefs?.[defId]) {
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    root.on("pointerover", () => {
      const def = settlementPracticeDefs[defId];
      const lines = Array.isArray(def?.ui?.lines) ? [...def.ui.lines] : [];
      if (typeof def?.ui?.description === "string" && def.ui.description.length > 0) {
        lines.push("", def.ui.description);
      }
      const anchor = tooltipView.getAnchorRectForDisplayObject?.(root, "screen") ?? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        coordinateSpace: "screen",
      };
      tooltipView.show?.(
        {
          title: String(def?.ui?.title ?? def?.name ?? defId),
          lines,
          maxWidth: 320,
          scale: tooltipView.getRelativeDisplayScale?.(root, 1) ?? 1,
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

function drawAgendaSection(container, rect, classId, agenda, tooltipView) {
  const section = new PIXI.Container();
  section.x = rect.x;
  section.y = rect.y;

  const label = new PIXI.Text(`${CLASS_LABELS[classId] ?? capitalizeLabel(classId)} Agenda`, {
    fontFamily: "Georgia",
    fontSize: 13,
    fontWeight: "bold",
    fill: 0xd7b450,
  });
  label.x = 0;
  label.y = 0;
  section.addChild(label);

  const cardWidth = 82;
  const cardHeight = 56;
  const cardGap = 8;
  const cards = Array.isArray(agenda) ? agenda.slice(0, 3) : [];
  for (let index = 0; index < cards.length; index += 1) {
    createMiniPracticeCard(
      section,
      {
        x: index * (cardWidth + cardGap),
        y: 24,
        width: cardWidth,
        height: cardHeight,
      },
      cards[index],
      tooltipView
    );
  }

  if (cards.length <= 0) {
    const emptyText = new PIXI.Text("No agenda", {
      fontFamily: "Georgia",
      fontSize: 12,
      fill: 0xd7d0c3,
    });
    emptyText.x = 0;
    emptyText.y = 30;
    section.addChild(emptyText);
  }

  container.addChild(section);
  return section;
}

function createCard(container, rect, candidate, onSelect, tooltipView) {
  const root = new PIXI.Container();
  root.eventMode = "static";
  root.cursor = "pointer";
  root.hitArea = new PIXI.Rectangle(rect.x, rect.y, rect.width, rect.height);
  root.on("pointertap", () => onSelect?.(candidate?.candidateIndex ?? null));

  const bg = new PIXI.Graphics();
  drawCardRect(bg, rect.x, rect.y, rect.width, rect.height, 0x4d4740, 0xd7b450);
  root.addChild(bg);

  const title = new PIXI.Text(`Age ${Math.floor(candidate?.initialAgeYears ?? 0)}`, {
    fontFamily: "Georgia",
    fontSize: 24,
    fontWeight: "bold",
    fill: 0xf7f2e9,
  });
  title.x = rect.x + 18;
  title.y = rect.y + 18;
  root.addChild(title);

  const classText = new PIXI.Text(String(candidate?.sourceClassId ?? "villager"), {
    fontFamily: "Georgia",
    fontSize: 15,
    fill: 0xd7d0c3,
  });
  classText.x = rect.x + 18;
  classText.y = rect.y + 52;
  root.addChild(classText);

  const sectionBg = new PIXI.Graphics();
  sectionBg.lineStyle(2, 0x6e6559, 0.75);
  sectionBg.beginFill(0x45413a, 0.72);
  sectionBg.drawRoundedRect(rect.x + 14, rect.y + 90, rect.width - 28, 182, 18);
  sectionBg.endFill();
  root.addChild(sectionBg);

  drawAgendaSection(
    root,
    {
      x: rect.x + 26,
      y: rect.y + 104,
    },
    "villager",
    candidate?.agendaByClass?.villager ?? [],
    tooltipView
  );
  drawAgendaSection(
    root,
    {
      x: rect.x + 26,
      y: rect.y + 196,
    },
    "stranger",
    candidate?.agendaByClass?.stranger ?? [],
    tooltipView
  );

  container.addChild(root);
}

export function createSettlementVassalChooserView({
  app,
  layer,
  getSelectionPool,
  isOpen,
  onSelectCandidate,
  tooltipView,
} = {}) {
  const modalFrame = createCenteredModalFrame({
    PIXI,
    layer,
    stage: app?.stage ?? null,
    getScreenSize: () => ({
      width: Math.floor(app?.screen?.width ?? 2424),
      height: Math.floor(app?.screen?.height ?? 1080),
    }),
    title: "Choose a Vassal",
    showClose: false,
    onRequestClose: () => {},
    defaultLayout: {
      widthPx: 1780,
      heightPx: 820,
      marginPx: 24,
      zIndex: 20,
    },
  });
  const { body, setOpenVisible } = modalFrame;
  let lastSignature = "";
  let wasOpen = false;

  function buildSelectionPoolSignature(selectionPool) {
    return JSON.stringify({
      poolId: selectionPool?.poolId ?? null,
      createdSec: Number.isFinite(selectionPool?.createdSec)
        ? Math.floor(selectionPool.createdSec)
        : null,
      expectedPoolHash: selectionPool?.expectedPoolHash ?? null,
      candidates: (Array.isArray(selectionPool?.candidates) ? selectionPool.candidates : []).map(
        (candidate) => ({
          candidateIndex: Number.isFinite(candidate?.candidateIndex)
            ? Math.floor(candidate.candidateIndex)
            : null,
          vassalId: candidate?.vassalId ?? null,
          sourceClassId: candidate?.sourceClassId ?? null,
          initialAgeYears: Number.isFinite(candidate?.initialAgeYears)
            ? Math.floor(candidate.initialAgeYears)
            : null,
          deathYear: Number.isFinite(candidate?.deathYear) ? Math.floor(candidate.deathYear) : null,
          agendaByClass: {
            villager: Array.isArray(candidate?.agendaByClass?.villager)
              ? [...candidate.agendaByClass.villager]
              : [],
            stranger: Array.isArray(candidate?.agendaByClass?.stranger)
              ? [...candidate.agendaByClass.stranger]
              : [],
          },
        })
      ),
      screen: [app?.screen?.width ?? 0, app?.screen?.height ?? 0],
    });
  }

  function render(force = false) {
    const open = typeof isOpen === "function" ? isOpen() === true : false;
    setOpenVisible(open);
    if (!open) {
      if (wasOpen) {
        tooltipView?.hide?.();
        clearChildren(body);
        lastSignature = "";
      }
      wasOpen = false;
      return;
    }
    wasOpen = true;
    const selectionPool = getSelectionPool?.() ?? null;
    const signature = buildSelectionPoolSignature(selectionPool);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    clearChildren(body);
    const frame = modalFrame.layoutFrame({
      widthPx: Math.floor(app?.screen?.width ?? 2424) - 120,
      heightPx: Math.floor(app?.screen?.height ?? 1080) - 120,
      marginPx: 24,
    });

    const intro = new PIXI.Text("Pick one heir to guide and observe.", {
      fontFamily: "Georgia",
      fontSize: 18,
      fill: 0xf7f2e9,
    });
    intro.x = 12;
    intro.y = 0;
    body.addChild(intro);

    const candidates = Array.isArray(selectionPool?.candidates) ? selectionPool.candidates : [];
    const cardGap = 26;
    const cardWidth = Math.floor((frame.bodyWidth - cardGap * 2 - 24) / 3);
    const cardHeight = frame.bodyHeight - 86;
    for (let index = 0; index < Math.min(3, candidates.length); index += 1) {
      createCard(
        body,
        {
          x: 12 + index * (cardWidth + cardGap),
          y: 42,
          width: cardWidth,
          height: cardHeight,
        },
        candidates[index],
        onSelectCandidate,
        tooltipView
      );
    }
  }

  return {
    init: () => render(true),
    update: () => render(false),
    refresh: () => render(true),
    getScreenRect: () => modalFrame.getScreenRect?.() ?? null,
  };
}
