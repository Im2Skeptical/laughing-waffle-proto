import assert from 'node:assert/strict';
import './projection-timing-observability-test.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { createSettlementTimingSnapshot } from '../src/views/ui-root/settlement-timing-snapshot.js';
import { publishSettlementDebugApi } from '../src/views/ui-root/settlement-debug-api.js';
import { createTimeGraphController } from '../src/model/timegraph/controller-core.js';
import { createLifeDecisionController } from '../src/controllers/life-decision-controller.js';
import { createSimRunner } from '../src/controllers/sim-runner.js';
import { selectedState } from '../src/model/tests/vassal-life-map/helpers.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { ActionKinds } from '../src/model/actions.js';
import { prepareLifeChoices, runLifeDecisionJob } from '../src/model/vassal-life-map/decision-preparation.js';
import { getVassalNodeDecisionPresentation } from '../src/model/vassal-life-map.js';
import { createForecastRevealState } from '../src/views/timegraphs/forecast-reveal-state.js';

const output = process.env.TIMING_OBSERVABILITY_OUTPUT ?? `artifacts/perf-hillclimb/passive-observability-v2-${new Date().toISOString().replace(/[:.]/g, '')}`;
mkdirSync(output, { recursive: true });
const forbiddenCalls = [];
const forbidden = name => () => { forbiddenCalls.push(name); throw new Error(`forbidden: ${name}`); };
const poison = Object.fromEntries(['getState', 'getCursorState', 'getData', 'getSnapshot', 'getDebugState',
  'getSemanticSnapshot', 'getDecisionPresentation', 'getPresentation', 'getCandidate', 'getRecap',
  'getStateAt', 'getStateDataAt', 'render', 'sync', 'getDisplayHistoryEndSec', 'getForecastStatus',
  'syncProjectionReplacementDataContext', 'getPlotSnapshot'].map(name => [name, forbidden(name)]));
const json = value => JSON.parse(JSON.stringify(value));
function primitives(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { assert.ok(Number.isFinite(value)); return; }
  assert.equal(typeof value, 'object', 'only JSON primitive DTOs');
  if (Array.isArray(value)) assert.ok(value.length < 100, 'bounded metadata arrays');
  for (const item of Object.values(value)) primitives(item);
}
function corrupt(value) {
  for (const key of Object.keys(value)) {
    if (value[key] && typeof value[key] === 'object') corrupt(value[key]);
    else value[key] = 'mutated';
  }
}
function reads(read, describe) {
  const expected = json(read()); primitives(expected);
  for (let i = 0; i < 500; i++) { const value = read(); assert.deepEqual(json(value), expected, describe); corrupt(value); }
  assert.deepEqual(json(read()), expected, `${describe}: mutation isolation`);
  return expected;
}

// Execute actual view getter bodies with explicit raw closure fixtures. Node
// does not construct a fake renderer; the browser probe covers real wiring.
const sourceFiles = [];
function viewReader(file, scope) {
  sourceFiles.push(file);
  const match = readFileSync(file, 'utf8').match(/(?:function )?getTimingSnapshot\(([^)]*)\) \{([\s\S]*?)\n {2,4}\}(?:,|\r?\n)/);
  assert.ok(match, `${file}: actual getter found`);
  return vm.runInNewContext(`(function getTimingSnapshot(${match[1]}) {${match[2]}\n})`, { ...poison, ...scope });
}
const raw = { root: { visible: true, pendingInteractionCount: 2 }, detailRoot: { visible: true },
  pose: { x: 1, y: 2, zoom: 1.5 }, panel: { phase: 'opening', animating: true, origin: { x: 4 } },
  entry: { open: true, visible: true, phase: 'opening' }, candidateNodeId: 'n1', displayedVassalId: 'v1',
  entryConfirmationOpen: true, logicalOpen: true, openNodeId: 'n1', motion: {},
  lastDecision: { node: { id: 'cached-n0', family: 'shop' }, nodeState: { selectedOptionId: 'o1', resolving: false }, shopTag: 'resource', offers: [{offerId:'o1'}], purchases: [{offerId:'p1'}], previewRegionId:'R02', settlement:{practices:[{practiceId:'test'},null,null,null,null]} },
  dismissRoot: { interactionState: 'idle' }, clockStartedAt: 42,
  clock: { second: 12, progress: .5, locked: false, counters: { years: 1 } } };
