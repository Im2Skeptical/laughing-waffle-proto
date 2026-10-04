import assert from 'node:assert/strict';
import { createNodeResolutionDiagnostics } from '../src/controllers/node-resolution-diagnostics.js';

let time = 0;
const diagnostics = createNodeResolutionDiagnostics({ now: () => time });
const sample = (at, recapOpen, resolutionSec = 12) => {
  time = at; diagnostics.sample({ recapOpen, resolutionSec });
};
sample(0, false);
sample(2000, true);
sample(2016, true);
sample(4900, true);
sample(8500, true);
assert.equal(diagnostics.snapshot()[0].maxFrameGapMs, 3600,
  'capture the full freeze when it starts within the first three seconds');
sample(14000, true);
assert.equal(diagnostics.snapshot()[0].maxFrameGapMs, 3600,
  'later popup reading time is outside the measurement window');
diagnostics.suspend();
sample(90000, false);
sample(90016, true, 24);
sample(90032, true, 24);
assert.equal(diagnostics.snapshot().at(-1).maxFrameGapMs, 16,
  'background or menu time must not be counted as a freeze');
for (let i = 0; i < 5; i++) {
  sample(100000 + i * 100, false);
  sample(100016 + i * 100, true, 30 + i);
}
assert.equal(diagnostics.snapshot().length, 3, 'diagnostics stay bounded');
const copy = diagnostics.snapshot(); copy[0].resolutionSec = -1;
assert.notEqual(diagnostics.snapshot()[0].resolutionSec, -1, 'reports cannot mutate retained timings');
console.log('[node-resolution-diagnostics] popup gaps, window boundary, suspension and bounded reports OK');
