import { RESOURCE_ART_IDS } from '../chronicle-art.js';
import { addResourceIcon } from '../resource-cost-pixi.js';
import { CIVILIZATION_RECT, MAP_VIEWPORT_RECT } from './constants.js';

// Recipe roles, not current inventory or activation readiness. Charge event
// triggers are not Stock costs and must not appear as demand.
export function getSettlementStockTags(viewModel) {
  if (!viewModel) return [];
  const produced = new Set();
  const demanded = new Set();
  const inputs = [];
  for (const stock of viewModel.marketStocks ?? []) for (const trait of stock.traits) produced.add(trait);
  for (const piece of [...(viewModel.practices ?? []), ...(viewModel.structures ?? [])]) {
    const face = piece?.face;
    if (!face) continue;
    if (face.production?.some(output => output.icon === 'stock' && output.value > 0)) {
      for (const trait of face.stockTraits ?? []) produced.add(trait);
    }
    for (const input of face.inputs ?? []) {
      if (input.amount > 0 && input.traits?.length) inputs.push(input.traits);
    }
  }
  if (viewModel.population?.mealDemand > 0) inputs.push(['Edible']);
  for (const alternatives of inputs) {
    // A recipe needs any one of its alternatives. Show matching local sources
    // when present, rather than marking unused alternatives as missing imports.
    const local = alternatives.filter(trait => produced.has(trait));
    for (const trait of local.length ? local : alternatives) demanded.add(trait);
  }
  return [...new Set([...produced, ...demanded])].sort().map(trait => {
    const producer = produced.has(trait), consumer = demanded.has(trait);
    const id = `stock-${trait.toLowerCase()}`;
    return {
      trait,
      iconId: RESOURCE_ART_IDS.includes(id) ? id : 'stock',
      producer, consumer,
      outline: producer ? consumer ? null : 'green' : 'red',
    };
  });
}

export function getSettlementStockTagLayout(tags, point) {
  const gap = 36, size = 32;
  // Northern settlements have less headroom. Widen their row instead of
  // putting wrapped icons beneath the fixed header/viewport clipping edge.
  const availableRows = Math.max(1, 1 + Math.floor((point.y - 98 - 18 - MAP_VIEWPORT_RECT.y) / gap));
  const columns = Math.max(6, Math.ceil(tags.length / availableRows));
  const rows = Math.ceil(tags.length / columns);
  const top = point.y - 98 - (rows - 1) * gap;
  const left = point.x - (Math.min(columns, tags.length) - 1) * gap / 2 - 18;
  const drawerRight = CIVILIZATION_RECT.x + CIVILIZATION_RECT.width + 44;
  const offsetX = top - 18 < CIVILIZATION_RECT.y + CIVILIZATION_RECT.height
    ? Math.max(0, drawerRight + 4 - left) : 0;
  return tags.map((tag, index) => {
    const row = Math.floor(index / columns);
    const count = Math.min(columns, tags.length - row * columns);
    return { ...tag, size,
      x: point.x + offsetX + (index % columns - (count - 1) / 2) * gap,
      y: point.y - 98 - (rows - 1 - row) * gap,
    };
  });
}

export function addSettlementStockTags(parent, point, tags, { tooltipView, reference } = {}) {
  for (const tag of getSettlementStockTagLayout(tags, point)) {
    const root = new PIXI.Container();
    root.position.set(tag.x, tag.y);
    const plate = new PIXI.Graphics();
    if (tag.outline) plate.lineStyle(2.5, tag.outline === 'red' ? 0xf07970 : 0x87d68a, 1);
    plate.beginFill(0x101916, .88).drawRoundedRect(-17, -17, 34, 34, 5).endFill();
    root.addChild(plate);
    addResourceIcon(root, tag.iconId, 0, 0, tag.size);
    root.stockTag = tag;
    const role = tag.outline === 'red' ? 'Consumer with no local producer'
      : tag.outline === 'green' ? 'Producer with no local consumer' : 'Local producer and consumer';
    const spec = { title: `${reference} · ${tag.trait} Stock`, lines: [role,
      'Tags describe installed recipes and meal demand, regardless of current Stock.',
      'Red: needs a local source. Green: produced for use elsewhere. No outline: used locally.',
      'Require inputs count as demand; alternative inputs use a matching local tag when available.'], maxWidth: 310 };
    root.eventMode = 'static';
    root.cursor = 'help';
    root.hitArea = new PIXI.Rectangle(-18, -18, 36, 36);
    root.on('pointerover', () => tooltipView?.show?.(spec, root.getBounds(), { dismissOnExit: true }));
    root.on('pointerout', () => tooltipView?.hide?.());
    root.on('pointerdown', event => {
      event.stopPropagation();
      tooltipView?.pin?.(spec, root.getBounds(), `stock-tag:${reference}:${tag.trait}`);
    });
    parent.addChild(root);
  }
}
