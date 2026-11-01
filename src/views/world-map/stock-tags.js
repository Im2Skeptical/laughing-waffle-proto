import { RESOURCE_ART_IDS } from '../chronicle-art.js';
import { addResourceIcon } from '../resource-cost-pixi.js';
import { MAP_VIEWPORT_RECT } from './constants.js';
import { getDetailedStructureDef } from '../../model/game-config.js';
import {createMapStockCoverage,stockSourceKey} from './stock-coverage.js';

// Recipe roles, not current inventory or activation readiness. Charge event
// triggers are not Stock costs and must not appear as demand.
export function getSettlementStockTags(viewModel,{state,regionId,coverage}={}) {
  if (!viewModel) return [];
  const produced = new Set();
  const missing = new Set(),unhosted = new Set(),unused=new Set(),outputs=[];
  const inputs = [];
  const holders=new Set((viewModel.practices??[]).filter(p=>p?.face?.category!=='influence'&&p?.face?.stockCapacity!==0).flatMap(p=>p?.face?.stockTraits??[]));
  coverage??=state?createMapStockCoverage(state):null;
  for (const [index,stock] of (viewModel.marketStocks??[]).entries()){
    for(const trait of stock.traits)produced.add(trait);
    outputs.push({traits:stock.traits,index,structure:false});
  }
  const pieces=[...(viewModel.practices??[]).map((piece,index)=>({piece,index,structure:false})),...(viewModel.structures??[]).map(piece=>({piece,structure:true}))];
  for (const {piece,index,structure} of pieces) {
    const face = piece?.face;
    if (!face) continue;
    if (face.production?.some(output => output.icon === 'stock')||face.baseStockProduction?.some(output=>output.amount>0)) {
      const outputTraits=face.stockTraits?.length?face.stockTraits:['Stock'];
      for(const trait of outputTraits){produced.add(trait);if(!holders.has(trait))unhosted.add(trait);}
      outputs.push({traits:outputTraits,index,structure});
    }
    const demands=structure&&!piece.construction
      ?(state&&piece.structureId?getDetailedStructureDef(state,piece.structureId)?.upkeep?.consume??[]:[])
      :face.inputs??[];
    for (const input of demands) {
      if (input.amount > 0 && input.traits?.length) inputs.push({alternatives:input.traits,face,allegiance:piece.allegiance});
    }
  }
  if (viewModel.population?.mealDemand > 0) inputs.push({alternatives:['Edible']});
  if(coverage){
    for(const trait of coverage.missingByRegion.get(regionId)??[])missing.add(trait);
  }else for(const {alternatives} of inputs){
    if(!alternatives.some(trait=>holders.has(trait)))for(const trait of alternatives)missing.add(trait);
  }
  for(const output of outputs){
    // A multi-trait Stock unit is used if any of its traits can supply a recipe.
    const used=coverage&&!output.structure?coverage.usedSources.has(stockSourceKey(regionId,output.index)):
      inputs.some(input=>input.alternatives.some(trait=>output.traits.includes(trait)));
    if(!used)for(const trait of output.traits)unused.add(trait);
  }
  return [...new Set([...missing,...unhosted,...unused])].sort().map(trait => {
    const producer = produced.has(trait), consumer = missing.has(trait);
    const id = `stock-${trait.toLowerCase()}`;
    return {
      trait,
      iconId: RESOURCE_ART_IDS.includes(id) ? id : 'stock',
      producer, consumer,
      outline: missing.has(trait)?'red':unhosted.has(trait)?'amber':'green',unhosted:unhosted.has(trait),unused:unused.has(trait),
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
    if (tag.outline) plate.lineStyle(2.5, tag.outline === 'red' ? 0xf07970 : tag.outline==='green'?0x87d68a:0xe2b365, 1);
    plate.beginFill(0x101916, .88).drawRoundedRect(-17, -17, 34, 34, 5).endFill();
    root.addChild(plate);
    addResourceIcon(root, tag.iconId, 0, 0, tag.size);
    root.stockTag = tag;
    const role = tag.outline === 'red' ? 'Input has no eligible supply source'
      : tag.outline==='green'?'Produced Stock has no installed consumer in reach':'Output has no local Stock holder';
    const spec = { title: `${reference} · ${tag.trait} Stock`, lines: [role,
      'Green: unused production. Red: input with no source. Amber: output with no holder.',
      ...(tag.unhosted&&tag.outline!=='amber'?['A local output also has no Stock holder.']:[]),
      'Sources include eligible adjacent road-connected holdings; Influence uses its own allegiance network.',
      'Installed consumers count even when waiting on timing, Charge or other inputs. Empty holders still count as sources.',
      'Meals, Require, alternatives, active construction and upkeep count; finished construction costs do not.'], maxWidth: 340,scale:2 };
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