const rawBefore = JSON.stringify(raw);
const map = viewReader('src/views/world-map-pixi.js', { ...raw,
  camera: { snapshot: () => raw.pose, isAnimating: () => true }, panelReveal: { snapshot: () => raw.panel }, illustrated: {stats:{ready:false, prepared:true}} });
const lifeMap = viewReader('src/views/vassal-life-map-pixi.js', { ...raw, entryDialog: { getSnapshot: () => raw.entry, getConfirmPoint: () => ({x:12,y:13}) } });
const decision = viewReader('src/views/vassal-node-decision-modal-pixi.js', { ...raw, worldScreen: { getTimingSnapshot: () => ({artReady:true, artPrepared:false}) } });
const recap = viewReader('src/views/vassal-resolution-recap-pixi.js', { ...raw, clockView: { getSnapshot: () => raw.clock } });
for (const [name, read] of Object.entries({ map, lifeMap, decision, recap })) reads(read, name);
assert.equal(JSON.stringify(raw), rawBefore);
const reveal = createForecastRevealState();
Object.assign(reveal, { historyEndSec: 10, visibleEndSec: 40.8, targetEndSec: 90, animatedEndSec: 41,
  startSecOverride: 2, readinessCapSec: 43 }); // stale override must not be cleared
const scrub = { scrubSec: 30, isScrubbing: true, latchedForecastScrubSec: 30 };
const coverage = { computedSec: 70, requestedSec: 90, pending: true, cacheVersion: 7, subjectKey: 'civ' };
const timeline = { historyEndSec: 10, revision: 4, actions: [], checkpoints: [] };
const graph = viewReader('src/views/timegraphs-pixi.js', { root: raw.root,
  controller: { ...poison, getTimingSnapshot: () => ({ ...coverage }) }, getTimeline: () => timeline,
  plot: {x:10,y:20,w:100,h:40}, reveal, scrub, minSec: 0, maxSec: 100, presentationSuspended: false, openingRevealSec: null });
const graphBefore = JSON.stringify({ reveal, scrub, coverage, timeline });
assert.equal(graph().browseCapSec, 40);
reads(graph, 'graph');
assert.equal(JSON.stringify({ reveal, scrub, coverage, timeline }), graphBefore);
reveal.historyEndSec = 9; assert.equal(graph().browseCapSec, 10, 'stale reveal context caps at frontier');
reveal.historyEndSec = 10; coverage.computedSec = 25;
assert.equal(graph().browseCapSec, 25, 'cap cannot exceed computed coverage');
coverage.computedSec = null; assert.equal(graph().browseCapSec, null, 'unavailable coverage remains null');
coverage.computedSec = 70;

// Actual graph controllers, cold and settled. Full diagnostic parity happens
// before observation; dependencies throw throughout the observation window.
let observing = false;
const state = selectedState(1);
const runner = createSimRunner({ setupId: 'devPlaytesting01' }); runner.resetToState(state);
const projection = new Proxy({}, { get: (_, key) => forbidden(`projection.${String(key)}`) });
const cold = createTimeGraphController({ getTimeline: poison.getState, getCursorState: poison.getCursorState, projectionCache: projection });
reads(() => cold.getTimingSnapshot(), 'cold graph controller');
const controller = createTimeGraphController({
  getTimeline: () => observing ? poison.getState() : runner.getTimeline(),
  getCursorState: () => observing ? poison.getCursorState() : runner.getCursorState(), horizonSec: 2 });
controller.ensureCache();
const full = controller.getData(); // untimed diagnostic, not a purity oracle
assert.ok(full.cache, 'warm parity fixture has a real graph cache');
assert.ok(Number.isFinite(full.forecastCoverageEndSec), 'warm fixture has computed coverage');
assert.equal(controller.getTimingSnapshot().cacheVersion, full.cacheVersion);
assert.equal(controller.getTimingSnapshot().computedSec, full.forecastCoverageEndSec);
assert.equal(controller.getTimingSnapshot().requestedSec, full.forecastRequestedEndSec);
const stateBefore = JSON.stringify(serializeGameState(runner.getState()));
const timelineBefore = JSON.stringify(runner.getTimeline());
observing = true; reads(() => controller.getTimingSnapshot(), 'warm graph controller'); observing = false;
assert.equal(JSON.stringify(serializeGameState(runner.getState())), stateBefore, 'state/RNG unchanged');
assert.equal(JSON.stringify(runner.getTimeline()), timelineBefore, 'timeline unchanged');

