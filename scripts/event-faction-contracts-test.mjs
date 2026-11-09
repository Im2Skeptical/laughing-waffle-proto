import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getMoonPhaseAtSecond } from '../src/model/moon-phases.js';
import { getRegionState, getAdjacentRegionIds, getConnectedRegionIds, addWorldConnection, removeWorldConnection } from '../src/model/world-state.js';
import { emitPracticeEvent, withPracticeRoot } from '../src/model/detailed-settlements/practice-events.js';
import { flushPracticeEvents, evaluateDetailedPracticeSlot } from '../src/model/detailed-settlements/practices.js';
import { generateStock, planStock } from '../src/model/detailed-settlements/stock.js';
import { writePopulationBins, allegianceSummary } from '../src/model/detailed-settlements/population-ledger.js';
import { changeController } from '../src/model/detailed-settlements/territory.js';
import { initializeReplayClock } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';

// Gap: full-map contract covers Resource defense following the holder, Field Study
// install/frontier isolation, and same-region Beast Rendering stock. Legacy charge
// suites cover queues and scopes without ruleset stamps or a removed road.
// This file is the pairwise scope, faction, holder and instance matrix.
const outDir = new URL('../artifacts/grok-nov07-spend/event-factions/', import.meta.url);
const child = (n, allegiance = 'neutral') => ({ classId: 'villager', allegiance, specialty: 'ordinary', kind: 'children', age: null, count: n });
const adults = (n, allegiance) => ({ classId: 'villager', allegiance, specialty: 'ordinary', kind: 'adults', age: null, count: n });
const results = [];

function boot() {
  const state = createNewGameState(424242);
  assert.equal(state.paused, false, 'effect fixtures run unpaused');
  assert.equal(state.phase, 'simulation', 'effect fixtures use simulation mode');
  for (const site of state.world.sites) {
    if (!site.detailedState) continue;
    delete site.neutral;
    delete site.town;
    site.simulationMode = 'detailed';
    getRegionState(state, site.regionId).detailedSettlementEnabled = true;
    site.detailedState.practiceSlots = [null, null, null, null, null];
    site.detailedState.structureSlots?.fill(null);
  }
  const home = state.civilization.capitalRegionId;
  const neighbour = state.world.regions.find(region => region.controller === 'player' && region.id !== home)?.id;
  const edge = getAdjacentRegionIds(state, home);
  assert.ok(edge.includes(neighbour), 'opening partner shares a polygon edge');
  assert.ok(getConnectedRegionIds(state, home).includes(neighbour), 'opening partner has the starting road');
  const far = state.world.regions.find(region => region.id !== home && !edge.includes(region.id))?.id;
  assert.ok(far && !getConnectedRegionIds(state, home).includes(far), 'far region has neither edge nor road');
  return { state, home, neighbour, far };
}
function put(state, regionId, specs, bins = [child(4)]) {
  const site = state.world.sites.find(entry => entry.regionId === regionId);
  const defs = state.gameConfig.gamepieces.practices;
  site.detailedState.practiceSlots = [0, 1, 2, 3, 4].map(index => {
    const spec = specs[index];
    if (!spec) return null;
    const practiceId = spec.id;
    const influence = defs[practiceId].category === 'influence';
    return { practiceId, tier: 'bronze', instanceId: spec.instanceId, charge: spec.charge ?? 0, work: 0,
      ...(influence ? { allegiance: spec.allegiance ?? 'player' } : { stock: spec.stock ?? 0 }) };
  });
  writePopulationBins(site.detailedState, bins);
  return site;
}
function fire(state, event) {
  emitPracticeEvent(state, event);
  flushPracticeEvents(state);
}
function slot(state, regionId, index) {
  return state.world.sites.find(entry => entry.regionId === regionId).detailedState.practiceSlots[index];
}
function changedPaths(before, after, path = '') {
  if (Object.is(before, after)) return [];
  const bothObjects = before && after && typeof before === 'object' && typeof after === 'object';
  if (!bothObjects) return [path || '$'];
  if (Array.isArray(before) || Array.isArray(after)) {
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    const count = Math.max(before.length ?? 0, after.length ?? 0);
    return Array.from({ length: count }, (_, index) => changedPaths(before[index], after[index], `${path}[${index}]`)).flat();
  }
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => changedPaths(before[key], after[key], path ? `${path}.${key}` : key));
}
function sitePath(state, regionId) {
  return `world.sites[${state.world.sites.findIndex(entry => entry.regionId === regionId)}].detailedState`;
}
function rawState(state) {
  return JSON.stringify(serializeGameState(state));
}
function assertRaw(actual, expected, name) {
  if (actual === expected) return;
  const bad = changedPaths(JSON.parse(expected), JSON.parse(actual));
  writeFileSync(new URL(`${name}.diff.json`, outDir), JSON.stringify(bad.slice(0, 40), null, 2));
  assert.fail(`${name}: ${bad.slice(0, 8).join(' | ')}`);
}
function commit(state, regions, extra, name, run) {
  const beforeRaw = rawState(state);
  const before = JSON.parse(beforeRaw);
  run();
  const afterRaw = rawState(state);
  const after = JSON.parse(afterRaw);
  const allowed = ['civilization.practiceEvents', ...regions.flatMap(regionId => [`${sitePath(state, regionId)}.practiceSlots`, `${sitePath(state, regionId)}.practiceActivationTrace`]), ...extra];
  const bad = changedPaths(before, after).filter(path => !allowed.some(prefix => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)));
  if (bad.length) writeFileSync(new URL(`${name}.diff.json`, outDir), JSON.stringify(bad, null, 2));
  assert.deepEqual(bad, [], name);
  assert.equal(JSON.stringify(after.rng), JSON.stringify(before.rng), `${name} rng`);
  assert.equal(after.paused, before.paused, `${name} paused`);
  assert.equal(after.phase, before.phase, `${name} mode`);
  assert.equal(after.tSec, before.tSec, `${name} tSec`);
  assert.equal(getMoonPhaseAtSecond(after).id, getMoonPhaseAtSecond(before).id, `${name} phase`);
}
function record(name, coverage, detail) {
  results.push({ name, coverage, ...detail });
}

