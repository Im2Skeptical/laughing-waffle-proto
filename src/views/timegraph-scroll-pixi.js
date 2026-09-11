import { SETTLEMENT_GRAPH_GROUPS } from "./ui-root/settlement-graph-groups.js";
import { RELIC } from "./chronicle-skin.js";
import { getArtRevision, getChronicleTexture } from "./chronicle-art.js";

// Fixed design-space measurements follow the painted recesses in the atlas.
export const TIMEGRAPH_CHROME = Object.freeze({
  headerHeight: 42, iconSize: 28, keyRows: 4, keyCapacity: 8,
});
const ASSEMBLY_FRAME = Object.freeze({ x: 0, y: 108, width: 2172, height: 504 });
const CONTROL_RECTS = Object.freeze({
  chaos: { x: 228, y: 17, width: 129, height: 24 },
  resources: { x: 389, y: 17, width: 129, height: 24 },
  population: { x: 550, y: 17, width: 131, height: 24 },
  series: { x: 744, y: 17, width: 39, height: 27 },
  focus: { x: 1504, y: 17, width: 105, height: 24 },
});
export function getTimegraphLayout() {
  return {
    plot: { x: 233, y: 60, w: 1365, h: 156 },
    key: { x: 28, y: 46, width: 125, height: 189 },
    controls: CONTROL_RECTS,
  };
}
const INKS = Object.freeze({
  monsterCount: 0x962f32, chaosResistance: 0x176f74, chaosRawPressure: 0xa4541d,
  food: 0x326e38, gold: 0x987018, totalPopulation: 0x623982,
  "population:villager": 0x325b99, "population:stranger": 0xa54475,
  civilizationHousingCapacity: 0x6b452b, housingCapacity: 0x72712d,
});

export function getTimegraphInk(series) {
  if (INKS[series?.id] != null) return INKS[series.id];
  const color = Number.isFinite(series?.color) ? series.color : 0x886b36;
  return (((color >> 16 & 255) * .6) << 16) |
    (((color >> 8 & 255) * .6) << 8) | ((color & 255) * .6);
}

// Only the contents page. The key cabinet, parchment and plot never move.
export function layoutTimegraphKey(count, requestedPage = 0) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const { keyCapacity, keyRows } = TIMEGRAPH_CHROME;
  const pageCount = Math.max(1, Math.ceil(total / keyCapacity));
  const page = Math.max(0, Math.min(pageCount - 1, Math.floor(Number(requestedPage) || 0)));
  const startIndex = page * keyCapacity;
  return {
    ...getTimegraphLayout().key, page, pageCount, startIndex, total,
    points: Array.from({ length: Math.min(keyCapacity, total - startIndex) }, (_, index) => ({
      x: 50 + Math.floor(index / keyRows) * 55,
      y: 56 + (index % keyRows) * 35,
    })),
  };
}

export function getTimegraphGlyphInk(color) {
  // Keep the paper line's hue legible on the cabinet's dark bronze sockets.
  const mix = (channel, light) => Math.round(channel * .55 + light * .45);
  return mix(color >> 16 & 255, 255) << 16 |
    mix(color >> 8 & 255, 240) << 8 | mix(color & 255, 200);
}

