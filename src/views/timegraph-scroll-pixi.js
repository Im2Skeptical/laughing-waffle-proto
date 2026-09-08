import { SETTLEMENT_GRAPH_GROUPS } from "./ui-root/settlement-graph-groups.js";
import { paintRelicPanel, RELIC } from "./chronicle-skin.js";

export const TIMEGRAPH_CHROME = Object.freeze({
  headerHeight: 42, buttonWidth: 168, buttonHeight: 32, buttonGap: 8,
  iconSize: 28, iconPitch: 34, keyPadding: 8,
});
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

// Fill each column vertically before adding a column. Custom selections stay
// inside the bottom assembly without reducing the graph's height.
export function layoutTimegraphKey(count, height, headerHeight = TIMEGRAPH_CHROME.headerHeight) {
  const { iconPitch, iconSize, keyPadding } = TIMEGRAPH_CHROME;
  const rows = Math.max(1, Math.floor((height - headerHeight - keyPadding * 2 - 4) / iconPitch));
  const columns = Math.max(1, Math.ceil(count / rows));
  return {
    rows, width: columns * iconPitch + keyPadding * 2,
    height: Math.min(rows, Math.max(1, count)) * iconPitch + keyPadding * 2,
    points: Array.from({ length: count }, (_, index) => ({
      x: keyPadding + Math.floor(index / rows) * iconPitch + (iconPitch - iconSize) / 2,
      y: headerHeight + 4 + keyPadding + (index % rows) * iconPitch,
    })),
  };
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

export function createTimegraphScroll({ root, width, height, headerHeight, onToggleGroup, getActiveGroups }) {
  const { buttonWidth, buttonHeight, buttonGap } = TIMEGRAPH_CHROME;
  const backing = new PIXI.Container();
  backing.eventMode = "none";
  root.addChildAt(backing, 0);
  const parchment = PIXI.Sprite.from("images/dark-fantasy/timegraph-scroll-side-rollers.png");
  parchment.y = headerHeight;
  parchment.height = height - headerHeight;
  const housing = new PIXI.Graphics();
  paintRelicPanel(housing, 0, 0, width, headerHeight - 2, RELIC.stone, RELIC.brass, 2);
  paintRelicPanel(housing, 630, 4, width - 762, buttonHeight, RELIC.night, RELIC.brass, 1);
  const keyPanel = new PIXI.Graphics();
  backing.addChild(parchment, housing, keyPanel);
  const scopeHeading = new PIXI.Text("VIEWING", { fontFamily: "Georgia", fontSize: 16, fill: RELIC.gold });
  scopeHeading.position.set(644, 12);
  const scopeValue = new PIXI.Text("Civilization", { fontFamily: "Georgia", fontSize: 21, fill: RELIC.bone });
  scopeValue.position.set(738, 8);
  backing.addChild(scopeHeading, scopeValue);
  const buttons = SETTLEMENT_GRAPH_GROUPS.map(({ id, label }, index) => {
    const container = new PIXI.Container();
    container.position.set(12 + index * (buttonWidth + buttonGap), 4);
    container.eventMode = "static";
    container.cursor = "pointer";
    container.hitArea = new PIXI.Rectangle(0, 0, buttonWidth, buttonHeight);
    const bg = new PIXI.Graphics();
    const text = new PIXI.Text(label, { fontFamily: "Georgia", fontSize: 22, fontWeight: "bold", fill: RELIC.bone });
    text.anchor.set(.5);
    text.position.set(buttonWidth / 2, buttonHeight / 2);
    container.addChild(bg, text);
    container.on("pointerdown", (event) => event.stopPropagation());
    container.on("pointertap", (event) => { event.stopPropagation(); onToggleGroup?.(id); });
    root.addChild(container);
    return { id, container, bg, text };
  });
  let signature = null, keySignature = null;
  return {
    setScope(label) {
      const local = label.startsWith("Local");
      scopeValue.text = local ? "Settlement · " + label.replace("Local • ", "") : "Civilization · All settlements";
      scopeValue.scale.set(1);
      scopeValue.scale.set(Math.min(1, (width - 884) / Math.max(1, scopeValue.width)));
    },
    layoutKey(count) {
      const spec = layoutTimegraphKey(count, height, headerHeight);
      if (keySignature !== count) {
        keySignature = count;
        keyPanel.clear();
        if (count) paintRelicPanel(keyPanel, 0, headerHeight + 4, spec.width, spec.height, RELIC.night, RELIC.brass, 2);
        parchment.x = spec.width + 8;
        parchment.width = width - parchment.x;
      }
      return spec;
    },
    update() {
      const active = getActiveGroups?.() ?? [];
      const next = active.join("|");
      if (signature === next) return;
      signature = next;
      for (const button of buttons) {
        const selected = active.includes(button.id);
        button.bg.clear();
        paintRelicPanel(button.bg, 0, 0, buttonWidth, buttonHeight,
          selected ? 0x6b5132 : RELIC.raised, selected ? RELIC.gold : RELIC.brass, selected ? 2 : 1);
        button.text.style.fill = selected ? 0xffe6b5 : RELIC.bone;
      }
    },
    getScopeLabel: () => scopeValue.text,
    getButtons: () => buttons.map(({ id, container }) => {
      const point = container.toGlobal(new PIXI.Point(buttonWidth / 2, buttonHeight / 2));
      return { id, x: point.x, y: point.y };
    }),
  };
}