// Optional anchor reads use only Map.has on the actual graph boundary store.
assert.equal(cold.getTimingSnapshot({anchorSec:1}).hasRetainedAnchor, null);
controller.getStateDataAt(runner.getTimeline().historyEndSec + 1); // untimed real restore seeds retained boundary
const boundaries = full.cache.stateDataByBoundary;
const expectedAnchor = boundaries.keys().next().value;
assert.ok(Number.isInteger(expectedAnchor));
const boundaryBefore = [...boundaries.entries()];
const originalKeys = boundaries.keys, originalIterator = boundaries[Symbol.iterator];
boundaries.keys = poison.getData; boundaries[Symbol.iterator] = poison.getData;
observing = true;
assert.equal(controller.getTimingSnapshot().requestedAnchorSec, undefined);
assert.equal(controller.getTimingSnapshot({anchorSec:expectedAnchor}).hasRetainedAnchor, true);
assert.equal(controller.getTimingSnapshot({anchorSec:999999}).hasRetainedAnchor, false);
assert.equal(controller.getTimingSnapshot({anchorSec:-1}).requestedAnchorSec, undefined);
reads(() => controller.getTimingSnapshot({anchorSec:expectedAnchor}), 'actual retained anchor without enumeration');
observing = false;
boundaries.keys = originalKeys; boundaries[Symbol.iterator] = originalIterator;
assert.deepEqual([...boundaries.entries()], boundaryBefore, 'anchor order and pointers unchanged');
const projectionWitness=controller.getTimingSnapshot({anchorSec:expectedAnchor,includeProjectionSource:true}).projection;
assert.equal(projectionWitness.signatureMatches,true,'optional raw source query matches the actual controller timeline');
assert.equal(typeof projectionWitness.hasRetainedAnchor,'boolean');
const rawTimelineBefore=JSON.stringify(runner.getTimeline());
reads(()=>controller.getTimingSnapshot({anchorSec:expectedAnchor,includeProjectionSource:true}), 'optional passive projection source');
assert.equal(JSON.stringify(runner.getTimeline()),rawTimelineBefore,'raw timeline reader and source comparison do not mutate timeline');
assert.equal(graph({anchorSec:1}).plotRect, null, 'unavailable geometry explicit');
const savedTransform = raw.root.transform;
raw.root.transform = {worldTransform:{a:2,b:0,c:0,d:3,tx:4,ty:5}};
assert.deepEqual(json(graph().plotRect), {x:24,y:65,width:200,height:120});
delete raw.root.transform;
assert.equal(savedTransform, undefined);