// Engraved symbols use the same ink as their line; names live in details.
export function drawTimegraphGlyph(g, seriesId, color) {
  g.lineStyle(2, color, 1);
  const head = (x, y) => g.drawCircle(x, y, 3);
  const person = (x, y) => { head(x, y); g.moveTo(x - 4, y + 9).lineTo(x - 3, y + 5).lineTo(x + 3, y + 5).lineTo(x + 4, y + 9); };
  if (seriesId === "monsterCount") {
    g.drawPolygon([7,10,9,6,19,6,21,10,20,20,8,20,7,10])
      .moveTo(9,7).lineTo(5,3).lineTo(5,12).moveTo(19,7).lineTo(23,3).lineTo(23,12);
    g.beginFill(color).drawCircle(11,12,2).drawCircle(17,12,2).endFill();
    g.moveTo(11,18).lineTo(11,23).moveTo(17,18).lineTo(17,23);
  } else if (seriesId === "chaosResistance") {
    g.drawPolygon([14,4,23,8,21,18,14,24,7,18,5,8,14,4]).moveTo(14,8).lineTo(14,19);
  } else if (seriesId.startsWith("chaos")) {
    g.drawPolygon([16,3,7,15,13,15,10,25,22,11,16,11,16,3]);
    if (seriesId === "chaosRawPressure") g.moveTo(5,20).lineTo(4,24).moveTo(23,4).lineTo(25,8);
  } else if (seriesId === "food") {
    g.moveTo(14,24).lineTo(14,4);
    for (const y of [7,12,17]) g.moveTo(14,y+4).lineTo(8,y).lineTo(8,y+3).lineTo(14,y+6)
      .moveTo(14,y+4).lineTo(20,y).lineTo(20,y+3).lineTo(14,y+6);
  } else if (seriesId === "gold") {
    g.drawCircle(14,14,10).drawCircle(14,14,7).moveTo(14,8).lineTo(14,20).moveTo(10,11).lineTo(18,11).moveTo(10,17).lineTo(18,17);
  } else if (seriesId.toLowerCase().includes("housing")) {
    g.moveTo(4,13).lineTo(14,4).lineTo(24,13).moveTo(7,11).lineTo(7,23).lineTo(21,23).lineTo(21,11)
      .moveTo(12,23).lineTo(12,16).lineTo(16,16).lineTo(16,23);
    if (seriesId === "civilizationHousingCapacity") g.moveTo(3,7).lineTo(8,2).lineTo(12,5);
  } else if (seriesId.startsWith("faith:")) {
    g.drawPolygon([14,3,17,11,25,14,17,17,14,25,11,17,3,14,11,11,14,3]);
  } else if (seriesId.startsWith("happiness:")) {
    g.drawCircle(14,14,10).moveTo(8,17).quadraticCurveTo(14,23,20,17);
    g.beginFill(color).drawCircle(10,11,1).drawCircle(18,11,1).endFill();
  } else {
    person(14,9);
    if (seriesId === "totalPopulation") { head(5,12); head(23,12); }
    if (seriesId.endsWith(":villager")) g.moveTo(7,6).lineTo(14,3).lineTo(21,6);
    if (seriesId.endsWith(":stranger")) g.moveTo(8,11).quadraticCurveTo(8,1,14,2).quadraticCurveTo(20,1,20,11);
    if (seriesId.startsWith("freePopulation:")) g.moveTo(21,19).lineTo(27,19).moveTo(24,16).lineTo(24,22);
  }
}

