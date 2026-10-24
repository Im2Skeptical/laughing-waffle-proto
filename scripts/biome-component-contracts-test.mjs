// Membership contract for biome Output Multipliers.
// Pause/phase policy: no ticks and no pause. createNewGameState leaves
// paused false and phase "simulation". Queries must leave both, the RNG
// JSON, and the full serialized GameState unchanged. The river-basin
// literal and the six-region fixture are not GameStates.
// Membership and source regionIds are compared as sorted copies. Production
// arrays and serialized GameState are not reordered. Walk order and source
// labels are not asserted. The corner fixture is written onto regional-v1:3
// before either geometry cache is filled, then restored. worldMapDefs is frozen.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {getRegionalMap, regionalMapId} from '../src/model/regional-map/definition.js';
import {worldMapDefs} from '../src/defs/world/world-map-defs.js';
import {BIOME_MULTIPLIER_RULES} from '../src/defs/world/biome-multiplier-rules.js';
import {contiguousBiomeRegions} from '../src/model/detailed-settlements/biome-multipliers.js';
import {stockOutputBreakdown} from '../src/model/detailed-settlements/stock.js';
import {serializeGameState, deserializeGameState} from '../src/model/state.js';
import {practiceSlot} from '../src/model/dev-lab/fixtures.js';

const RULES = [
  {biome:'plains', kind:'outputMultiplier', query:{traitsAny:['Grain']}, amountPerRegion:1, practices:['dryFarming', 'milling']},
  {biome:'mountains', kind:'outputMultiplier', query:{traitsAny:['Stone']}, amountPerRegion:1, practices:['quarrying']},
  {biome:'forest', kind:'outputMultiplier', query:{traitsAny:['Construction']}, amountPerRegion:1, practices:['logging', 'carpentry', 'masonry', 'quarrying']},
];
const PRACTICES = ['dryFarming', 'milling', 'forage', 'quarrying', 'logging', 'carpentry'];
const SEEDS = [1, 42, 1867, 4294967295];
const MAINLAND = ['black-marsh', 'cedar-woods', 'copper-basin', 'east-steppe', 'high-pass', 'iron-hills', 'lake-country', 'obsidian-ridge', 'reed-delta', 'river-crown', 'salt-coast', 'southern-savanna', 'upper-floodplain', 'west-levee'];
const counts = {regionCases:0, scopeChecks:0, cacheChecks:0, singletons:0, generatedCornerPairs:0, mixedControllerComponents:0};
const edgeKey = (a, b) => [String(a), String(b)].sort().join('|');
const sorted = ids => [...ids].sort();

function authoredEdges(definition) {
  const regions = definition.regions;
  const edges = regions.map(region => {
    const ids = region.polygonVertexIds ?? [];
    const keys = new Set();
    for (let i = 0; i < ids.length; i++) keys.add(edgeKey(ids[i], ids[(i + 1) % ids.length]));
    return keys;
  });
  const neighbours = new Map(regions.map(region => [region.id, []]));
  let cornerPairs = 0;
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    let shared = false;
    for (const key of edges[i]) if (edges[j].has(key)) { shared = true; break; }
    if (shared) {
      neighbours.get(regions[i].id).push(regions[j].id);
      neighbours.get(regions[j].id).push(regions[i].id);
    } else if ((regions[i].polygonVertexIds ?? []).some(vertex => (regions[j].polygonVertexIds ?? []).includes(vertex))) cornerPairs++;
  }
  return {neighbours, cornerPairs};
}

function expectedComponents(definition, neighbours) {
  const biome = new Map(definition.regions.map(region => [region.id, region.biome]));
  const seen = new Set(), out = new Map();
  for (const start of definition.regions.map(region => region.id)) {
    if (seen.has(start)) continue;
    const ids = [], queue = [start];
    seen.add(start);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor];
      ids.push(id);
      for (const next of neighbours.get(id) ?? []) {
        if (!seen.has(next) && biome.get(next) === biome.get(start)) { seen.add(next); queue.push(next); }
      }
    }
    const members = sorted(ids);
    for (const id of ids) out.set(id, members);
  }
  return out;
}

