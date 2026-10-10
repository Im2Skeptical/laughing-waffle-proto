// Malformed save import at the public inspect/import boundary.
// Non-array timeline actions/checkpoints are normalized, not rejected.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSaveTestStorage } from './save-test-storage.mjs';
import { openSaveDatabase, runSaveTransaction, SAVE_PAYLOAD_STORE, SAVE_META_STORE } from '../src/controllers/sim-runner/save-storage.js';
import { createNewGameState } from '../src/model/new-game.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { serializeGameState } from '../src/model/state.js';
import {
  exportSave, writeSaveToSlot, inspectSaveText, importSaveToSlot, getSaveSlotMeta, SAVE_SCHEMA_VERSION,
} from '../src/controllers/sim-runner/save-slots.js';

const WITNESS = 3;
const DEST = 2;
const SOURCE = 1;
const priorIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
let database;

function patch(parsed, visit) {
  const copy = structuredClone(parsed);
  visit(copy);
  return JSON.stringify(copy);
}

function bothBodies(data, visit) {
  visit(data.state);
  visit(data.timeline.baseStateData);
}

async function clearSlot(slot) {
  const db = await openSaveDatabase();
  await runSaveTransaction(db, [SAVE_PAYLOAD_STORE, SAVE_META_STORE], 'readwrite', tx => {
    tx.objectStore(SAVE_PAYLOAD_STORE).delete(slot);
    tx.objectStore(SAVE_META_STORE).delete(slot);
  });
}

