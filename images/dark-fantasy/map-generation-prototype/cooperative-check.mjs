import assert from 'node:assert/strict';
import { runSync, runCooperative } from './cooperative.js';

const busy = ms => { const end = performance.now() + ms; while (performance.now() < end); };
function* job(log) { let total = 0; for (let i = 1; i <= 5; i++) { busy(30); total += i; log?.push(i); yield; } return total; }

// Both drivers run a job to the same result, in the same order.
const syncLog = [], coopLog = [];
assert.equal(runSync(job(syncLog)), 15);
const stats = {};
assert.equal(await runCooperative(job(coopLog), { sliceMs: 40, stats }), 15);
assert.deepEqual(coopLog, syncLog);
assert.equal(stats.steps, 6);
assert.ok(stats.longestStepMs >= 29, 'longest step reflects the real stretch of work');

// A long job lets other macrotasks run in between; the sync driver cannot.
let ticks = 0;
const timer = setInterval(() => { ticks++; }, 1);
await runCooperative(job(), { sliceMs: 20 });
const during = ticks;
clearInterval(timer);
assert.ok(during >= 3, `timers keep firing during a cooperative job (saw ${during})`);

// Cheap checkpoints do not yield every time: tiny steps share one slice.
const cheap = {};
await runCooperative((function* () { for (let i = 0; i < 1000; i++) yield; return 'done'; })(), { sliceMs: 1e6, stats: cheap });
assert.equal(cheap.yields ?? 0, 0);
assert.equal(cheap.steps, 1001);

// Slow checkpoints are reported for diagnostics, and errors propagate.
const slow = {};
await runCooperative((function* () { busy(120); yield; })(), { sliceMs: 10, stats: slow });
assert.deepEqual(slow.slowSteps.map(([step]) => step), [1]);
await assert.rejects(runCooperative((function* () { yield; throw new Error('boom'); })()), /boom/);
assert.throws(() => runSync((function* () { throw new Error('sync boom'); })()), /sync boom/);
console.log(JSON.stringify({ pass: true, timersDuringJob: during }));