export function createTimegraphScroll({ root, width, height, onToggleGroup, getActiveGroups, onKeyPage }) {
  const backing = new PIXI.Container();
  backing.eventMode = "none";
  root.addChildAt(backing, 0);
  const illustration = new PIXI.Sprite();
  illustration.eventMode = "none";
  backing.addChild(illustration);
  let illustrationRevision = -1;
  const mountIllustration = () => {
    if (illustration.destroyed) return;
    const atlas = getChronicleTexture("timegraph-chronicle-assembly.png");
    if (!atlas?.baseTexture.valid) return;
    illustrationRevision = getArtRevision();
    const { x, y, width: frameWidth, height: frameHeight } = ASSEMBLY_FRAME;
    illustration.texture = new PIXI.Texture(atlas.baseTexture, new PIXI.Rectangle(x, y, frameWidth, frameHeight));
    illustration.width = width;
    illustration.height = height;
  };
  mountIllustration();

  const scopeHeading = new PIXI.Text("VIEWING", { fontFamily: "Georgia", fontSize: 14, fill: RELIC.gold });
  scopeHeading.position.set(850, 21);
  const scopeValue = new PIXI.Text("Civilization", { fontFamily: "Georgia", fontSize: 20, fill: RELIC.bone });
  scopeValue.position.set(931, 17);
  backing.addChild(scopeHeading, scopeValue);
  const keyCaption = new PIXI.Text("KEY", { fontFamily: "Georgia", fontSize: 17, fontWeight: "bold", fill: 0x21190f });
  keyCaption.anchor.set(.5);
  keyCaption.position.set(91, 31);
  backing.addChild(keyCaption);

  function paintButtonState(g, id, active, hovered = false) {
    const rect = CONTROL_RECTS[id];
    g.clear();
    if (!active && !hovered) return;
    g.lineStyle(1, active ? 0xefc575 : RELIC.bone, active ? .8 : .35)
      .beginFill(0xe7b65b, active ? .13 : .06)
      .drawRoundedRect(3, 2, rect.width - 6, rect.height - 4, rect.height / 3).endFill();
  }
  const buttons = SETTLEMENT_GRAPH_GROUPS.map(({ id, label }) => {
    const rect = CONTROL_RECTS[id];
    const container = new PIXI.Container();
    container.position.set(rect.x, rect.y);
    container.eventMode = "static";
    container.cursor = "pointer";
    container.hitArea = new PIXI.Rectangle(-5, -5, rect.width + 10, rect.height + 10);
    const bg = new PIXI.Graphics();
    const text = new PIXI.Text(label, { fontFamily: "Georgia", fontSize: 20, fontWeight: "bold", fill: RELIC.bone });
    text.anchor.set(.5);
    text.position.set(rect.width / 2, rect.height / 2 - 1);
    container.addChild(bg, text);
    container.on("pointerdown", (event) => event.stopPropagation());
    container.on("pointertap", (event) => { event.stopPropagation(); onToggleGroup?.(id); });
    const button = { id, container, bg, text, hovered: false };
    container.on("pointerover", () => { button.hovered = true; updateButtons(); });
    container.on("pointerout", () => { button.hovered = false; updateButtons(); });
    root.addChild(container);
    return button;
  });
  function updateButtons() {
    if (illustrationRevision !== getArtRevision() || !illustration.texture?.baseTexture.valid) {
      mountIllustration();
    }
    const active = getActiveGroups?.() ?? [];
    for (const button of buttons) {
      const selected = active.includes(button.id);
      paintButtonState(button.bg, button.id, selected, button.hovered);
      button.text.style.fill = selected ? 0xffdda0 : RELIC.bone;
    }
  }

  let keyLayout = layoutTimegraphKey(0);
  const pageButtons = [-1, 1].map((direction) => {
    const button = new PIXI.Container();
    button.position.set(direction < 0 ? 42 : 100, 197);
    button.eventMode = "static";
    button.hitArea = new PIXI.Rectangle(-2, -2, 46, 38);
    const shade = new PIXI.Graphics();
    button.addChild(shade);
    button.on("pointerdown", event => event.stopPropagation());
    button.on("pointertap", event => {
      event.stopPropagation();
      onKeyPage?.(keyLayout.page + direction);
    });
    root.addChild(button);
    return { button, shade, direction };
  });

  return {
    setScope(label) {
      scopeValue.text = label.startsWith("Local")
        ? "Settlement · " + label.replace("Local • ", "")
        : "Civilization · All settlements";
      scopeValue.scale.set(1);
      scopeValue.scale.set(Math.min(1, 500 / Math.max(1, scopeValue.width)));
    },
    layoutKey(count, page) {
      keyLayout = layoutTimegraphKey(count, page);
      keyCaption.text = keyLayout.pageCount > 1 ? `KEY  ${keyLayout.page + 1}/${keyLayout.pageCount}` : "KEY";
      keyCaption.style.fontSize = keyLayout.pageCount > 1 ? 15 : 17;
      for (const { button, shade, direction } of pageButtons) {
        const enabled = direction < 0 ? keyLayout.page > 0 : keyLayout.page < keyLayout.pageCount - 1;
        button.cursor = enabled ? "pointer" : "default";
        shade.clear();
        if (!enabled) shade.beginFill(0x15120e, .68).drawRoundedRect(2, 2, 39, 28, 3).endFill();
      }
      return keyLayout;
    },
    update: updateButtons,
    paintButtonState,
    getScopeLabel: () => scopeValue.text,
    getKeyDebugState: () => ({
      page: keyLayout.page, pageCount: keyLayout.pageCount, total: keyLayout.total,
      capacity: TIMEGRAPH_CHROME.keyCapacity, zone: { ...getTimegraphLayout().key },
      pageButtons: pageButtons.map(({ button, direction }) => {
        const point = button.toGlobal(new PIXI.Point(21, 17));
        return { direction, x: point.x, y: point.y };
      }),
    }),
    getButtons: () => buttons.map(({ id, container }) => {
      const rect = CONTROL_RECTS[id];
      const point = container.toGlobal(new PIXI.Point(rect.width / 2, rect.height / 2));
      return { id, x: point.x, y: point.y };
    }),
  };
}
