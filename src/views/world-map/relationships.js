import { getRegionReference } from '../../model/world-state.js';
import { getDetailedSettlement, resolveDetailedRegionScope } from '../../model/detailed-settlements.js';
import { stockProviderSlots } from '../../model/detailed-settlements/stock.js';
import { createText, roundedRect } from '../settlement-view-primitives.js';
import { TEXT_STYLES } from '../settlement-theme.js';

export const RELATION_COLOURS = Object.freeze({ adjacent: 0x8cf0ba, connected: 0xc8adff });

// Read the viewed state's live roads and authoritative Stock provider selector.
// A multi-road connection describes reach, not permission to share Stock.
export function getMapRelationships(state, regionId, active) {
  if (!active) return null;
  const adjacentRegionIds = resolveDetailedRegionScope(state, regionId, { kind: 'adjacent' });
  const connectedRegionIds = resolveDetailedRegionScope(state, regionId, { kind: 'connectedComponent' });
  const settlement = getDetailedSettlement(state, regionId);
  const stockProviderRegionIds = settlement ? [...new Set(stockProviderSlots(state, settlement)
    .map(source => source.regionId).filter(id => id && id !== regionId))] : [];
  return {
    selectedRegionId: regionId,
    adjacentRegionIds,
    connectedRegionIds: connectedRegionIds.filter(id => !adjacentRegionIds.includes(id)),
    stockProviderRegionIds,
  };
}

export function getMapRelationship(relationships, regionId) {
  if (!relationships) return null;
  if (relationships.selectedRegionId === regionId) return 'selected';
  if (relationships.adjacentRegionIds.includes(regionId)) return 'adjacent';
  if (relationships.connectedRegionIds.includes(regionId)) return 'connected';
  return null;
}

export function drawRelationshipLine(graphics, from, to, kind, width = 4) {
  const colour = RELATION_COLOURS[kind];
  graphics.lineStyle(width, colour, 1);
  if (kind === 'adjacent') {
    graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
    return;
  }
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  for (let distance = 0; distance < length; distance += 18) {
    const start = distance / length, end = Math.min(length, distance + 10) / length;
    graphics.moveTo(from.x + (to.x - from.x) * start, from.y + (to.y - from.y) * start)
      .lineTo(from.x + (to.x - from.x) * end, from.y + (to.y - from.y) * end);
  }
}

export function addRelationshipBadge(parent, point, kind, stockProvider) {
  if (!RELATION_COLOURS[kind]) return;
  const label = `${kind === 'adjacent' ? 'Adjacent' : 'Connected'}${stockProvider ? ' · Stock' : ''}`;
  const text = createText(label, { ...TEXT_STYLES.chip, fontSize: 19, fill: RELATION_COLOURS[kind] }, point.x, point.y + 82, .5, .5);
  const plate = new PIXI.Graphics();
  plate.eventMode = text.eventMode = 'none';
  plate.label = `relationship-${kind}-badge`;
  roundedRect(plate, point.x - text.width / 2 - 10, point.y + 68, text.width + 20, 28, 6, 0x0c171b, RELATION_COLOURS[kind], 1.5);
  parent.addChild(plate, text);
}

export function addRelationshipLegend(parent, state, relationships) {
  const root = new PIXI.Container();
  root.label = 'settlement-reach-legend';
  root.eventMode = 'none';
  const refs = ids => ids.map(id => getRegionReference(state, id) ?? id).join(', ') || 'None';
  const lines = [
    ['adjacent', `Adjacent · ${refs(relationships.adjacentRegionIds)}`],
    ['connected', `Rest of connected group · ${refs(relationships.connectedRegionIds)}`],
  ];
  let y = 14;
  for (const [kind, label] of lines) {
    const sample = new PIXI.Graphics();
    drawRelationshipLine(sample, {x:16,y:y+15}, {x:62,y:y+15}, kind, 5);
    const text = createText(label, { ...TEXT_STYLES.body, fontSize: 25, lineHeight: 29, fill: RELATION_COLOURS[kind], wordWrap: true, wordWrapWidth: 792 }, 76, y);
    root.addChild(sample, text);
    y += text.height + 8;
  }
  const supply = createText(`Stock can draw from: ${refs(relationships.stockProviderRegionIds)}\nAdjacent = direct road. Rest of group = reachable via more roads.`,
    { ...TEXT_STYLES.body, fontSize: 23, lineHeight: 27, fill: 0xeeeece, wordWrap: true, wordWrapWidth: 852 }, 16, y);
  root.addChild(supply);
  const height = y + supply.height + 14;
  const plate = new PIXI.Graphics();
  roundedRect(plate, 0, 0, 884, height, 8, 0x0c171b, 0x526361, 2);
  root.addChildAt(plate, 0);
  root.position.set(32, 742 - height);
  parent.addChild(root);
  return {x:32, y:742-height, width:884, height};
}