// Exercise the actual private artwork stores and drawing resolver in an
// isolated module fixture. No product writes/test facade are shipped.
const artSource = readFileSync('src/views/chronicle-art.js','utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const art = vm.runInNewContext(`
  let minimalGraphics = true;
  const detailedSettlementPracticeDefs = {}, settlementStructureDefs = {};
  ${artSource}
  let loads = 0;
  loadPackedGroup = () => { loads++; return Promise.resolve(); };
  Object.values(PACKED_GROUPS).forEach((group,index) => {
    if (group === PACKED_GROUPS.resources || index === 0) return;
    packedTextures.set(group.prefix+'probe.png', {valid:true,baseTexture:{valid:true}});
    packedLoads.set(group, Promise.resolve());
    if (index % 2) hiddenGroups.add(group);
  });
  ({read:getChronicleArtworkPublicationSnapshot, texture:getChronicleTexture,
    fingerprint:()=>JSON.stringify({keys:[...packedTextures.keys()],hidden:[...hiddenGroups].map(g=>g.prefix),revision,loads})})
`, { Promise });
const artBefore = art.fingerprint();
const publication = reads(art.read, 'all nonresource artwork private publication');
assert.equal(art.fingerprint(), artBefore, 'metadata cannot load/mutate stores or revision');
assert.equal(publication.groups.length, 13);
assert.equal(publication.groups[0].loaded, false, 'unloaded group explicit');
for (const group of publication.groups) {
  if (group.sampleFile) assert.equal(!!art.texture(group.sampleFile), group.sampleDrawingAvailable,
    `actual loadTexture parity: ${group.id}`);
}
// Visible retained artwork is drawable even in minimal mode: hiding, not
// the minimal flag, gates already-loaded atlas frames in loadTexture.
assert.ok(publication.groups.some(g=>g.loaded && g.drawingAvailable));
assert.ok(publication.groups.some(g=>g.loaded && !g.drawingAvailable));

// Actual Life controller, live worker then ready job with stale revision/token.
const choices = await prepareLifeChoices(serializeGameState(state));
const nodeId = Object.keys(choices)[0];
const entered = deserializeGameState(choices[nodeId].stateData);
const optionId = getVassalNodeDecisionPresentation(entered, nodeId).nodeState.options.find(o => o.enabled !== false).id;
let lifeTimeline = { revision: 1, historyEndSec: entered.tSec, actions: [] };
let worker, starts = 0, terminations = 0, changes = 0, stateReads = 0;
const lifeRunner = { getTimeline: () => lifeTimeline,
  dispatchPreparedActionsAtCurrentSecond() { lifeTimeline.revision++; return { ok: true }; } };
const life = createLifeDecisionController({ getRunner: () => lifeRunner,
  getState: () => { stateReads++; if (observing) return poison.getState(); return entered; },
  onChange: () => { changes++; }, createWorker: () => { starts++; return worker = {
    terminate() { terminations++; }, postMessage(message) { this.message = message; } }; } });
life.dispatch(ActionKinds.VASSAL_SELECT_LIFE_OPTION, { nodeId, optionId });
life.dispatch(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
observing = true;
const lifecycle = JSON.stringify({ starts, terminations, changes, stateReads });
reads(() => life.getTimingSnapshot(), 'active Life job');
assert.equal(JSON.stringify({ starts, terminations, changes, stateReads }), lifecycle);
assert.equal(life.getTimingSnapshot().workerActive, true);
lifeTimeline.revision++;
const activeStale = reads(() => life.getTimingSnapshot(), 'stale active worker');
assert.equal(activeStale.sourceMatches, false);
assert.equal(activeStale.workerActive, true, 'observation cannot terminate a stale worker');
assert.equal(JSON.stringify({ starts, terminations, changes, stateReads }), lifecycle);
lifeTimeline.revision--; // restore fixture token before normal worker delivery
observing = false;
await runLifeDecisionJob(worker.message, message => worker.onmessage({ data: { ...message, requestId: worker.message.requestId } }));
await new Promise(resolve => setImmediate(resolve));
assert.equal(life.getTimingSnapshot().jobReady, true);
assert.equal(life.getTimingSnapshot().ready, true);
assert.ok(life.getTimingSnapshot().targetSec > life.getTimingSnapshot().baseSec);
lifeTimeline.revision++;
const staleBefore = JSON.stringify({ starts, terminations, changes, stateReads, lifeTimeline });
observing = true;
const stale = reads(() => life.getTimingSnapshot(), 'stale ready Life job');
assert.equal(stale.sourceMatches, false); assert.equal(stale.jobReady, true); assert.equal(stale.ready, false);
assert.equal(JSON.stringify({ starts, terminations, changes, stateReads, lifeTimeline }), staleBefore);
lifeTimeline = { ...lifeTimeline, revision: stale.baseRevision };
assert.equal(life.getTimingSnapshot().timelineMatches, false, 'same revision on replacement timeline stays stale');
observing = false;
assert.equal(life.getStatus(), null, 'normal orchestration still clears obsolete job');
const safeRunner = { ...runner, getState: poison.getState, getCursorState: poison.getCursorState };
const actualRunnerBefore = JSON.stringify(runner.getTimeline());
reads(() => {
  const preview = safeRunner.getPreviewStatus();
  const tl = safeRunner.getTimeline();
  return { historyEndSec: preview.historyEndSec, liveSec: preview.liveSec,
    previewSec: preview.previewSec, revision: tl.revision, actionCount: tl.actions.length };
}, 'actual runner passive primitives');
assert.equal(JSON.stringify(runner.getTimeline()), actualRunnerBefore);
const composed = createSettlementTimingSnapshot({
  getLocalState: () => ({ mode: 'map', selectedRegionId: 'R01', regionSelectionActive: true }),
  getRunner: () => ({ ...poison, getTimeline: () => timeline,
    getPreviewStatus: () => ({ active: true, liveSec: 10, previewSec: 30, historyEndSec: 10, isForecastPreview: true }) }),
  getMap: map, getGraph: graph, getLifeMap: lifeMap, getDecision: decision,
  getProcessing: () => life.getTimingSnapshot(), getRecap: recap,
  getOpeningSnapshot: () => ({phase:'revealing',preparation:'ready',coverageSec:100,elapsedSec:2,lossSec:100}),
  getArtwork: forbidden('artwork on default read') });
publishSettlementDebugApi(new Proxy({ getTimingSnapshot: composed }, { get: (target, key) => key in target ? target[key] : forbidden(`legacy.${String(key)}`) }));
const dto = reads(() => globalThis.__SETTLEMENT_DEBUG__.getTimingSnapshot(), 'published facade');
assert.equal(dto.version, 2); assert.equal(dto.runner.viewedSec, 30); assert.equal(dto.map.camera.zoom, 1.5);
assert.equal(JSON.stringify(raw), rawBefore); assert.equal(forbiddenCalls.length, 0);
assert.equal(dto.life.observedDecisionNodeId, 'cached-n0', 'stale cached decision is not relabelled as open node');
assert.equal(dto.life.decisionNodeId, 'n1');
assert.equal(dto.life.boardRegionId, 'R02');
assert.deepEqual(dto.life.boardPracticeIds, ['test',null,null,null,null]);
assert.equal(dto.opening.phase, 'revealing');
assert.equal(dto.map.artReady, false); assert.equal(dto.life.decisionArtReady, true);
assert.equal('artwork' in dto, false);
// Composition forwards optional queries unchanged and never requests artwork
// metadata on defaults. Missing facts remain null, including absent decisions.
let forwarded, artworkReads = 0;
const optional = createSettlementTimingSnapshot({
  getLocalState:()=>({}), getRunner:()=>null, getMap:()=>null,
  getGraph:options=>{forwarded=options;return controller.getTimingSnapshot(options);},
  getLifeMap:()=>null, getDecision:()=>null, getProcessing:()=>null, getRecap:()=>null,
  getArtwork:()=>{artworkReads++;return art.read();},
});
assert.equal(optional().life.boardPracticeIds, null);
assert.equal(artworkReads,0);
const query = {anchorSec:expectedAnchor, includeArtwork:true};
const queried = optional(query);
assert.equal(forwarded,query); assert.equal(queried.graph.requestedAnchorSec,expectedAnchor);
assert.equal(queried.graph.hasRetainedAnchor,true); assert.equal(artworkReads,1);
assert.equal(queried.artwork.version,1); assert.equal(queried.opening.lossSec,null);
const missingDecision = viewReader('src/views/vassal-node-decision-modal-pixi.js',
  {...raw,lastDecision:null,worldScreen:{getTimingSnapshot:()=>({artReady:false,artPrepared:null})}});
assert.equal(missingDecision().offerIds,null);
assert.equal(missingDecision().boardPracticeIds,null);
delete globalThis.__SETTLEMENT_DEBUG__;
sourceFiles.push('src/model/timegraph/controller-core.js', 'src/controllers/life-decision-controller.js',
  'src/model/timegraph/projection-cache.js', 'scripts/projection-timing-observability-test.mjs',
  'src/views/ui-root/settlement-timing-snapshot.js', 'src/views/ui-root/settlement-debug-api.js',
  'src/views/ui-root-settlement-pixi.js', 'src/views/chronicle-art.js', 'src/views/vassal-node-decision/world-screen.js',
  'scripts/timing-observability-browser-probe.mjs', 'scripts/timing-observability-test.mjs');
writeFileSync(`${output}/unit.json`, JSON.stringify({ verdict: 'focused checks passed; Phase A NOT SOUND',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), node: process.version,
  sourceHashes: Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])),
  forbiddenCalls, readsPerCase: 500, checks: ['raw view seams', 'actual graph controller', 'actual Life active/stale job',
    'state/RNG/timeline invariance', 'DTO mutation isolation', 'published facade', 'untimed graph parity'],
  limitations: ['Node view getters use closure fixtures; browser covers actual constructors', 'no matched overhead or tail acceptance'],
}, null, 2));
console.log(`[timing-observability] PASS: forbidden calls=0; state/RNG/cache/Life stale-token/DTO controls; ${output}/unit.json`);
