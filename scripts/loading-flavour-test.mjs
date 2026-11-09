import assert from 'node:assert/strict';
import { getLoadingFlavour, LOADING_FLAVOUR } from '../src/views/loading-flavour.js';

assert.match(getLoadingFlavour(), /fallen empire/);
assert.match(getLoadingFlavour({operation:'continue'}), /surviving empire/);
assert.equal(getLoadingFlavour({reuseWorld:true}), getLoadingFlavour({operation:'continue'}));
for (const [mode, lines] of Object.entries(LOADING_FLAVOUR)) {
  assert.ok(lines.includes('Reticulating Splines'));
  assert.equal(new Set(lines).size, lines.length);
  for (let i = 0; i < lines.length * 2; i++) {
    assert.equal(getLoadingFlavour({operation:mode === 'fallen' ? 'newGame' : 'continue',elapsedMs:i*4000}), lines[i%lines.length]);
  }
}
assert.equal(getLoadingFlavour({elapsedMs:-4}), getLoadingFlavour());
console.log('[loading-flavour] PASS fresh/returning/inherited-world copy, in-jokes, work-driven cycling');
