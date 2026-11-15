// Repair round 1 (B03/B04/B05) fail-closed checks. No browser needed.
import assert from 'node:assert/strict';
import { oracleNewGame } from './browser.mjs';
import { preparedPinCheck, applyGapOutcome, DRAG_REQUIRED_PRECONDITIONS } from './scrub-drag.mjs';
import { labelSequentialInProcess, SEQUENTIAL_IN_PROCESS } from './independence.mjs';
import { summarize } from './statistics.mjs';
import { EXPECTED_OPENING_LOSS_SEC, FROZEN_SEED } from './identities.mjs';

const goodSnap = { opening: { phase: 'completed', elapsedSec: 5, lossSec: EXPECTED_OPENING_LOSS_SEC, coverageSec: EXPECTED_OPENING_LOSS_SEC }, runner: { baseSeed: FROZEN_SEED } };
assert.equal(oracleNewGame(goodSnap, []).ok, true, 'control: completed reveal passes');
// B03 counterexample from the audit: reveal timeout swallowed at phase 'revealing', elapsedSec 0.
const stuck = { ...goodSnap, opening: { ...goodSnap.opening, phase: 'revealing', elapsedSec: 0 } };
const r = oracleNewGame(stuck, []);
assert.equal(r.ok, false, 'B03: incomplete reveal must fail closed');
assert.ok(r.reasons.some((x) => x.startsWith('reveal-incomplete')));

// B04: prepared start pins loss 6138 and seed.
const applied = { quality: 'high', renderScale: 1, terrain: 'illustrated' };
const pinOk = preparedPinCheck({ opening: { lossSec: EXPECTED_OPENING_LOSS_SEC, seed: FROZEN_SEED }, applied: null });
assert.ok(pinOk.reasons.every((x) => x === 'graphics-not-pinned'), 'pinned loss/seed accepted');
const pinBad = preparedPinCheck({ opening: { lossSec: 6137, seed: FROZEN_SEED }, applied });
assert.equal(pinBad.ok, false, 'B04: loss 6137 must fail closed');
assert.ok(pinBad.reasons.some((x) => x.startsWith('loss-mismatch')));
assert.equal(preparedPinCheck({ opening: { lossSec: EXPECTED_OPENING_LOSS_SEC, seed: 12345 }, applied }).ok, false, 'B04: seed mismatch fails');
assert.ok(DRAG_REQUIRED_PRECONDITIONS.includes('lossPinned'), 'B04: lossPinned required in drag oracle');
for (const k of ['revealSettled', 'referenceAwayReached', 'referenceReached']) assert.ok(DRAG_REQUIRED_PRECONDITIONS.includes(k), `B03: ${k} required`);

// B03: settle-gap idle timeout rejects the drag and its observations.
const drag = { ok: true, oracle: {}, required: [], observations: [{ ok: true }] };
applyGapOutcome(drag, { idleReached: false, totalMs: 35000 });
assert.equal(drag.ok, false); assert.equal(drag.observations[0].ok, false);
const drag2 = { ok: true, oracle: {}, required: [], observations: [{ ok: true }] };
applyGapOutcome(drag2, { idleReached: true }); assert.equal(drag2.ok, true);

// B05: 130 sequential in-process calls are one launch cluster -> no tail eligibility.
const rows = Array.from({ length: 130 }, (_, i) => labelSequentialInProcess({
  job: 'forecast-window', step: 'window', population: { runtime: 'node', process: 'single' }, elapsedMs: 1000 + (i % 17), ok: true, timeout: false,
  buildId: 'b', fixture: 'f', harnessId: 'h', measurementContractId: 'c', fixtureManifestId: 'm', oracleSdkSha256: 'o',
}, { idPrefix: 'wp4-window', index: i, pid: 4242 }));
assert.equal(new Set(rows.map((x) => x.launchId)).size, 1);
assert.equal(new Set(rows.map((x) => x.observationId)).size, 130);
assert.ok(rows.every((x) => x.independence === SEQUENTIAL_IN_PROCESS && x.tailInference === 'INCONCLUSIVE'));
const s = summarize(rows);
const row = Array.isArray(s) ? s[0] : s;
assert.ok(row && row.attempted === 130 && row.passed === 130, 'summary computed over all 130 rows');
assert.equal(row.p95Interval.bounded, false, 'B05: no bounded p95 interval from one process');
assert.equal(row.independentLaunches, 1);
assert.equal(row.eligibleForTailInference, false, `B05: sequential in-process rows must not be tail-eligible (${JSON.stringify(row).slice(0, 200)})`);
console.log('failclosed-test: ok (B03 reveal/gap/reference, B04 loss pin, B05 sequential label)');