function readScope(state, regionId, practiceId) {
  const settlement = {practiceSlots:[practiceSlot(practiceId)], structureSlots:[]};
  state.world.sites.push({regionId, detailedState:settlement, simulationMode:'detailed'});
  try {
    const breakdown = stockOutputBreakdown(state, settlement, settlement.practiceSlots[0]);
    return {
      multiplier: breakdown.multiplier,
      sources: breakdown.sources.map(source => ({
        id: source.id, amount: source.amount, trait: source.query?.traitsAny?.[0] ?? null, regionIds: sorted(source.regionIds ?? []),
      })),
    };
  } finally {
    state.world.sites.pop();
  }
}

function expectedScope(biome, members, practice) {
  const rule = RULES.find(entry => entry.biome === biome && entry.practices.includes(practice));
  if (!rule) return {multiplier:1, sources:[]};
  const regionIds = sorted(members);
  return {multiplier:1 + regionIds.length, sources:[{id:`biome:${biome}`, amount:regionIds.length, trait:rule.query.traitsAny[0], regionIds}]};
}

function checkRegions(state, definition, expected) {
  const controllers = new Map(state.world.regions.map(region => [region.id, region.controller]));
  const seen = new Set();
  for (const region of definition.regions) {
    const actual = contiguousBiomeRegions(state, region.id);
    const members = expected.get(region.id);
    counts.regionCases++;
    assert.deepEqual(sorted(actual), members, `${definition.id} ${region.id} members`);
    if (members.length === 1) counts.singletons++;
    if (!seen.has(actual)) {
      seen.add(actual);
      counts.cacheChecks++;
      for (const id of actual) assert.equal(contiguousBiomeRegions(state, id), actual, `${definition.id} shared component object`);
      if (actual.length > 1 && new Set([...actual].map(id => controllers.get(id))).size > 1) counts.mixedControllerComponents++;
    }
    for (const practice of PRACTICES) {
      counts.scopeChecks++;
      assert.deepEqual(readScope(state, region.id, practice), expectedScope(region.biome, members, practice), `${definition.id} ${region.id} ${practice}`);
    }
  }
}

assert.deepEqual(BIOME_MULTIPLIER_RULES.map(({biome, kind, query, amountPerRegion}) => ({biome, kind, query, amountPerRegion})), RULES.map(({practices, ...rule}) => rule));
const states = new Map();
for (const seed of SEEDS) {
  const state = createNewGameState(seed);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'simulation');
  // Ownership and roads are fixed before the first component read.
  state.world.regions.forEach((region, index) => { region.controller = index % 2 === 0 ? 'player' : 'external-b'; });
  state.world.connections = [];
  const rng = JSON.stringify(state.rng);
  const saved = JSON.stringify(serializeGameState(state));
  const definition = getRegionalMap(regionalMapId(seed)).definition;
  const geometry = authoredEdges(definition);
  counts.generatedCornerPairs += geometry.cornerPairs;
  assert.equal(geometry.cornerPairs, 0, `seed ${seed} has a corner-only pair; the fixture owns that case`);
  const expected = expectedComponents(definition, geometry.neighbours);
  if (seed === 1867) assert.deepEqual({R01:expected.get('R01'), R02:expected.get('R02'), R03:expected.get('R03')}, {R01:['R01', 'R04'], R02:['R02', 'R05', 'R13'], R03:['R03']});
  checkRegions(state, definition, expected);
  assert.equal(JSON.stringify(state.rng), rng, `seed ${seed} rng`);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'simulation');
  assert.equal(JSON.stringify(serializeGameState(state)), saved, `seed ${seed} serialized state`);
  states.set(seed, state);
}
assert.ok(counts.singletons > 0);
assert.ok(counts.mixedControllerComponents > 0);
assert.notDeepEqual(sorted(contiguousBiomeRegions(states.get(42), 'R01')), sorted(contiguousBiomeRegions(states.get(1), 'R01')), 'seed 42 must not reuse seed 1');
const shadow = {world:{definitionId:states.get(1).world.definitionId, sites:[], regions:[{id:'R01', controller:'external-b'}], connections:[{regionAId:'R01', regionBId:'R07'}]}};
assert.equal(contiguousBiomeRegions(shadow, 'R01'), contiguousBiomeRegions(states.get(1), 'R01'), 'same definition shares the cache across ownership and roads');
const reloaded = deserializeGameState(serializeGameState(states.get(1)));
assert.equal(reloaded.paused, false);
assert.equal(reloaded.phase, 'simulation');
assert.deepEqual(sorted(contiguousBiomeRegions(reloaded, 'R01')), sorted(contiguousBiomeRegions(states.get(1), 'R01')));
assert.deepEqual(readScope(reloaded, 'R01', 'dryFarming'), readScope(states.get(1), 'R01', 'dryFarming'));
const configured = {world:{definitionId:regionalMapId(1867), sites:[], regions:[], connections:[]}, gameConfig:{gamepieces:{practices:{dryFarming:{stockTraits:['Edible']}}}}};
assert.deepEqual(sorted(contiguousBiomeRegions(configured, 'R01')), ['R01', 'R04']);
counts.scopeChecks++;
assert.deepEqual(readScope(configured, 'R01', 'dryFarming'), {multiplier:1, sources:[]}, 'trait override drops Grain without changing members');

