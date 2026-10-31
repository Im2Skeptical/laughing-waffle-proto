import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import {
  getVassalCandidatePool, getVassalStatPresentation, getVassalStatsPresentation,
  getVassalPrestigeIncome, getAdjustedVassalPrestigeCost, getCurrentLifeMapVassal,
} from '../src/model/vassal-life-map.js';
import { getVassalRiskDeathChance, rollScholarQualityBonus } from '../src/model/vassal-life-map/class-rules.js';
import { getMartialForce } from '../src/model/detailed-settlements/external-world.js';
import { FOUNDER_CLASSES, STAT_ICONS } from '../src/views/protovassal-class-data.js';
import { levelUpTooltipSpec } from '../src/views/vassal-level-up-modal-pixi.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { forceEnter, nodeIdForFamily } from '../src/model/tests/vassal-life-map/helpers.js';

const state = createNewGameState(131);
for (const [index, statId, label] of [[0, 'cunning', 'Ingenuity'], [1, 'intelligence', 'Prowess']]) {
  const founder = getVassalCandidatePool(state).candidates[index];
  assert.equal(founder.classId, null, 'reproduce the actual pre-Founding candidate');
  assert.equal(getVassalStatPresentation(founder, statId).label, label,
    `${founder.archetype} HUD and level-up must match the picker`);
}

for (const [classId, slot, label, iconId] of [
  ['scholar', 'cunning', 'Ingenuity', 'stock-knowledge'],
  ['warrior', 'intelligence', 'Prowess', 'stock-arms'],
]) {
  const base = { cunning: 4, intelligence: 3, wisdom: 2, effectiveness: 1 };
  for (const identity of [{ classId: null, founderClassId: classId }, { classId, founderClassId: null }]) {
    const vassal = { ...identity, stats: base };
    const presentation = getVassalStatPresentation(vassal, slot);
    assert.equal(presentation.label, label);
    assert.equal(presentation.iconId, iconId);
    assert.equal(presentation.statId, slot, 'serialized slots remain stable');
    assert.equal(FOUNDER_CLASSES[classId].stat, presentation.label);
    assert.equal(STAT_ICONS[presentation.label], presentation.iconId);
    const tip = levelUpTooltipSpec(vassal, slot);
    assert.equal(tip.title, label, 'the level-up tooltip uses the same identity');
    assert.equal(tip.sections[0].text, presentation.powerLabel);
    const raised = getVassalStatPresentation({ ...vassal, stats: { ...base, [slot]: base[slot] + 1 } }, slot);
    assert.equal(tip.sections[1].text, raised.powerLabel);
    assert.equal(getVassalPrestigeIncome(vassal), classId === 'scholar' ? 3 : 7);
    assert.equal(getAdjustedVassalPrestigeCost(vassal, 100), classId === 'warrior' ? 100 : 76);
    assert.equal(getVassalRiskDeathChance(vassal, .5), classId === 'warrior' ? .275 : .5);
    const forceBase = getMartialForce(state, { stats: base });
    assert.equal(getMartialForce(state, vassal) - forceBase, classId === 'warrior' ? 3 + (vassal.classId === 'warrior' ? Math.floor(state.civilization.prestige / 10) : 0) : 0);
    const qualityState = deserializeGameState(serializeGameState(state));
    const rngBefore = qualityState.rng.vassalSeed;
    assert.equal(rollScholarQualityBonus(qualityState, { ...vassal, stats: { ...base, cunning: 40 } }, 3),
      classId === 'scholar' ? 2 : 0, 'Ingenuity affects real shop-quality rolls before and after Founding');
    assert.equal(qualityState.rng.vassalSeed, rngBefore, 'guaranteed uplift consumes no RNG');
  }
  // A fresh founder can earn and spend a level before reaching Founding. The
  // selection action and earned-stat action must rebuild with identical state/RNG.
  const initial = createNewGameState(131);
  const index = classId === 'scholar' ? 0 : 1;
  const timeline = createTimelineFromInitialState(initial);
  const select = appendActionAtCursor(timeline, {
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL, payload: { candidateIndex: index }, tSec: 0,
  }, initial);
  assert.equal(select.ok, true);
  const selected = rebuildStateAtSecond(timeline, 0);
  assert.equal(selected.ok, true);
  const vassal = getCurrentLifeMapVassal(selected.state);
  assert.equal(vassal.classId, null);
  assert.equal(getVassalStatPresentation(vassal, slot).label, label);
  assert.deepEqual(getVassalStatsPresentation(getCurrentLifeMapVassal(deserializeGameState(serializeGameState(selected.state)))) ,
    getVassalStatsPresentation(vassal), 'founder identity survives JSON round-trip');
  // Exercise actual pre-Founding Development presentation, including trades.
  const node = forceEnter(selected.state, nodeIdForFamily(selected.state, 'development'));
  for (const option of node.options) {
    assert.equal(option.statLabel, getVassalStatPresentation(vassal, option.statId).label);
    if (option.lossStatId) assert.equal(option.lossStatLabel, getVassalStatPresentation(vassal, option.lossStatId).label);
  }
  vassal.initialAge = 20;
  vassal.stats.wisdom = 40;
  const steady = node.options.find(option => option.id === 'steadyPractice');
  assert.ok(steady);
  steady.phaseCost = 0;
  const levelTimeline = createTimelineFromInitialState(selected.state);
  const commit = (kind, payload) => {
    const action = { kind, payload, tSec: selected.state.tSec };
    assert.equal(appendActionAtCursor(levelTimeline, action, selected.state).ok, true);
    assert.equal(applyAction(selected.state, action, { isReplay: true }).ok, true);
  };
  commit(ActionKinds.VASSAL_SELECT_LIFE_OPTION, { nodeId: node.nodeId, optionId: steady.id });
  commit(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: node.nodeId });
  assert.ok(vassal.developmentChoiceQueue.some(choice => choice.offeredStatIds.includes(slot)));
  while (vassal.developmentChoiceQueue.length) {
    const choice = vassal.developmentChoiceQueue[0];
    const statId = choice.offeredStatIds.includes(slot) ? slot : choice.offeredStatIds[0];
    const before = vassal.stats[statId];
    commit(ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT, { choiceId: choice.choiceId, statId });
    assert.equal(vassal.stats[statId], before + 1);
  }
  const replay = rebuildStateAtSecond(levelTimeline, selected.state.tSec);
  assert.equal(replay.ok, true);
  assert.deepEqual(serializeGameState(replay.state), serializeGameState(selected.state),
    'pre-Founding node income and level-up actions replay with identical state/RNG');
}

const unclassed = { classId: null, founderClassId: null, stats: { cunning: 4, intelligence: 3 } };
assert.equal(getVassalStatPresentation(unclassed, 'cunning').label, 'Cunning');
assert.equal(getVassalStatPresentation(unclassed, 'intelligence').label, 'Intelligence');
assert.equal(getVassalPrestigeIncome(unclassed), 7);
assert.equal(getAdjustedVassalPrestigeCost(unclassed, 100), 76);
assert.equal(getVassalStatPresentation({ ...unclassed, classId: 'warrior', founderClassId: 'scholar' }, 'cunning').label,
  'Cunning', 'an established class takes precedence over founder identity');
console.log('Vassal stat identity OK');
