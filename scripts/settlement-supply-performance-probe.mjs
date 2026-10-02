// Compare stock-query cost with an unchanged checkout of the same gameplay.
// node scripts/settlement-supply-performance-probe.mjs <checkout>
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInitialState } from '../src/model/init.js';
import { serializeGameState } from '../src/model/state.js';
import { planStock } from '../src/model/detailed-settlements/stock.js';
import { buildProjectionChunkFromStateData } from '../src/model/projection-chunk.js';
import { practiceSlot, fiveSlots } from '../src/model/dev-lab/fixtures.js';
import * as timelineApi from '../src/model/timeline/index.js';
import { rememberMaxObservedCivilizationSurvivalYear } from '../src/model/persistent-memory.js';

if (!process.argv[2]) throw new Error('Supply an unchanged checkout with the same gameplay/save schema');
const root = pathToFileURL(resolve(process.argv[2]) + '/');
const baseline = await import(new URL('src/model/detailed-settlements/stock.js', root));
const baselineProjection = await import(new URL('src/model/projection-chunk.js', root));
const baselineTimeline = await import(new URL('src/model/timeline/index.js', root));
const state = createInitialState('devPlaytesting01', 99117);
state.gameConfig.settings.values.primordialBasePressure = 0;
state.paused = false;
const base = serializeGameState(state);
const [local, remote] = state.world.sites.filter(site => site.simulationMode === 'detailed');
local.detailedState.practiceSlots = fiveSlots();
remote.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 3), practiceSlot('surfaceMining', 2));
const costs = [{ traits: ['Timber'], amount: 1 }];
const requirements = [{ traits: ['Ore'], amount: 1 }];
const report = { calls: 10000, seconds: 512, baseline: [], optimized: [] };
const measure = (stock, projection, timeline) => {
  const sample = {};
  for (const [name, consume, require] of [['emptyMs', [], []], ['remoteMs', costs, requirements]]) {
    const start = performance.now();
    for (let i = 0; i < report.calls; i++) {
      assert.equal(stock(state, local.detailedState, consume, require).ok, true);
    }
    sample[name] = performance.now() - start;
  }
  const start = performance.now();
  const result = projection(base, 0, report.seconds);
  sample.projectionMs = performance.now() - start;
  assert.equal(result.ok, true);
  assert.equal(result.endSec, report.seconds);
  const boundaryTimeline = timeline.createTimelineFromInitialState(state);
  rememberMaxObservedCivilizationSurvivalYear(boundaryTimeline, 75);
  const boundaryStart = performance.now();
  let boundary;
  for (let i = 0; i < 100; i++) boundary = timeline.getStateDataAtSecond(boundaryTimeline, 0);
  sample.boundaryMs = performance.now() - boundaryStart;
  assert.equal(boundary.ok, true);
  return { sample, result, boundary };
};
for (let round = 0; round < 5; round++) {
  let before, after;
  const runBefore = () => before = measure(baseline.planStock, baselineProjection.buildProjectionChunkFromStateData, baselineTimeline);
  const runAfter = () => after = measure(planStock, buildProjectionChunkFromStateData, timelineApi);
  if (round % 2) { runAfter(); runBefore(); } else { runBefore(); runAfter(); }
  assert.deepEqual(after.result, before.result, 'every summary, replay anchor and final state must match');
  assert.deepEqual(after.boundary, before.boundary, 'reused frontier data must include the same persistent knowledge');
  assert.deepEqual(planStock(state, local.detailedState, costs, requirements),
    baseline.planStock(state, local.detailedState, costs, requirements), 'provider order and allocation must match');
  if (round > 0) { report.baseline.push(before.sample); report.optimized.push(after.sample); }
}
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
report.ratios = {};
report.medians = { baseline: {}, optimized: {} };
for (const key of ['emptyMs', 'remoteMs', 'projectionMs', 'boundaryMs']) {
  for (const revision of ['baseline', 'optimized']) report.medians[revision][key] = median(report[revision].map(sample => sample[key]));
  report.ratios[key] = report.medians.optimized[key] / report.medians.baseline[key];
}
mkdirSync('artifacts/perf-supply', { recursive: true });
const artifact = 'artifacts/perf-supply/comparison.json';
writeFileSync(artifact, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ medians: report.medians, ratios: report.ratios, artifact }));
assert.ok(report.ratios.emptyMs < .5, 'empty stock queries must eliminate at least half the regression cost');
assert.ok(report.ratios.remoteMs < .5, 'remote stock queries must eliminate at least half the regression cost');
assert.ok(report.ratios.projectionMs < 1.2, 'complete forecasts must not regress');
assert.ok(report.ratios.boundaryMs < .5, 'polling an unchanged forecast boundary must eliminate repeated validation');