mkdirSync(outDir, { recursive: true });

{
  const { state, home } = boot();
  const site = put(state, home, [{ id: 'fieldStudy', instanceId: 'ef:field' }, { id: 'papermaking', instanceId: 'ef:paper', stock: 2 }]);
  const before = rawState(state);
  const phase = getMoonPhaseAtSecond(state).id;
  planStock(state, site.detailedState, [], [{ traits: ['Record'], amount: 1 }]);
  evaluateDetailedPracticeSlot(state, home, 0);
  assertRaw(rawState(state), before, 'pure-query-unchanged');
  const raw = JSON.parse(before);
  const after = JSON.parse(rawState(state));
  assert.equal(JSON.stringify(after.rng), JSON.stringify(raw.rng), 'pure-query-unchanged rng');
  assert.equal(after.paused, false, 'pure-query-unchanged paused');
  assert.equal(after.tSec, raw.tSec, 'pure-query-unchanged tSec');
  assert.equal(getMoonPhaseAtSecond(after).id, phase, 'pure-query-unchanged phase');
  record('pure-query-unchanged', 'ordinary', { planner: 'planStock + evaluateDetailedPracticeSlot' });
}

{
  const { state, home, far } = boot();
  put(state, home, [{ id: 'beastRendering', instanceId: 'ef:beast' }, { id: 'fieldStudy', instanceId: 'ef:field' }]);
  getRegionState(state, far).controller = 'external-a';
  const research = state.civilization.research.total;
  commit(state, [home, far], ['civilization.history.monsterTrophies'], 'payload-faction', () => {
    fire(state, { kind: 'monsterDestroyed', regionId: far, faction: 'player', practiceId: 'monsterHunting', classId: 'warrior' });
    assert.equal(slot(state, home, 0).stock, 2, 'payload-faction');
    assert.equal(slot(state, home, 0).charge, 0, 'payload-faction');
    assert.equal(slot(state, home, 1).charge, 0, 'payload-faction');
    assert.equal(state.civilization.research.total, research, 'payload-faction');
  });
  fire(state, { kind: 'monsterDestroyed', regionId: far, faction: 'external-a', controller: 'player', practiceId: 'monsterHunting', classId: 'warrior' });
  assert.equal(slot(state, home, 0).stock, 2, 'controller-is-not-faction');
  getRegionState(state, far).controller = 'player';
  put(state, far, [{ id: 'fm_forcedPageantry', instanceId: 'ef:pageant', allegiance: 'external-a' }], [child(4)]);
  commit(state, [home, far], ['civilization.research'], 'controller-not-faction', () => {
    fire(state, { kind: 'practiceInstalled', regionId: far, practiceId: 'fm_forcedPageantry', slotIndex: 0 });
    assert.equal(state.civilization.research.total, research + 2, 'controller-not-faction');
    assert.equal(slot(state, home, 0).stock, 2, 'controller-not-faction');
  });
  record('civilization-faction-and-controller', 'ordinary', { far, beastStock: 2, research: research + 2 });
}