try {
  const state = createNewGameState(735);
  const timeline = createTimelineFromInitialState(state);
  database = createSaveTestStorage();
  const written = await writeSaveToSlot(SOURCE, { state, timeline, setupId: 'import-boundary' });
  assert.equal(written.ok, true);
  const baseline = await database.get(SOURCE);
  const parsed = JSON.parse(baseline);
  assert.equal(parsed.meta.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(exportSave({ state, timeline, setupId: 'import-boundary' }).ok, true);
  assert.equal(inspectSaveText(baseline).ok, true, 'positive inspect control');
  assert.deepEqual(serializeGameState(inspectSaveText(baseline).state), serializeGameState(state));

  const unicode = patch(parsed, data => { data.meta.setupId = '北-δ-🙂'; });
  const escaped = unicode.replace('北', '\\u5317');
  assert.equal(inspectSaveText(escaped).meta.setupId, '北-δ-🙂', 'Unicode JSON escapes parse');
  assert.equal((await importSaveToSlot(DEST, escaped)).ok, true);
  assert.equal(await database.get(DEST), escaped, 'valid import writes the supplied text');
  assert.equal(await database.get(SOURCE), baseline);
  assert.equal(await database.get(WITNESS), null);
  await clearSlot(DEST);

  const occupiedText = patch(parsed, data => { data.meta.setupId = 'occupied-valid'; });
  assert.equal(inspectSaveText(occupiedText).ok, true);
  const cases = [
    { id: 'broken-json', reason: 'badSaveData', text: '{broken' },
    { id: 'empty-text', reason: 'badSaveData', text: '' },
    { id: 'bad-unicode-escape', reason: 'badSaveData', text: '{"meta":"\\u12"}' },
    { id: 'null-envelope', reason: 'versionMismatch', text: 'null' },
    { id: 'array-envelope', reason: 'versionMismatch', text: '[]' },
    { id: 'missing-meta', reason: 'versionMismatch', mutate: data => { delete data.meta; } },
    { id: 'old-runner-schema', reason: 'versionMismatch', mutate: data => { data.meta.schemaVersion = SAVE_SCHEMA_VERSION - 1; } },
    { id: 'schema-version-string', reason: 'versionMismatch', mutate: data => { data.meta.schemaVersion = String(SAVE_SCHEMA_VERSION); } },
    { id: 'missing-timeline', reason: 'badSaveData', mutate: data => { delete data.timeline; } },
    { id: 'timeline-not-object', reason: 'badSaveData', mutate: data => { data.timeline = 'none'; } },
    { id: 'history-end-not-finite', reason: 'missingTimeline', mutate: data => { data.timeline.historyEndSec = null; data.timeline.cursorSec = 0; } },
    { id: 'negative-cursor', reason: 'badSaveData', mutate: data => { data.timeline.cursorSec = -1; } },
    { id: 'cursor-past-history', reason: 'badSaveData', mutate: data => { data.timeline.cursorSec = data.timeline.historyEndSec + 1; } },
    { id: 'cursor-not-number', reason: 'badSaveData', mutate: data => { data.timeline.cursorSec = '0'; } },
    { id: 'state-schema', reason: 'badSaveData', mutate: data => { data.state.gameStateSchemaVersion -= 1; } },
    { id: 'base-state-schema', reason: 'badSaveData', mutate: data => { data.timeline.baseStateData.gameStateSchemaVersion -= 1; } },
    { id: 'monster-pressure', reason: 'badSaveData', mutate: data => bothBodies(data, body => { body.civilization.chaos.monsterPressure = -1; }) },
    { id: 'rng-stream', reason: 'badSaveData', mutate: data => bothBodies(data, body => { body.rng.vassalSeed = null; }) },
    { id: 'game-config-schema', reason: 'badSaveData', mutate: data => bothBodies(data, body => { body.gameConfig.schemaVersion = 1; }) },
    { id: 'cursor-before-initial', reason: 'badSaveData', mutate: data => {
      bothBodies(data, body => { body.tSec = 8; });
      data.timeline.historyEndSec = 8;
      data.timeline.cursorSec = 0;
    } },
  ];
  assert.ok(cases.length >= 12 && cases.length <= 20);

  for (const occupied of [false, true]) {
    if (occupied) {
      assert.equal((await importSaveToSlot(DEST, occupiedText)).ok, true);
    } else {
      await clearSlot(DEST);
    }
    const before = await database.get(DEST);
    const beforeMeta = await getSaveSlotMeta(DEST);
    assert.equal(before, occupied ? occupiedText : null);
    for (const entry of cases) {
      const text = entry.text ?? patch(parsed, entry.mutate);
      const inspected = inspectSaveText(text);
      assert.equal(inspected.ok, false, entry.id);
      assert.equal(inspected.reason, entry.reason, entry.id);
      let imported;
      try { imported = await importSaveToSlot(DEST, text); }
      catch (error) { assert.fail(`${entry.id} threw ${error.name}: ${error.message}`); }
      assert.equal(imported.ok, false, `${entry.id} must return ok false`);
      assert.equal(imported.reason, entry.reason, entry.id);
      assert.equal(await database.get(DEST), before, `${entry.id} ${occupied ? 'occupied' : 'empty'} destination`);
      assert.deepEqual(await getSaveSlotMeta(DEST), beforeMeta, `${entry.id} destination metadata`);
      assert.equal(await database.get(SOURCE), baseline, `${entry.id} other slot`);
      assert.equal(await database.get(WITNESS), null, entry.id);
      assert.equal(baseline, JSON.stringify(parsed), `${entry.id} baseline text`);
    }
  }

  assert.equal((await importSaveToSlot(DEST, baseline)).ok, true, 'occupied slot accepts a valid replacement');
  assert.equal(await database.get(DEST), baseline);
  assert.equal(await database.get(SOURCE), baseline);
  console.log(`[save-import-boundaries] OK: ${cases.length} malformed cases, empty and occupied`);
} catch (error) {
  mkdirSync('artifacts', { recursive: true });
  const artifact = 'artifacts/save-import-boundaries-test-failure.json';
  writeFileSync(artifact, JSON.stringify({
    message: error.message, stack: error.stack, expected: error.expected, actual: error.actual,
  }, null, 2));
  console.error(`[save-import-boundaries] FAILED: ${String(error.message).split('\n')[0]}\nReproduce: node scripts/save-import-boundaries-test.mjs\nDetails: ${artifact}`);
  process.exitCode = 1;
} finally {
  database?.restore();
  if (priorIndexedDB) Object.defineProperty(globalThis, 'indexedDB', priorIndexedDB);
  else delete globalThis.indexedDB;
}
