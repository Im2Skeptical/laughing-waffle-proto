// Experimental encounter data. Never read by player New Game or saved runs.
import { VASSAL_STAT_IDS } from '../../../src/defs/gamepieces/vassal-life-map-defs.js';
import { VASSAL_HEIRLOOM_DEFS } from '../../../src/defs/gamepieces/vassal-heirloom-defs.js';
import { MOON_PHASE_COUNT } from '../../../src/defs/gamesettings/moon-phase-defs.js';
import { getGameSetting } from '../../../src/model/game-config.js';
import { worldMapDefs } from '../../../src/defs/world/world-map-defs.js';
export const OPENING_KINDS = ['relic', 'world', 'founding', 'shop', 'development', 'martial', 'supply', 'patronage', 'specialRelic', 'customNote'];

const phasesPerYear = getGameSetting(null, 'seasonDurationSec') * 4 / getGameSetting(null, 'phaseDurationSec');
const worldRegions = worldMapDefs.riverBasin01.regions;
export function createOpeningWorldCosts() {
  return { movePhaseCost: 3 * MOON_PHASE_COUNT, routePhaseCost: 5 * phasesPerYear, routePrestigeCost: 15,
    travelPrestigeByRegion: Object.fromEntries(worldRegions.map((region, i) => [region.id, [3, 6, 9][i % 3]])) };
}

export function applyOpeningWorldPrices(node) {
  const priced = { ...node, worldCosts: createOpeningWorldCosts(), options: (node.options ?? []).map(option =>
    option.id === 'tour' ? { ...option, phaseCost: 2 * phasesPerYear } : option) };
  delete priced.phaseCost;
  return priced;
}

export function createOpeningTourOption(relicChance = 25) {
  return { id: 'tour', label: 'Tour the current region', phaseCost: 2 * phasesPerYear, weightedOutcomes: [
    { weight: relicChance, options: Object.values(VASSAL_HEIRLOOM_DEFS).filter(d => d.quality === 'bronze').map(d => ({ definitionId: d.id })) },
    { weight: 100 - relicChance, options: VASSAL_STAT_IDS.map(statId => ({ statId, statDelta: 1 })) },
  ] };
}

export function createOpeningExperiment() {
  return {
    schemaVersion: 1, name: 'Warrior opening · first draft', seed: 42,
    entryIds: ['relic', 'explore'],
    nodes: [
      { id: 'relic', title: 'An heirloom on the road', kind: 'relic',
        description: 'A small discovery shapes the person who will found the Warriors. Ordinary relics have no direct death roll.', next: ['founding'],
        relics: [
          { definitionId: 'minorSeal', phaseCost: 6, prestigeCost: 0, chaos: 0 },
          { definitionId: 'tutorsNotebook', phaseCost: 8, prestigeCost: 0, chaos: 0 },
          { definitionId: 'hourglass', phaseCost: 6, prestigeCost: 0, chaos: 10 },
        ] },
      { id: 'explore', title: 'Choose your foothold', kind: 'world',
        description: 'Move to another settlement, build a route, or tour this region for an ordinary relic or a random ability gain.', next: ['founding'],
        worldCosts: createOpeningWorldCosts(), options: [createOpeningTourOption()] },
      { id: 'founding', title: 'Establish the Warriors', kind: 'founding',
        description: 'Both routes converge here. Train ten existing adults; Prestige now sustains your Retinue.', phaseCost: 6, next: ['shop'] },
      { id: 'shop', title: 'Make your first investment', kind: 'shop',
        description: 'Buy a useful Practice or keep Prestige for your Retinue. Purchases still use the real five-slot settlement board.', next: ['development'],
        cards: [
          { kind: 'practice', definitionId: 'herdingTrain', prestigeCost: 10, phaseCost: 12 },
          { kind: 'practice', definitionId: 'logging', prestigeCost: 10, phaseCost: 12 },
          { kind: 'practice', definitionId: 'barter', prestigeCost: 10, phaseCost: 12 },
        ], pass: { id: 'save', label: 'Keep Prestige for the Retinue', phaseCost: 2, prestigeDelta: 1 } },
      { id: 'development', title: 'Prepare for what comes next', kind: 'development',
        description: 'Compare personal Force with the nearby targets. Development should change an upcoming decision.', next: ['martial'],
        options: [
          { id: 'drill', label: 'Quick martial drilling', statId: 'intelligence', statDelta: 1, phaseCost: 6 },
          { id: 'train', label: 'Dedicated martial training', statId: 'intelligence', statDelta: 2, phaseCost: 18 },
          { id: 'organize', label: 'Learn to organize work', statId: 'effectiveness', statDelta: 1, phaseCost: 6 },
        ] },
      { id: 'martial', title: 'Test the new host', kind: 'martial',
        description: 'Legal Campaigns and real crisis responses appear here. Drilling is a useful alternative when no target is ready.', next: ['supply'],
        options: [{ id: 'readiness', label: 'Drill for the next encounter', statId: 'intelligence', statDelta: 1, phaseCost: 8 }] },
      { id: 'supply', title: 'Support the emerging economy', kind: 'supply', stockOutput: 'auto',
        description: 'Prefer an unmet recipe input; otherwise offer a seeded output. Producing a trait does not guarantee the recipe can run.', next: ['favor'],
        pass: { id: 'supply-favor', label: 'Seek support instead', prestigeDelta: 3, phaseCost: 4 } },
      { id: 'favor', title: 'An easy opportunity', kind: 'patronage',
        description: 'A modest benefit is a valid step. This completes the authored opening experiment.', next: [],
        options: [
          { id: 'favor', label: 'Accept local goodwill', prestigeDelta: 5, phaseCost: 2 },
          { id: 'office', label: 'Take a longer appointment', prestigeDelta: 12, phaseCost: 12 },
        ] },
    ],
  };
}