const fixtureId = regionalMapId(3);
const fixtureDef = getRegionalMap(fixtureId).definition;
const fixtureHash = createHash('sha256').update(JSON.stringify(fixtureDef)).digest('hex');
const savedRegions = fixtureDef.regions.slice(0, 6).map(region => ({region, biome:region.biome, polygon:region.polygonVertexIds}));
const names = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06'];
assert.deepEqual(savedRegions.map(entry => entry.region.id), names);
const polygons = {R01:['fa', 'fb', 'fc'], R02:['fb', 'fd', 'fc'], R03:['fc', 'fd', 'fe'], R04:['fc', 'fe', 'ff'], R05:['fg', 'fh', 'fi'], R06:['fj', 'fk', 'fl']};
const biomes = {R01:'plains', R02:'plains', R03:'forest', R04:'plains', R05:'plains', R06:'mountains'};
const standIn = {regions:names.map(id => ({id, biome:biomes[id], polygonVertexIds:polygons[id]}))};
const fixtureGeometry = authoredEdges(standIn);
const fixtureExpected = expectedComponents(standIn, fixtureGeometry.neighbours);
assert.equal(standIn.regions[0].polygonVertexIds.some(vertex => standIn.regions[3].polygonVertexIds.includes(vertex)), true);
assert.equal(fixtureGeometry.neighbours.get('R01').includes('R04'), false);
assert.deepEqual(sorted(fixtureGeometry.neighbours.get('R01')), ['R02']);
assert.deepEqual(fixtureExpected.get('R01'), ['R01', 'R02']);
assert.deepEqual(fixtureExpected.get('R04'), ['R04']);
const fixtureState = {world:{definitionId:fixtureId, sites:[], regions:names.map(id => ({id, controller:'external-a'})), connections:[]}};
try {
  for (const entry of savedRegions) {
    entry.region.biome = biomes[entry.region.id];
    entry.region.polygonVertexIds = polygons[entry.region.id];
  }
  counts.regionCases++;
  assert.deepEqual(sorted(contiguousBiomeRegions(fixtureState, 'R01')), ['R01', 'R02'], 'fixture plains R01 members exclude corner-only R04');
  counts.regionCases++;
  assert.deepEqual(sorted(contiguousBiomeRegions(fixtureState, 'R04')), ['R04'], 'fixture plains R04 stays a singleton beside the R01-R02 edge');
  for (const id of names) {
    if (id !== 'R01' && id !== 'R04') {
      counts.regionCases++;
      assert.deepEqual(sorted(contiguousBiomeRegions(fixtureState, id)), fixtureExpected.get(id), `fixture ${id} members`);
    }
    for (const practice of PRACTICES) {
      counts.scopeChecks++;
      assert.deepEqual(readScope(fixtureState, id, practice), expectedScope(biomes[id], fixtureExpected.get(id), practice), `fixture ${id} ${practice}`);
    }
  }
  fixtureState.world.connections = [{regionAId:'R01', regionBId:'R04'}];
  fixtureState.world.regions.find(region => region.id === 'R02').controller = 'player';
  assert.deepEqual(sorted(contiguousBiomeRegions(fixtureState, 'R01')), ['R01', 'R02'], 'fixture plains R01 members exclude corner-only R04');
  assert.deepEqual(sorted(contiguousBiomeRegions(fixtureState, 'R04')), ['R04'], 'fixture plains R04 stays a singleton beside the R01-R02 edge');
} finally {
  for (const entry of savedRegions) {
    entry.region.biome = entry.biome;
    entry.region.polygonVertexIds = entry.polygon;
  }
}
const restoredHash = createHash('sha256').update(JSON.stringify(fixtureDef)).digest('hex');
assert.equal(restoredHash, fixtureHash);