{
  const { state, home, neighbour } = boot();
  put(state, home, [
    { id: 'copyingTexts', instanceId: 'ef:copy-a' },
    { id: 'copyingTexts', instanceId: 'ef:copy-b' },
    { id: 'marginalia', instanceId: 'ef:margin' },
    { id: 'papermaking', instanceId: 'ef:paper' },
  ]);
  put(state, neighbour, [{ id: 'papermaking', instanceId: 'ef:neighbour-paper', stock: 0 }]);
  const homeSite = state.world.sites.find(entry => entry.regionId === home);
  const neighbourSite = state.world.sites.find(entry => entry.regionId === neighbour);
  commit(state, [home, neighbour], [], 'local-ignores-edge-and-road', () => {
    generateStock(state, neighbourSite.detailedState, neighbourSite.detailedState.practiceSlots[0], 1, false);
    flushPracticeEvents(state);
    fire(state, { kind: 'stockConsumed', regionId: neighbour, practiceId: 'papermaking', slotIndex: 0, traits: ['Paper', 'Record'], tags: ['Knowledge'] });
    assert.equal(slot(state, home, 0).charge, 0, 'local-ignores-edge-and-road');
    assert.equal(slot(state, home, 1).charge, 0, 'local-ignores-edge-and-road');
    assert.equal(slot(state, home, 2).charge, 0, 'local-ignores-edge-and-road');
  });
  commit(state, [home], [], 'one-clause-paper-and-record', () => {
    generateStock(state, homeSite.detailedState, homeSite.detailedState.practiceSlots[3], 1, false);
    flushPracticeEvents(state);
    assert.equal(slot(state, home, 0).charge, 1, 'one-clause-paper-and-record');
    assert.equal(slot(state, home, 1).charge, 1, 'one-clause-paper-and-record');
    assert.equal(slot(state, home, 3).stock, 1, 'one-clause-paper-and-record');
  });
  commit(state, [home], [], 'other-instance', () => {
    generateStock(state, homeSite.detailedState, homeSite.detailedState.practiceSlots[0], 1, false);
    flushPracticeEvents(state);
    assert.equal(slot(state, home, 1).stock, 3, 'other-instance');
    assert.equal(slot(state, home, 1).charge, 1, 'other-instance');
    assert.equal(slot(state, home, 0).stock, 4, 'own-instance');
    assert.equal(slot(state, home, 0).charge, 0, 'own-instance');
  });
  // Two local copies are a unit probe of instance matching, not a claim that the
  // current shop can install duplicate Practice definitions on one board.
  record('local-instance-and-traits', 'unit-duplicate-instances', { copyA: { charge: 0, stock: 4 }, copyB: { charge: 1, stock: 3 } });
}

