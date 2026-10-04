import { getAdjacentRegionIds, getConnectedRegionIds } from '../../model/world-state.js';
import { resolveDetailedRegionScope } from '../../model/detailed-settlements.js';

export const RELATION_COLOUR = 0xc8adff;

// Physical adjacency and a live direct road are independently required.
// Reaching a region through other roads does not qualify it for highlighting.
export function getMapRelationships(state, regionId, active) {
  if (!active) return null;
  const connected = getConnectedRegionIds(state, regionId);
  return {
    selectedRegionId: regionId,
    highlightedRegionIds: getAdjacentRegionIds(state, regionId).filter(id => connected.includes(id)),
    groupRegionIds: resolveDetailedRegionScope(state, regionId, {kind:'connectedComponent',includeHost:true}),
  };
}

export function getMapRelationship(relationships, regionId) {
  if (!relationships) return null;
  if (relationships.selectedRegionId === regionId) return 'selected';
  return relationships.highlightedRegionIds.includes(regionId) ? 'connected' : null;
}

export function drawRelationshipLine(graphics, from, to, width = 4) {
  graphics.lineStyle(width, RELATION_COLOUR, 1);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  for (let distance = 0; distance < length; distance += 18) {
    const start = distance / length, end = Math.min(length, distance + 10) / length;
    graphics.moveTo(from.x + (to.x - from.x) * start, from.y + (to.y - from.y) * start)
      .lineTo(from.x + (to.x - from.x) * end, from.y + (to.y - from.y) * end);
  }
}
