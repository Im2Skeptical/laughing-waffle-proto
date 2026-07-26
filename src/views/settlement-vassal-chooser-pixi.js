import { createCenteredModalFrame } from "./ui-helpers/centered-modal-frame.js";

function clear(container) {
  for (const child of [...(container?.children ?? [])]) {
    container.removeChild(child);
    child.destroy?.({ children: true });
  }
}

function candidateCard(parent, rect, candidate, onSelect) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointertap", () => onSelect?.(candidate.candidateIndex));
  const gfx = new PIXI.Graphics();
  gfx.lineStyle(3, 0xd7b450, 0.95);
  gfx.beginFill(0x4d4740, 0.98);
  gfx.drawRoundedRect(0, 0, rect.width, rect.height, 22);
  gfx.endFill();
  root.addChild(gfx);
  const lines = [
    `Age ${candidate.initialAge}`,
    `Target: ${candidate.targetRegionId}`,
    `Order resistance snapshot: ${candidate.resistanceSnapshot}`,
    `Trait ${candidate.traitId} (${candidate.traitPrestigeModifier >= 0 ? "+" : ""}${candidate.traitPrestigeModifier})`,
    `Profession: ${candidate.professionId} (no prestige)`,
    "",
    ...candidate.interventions.map((entry, index) =>
      `${index + 1}. ${entry.practiceId} — requires ${entry.requiredPrestige}`)
  ];
  lines.forEach((line, index) => {
    const text = new PIXI.Text(line, {
      fontFamily: "Georgia",
      fontSize: index === 0 ? 25 : 16,
      fontWeight: index === 0 ? "bold" : "normal",
      fill: index >= 6 ? 0xe3c46c : 0xf7f2e9,
      wordWrap: true,
      wordWrapWidth: rect.width - 36,
    });
    text.position.set(18, 18 + index * 42);
    root.addChild(text);
  });
  parent.addChild(root);
}

export function createSettlementVassalChooserView({
  app,
  layer,
  getSelectionPool,
  isOpen,
  onSelectCandidate,
} = {}) {
  const frame = createCenteredModalFrame({
    PIXI,
    layer,
    stage: app?.stage,
    getScreenSize: () => ({
      width: Math.floor(app?.screen?.width ?? 2424),
      height: Math.floor(app?.screen?.height ?? 1080),
    }),
    title: "Choose a Vassal and Settlement",
    showClose: false,
    defaultLayout: { widthPx: 2100, heightPx: 820, marginPx: 24, zIndex: 20 },
  });
  let signature = "";

  function render(force = false) {
    const open = isOpen?.() === true;
    frame.setOpenVisible(open);
    if (!open) {
      signature = "";
      clear(frame.body);
      return;
    }
    const pool = getSelectionPool?.();
    const next = JSON.stringify(pool);
    if (!force && next === signature) return;
    signature = next;
    clear(frame.body);
    const layout = frame.layoutFrame({
      widthPx: Math.floor(app?.screen?.width ?? 2424) - 100,
      heightPx: Math.floor(app?.screen?.height ?? 1080) - 100,
      marginPx: 24,
    });
    const candidates = pool?.candidates ?? [];
    const gap = 24;
    const width = Math.floor((layout.bodyWidth - 24 - gap * 2) / 3);
    candidates.slice(0, 3).forEach((candidate, index) => candidateCard(
      frame.body,
      { x: 12 + index * (width + gap), y: 18, width, height: layout.bodyHeight - 36 },
      candidate,
      onSelectCandidate
    ));
  }

  return {
    init: () => render(true),
    update: () => render(),
    refresh: () => render(true),
    getScreenRect: () => frame.getScreenRect?.() ?? null,
  };
}