const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
export function validateOpeningExperiment(doc) {
  if (!doc || doc.schemaVersion !== 1 || typeof doc.name !== 'string' || !doc.name.trim()
      || !Number.isInteger(doc.seed) || !finite(doc.seed, 0, 4294967295)
      || !Array.isArray(doc.nodes) || doc.nodes.length < 2 || doc.nodes.length > 24
      || !Array.isArray(doc.entryIds) || !doc.entryIds.length) throw new Error('Choose a name, unsigned seed and 2–24 nodes in a version-1 experiment.');
  const ids = new Set();
  const occupiedCells = new Set();
  for (const node of doc.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(node.id) || ids.has(node.id)
        || !OPENING_KINDS.includes(node.kind) || typeof node.title !== 'string' || !node.title.trim()
        || typeof node.description !== 'string' || !Array.isArray(node.next) || new Set(node.next).size !== node.next.length) throw new Error('Each node needs a unique ID, title, description, kind and next-node list.');
    ids.add(node.id);
    if (node.editorPosition != null) {
      const { column, row } = node.editorPosition;
      if (!Number.isInteger(column) || !Number.isInteger(row) || !finite(column, 0, 47) || !finite(row, 0, 47)) throw new Error(`${node.title}: choose a column and row from 1 to 48.`);
      const key = `${column}:${row}`;
      if (occupiedCells.has(key)) throw new Error(`${node.title}: two nodes occupy the same grid cell.`);
      occupiedCells.add(key);
    }
    if (node.displayLabel != null && typeof node.displayLabel !== 'string') throw new Error(`${node.title}: the game-screen label must be text.`);
    if (node.phaseCost != null && !finite(node.phaseCost, 0, 320)) throw new Error(`${node.title}: phases must be between 0 and 320.`);
    if (node.worldCosts != null) {
      const costs = node.worldCosts;
      if (!costs || typeof costs !== 'object' || Array.isArray(costs)
          || !finite(costs.movePhaseCost, 0, 320) || !finite(costs.routePhaseCost, 0, 320)
          || !finite(costs.routePrestigeCost, 0, 10000)
          || !costs.travelPrestigeByRegion || typeof costs.travelPrestigeByRegion !== 'object' || Array.isArray(costs.travelPrestigeByRegion)
          || Object.entries(costs.travelPrestigeByRegion).some(([id, value]) => !worldRegions.some(region => region.id === id) || !Number.isInteger(value) || !finite(value, 0, 10000))) {
        throw new Error(`${node.title}: world prices need valid phase costs, a Prestige cost and non-negative destination rewards.`);
      }
    }
    if (node.stockOutput != null && typeof node.stockOutput !== 'string') throw new Error(`${node.title}: choose a Stock output.`);
    for (const list of ['options', 'relics', 'cards']) {
      if (node[list] != null && (!Array.isArray(node[list]) || node[list].length > 12)) throw new Error(`${node.title}: ${list} must be a list of at most 12 offers.`);
      const keys = new Set();
      for (const item of node[list] ?? []) {
        const key = item?.id ?? item?.definitionId;
        if (typeof key !== 'string' || !key || keys.has(key)) throw new Error(`${node.title}: offers need unique IDs.`);
        keys.add(key); validateOffer(item, node.title);
      }
    }
    if (node.pass != null) validateOffer(node.pass, node.title);
    if (node.kind === 'founding' && node.relics?.length) throw new Error('Founding cannot contain relic offers.');
  }
  if (doc.nodes.filter(n => n.kind === 'founding').length !== 1) throw new Error('Keep exactly one founding convergence point.');
  if (new Set(doc.entryIds).size !== doc.entryIds.length || [...doc.entryIds, ...doc.nodes.flatMap(n => n.next)].some(id => !ids.has(id))) throw new Error('Entry and next-node links must reference existing nodes.');
  const reached = new Set(), visiting = new Set(), checked = new Set();
  const visit = (id, founded) => {
    const node = doc.nodes.find(n => n.id === id), key = `${id}:${founded}`;
    if (visiting.has(id)) throw new Error(`The opening graph cannot contain a cycle. A route loops back to "${node.title}".`);
    if (checked.has(key)) return;
    visiting.add(id); reached.add(id);
    const nextFounded = founded || node.kind === 'founding';
    if (!nextFounded && !node.next.length) throw new Error(`Every entry path must reach founding. "${node.title}" currently ends before founding.`);
    if (!nextFounded && (node.kind === 'specialRelic' || [...(node.options ?? []), ...(node.relics ?? [])].some(o => (o.immediateDeathChance ?? 0) > 0))) throw new Error('Pre-founding encounters must have no direct death risk.');
    for (const next of node.next) visit(next, nextFounded);
    visiting.delete(id); checked.add(key);
  };
  doc.entryIds.forEach(id => visit(id, false));
  if (reached.size !== ids.size) throw new Error(`Every authored node must be reachable from an entry. Connect or remove: ${doc.nodes.filter(n => !reached.has(n.id)).map(n => n.title).join(', ')}.`);
  return structuredClone(doc);
}

