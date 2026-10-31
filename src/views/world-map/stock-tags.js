import { RESOURCE_ART_IDS } from '../chronicle-art.js';
import { addResourceIcon } from '../resource-cost-pixi.js';
import { MAP_VIEWPORT_RECT } from './constants.js';
import { stockProviderSlots, stockTraits } from '../../model/detailed-settlements/stock.js';
import { getDetailedStructureDef } from '../../model/game-config.js';

// Recipe roles, not current inventory or activation readiness. Charge event
// triggers are not Stock costs and must not appear as demand.
export function getSettlementStockTags(viewModel,{state,regionId}={}) {
  if (!viewModel) return [];
  const produced = new Set();
  const missing = new Set(),unhosted = new Set();
  const inputs = [];
  const holders=new Set((viewModel.practices??[]).filter(p=>p?.face?.category!=='influence'&&p?.face?.stockCapacity!==0).flatMap(p=>p?.face?.stockTraits??[]));
  const settlement=state?.world?.sites.find(s=>s.regionId===regionId)?.detailedState;
  const networks=new Map();
  for (const stock of viewModel.marketStocks ?? []) for (const trait of stock.traits) produced.add(trait);
  const pieces=[...(viewModel.practices??[]).map(piece=>({piece,structure:false})),...(viewModel.structures??[]).map(piece=>({piece,structure:true}))];
  for (const {piece,structure} of pieces) {
    const face = piece?.face;
    if (!face) continue;
    if (face.production?.some(output => output.icon === 'stock' && output.value > 0)) {
      for (const trait of face.stockTraits ?? []) produced.add(trait);
      const outputTraits=face.stockTraits?.length?face.stockTraits:['Stock'];
      for(const trait of outputTraits)if(!holders.has(trait))unhosted.add(trait);
    }
    const demands=structure&&!piece.construction
      ?(state&&piece.structureId?getDetailedStructureDef(state,piece.structureId)?.upkeep?.consume??[]:[])
      :face.inputs??[];
    for (const input of demands) {
      if (input.amount > 0 && input.traits?.length) inputs.push({alternatives:input.traits,face,allegiance:piece.allegiance});
    }
  }
  if (viewModel.population?.mealDemand > 0) inputs.push({alternatives:['Edible']});
  for (const {alternatives,face,allegiance} of inputs) {
    let sources=produced;
    if(settlement){
      const beneficiary=face?.category==='influence'?allegiance:undefined,key=beneficiary??'holder';
      if(!networks.has(key))networks.set(key,new Set(stockProviderSlots(state,settlement,false,{beneficiary}).flatMap(source=>stockTraits(state,source.slot))));
      sources=networks.get(key);
    }
    // Empty holders still represent a source: this is structural coverage,
    // not an inventory ticker. Actual allocated substitutions also qualify.
    const supplied=alternatives.some(trait=>sources.has(trait))||face?.providers?.some(p=>p.traits?.some(trait=>alternatives.includes(trait)));
    if(!supplied)for(const trait of alternatives)missing.add(trait);
  }
  return [...new Set([...missing,...unhosted])].sort().map(trait => {
    const producer = produced.has(trait), consumer = missing.has(trait);
    const id = `stock-${trait.toLowerCase()}`;
    return {
      trait,
      iconId: RESOURCE_ART_IDS.includes(id) ? id : 'stock',
      producer, consumer,
      outline: missing.has(trait)?'red':'amber',unhosted:unhosted.has(trait),
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
  return tags.map((tag, index) => {
    const row = Math.floor(index / columns);
    const count = Math.min(columns, tags.length - row * columns);
    return { ...tag, size,
      // Map-local icons share their settlement's camera transform. Fixed HUD
      // avoidance must not displace them into an unrelated region.
      x: point.x + (index % columns - (count - 1) / 2) * gap,
      y: top + row * gap,
    };
  });
}

export function addSettlementStockTags(parent, point, tags, { tooltipView, reference } = {}) {
  for (const tag of getSettlementStockTagLayout(tags, point)) {
    const root = new PIXI.Container();
    root.position.set(tag.x, tag.y);
    const plate = new PIXI.Graphics();
    if (tag.outline) plate.lineStyle(2.5, tag.outline === 'red' ? 0xf07970 : 0xe2b365, 1);
    plate.beginFill(0x101916, .88).drawRoundedRect(-17, -17, 34, 34, 5).endFill();
    root.addChild(plate);
    addResourceIcon(root, tag.iconId, 0, 0, tag.size);
    root.stockTag = tag;
    const role = tag.outline === 'red' ? 'Input has no eligible supply source'
      : 'Output has no local Stock holder';
    const spec = { title: `${reference} · ${tag.trait} Stock`, lines: [role,
      'Only supply problems appear on the map. Ordinary hosted and supplied Stock stays hidden.',
      'Sources include eligible adjacent road-connected holdings; Influence uses its own allegiance network.',
      'Empty holders still count as sources. Require and alternative inputs are included.'], maxWidth: 310 };
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