const basinEdges = authoredEdges(worldMapDefs.riverBasin01);
const basinExpected = expectedComponents(worldMapDefs.riverBasin01, basinEdges.neighbours);
const basinState = {world:{definitionId:'riverBasin01', sites:[], regions:[], connections:[]}};
assert.ok(basinEdges.cornerPairs >= 10);
assert.equal(basinEdges.neighbours.get('iron-hills').includes('upper-floodplain'), false);
assert.deepEqual(basinExpected.get('cedar-woods'), MAINLAND);
assert.equal(basinExpected.get('iron-hills'), basinExpected.get('upper-floodplain'));
counts.regionCases += 2;
assert.deepEqual(sorted(contiguousBiomeRegions(basinState, 'cedar-woods')), MAINLAND, 'riverBasin01 mainland members');
assert.deepEqual(sorted(contiguousBiomeRegions(basinState, 'outer-isles')), ['outer-isles'], 'riverBasin01 outer-isles members');
counts.scopeChecks += 2;
assert.deepEqual(readScope(basinState, 'cedar-woods', 'dryFarming'), {multiplier:1, sources:[]});
assert.deepEqual(readScope(basinState, 'outer-isles', 'logging'), {multiplier:1, sources:[]});

const summary = {
  command:'node scripts/biome-component-contracts-test.mjs',
  head:'ed68e0ebc57f27d21c8af09d89f3ab8cf675859b',
  counts, seeds:SEEDS, firstDifference:null, confirmedBugs:[],
  pausePhase:'no ticks; paused stays false; phase stays simulation. Basin and fixture literals have no paused, phase, or RNG fields.',
  oracle:'Sorted member sets from an independent polygon-edge BFS. Source regionIds are sorted copies. Walk order and source labels are not asserted. GameState snapshots stay raw JSON.',
  fixture:{id:fixtureId, hash:fixtureHash, restoredHash, corner:'R01 and R04 share vertex fc and no edge; both plains. R01-R02 share edge fb-fc.'},
  gap:'scripts/stock-multipliers-test.mjs pins sorted seed-1867 components for R01, R02, and R03 and fills that cache before it changes R04 controller. It does not sweep other seeds, source regionIds, missing biomes, corner-only membership, or a second map.',
};
mkdirSync('artifacts/grok-oct24-spend/biome-review', {recursive:true});
writeFileSync('artifacts/grok-oct24-spend/biome-review/summary.json', JSON.stringify(summary, null, 2));
console.log(`[biome-review] OK regions=${counts.regionCases} scopes=${counts.scopeChecks} mixed=${counts.mixedControllerComponents} singletons=${counts.singletons}`);