function validateOffer(item, title) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${title}: malformed offer.`);
  for (const [key, min, max] of [['phaseCost', 0, 320], ['prestigeCost', 0, 10000], ['prestigeDelta', -10000, 10000], ['chaos', 0, 1000], ['statDelta', -10, 10], ['immediateDeathChance', 0, 1]]) {
    if (item[key] != null && !finite(item[key], min, max)) throw new Error(`${title}: ${key} must be between ${min} and ${max}.`);
  }
  if (item.statId != null && !['cunning', 'wisdom', 'effectiveness', 'intelligence'].includes(item.statId)) throw new Error(`${title}: choose a recognized ability.`);
  if (item.kind != null && !['practice', 'structure'].includes(item.kind)) throw new Error(`${title}: cards must be Practices or Structures.`);
  if (item.weightedOutcomes != null) {
    if (!Array.isArray(item.weightedOutcomes) || !item.weightedOutcomes.length || item.weightedOutcomes.length > 12
        || !item.weightedOutcomes.some(bucket => bucket.weight > 0)) throw new Error(`${title}: random outcomes need positive total weight.`);
    for (const bucket of item.weightedOutcomes) {
      if (!finite(bucket.weight, 0, 10000) || !Array.isArray(bucket.options) || !bucket.options.length || bucket.options.length > 24) throw new Error(`${title}: each outcome needs a weight and reward pool.`);
      for (const reward of bucket.options) {
        if(reward && Object.keys(reward).some(key=>!['definitionId','statId','statDelta'].includes(key))) throw new Error(`${title}: random rewards contain only a relic ID or an ability gain.`);
        if (!reward || reward.weightedOutcomes || (!reward.definitionId && !reward.statId)) throw new Error(`${title}: rewards must name a relic or ability.`);
        if (reward.definitionId && (!VASSAL_HEIRLOOM_DEFS[reward.definitionId] || VASSAL_HEIRLOOM_DEFS[reward.definitionId].quality !== 'bronze')) throw new Error(`${title}: random finds use ordinary Bronze relics.`);
        if (reward.statId && (!VASSAL_STAT_IDS.includes(reward.statId) || !Number.isInteger(reward.statDelta) || reward.statDelta < 1 || reward.statDelta > 10)) throw new Error(`${title}: random ability rewards need a positive gain.`);
        if (reward.definitionId && reward.statId) throw new Error(`${title}: choose a relic or an ability per reward.`);
      }
    }
  }
}
