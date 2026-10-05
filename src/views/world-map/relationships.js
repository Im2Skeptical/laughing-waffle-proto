import { getAdjacentRegionIds, getConnectedRegionIds } from '../../model/world-state.js';

export const RELATION_COLOUR = 0xc8adff;
export const RELATION_STYLES = Object.freeze({
  allied: Object.freeze({kind:'allied', colour:RELATION_COLOUR, width:6, alpha:1, fillAlpha:.14, dashLength:null, gapLength:0, innerColour:0xebdeff, priority:3}),
  neutral: Object.freeze({kind:'neutral', colour:RELATION_COLOUR, width:4.5, alpha:.95, fillAlpha:.09, dashLength:16, gapLength:8, priority:2}),
  empty: Object.freeze({kind:'empty', colour:RELATION_COLOUR, width:3, alpha:.7, fillAlpha:.035, dashLength:3, gapLength:13, priority:1}),
  hostile: Object.freeze({kind:'hostile', colour:0xe77a86, width:6, alpha:1, fillAlpha:.1, dashLength:null, gapLength:0, innerColour:0xffd5ca, priority:4}),
});

export function getRelationshipStyle(indicator = {}) {
  if (indicator.monster) return RELATION_STYLES.hostile;
  if (indicator.hasDetailedSettlement && indicator.controller === 'player') return RELATION_STYLES.allied;
  if (indicator.neutral || indicator.hasDetailedSettlement) return RELATION_STYLES.neutral;
  return RELATION_STYLES.empty;
}

// Physical adjacency and a live direct road are independently required.
// Reaching a region through other roads does not qualify it for highlighting or framing.
export function getMapRelationships(state, regionId, active) {
  if (!active) return null;
  const connected = getConnectedRegionIds(state, regionId);
  const highlightedRegionIds = getAdjacentRegionIds(state, regionId).filter(id => connected.includes(id));
  return {
    selectedRegionId: regionId,
    highlightedRegionIds,
    groupRegionIds: [regionId, ...highlightedRegionIds],
  };
}

export function getMapRelationship(relationships, regionId) {
  if (!relationships) return null;
  if (relationships.selectedRegionId === regionId) return 'selected';
  return relationships.highlightedRegionIds.includes(regionId) ? 'connected' : null;
}

export function drawRelationshipLine(graphics, from, to, style = RELATION_STYLES.empty) {
  graphics.lineStyle(style.width, style.colour, style.alpha);
  if (style.dashLength == null) {
    graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
    return;
  }
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  for (let distance = 0; distance < length; distance += style.dashLength + style.gapLength) {
    const start = distance / length, end = Math.min(length, distance + style.dashLength) / length;
    graphics.moveTo(from.x + (to.x - from.x) * start, from.y + (to.y - from.y) * start)
      .lineTo(from.x + (to.x - from.x) * end, from.y + (to.y - from.y) * end);
  }
}
