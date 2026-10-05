import { createLabFixture, fiveSlots, practiceSlot } from './fixtures.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { getCurrentLifeMapVassal, enterVassalLifeNode } from '../vassal-life-map.js';
import { VASSAL_NODE_FAMILIES, VASSAL_SIGNATURE_NODE_VARIANTS } from '../../defs/gamepieces/vassal-life-map-defs.js';

export const LAB_NODE_TYPES = Object.freeze([
  ...Object.values(VASSAL_NODE_FAMILIES).filter(node => !['signature', 'settlement', 'philosopherFounding', 'warlordFounding'].includes(node.id)).map(node => [node.id, node.label]),
  ...Object.values(VASSAL_SIGNATURE_NODE_VARIANTS).map(node => [`signature:${node.id}`, node.label]),
]);
export const LAB_NODE_DEFAULTS = Object.freeze({ type:'practiceReform', classId:'scholar', seed:42, research:0, prestige:100, age:18,
  effectiveness:4, intelligence:4, cunning:4, wisdom:4 });

// An authored, disposable fixture. Only the content RNG is reseeded: changing
// the refresh seed keeps the settlement, portrait and Life Map identical.
export function createLabNodeSandbox(options = {}) {
  const settings = { ...LAB_NODE_DEFAULTS, ...options };
  if (!LAB_NODE_TYPES.some(([id]) => id === settings.type)) throw new Error('Choose a node type');
  if (!['scholar','warrior','unclassed'].includes(settings.classId)) throw new Error('Choose a dummy class');
  for (const key of ['seed','research','prestige','age','effectiveness','intelligence','cunning','wisdom']) {
    const max = key === 'seed' ? 4294967295 : key === 'research' ? Number.MAX_SAFE_INTEGER : key === 'prestige' ? 10000 : 100;
    if (!Number.isInteger(settings[key]) || settings[key] < 0 || settings[key] > max) throw new Error(`${key} must be an integer from 0 to ${max}`);
  }
  const state = createLabFixture(settings.classId === 'warrior' ? 'warrior' : 'scholar', 42);
  state.civilization.research.total = settings.research;
  const vassal = getCurrentLifeMapVassal(state);
  const settlement = state.world.sites.find(site => site.regionId === vassal.locationRegionId).detailedState;
  settlement.practiceSlots = fiveSlots(practiceSlot('forage',2),practiceSlot('barter',4),practiceSlot('logging',2),practiceSlot('surfaceMining',2),practiceSlot('bowmaking',2));
  vassal.name = 'Gym Dummy';
  vassal.classId = settings.classId === 'unclassed' ? null : settings.classId;
  vassal.prestige = settings.prestige;
  vassal.initialAge = settings.age;
  for (const key of ['effectiveness','intelligence','cunning','wisdom']) vassal.stats[key] = settings[key];
  const graph = vassal.lifeMap.graph;
  const variant = VASSAL_SIGNATURE_NODE_VARIANTS[settings.type.split(':')[1]];
  const family = variant ? variant.id === 'legacyPlus' ? 'legacy' : 'signature' : settings.type;
  let node = graph.nodes.find(node => node.family === family);
  if (!node) node = graph.nodes.find(node => node.family !== 'legacy' && !node.signatureNode
    && !graph.edges.some(edge => (edge.fromNodeId === node.id && graph.nodes.find(n => n.id === edge.toNodeId)?.family === family)
      || (edge.toNodeId === node.id && graph.nodes.find(n => n.id === edge.fromNodeId)?.family === family)));
  node.family = family;
  node.signatureNode = variant ? { ...variant, variantId:variant.id } : null;
  vassal.lifeMap.availableNodeIds = [node.id];
  state.rng.vassalSeed = settings.seed;
  state.rng.vassalDevelopmentSeed = settings.seed;
  const entered = enterVassalLifeNode(state, node.id);
  if (!entered.ok) throw new Error(entered.reason);
  return { settings, nodeId:node.id, state:deserializeGameState(serializeGameState(state)) };
}
