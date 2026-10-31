import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { createKeywordCardsState } from '../src/model/keywords-classes-prototype-fixture.js';
import { keywordAccess, keywordScore, keywordOutputAmount, keywordOutputSources } from '../src/model/practice-keywords.js';
import { getDetailedPracticeDef, validateGamepiecesDraft, createAuthoredGamepiecesDraft } from '../src/model/game-config.js';
import { getGamepieceFace } from '../src/model/gamepiece-presentation.js';
import { emitPracticeEvent } from '../src/model/detailed-settlements/practice-events.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { getVassalCandidatePool, selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { generateCandidatePool } from '../src/model/vassal-life-map/lifecycle/candidates.js';
import { applyClassAction } from '../src/model/vassal-life-map/class-actions.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { initializeReplayClock, advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';

// The player initializer captures attachments by default. Founding, rather than
// founder identity or a query-string preference, establishes ordinary access.
for (const role of ['scholar', 'warrior']) {
  const state = createNewGameState(1867), keyword = role === 'scholar' ? 'synthesis' : 'monsterTrophies';
  assert.equal(state.gameConfig.keywordPrototype, undefined);
  assert.equal(state.civilization.history.monsterTrophies, 0);
  for (const id of role === 'scholar'
    ? ['floodAlmanacs', 'marginalia', 'measuredRations', 'patternCarving', 'copyingTexts']
    : ['beastRendering', 'scarredShields', 'trailProvisioning', 'trophyRubbings', 'monsterHunting']) {
    const def = getDetailedPracticeDef(state, id);
    assert.equal(def.keywordOutputScale.keyword, keyword);
    assert.equal(def.prototypeKeyword, undefined, 'ordinary definitions carry no prototype marker');
    assert.equal(getGamepieceFace(null, 'practice', id).reading.keyword.id, keyword, 'catalogue inspection explains the passive too');
  }
  assert.equal(keywordAccess(state, keyword).active, false);
  const candidate = getVassalCandidatePool(state).candidates.find(candidate => candidate.founderClassId === role);
  assert.ok(candidate);
  assert.equal(selectLifeMapVassal(state, 1, null, candidate).ok, true);
  const lineage = state.civilization.vassalLineage, vassal = lineage.vassalsById[lineage.currentVassalId];
  assert.equal(keywordAccess(state, keyword).active, false, 'unclassed founder has no discipline');
  applyClassAction(state, vassal, { kind: 'train', classId: role, establishClass: true, count: role === 'scholar' ? 2 : 10 });
  assert.equal(keywordAccess(state, keyword).active, true, 'actual class establishment activates the discipline');
  assert.equal(keywordAccess(state, role === 'scholar' ? 'monsterTrophies' : 'synthesis').active, false);
  assert.equal(keywordAccess(state, 'economicRegions').active, false, 'Merchant is reserved, not reassigned to Scholar');
  emitPracticeEvent(state, { kind: 'monsterDestroyed', faction:'player' });
  emitPracticeEvent(state, { kind: 'defenseSucceeded' });
  emitPracticeEvent(state, { kind: 'campaignWon' });
  assert.equal(keywordScore(state, null, 'monsterTrophies'), 1, 'only a real destruction event earns a trophy');
  const saved = serializeGameState(state), loaded = deserializeGameState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(serializeGameState(loaded), saved);
  vassal.isDead = true;
  assert.equal(keywordAccess(state, keyword).active, false, 'dead Vassals never grant discipline bonuses');
  assert.equal(keywordScore(state, null, 'monsterTrophies'), 1, 'the civilization retains trophy history');
  vassal.isDead = false; vassal.endedReason = 'retired';
  assert.equal(keywordAccess(state, keyword).active, false);
  lineage.currentVassalId = null;
  assert.equal(keywordAccess(state, keyword).active, false, 'between lives is dormant');
  generateCandidatePool(state);
  const successor = { ...getVassalCandidatePool(state).candidates[0], classId: role, founderClassId: null };
  assert.equal(selectLifeMapVassal(state, 1, null, successor).ok, true);
  assert.equal(keywordAccess(state, keyword).active, true, 'a selected matching successor restores the discipline');
  assert.equal(keywordScore(state, null, 'monsterTrophies'), 1, 'selection does not reset history');
  const obsolete = structuredClone(saved); obsolete.gameStateSchemaVersion--;
  assert.throws(() => deserializeGameState(obsolete), /expected v41/);
}

// Ordinary A rules use captured coefficients, with no hidden per-card override.
const scholar = createKeywordCardsState('scholar'), regionId = scholar.civilization.capitalRegionId;
const definition = getDetailedPracticeDef(scholar, 'floodAlmanacs');
definition.keywordOutputScale = { keyword: 'synthesis', per: 2, amount: 2, cap: 1 };
const readingBefore = serializeGameState(scholar);
const sources = keywordOutputSources(scholar, regionId, definition);
assert.equal(keywordOutputAmount(scholar, regionId, definition.keywordOutputScale, definition.id), 2);
assert.equal(sources.reduce((sum, source) => sum + source.amount, 0), 2);
assert.ok(sources[0].label.includes(', '), 'grouped coefficients retain both contributor names');
assert.deepEqual(serializeGameState(scholar), readingBefore, 'reading never reserves Stock or rolls RNG');
initializeReplayClock(scholar);
const timeline = createTimelineFromInitialState(scholar);
assert.equal(advanceReplayStateToSecond(scholar, 36).ok, true);
assert.deepEqual(serializeGameState(rebuildStateAtSecond(timeline, 36).state), serializeGameState(scholar), 'ordinary captured coefficient replay');

const warrior = createKeywordCardsState('warrior');
initializeReplayClock(warrior);
const martialTimeline = createTimelineFromInitialState(warrior);
assert.equal(advanceReplayStateToSecond(warrior, 12).ok, true);
assert.equal(warrior.civilization.history.monsterTrophies, 1, 'ordinary real Hunt earns one persistent trophy');
assert.deepEqual(serializeGameState(rebuildStateAtSecond(martialTimeline, 12).state), serializeGameState(warrior));
const resumed = deserializeGameState(serializeGameState(warrior));
advanceReplayStateToSecond(warrior, 24); advanceReplayStateToSecond(resumed, 24);
assert.deepEqual(serializeGameState(resumed), serializeGameState(warrior), 'JSON continuation does not recount prior kills');
assert.equal(resumed.civilization.history.monsterTrophies, 1);
assert.ok(getDetailedSettlementSites(resumed, { playerOnly: true })[0].detailedState.practiceSlots[0].stock > 0);

for (const bad of [null, { keyword: 'unknown', per: 1, amount: 1, cap: 4 },
  { keyword: 'synthesis', per: 0, amount: 1, cap: 4 }, { keyword: 'synthesis', per: 1, amount: -1, cap: 4 },
  { keyword: 'synthesis', per: 1, amount: 1, cap: 1.5 }]) {
  const draft = createAuthoredGamepiecesDraft(); draft.practices.floodAlmanacs.keywordOutputScale = bad;
  assert.ok(validateGamepiecesDraft(draft).errors.some(error => error.includes('keyword Output Multiplier')));
}
console.log('[practice-keywords] OK: ordinary New Game, actual founding, class/death boundaries, captured DSL validation, real Hunt, JSON and authoritative replay');
