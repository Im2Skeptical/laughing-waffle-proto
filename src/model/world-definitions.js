import { worldMapDefs } from '../defs/world/world-map-defs.js';
import { getRegionalMap } from './regional-map/definition.js';

export function getWorldDefinitionById(id) {
  return worldMapDefs[id] ?? getRegionalMap(id)?.definition ?? null;
}
