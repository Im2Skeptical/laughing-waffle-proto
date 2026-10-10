// Property checks for public Life Map generator topology and JSON roundtrip.
// Legal configs only. Fixed seeds. Official RNG helpers and validators.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRng } from '../src/model/rng.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { createNewGameState } from '../src/model/new-game.js';
import { advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import {
  createAuthoredGameConfig,
  validateGameConfig,
} from '../src/model/game-config.js';
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from '../src/model/timeline/index.js';
import {
  getCurrentLifeMapVassal,
  selectLifeMapVassal,
} from '../src/model/vassal-life-map.js';
import {
  VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION,
  createAuthoredVassalLifeMapGeneratorConfig,
  canonicalizeVassalLifeMapGeneratorConfig,
  validateVassalLifeMapGeneratorConfig,
  generateVassalLifeMap,
  validateVassalLifeMapGraph,
} from '../src/model/vassal-life-map-generator.js';

const SEEDS = Object.freeze([
  1, 2, 7, 11, 17, 42, 64, 100, 256, 1024, 4096, 9001, 32768, 100003,
]);
const PAIRS = Object.freeze([
  ['authored', 'narrow'],
  ['authored', 'wide'],
  ['authored', 'earlyBand'],
  ['authored', 'lateBand'],
  ['authored', 'denseRoutes'],
]);

function variant(patch) {
  const config = { ...createAuthoredVassalLifeMapGeneratorConfig(), ...patch };
  const validation = validateVassalLifeMapGeneratorConfig(config);
  if (!validation.ok) throw new Error(`fixture config illegal: ${validation.errors.join('; ')}`);
  return config;
}

const SETTINGS = Object.freeze({
  authored: variant({}),
  narrow: variant({
    laneCount: 2, routeCount: 2, normalDepthCount: 3,
    earlyDepthCount: 1, midDepthCount: 1, layoutSmoothing: 0, minimumNodeGap: 0.02,
  }),
  wide: variant({
    laneCount: 12, routeCount: 24, normalDepthCount: 6,
    earlyDepthCount: 1, midDepthCount: 1, layoutSmoothing: 1, minimumNodeGap: 0.07,
  }),
  earlyBand: variant({
    laneCount: 4, routeCount: 4, normalDepthCount: 9, earlyDepthCount: 7, midDepthCount: 1,
  }),
  lateBand: variant({
    laneCount: 4, routeCount: 4, normalDepthCount: 9, earlyDepthCount: 1, midDepthCount: 1,
  }),
  denseRoutes: variant({
    laneCount: 6, routeCount: 12, normalDepthCount: 5, earlyDepthCount: 2, midDepthCount: 2,
  }),
});

function lifeMapRng(state) {
  return {
    nextFloat: () => state.rngNextVassalLifeMapFloat(),
    nextInt: (min, max) => state.rngNextVassalLifeMapInt(min, max),
  };
}

function draw(config, seed, rng) {
  const generated = generateVassalLifeMap(config, rng, {
    graphId: `life-map-${seed}`,
    generationSeed: seed,
  });
  assert.equal(generated.ok, true, generated.errors?.join('; ') ?? generated.reason);
  return generated.graph;
}

function topology(graph) {
  return JSON.stringify({
    nodes: graph.nodes,
    edges: graph.edges,
    entryNodeIds: graph.entryNodeIds,
    bossNodeId: graph.bossNodeId,
  });
}

function reachableFromEntries(graph) {
  const seen = new Set(graph.entryNodeIds);
  const queue = [...graph.entryNodeIds];
  while (queue.length) {
    const id = queue.pop();
    for (const edge of graph.edges) {
      if (edge.fromNodeId === id && !seen.has(edge.toNodeId)) {
        seen.add(edge.toNodeId);
        queue.push(edge.toNodeId);
      }
    }
  }
  return seen;
}

function expectBand(config, depth) {
  if (depth === config.normalDepthCount) return 'legacy';
  if (depth < config.earlyDepthCount) return 'early';
  if (depth < config.earlyDepthCount + config.midDepthCount) return 'mid';
  return 'late';
}

function expectTopology(graph, config, seed) {
  const validation = validateVassalLifeMapGraph(graph);
  assert.deepEqual(validation, { ok: true, errors: [] }, `${seed} ${validation.errors?.join('; ')}`);
  assert.equal(graph.schemaVersion, 4);
  assert.equal(graph.generationSeed, seed);
  assert.equal(graph.foundingNodeId ?? null, null);
  assert.ok(graph.entryNodeIds.length >= 2);
  assert.deepEqual(graph.generatorConfig, canonicalizeVassalLifeMapGeneratorConfig(config));
  const ids = new Set();
  for (const node of graph.nodes) {
    assert.equal(ids.has(node.id), false, node.id);
    ids.add(node.id);
    assert.ok(node.depth >= 0 && node.depth <= config.normalDepthCount, node.id);
    assert.ok(node.lane >= 0 && node.lane < config.laneCount, node.id);
    assert.equal(node.band, expectBand(config, node.depth), node.id);
    if (node.id === graph.bossNodeId) {
      assert.equal(node.family, 'legacy');
      assert.equal(node.depth, config.normalDepthCount);
      assert.match(node.id, /^life-d\d{2}-boss$/);
    } else {
      assert.match(node.id, /^life-d\d{2}-r\d{2}$/);
    }
  }
  for (const edge of graph.edges) {
    assert.equal(ids.has(edge.fromNodeId) && ids.has(edge.toNodeId), true);
  }
  assert.equal(graph.edges.some((edge) => edge.fromNodeId === graph.bossNodeId), false);
  const seen = reachableFromEntries(graph);
  assert.equal(seen.has(graph.bossNodeId), true);
  assert.equal(seen.size, graph.nodes.length);
  const roundtrip = JSON.parse(JSON.stringify(graph));
  assert.deepEqual(roundtrip, graph);
  assert.equal(JSON.stringify(roundtrip), JSON.stringify(graph));
}

function rejectMalformed() {
  const cases = [
    ['null', null],
    ['array', []],
    ['stale schema', { ...SETTINGS.authored, schemaVersion: 4 }],
    ['lane below min', { ...SETTINGS.authored, laneCount: 1 }],
    ['lane above max', { ...SETTINGS.authored, laneCount: 13 }],
    ['fractional lane', { ...SETTINGS.authored, laneCount: 6.2 }],
    ['routes over twice lanes', { ...SETTINGS.authored, routeCount: 13 }],
    ['no late depth', { ...SETTINGS.authored, earlyDepthCount: 6, midDepthCount: 5 }],
    ['gap too wide', { ...SETTINGS.authored, minimumNodeGap: 0.5 }],
    ['smoothing out of range', { ...SETTINGS.authored, layoutSmoothing: 1.1 }],
    ['duplicate non-repeat', { ...SETTINGS.authored, nonRepeatFamilyIds: ['crisis', 'crisis'] }],
    ['unknown family', { ...SETTINGS.authored, nonRepeatFamilyIds: ['not-a-family'] }],
    ['early weights empty', {
      ...SETTINGS.authored,
      weights: { ...SETTINGS.authored.weights, early: {} },
    }],
  ];
  const rejected = [];
  for (const [name, value] of cases) {
    const validation = validateVassalLifeMapGeneratorConfig(value);
    assert.equal(validation.ok, false, name);
    assert.ok(validation.errors.length > 0, name);
    const generated = generateVassalLifeMap(value, createRng(1), { generationSeed: 1 });
    rejected.push({
      name,
      validatorErrors: validation.errors,
      generateOk: generated.ok,
      generateReason: generated.reason ?? null,
    });
  }
  const repaired = canonicalizeVassalLifeMapGeneratorConfig({ laneCount: 6.2, schemaVersion: 99 });
  assert.equal(repaired.schemaVersion, VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION);
  assert.equal(repaired.laneCount, 6);
  assert.equal(validateVassalLifeMapGeneratorConfig(repaired).ok, true);
  const fractional = cases.find(([name]) => name === 'fractional lane');
  assert.equal(generateVassalLifeMap(fractional[1], createRng(1), { generationSeed: 1 }).ok, true,
    'canonicalize repairs a fractional lane before generate validates');
  const impossible = cases.find(([name]) => name === 'no late depth');
  assert.equal(generateVassalLifeMap(impossible[1], createRng(1), { generationSeed: 1 }).ok, false);
  return rejected;
}

function expectGameConfigs() {
  const authored = createAuthoredGameConfig();
  assert.equal(authored.lifeMapGenerator.schemaVersion, VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION);
  for (const [name, lifeMapGenerator] of Object.entries(SETTINGS)) {
    const config = { ...authored, lifeMapGenerator };
    const validation = validateGameConfig(config);
    assert.equal(validation.ok, true, `${name} ${validation.errors?.join('; ')}`);
    assert.equal(lifeMapGenerator.schemaVersion, VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION);
  }
}

function withoutLifeMapSeed(snapshot) {
  const copy = JSON.parse(JSON.stringify(snapshot));
  copy.rng.vassalLifeMapSeed = 0;
  return JSON.stringify(copy);
}

function expectStreamIsolation(seed) {
  const state = createNewGameState(seed);
  const before = serializeGameState(state);
  const streams = { ...before.rng };
  const graph = draw(state.gameConfig.lifeMapGenerator, seed, lifeMapRng(state));
  expectTopology(graph, state.gameConfig.lifeMapGenerator, seed);
  const after = serializeGameState(state);
  assert.notEqual(after.rng.vassalLifeMapSeed, streams.vassalLifeMapSeed);
  assert.ok(withoutLifeMapSeed(before) === withoutLifeMapSeed(after), 'generation changes only the Life Map RNG stream');
  for (const key of ['seed', 'baseSeed', 'vassalSeed', 'vassalDevelopmentSeed', 'vassalPortraitSeed']) {
    assert.equal(after.rng[key], streams[key], key);
  }
  const again = draw(before.gameConfig.lifeMapGenerator, seed, lifeMapRng(deserializeGameState(before)));
  assert.ok(JSON.stringify(again) === JSON.stringify(graph), 'Life Map generation repeats exactly from the saved RNG');
  const roundtrip = serializeGameState(deserializeGameState(after));
  assert.deepEqual(roundtrip, after);

  const selected = deserializeGameState(before);
  const choice = selectLifeMapVassal(selected, 0);
  assert.equal(choice.ok, true, choice.reason);
  const live = getCurrentLifeMapVassal(selected).lifeMap.graph;
  const liveValidation = validateVassalLifeMapGraph(live);
  assert.deepEqual(liveValidation, { ok: true, errors: [] }, liveValidation.errors?.join('; '));
  assert.equal(live.foundingNodeId != null, true);
  assert.equal(live.entryNodeIds.length, 1);
  assert.equal(live.entryNodeIds[0], live.foundingNodeId);
  assert.equal(reachableFromEntries(live).has(live.bossNodeId), true);
  assert.equal(live.edges.some((edge) => edge.fromNodeId === live.bossNodeId), false);
  const selectedBytes = JSON.stringify(serializeGameState(selected));
  const timeline = createTimelineFromInitialState(selected);
  const atZero = rebuildStateAtSecond(timeline, 0);
  assert.equal(atZero.ok, true, atZero.reason);
  assert.ok(JSON.stringify(serializeGameState(atZero.state)) === selectedBytes, 'selected state replays exactly at second zero');
  const atOne = rebuildStateAtSecond(timeline, 1);
  assert.equal(atOne.ok, true, atOne.reason);
  const direct = deserializeGameState(serializeGameState(selected));
  assert.equal(advanceReplayStateToSecond(direct, 1).ok, true);
  assert.ok(JSON.stringify(serializeGameState(direct)) === JSON.stringify(serializeGameState(atOne.state)), 'one-second replay matches every state and RNG field');
  const ticked = serializeGameState(atOne.state);
  assert.equal(ticked.tSec, 1);
  assert.equal(ticked.rng.vassalLifeMapSeed, serializeGameState(selected).rng.vassalLifeMapSeed);
  assert.ok(JSON.stringify(getCurrentLifeMapVassal(atOne.state).lifeMap.graph) === JSON.stringify(live), 'replay keeps the selected graph');
  return {
    seed,
    lifeMapSeedBeforeDraw: streams.vassalLifeMapSeed,
    lifeMapSeedAfterDraw: after.rng.vassalLifeMapSeed,
    lifeMapSeedAfterSelect: serializeGameState(selected).rng.vassalLifeMapSeed,
    lifeMapSeedAfterReplaySecond: ticked.rng.vassalLifeMapSeed,
    foundingNodeId: live.foundingNodeId,
  };
}

let currentCase = 'setup';
try {
const graphs = new Map();
const rows = [];
for (const [name, config] of Object.entries(SETTINGS)) {
  for (const seed of SEEDS) {
    currentCase = `${name}:${seed}`;
    const first = draw(config, seed, createRng(seed));
    const second = draw(config, seed, createRng(seed));
    expectTopology(first, config, seed);
    assert.ok(JSON.stringify(first) === JSON.stringify(second), `${name} seed ${seed}`);
    graphs.set(`${name}:${seed}`, topology(first));
    rows.push({
      setting: name, seed, nodes: first.nodes.length, edges: first.edges.length,
      entries: first.entryNodeIds.length, boss: first.bossNodeId,
    });
  }
}

const settingDeltas = [];
for (const [left, right] of PAIRS) {
  let differed = 0;
  for (const seed of SEEDS) {
    if (graphs.get(`${left}:${seed}`) !== graphs.get(`${right}:${seed}`)) differed += 1;
  }
  assert.ok(differed > 0, `${left} vs ${right} never changed topology across ${SEEDS.length} seeds`);
  settingDeltas.push({ left, right, seedsCompared: SEEDS.length, seedsWithDifferentTopology: differed });
}

currentCase = 'captured-config';
expectGameConfigs();
currentCase = 'malformed-config';
const malformed = rejectMalformed();
currentCase = 'rng-isolation';
const stream = expectStreamIsolation(SEEDS[0]);

const summary = {
  generations: rows.length,
  seeds: SEEDS.length,
  settings: Object.keys(SETTINGS),
  settingDeltas,
  stream,
  malformedRejectedByValidator: malformed.length,
  canonicalizeRepairsFractionalLane: true,
  limits: [
    'Does not claim each seed yields a unique graph.',
    'Does not claim every seed differs for every setting pair; each pair must differ on at least one listed seed.',
    'Generator graphs have no founding node. Founding is checked on one official select, then one replay second.',
    'canonicalize repairs schemaVersion and fractional laneCount; generate accepts that repaired lane. Validator still rejects the raw value.',
    'Unrelated RNG proof is full serialized JSON with vassalLifeMapSeed zeroed, plus one new-game seed and one replay tick.',
  ],
};
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/life-graph-properties.json', `${JSON.stringify({ summary, rows, malformed }, null, 2)}\n`);
console.log(`[life-graph-properties] ${rows.length} graphs, ${SEEDS.length} seeds, ${Object.keys(SETTINGS).length} settings OK`);
} catch (error) {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/life-graph-properties-failure.json', JSON.stringify({ case: currentCase, message: error.message, stack: error.stack, actual: error.actual, expected: error.expected }, null, 2));
  console.error(`[life-graph-properties] failed ${currentCase} repro=node scripts/life-graph-properties-test.mjs artifact=artifacts/life-graph-properties-failure.json`);
  process.exitCode = 1;
}