{
  const { state, home, neighbour } = boot();
  const site = put(state, home, [{ id: 'fm_veteransTestimony', instanceId: 'ef:veterans', allegiance: 'player' }], [adults(3, 'external-a')]);
  commit(state, [home, neighbour], [], 'influence-ignores-neighbour-defense', () => {
    fire(state, { kind: 'defenseSucceeded', regionId: neighbour, faction: 'player' });
    fire(state, { kind: 'defenseSucceeded', regionId: home, faction: 'external-a' });
    assert.equal(slot(state, home, 0).charge, 0, 'influence-ignores-neighbour-defense');
  });
  fire(state, { kind: 'defenseSucceeded', regionId: home, faction: 'player' });
  assert.equal(slot(state, home, 0).charge, 1, 'influence-hears-own-faction');
  changeController(state, home, 'external-a', { military: true });
  assert.equal(slot(state, home, 0).allegiance, 'player', 'influence-instance-retained');
  assert.equal(slot(state, home, 0).instanceId, 'ef:veterans', 'influence-instance-retained');
  assert.equal(getRegionState(state, home).controller, 'external-a', 'influence-instance-retained');
  commit(state, [home], [`${sitePath(state, home)}.control`, `world.regions[${state.world.regions.findIndex(region => region.id === home)}].controller`], 'influence-ignores-holder-defense', () => {
    fire(state, { kind: 'defenseSucceeded', regionId: home, faction: 'external-a' });
    assert.equal(slot(state, home, 0).charge, 1, 'influence-ignores-holder-defense');
    assert.equal(allegianceSummary(site.detailedState).player ?? 0, 0, 'influence-ignores-holder-defense');
  });
  fire(state, { kind: 'defenseSucceeded', regionId: home, faction: 'player' });
  assert.equal(allegianceSummary(site.detailedState).player, 3, 'influence-allegiance-after-capture');
  assert.equal(allegianceSummary(site.detailedState)['external-a'] ?? 0, 0, 'influence-allegiance-after-capture');
  assert.equal(slot(state, home, 0).charge, 0, 'influence-allegiance-after-capture');
  assert.equal(slot(state, home, 0).allegiance, 'player', 'influence-allegiance-after-capture');
  record('influence-allegiance-across-capture', 'ordinary', { converted: 3, holder: 'external-a' });
}

{
  // Registry cards, not ordinary full-map offers. Unit coverage of authored scopes.
  const { state, home, neighbour } = boot();
  put(state, home, [{ id: 'watchkeeping', instanceId: 'ef:watch' }, { id: 'warCouncil', instanceId: 'ef:council' }]);
  assert.equal(removeWorldConnection(state, home, neighbour).ok, true, 'adjacent-without-road');
  commit(state, [home, neighbour], [], 'adjacent-without-road', () => {
    fire(state, { kind: 'monsterPressure', regionId: neighbour, action: 'advance' });
    assert.equal(slot(state, home, 0).charge, 1, 'adjacent-without-road');
    assert.equal(slot(state, home, 1).charge, 0, 'connected-needs-road');
  });
  fire(state, { kind: 'supportContributed', regionId: neighbour, actionKind: 'campaign', classId: 'warrior' });
  assert.equal(slot(state, home, 1).charge, 0, 'connected-needs-road');
  assert.equal(addWorldConnection(state, home, neighbour).ok, true, 'connected-with-road');
  fire(state, { kind: 'supportContributed', regionId: neighbour, actionKind: 'campaign', classId: 'warrior' });
  assert.equal(slot(state, home, 1).charge, 1, 'connected-with-road');
  assert.equal(slot(state, home, 0).charge, 1, 'connected-with-road');
  record('edge-and-road-only-when-scoped', 'unit-registry-scope', { watchkeeping: 1, warCouncil: 1 });
}

