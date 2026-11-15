import assert from 'node:assert/strict';
import {normalizeJobSelection,assertDiscoveryCell,EXECUTABLE_JOBS} from './job-schedule.mjs';
assert.deepEqual(normalizeJobSelection(['save']),['save-history','save-opening']);
assert.deepEqual(normalizeJobSelection(['scrub']),['scrub-anchor','scrub-off-anchor']);
assert.deepEqual(normalizeJobSelection(['performance']),['performance-new','performance-continue']);
assert.deepEqual(normalizeJobSelection(['map']),['map-pan','map-zoom','map-open','map-close']);
assert.deepEqual(normalizeJobSelection(['all']),EXECUTABLE_JOBS);
for(const input of [['save','save-opening'],['performance','performance-continue'],['scrub','scrub-anchor'],['map','map-pan'],['all','entry']])
  assert.throws(()=>normalizeJobSelection(input),/duplicate executable/,'alias plus explicit job cannot silently run twice');
assert.throws(()=>normalizeJobSelection(['typo']),/unknown/);assert.throws(()=>normalizeJobSelection([]),/nonempty/);
const cell={job:'save-history',seed:99117,cache:'warm',population:'mobile',artwork:'off'};
const manifest={failed:false,config:{...cell,jobs:[cell.job],samples:1},launches:[{launchId:'native-one',job:cell.job,sample:0}]};
assert.equal(assertDiscoveryCell(cell,manifest).launchId,'native-one');
for(const mutate of [m=>m.launches.push({...m.launches[0],launchId:'hidden-second'}),m=>m.launches[0].job='save-opening',
  m=>m.config.jobs=['save'],m=>m.config.seed=123,m=>m.failed=true,m=>m.config.samples=2]){
  const wrong=structuredClone(manifest);mutate(wrong);assert.throws(()=>assertDiscoveryCell(cell,wrong));
}
console.log('[job-schedule] canonical alias expansion, duplicate rejection and exact planned/actual launch identity controls PASS');
