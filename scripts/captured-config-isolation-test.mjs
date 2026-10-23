// Validate the reader's warm path, mutable input revalidation and detached bodies.
import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { createProjectionAnchorReader, serializeGameState } from '../src/model/state.js';

const source = serializeGameState(createNewGameState(42));
const before = structuredClone(source);
const reader = createProjectionAnchorReader();
const first = reader.read(source);
const second = reader.read(source);
assert.equal(first.gameConfig, second.gameConfig, 'equal configurations share private frozen config');
assert.ok(Object.isFrozen(second.gameConfig.settings.values));
assert.notEqual(second.gameConfig, source.gameConfig, 'config is detached from source');
second.world.sites[0].detailedState.practiceSlots.fill(null);
second.rng.seed = 7;
assert.deepEqual(source, before, 'warm read owns its mutable body');
assert.deepEqual(serializeGameState(first), before, 'another returned body is unaffected');
assert.deepEqual(serializeGameState(reader.read(source)), before, 'later read is unaffected');

// An in-place edit of an unfrozen input must not hit the identity shortcut.
source.gameConfig.settings.values.primordialBasePressure = 3;
const changed = reader.read(source);
assert.equal(changed.gameConfig.settings.values.primordialBasePressure, 3);
assert.equal(first.gameConfig.settings.values.primordialBasePressure,
  before.gameConfig.settings.values.primordialBasePressure);
// Freezing only the outer config does not make nested settings immutable.
Object.freeze(source.gameConfig);
reader.read(source);
source.gameConfig.settings.values.primordialBasePressure = 4;
assert.equal(reader.read(source).gameConfig.settings.values.primordialBasePressure, 4,
  'shallow-frozen input must still be compared by content');
const frozenInput = reader.read(serializeGameState(changed));
const shared = { ...source, gameConfig: frozenInput.gameConfig };
const frozenCopy = reader.read(shared);
assert.equal(frozenCopy.gameConfig, frozenInput.gameConfig);
assert.throws(() => { frozenCopy.gameConfig.settings.values.primordialBasePressure = 9; }, TypeError);
const invalid = { ...shared, rng: { ...shared.rng, seed: NaN } };
assert.throws(() => reader.read(invalid), /RNG/);
assert.ok(Number.isNaN(invalid.rng.seed), 'validation does not repair or mutate source');
reader.clear();
assert.notEqual(reader.read(source).gameConfig, changed.gameConfig, 'clear discards private config');
console.log('[captured-config-isolation] warm bodies, changed mutable configs, frozen reuse, invalid RNG and clear OK');