{
  const { state, home } = boot();
  put(state, home, [{ id: 'fieldStudy', instanceId: 'ef:field' }, { id: 'fm_forcedPageantry', instanceId: 'ef:pageant', allegiance: 'external-a' }]);
  const research = state.civilization.research.total;
  withPracticeRoot(state, { kind: 'phaseResolved', regionId: home }, () => {
    emitPracticeEvent(state, { kind: 'practiceInstalled', regionId: home, practiceId: 'fm_forcedPageantry', slotIndex: 1 });
    emitPracticeEvent(state, { kind: 'practiceInstalled', regionId: home, practiceId: 'fm_forcedPageantry', slotIndex: 1 });
  });
  commit(state, [home], ['civilization.research'], 'same-root-one-discharge', () => {
    flushPracticeEvents(state);
    assert.equal(state.civilization.research.total, research + 2, 'same-root-one-discharge');
    assert.equal(slot(state, home, 0).charge, 1, 'same-root-one-discharge');
  });
  fire(state, { kind: 'practiceInstalled', regionId: home, practiceId: 'fm_forcedPageantry', slotIndex: 1 });
  assert.equal(state.civilization.research.total, research + 4, 'later-root-discharges');
  assert.equal(slot(state, home, 0).charge, 0, 'later-root-discharges');
  record('same-root-then-later-root', 'ordinary', { research: [research + 2, research + 4] });
}

{
  // No admitted card has two clauses that can match one event. Captured DSL probe only.
  const { state, home } = boot();
  put(state, home, [{ id: 'copyingTexts', instanceId: 'ef:copy' }, { id: 'papermaking', instanceId: 'ef:paper' }]);
  const card = state.gameConfig.gamepieces.practices.copyingTexts;
  const saved = structuredClone(card.charge.trigger);
  card.charge.trigger = { ...saved, any: [saved.any[0], { ...saved.any[0] }] };
  const site = state.world.sites.find(entry => entry.regionId === home);
  try {
    commit(state, [home], [], 'two-clauses-one-charge', () => {
      generateStock(state, site.detailedState, site.detailedState.practiceSlots[1], 1, false);
      flushPracticeEvents(state);
      assert.equal(slot(state, home, 0).charge, 1, 'two-clauses-one-charge');
      assert.equal(slot(state, home, 0).stock, 0, 'two-clauses-one-charge');
    });
  } finally {
    card.charge.trigger = saved;
  }
  record('two-clauses-one-charge', 'unit-captured-dsl', { charge: 1 });
}

{
  const { state, home, far } = boot();
  put(state, home, [{ id: 'fieldStudy', instanceId: 'ef:field' }]);
  getRegionState(state, far).controller = 'player';
  put(state, far, [{ id: 'fm_forcedPageantry', instanceId: 'ef:pageant', allegiance: 'external-a' }]);
  initializeReplayClock(state);
  emitPracticeEvent(state, { kind: 'practiceInstalled', regionId: far, practiceId: 'fm_forcedPageantry', slotIndex: 0 });
  const pending = rawState(state);
  const timeline = createTimelineFromInitialState(state);
  const restored = rebuildStateAtSecond(timeline, state.tSec);
  assert.equal(restored.ok, true, 'replay-pending');
  assertRaw(rawState(restored.state), pending, 'replay-pending');
  flushPracticeEvents(state);
  flushPracticeEvents(restored.state);
  const flushed = rawState(state);
  assertRaw(rawState(restored.state), flushed, 'replay-flushed');
  assert.equal(JSON.parse(flushed).civilization.research.total, JSON.parse(pending).civilization.research.total + 2, 'replay-flushed');
  assert.equal(JSON.parse(flushed).paused, false, 'replay-flushed paused');
  assert.equal(JSON.parse(flushed).tSec, JSON.parse(pending).tSec, 'replay-flushed tSec');
  assertRaw(rawState(deserializeGameState(JSON.parse(flushed))), flushed, 'replay-flushed');
  record('replay-pending-journal', 'ordinary', { researchDelta: 2, paused: false });
}

writeFileSync(new URL('cases.json', outDir), JSON.stringify({ results }, null, 2));
console.log(`[event-factions] ${results.length} cases ok`);
