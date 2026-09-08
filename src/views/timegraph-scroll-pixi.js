import { SETTLEMENT_GRAPH_GROUPS } from "./ui-root/settlement-graph-groups.js";

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

export function createTimegraphScroll({ root, width, height, onToggleGroup, getActiveGroups }) {
  const parchment = PIXI.Sprite.from("images/dark-fantasy/timegraph-scroll.png");
  parchment.width = width;
  parchment.height = height;
  parchment.eventMode = "none";
  root.addChildAt(parchment, 0);
  const buttons = SETTLEMENT_GRAPH_GROUPS.map(({ id, label }, index) => {
    const container = new PIXI.Container();
    container.position.set(40 + index * 222, 20);
    container.eventMode = "static";
    container.cursor = "pointer";
    container.hitArea = new PIXI.Rectangle(0, 0, 210, 46);
    const bg = new PIXI.Graphics();
    const text = new PIXI.Text(label, { fontFamily: "Georgia", fontSize: 27, fontWeight: "bold", fill: 0x4e3524 });
    text.anchor.set(.5);
    text.position.set(105, 23);
    container.addChild(bg, text);
    container.on("pointerdown", (event) => event.stopPropagation());
    container.on("pointertap", (event) => { event.stopPropagation(); onToggleGroup?.(id); });
    root.addChild(container);
    return { id, container, bg, text };
  });
  let signature = null;
  return {
    update() {
      const active = getActiveGroups?.() ?? [];
      const next = active.join("|");
      if (signature === next) return;
      signature = next;
      for (const button of buttons) {
        const selected = active.includes(button.id);
        button.bg.clear().lineStyle(2, selected ? 0x6b4828 : 0x9c774a, .9)
          .beginFill(selected ? 0x513b2c : 0xd9b779, selected ? .98 : .5)
          .drawRoundedRect(0, 0, 210, 46, 4).endFill();
        button.bg.lineStyle(1, selected ? 0xd9b878 : 0xf4dba6, .8)
          .drawRoundedRect(3, 3, 204, 40, 3);
        button.text.style.fill = selected ? 0xffe6b5 : 0x4e3524;
      }
    },
    getButtons: () => buttons.map(({ id, container }) => {
      const point = container.toGlobal(new PIXI.Point(105, 23));
      return { id, x: point.x, y: point.y };
    }),
  };
}
