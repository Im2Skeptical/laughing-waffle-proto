/**
 * Direct runFaithPhase controls. One helper call is one Faith reckoning on the
 * fixture's current moon turn. This does not advance tSec and does not replay
 * elapsed years.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { getDetailedSettlement } from '../src/model/detailed-settlements.js';
import { runFaithPhase } from '../src/model/detailed-settlements/phases/faith.js';
import { addMoonMigrationIntent } from '../src/model/detailed-settlements/phases/migration.js';
import { setMoonTurnPhase } from '../src/model/detailed-settlements/phases/moon-turn.js';
import { selectPopulationComposition } from '../src/model/detailed-settlements/helpers.js';
import { getMoonPhaseAtSecond } from '../src/model/moon-phases.js';
import { deserializeGameState, serializeGameState } from '../src/model/state.js';
import { clearDetailedPopulationAndFood, fresh } from '../src/model/tests/detailed-settlements/helpers.js';

const REGION = 'cedar-woods';
const DIFF_PATH = 'artifacts/faith-phase-boundaries-first-diff.json';

function capturedFaithConfig(state) {
  const values = state.gameConfig.settings.values;
  assert.equal(values.faithStreakForShift, 3);
  assert.equal(values.bronzeCollapseLossRate, 0.25);
  return {
    shiftAt: values.faithStreakForShift,
    collapseRate: values.bronzeCollapseLossRate,
  };
}

function fixture() {
  const state = clearDetailedPopulationAndFood(fresh(880));
  capturedFaithConfig(state);
  return state;
}

function phaseNow(state) {
  return getMoonPhaseAtSecond(state, 4);
}

function evidence(state, foodTarget, housingCap) {
  const turn = setMoonTurnPhase(state, phaseNow(state));
  const region = turn.regions[REGION];
  region.food = { byClass: { villager: { targetHappiness: foodTarget } } };
  region.housing = { happinessCap: housingCap };
  return turn;
}

function arm(state, spec) {
  const villager = getDetailedSettlement(state, REGION).populationByClass.villager;
  villager.children = 0;
  villager.adults = spec.adults;
  villager.eldersByAge = [];
  villager.faith = {
    tier: spec.tier,
    trend: spec.trend ?? null,
    streak: spec.streak ?? 0,
    collapseActive: spec.collapseActive === true,
  };
  villager.happiness.status = spec.happiness ?? 'neutral';
  villager.happiness.fullFeedStreak = 0;
  villager.happiness.missedFeedStreak = 0;
  villager.happiness.partialFeedRatios = [];
  return villager;
}

function reckon(state, foodTarget, housingCap) {
  evidence(state, foodTarget, housingCap);
  runFaithPhase(state, phaseNow(state));
  return state.civilization.currentMoonTurn.regions[REGION].faith.byClass.villager;
}

function faithIntents(state) {
  return state.civilization.currentMoonTurn.migrationIntents.filter((intent) => intent.reason === 'faith');
}

function preview(value) {
  const text = JSON.stringify(value);
  if (text == null) return String(value);
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function firstDiff(live, loaded, nodePath = '$') {
  if (Object.is(live, loaded)) return null;
  const liveObj = live !== null && typeof live === 'object';
  const loadedObj = loaded !== null && typeof loaded === 'object';
  if (liveObj && loadedObj) {
    const keys = [...new Set([...Object.keys(live), ...Object.keys(loaded)])].sort();
    for (const key of keys) {
      const found = firstDiff(live[key], loaded[key], `${nodePath}.${key}`);
      if (found) return found;
    }
    return null;
  }
  return { path: nodePath, live, loaded };
}

function assertSerializedEqual(live, loaded, label) {
  const actual = serializeGameState(live);
  const expected = serializeGameState(loaded);
  if (isDeepStrictEqual(actual, expected)) return;
  const diff = firstDiff(actual, expected) ?? { path: '$', live: 'different structure', loaded: 'different structure' };
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(DIFF_PATH, `${JSON.stringify({
    label,
    path: diff.path,
    live: preview(diff.live),
    loaded: preview(diff.loaded),
  }, null, 2)}\n`);
  assert.fail(`${label} diverged at ${diff.path}`);
}

function positiveStreak() {
  const state = fixture();
  arm(state, { adults: 10, tier: 'gold' });
  const first = reckon(state, 'positive', 'positive');
  assert.equal(first.faith, 'gold');
  assert.equal(first.faithShifted, false);
  assert.equal(first.faithTrend, 'positive');
  assert.equal(first.faithStreak, 1);
  const second = reckon(state, 'positive', 'positive');
  assert.equal(second.faith, 'gold');
  assert.equal(second.faithShifted, false);
  assert.equal(second.faithStreak, 2);
  const loaded = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
  assertSerializedEqual(state, loaded, 'roundtrip after two positive faith results');
  const thirdLive = reckon(state, 'positive', 'positive');
  const thirdLoaded = reckon(loaded, 'positive', 'positive');
  assert.equal(thirdLive.faith, 'diamond');
  assert.equal(thirdLive.faithShifted, true);
  assert.equal(thirdLive.faithStreak, 0);
  assert.equal(thirdLoaded.faith, 'diamond');
  assert.equal(thirdLoaded.faithStreak, 0);
  assertSerializedEqual(state, loaded, 'live and loaded continuation on the third positive result');
}

function neutralResets() {
  const state = fixture();
  arm(state, { adults: 4, tier: 'silver' });
  reckon(state, 'positive', 'positive');
  reckon(state, 'positive', 'positive');
  const row = reckon(state, 'neutral', 'positive');
  assert.equal(row.happiness, 'neutral');
  assert.equal(row.faith, 'silver');
  assert.equal(row.faithShifted, false);
  assert.equal(row.faithTrend, null);
  assert.equal(row.faithStreak, 0);
}

function reversalStartsAtOne() {
  const state = fixture();
  arm(state, { adults: 4, tier: 'gold' });
  reckon(state, 'positive', 'positive');
  reckon(state, 'positive', 'positive');
  const row = reckon(state, 'negative', 'positive');
  assert.equal(row.happiness, 'negative');
  assert.equal(row.faith, 'gold');
  assert.equal(row.faithShifted, false);
  assert.equal(row.faithTrend, 'negative');
  assert.equal(row.faithStreak, 1);
}

function tiersSaturate() {
  const down = fixture();
  arm(down, { adults: 4, tier: 'bronze' });
  reckon(down, 'negative', 'positive');
  reckon(down, 'negative', 'positive');
  const held = reckon(down, 'negative', 'positive');
  assert.equal(held.faith, 'bronze');
  assert.equal(held.faithShifted, false);
  assert.equal(held.faithStreak, 0);
  const up = fixture();
  arm(up, { adults: 4, tier: 'diamond' });
  reckon(up, 'positive', 'positive');
  reckon(up, 'positive', 'positive');
  const capped = reckon(up, 'positive', 'positive');
  assert.equal(capped.faith, 'diamond');
  assert.equal(capped.faithShifted, false);
  assert.equal(capped.faithStreak, 0);
}

function housingCapBoundsFoodTarget() {
  const capped = fixture();
  arm(capped, { adults: 4, tier: 'gold' });
  const neutralCap = reckon(capped, 'positive', 'neutral');
  assert.equal(neutralCap.previousHappiness, 'neutral');
  assert.equal(neutralCap.happiness, 'neutral');
  assert.equal(neutralCap.faithTrend, null);
  assert.equal(neutralCap.faithStreak, 0);
  const negativeCap = fixture();
  arm(negativeCap, { adults: 4, tier: 'gold' });
  const heldDown = reckon(negativeCap, 'positive', 'negative');
  assert.equal(heldDown.happiness, 'negative');
  assert.equal(heldDown.faithTrend, 'negative');
  assert.equal(heldDown.faithStreak, 1);
  const foodDown = fixture();
  arm(foodDown, { adults: 4, tier: 'gold' });
  const followed = reckon(foodDown, 'negative', 'positive');
  assert.equal(followed.happiness, 'negative');
  assert.equal(followed.faithStreak, 1);
}

function collapseEntryRepeatAndRecovery() {
  const state = fixture();
  const { collapseRate } = capturedFaithConfig(state);
  const people = 10;
  arm(state, { adults: people, tier: 'bronze', collapseActive: false });
  const expected = Math.ceil(people * collapseRate);
  assert.equal(expected, 3);
  const entered = reckon(state, 'negative', 'positive');
  assert.equal(entered.faith, 'bronze');
  assert.equal(entered.displaced, expected);
  assert.equal(entered.collapseEntered, true);
  assert.equal(getDetailedSettlement(state, REGION).populationByClass.villager.faith.collapseActive, true);
  assert.equal(faithIntents(state).length, 1);
  assert.equal(faithIntents(state)[0].requested, expected);
  const repeat = reckon(state, 'negative', 'positive');
  assert.equal(repeat.displaced, 0);
  assert.equal(repeat.collapseEntered, false);
  assert.equal(faithIntents(state).length, 1);
  const recovered = reckon(state, 'neutral', 'positive');
  assert.equal(recovered.happiness, 'neutral');
  assert.equal(recovered.displaced, 0);
  assert.equal(getDetailedSettlement(state, REGION).populationByClass.villager.faith.collapseActive, false);
  const again = reckon(state, 'negative', 'positive');
  assert.equal(again.displaced, expected);
  assert.equal(again.collapseEntered, true);
  assert.equal(faithIntents(state).length, 2);
  const loaded = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
  assertSerializedEqual(state, loaded, 'roundtrip after collapse re-entry');
  reckon(state, 'neutral', 'positive');
  reckon(loaded, 'neutral', 'positive');
  assertSerializedEqual(state, loaded, 'live and loaded continuation after collapse recovery');
}

function reservationHeadroom() {
  const state = fixture();
  const people = 10;
  const settlement = getDetailedSettlement(state, REGION);
  arm(state, { adults: people, tier: 'bronze', collapseActive: false });
  const turn = evidence(state, 'negative', 'positive');
  const reserved = 8;
  const held = addMoonMigrationIntent(state, turn, {
    reason: 'food',
    sourceId: REGION,
    sourceClassId: 'villager',
    composition: selectPopulationComposition(settlement, ['villager'], reserved),
  });
  assert.equal(held.requested, reserved);
  runFaithPhase(state, phaseNow(state));
  const row = turn.regions[REGION].faith.byClass.villager;
  assert.equal(row.displaced, people - reserved);
  assert.equal(faithIntents(state)[0].requested, people - reserved);
}

positiveStreak();
neutralResets();
reversalStartsAtOne();
tiersSaturate();
housingCapBoundsFoodTarget();
collapseEntryRepeatAndRecovery();
reservationHeadroom();
console.log('[faith-phase-boundaries] direct runFaithPhase controls OK');
