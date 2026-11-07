// Ordinary Monster Trophies after full-map control. Captured coefficients and
// the documented formula are the oracle: min(cap, floor(score / per)) * amount.
// Charge Stock is floor(base * (1 + contribution)); a scheduled Hunt with no
// workers uses the same multiplier on its base, evaluated before the kill.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState, syncPhaseToPaused } from '../src/model/state.js';
import { cmdSetPaused } from '../src/model/game-model.js';
import { advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { keywordAccess } from '../src/model/practice-keywords.js';
import { stockOutputBreakdown, stockCapacity } from '../src/model/detailed-settlements/stock.js';
import { runPracticeActivation, flushPracticeEvents } from '../src/model/detailed-settlements/practices.js';
import { emitPracticeEvent } from '../src/model/detailed-settlements/practice-events.js';
import { adjacentRegionIds, addMonsterPressure } from '../src/model/detailed-settlements/external-world.js';
import { changeController } from '../src/model/detailed-settlements/territory.js';
import { writePopulationBins } from '../src/model/detailed-settlements/population-ledger.js';
import { getVassalCandidatePool, selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { generateCandidatePool } from '../src/model/vassal-life-map/lifecycle/candidates.js';
import { applyClassAction } from '../src/model/vassal-life-map/class-actions.js';
import { resolveCampaignAttempt, buildCampaignOptions } from '../src/model/vassal-life-map/campaign.js';

const outDir = 'artifacts/grok-nov07-spend/monster-trophies';
const names = [];
const eq = (actual, expected, name) => { names.push(name); assert.equal(actual, expected, `ASSERT ${name}`); };
const deep = (actual, expected, name) => { names.push(name); assert.deepEqual(actual, expected, `ASSERT ${name}`); };
const trophyScale = { keyword: 'monsterTrophies', per: 2, amount: 3, cap: 1 };
const contrib = (scale, score, active) => active ? Math.min(scale.cap, Math.floor(score / scale.per)) * scale.amount : 0;
const snap = state => ({ saved: serializeGameState(state), paused: state.paused, phase: state.phase, tSec: state.tSec,
  rng: [state.rng.seed, state.rng.baseSeed, state.rng.vassalSeed, state.rng.vassalDevelopmentSeed, state.rng.vassalLifeMapSeed, state.rng.vassalPortraitSeed] });
const pure = (state, read) => { const before = snap(state); const value = read(); deep(snap(state), before, 'pure-read'); return value; };
const people = (allegiance, warrior = 0) => [
  ...(warrior ? [{ classId: 'villager', allegiance, specialty: 'warrior', kind: 'adults', age: null, count: warrior }] : []),
  { classId: 'villager', allegiance, specialty: 'ordinary', kind: 'children', age: null, count: 4 }];

const state = createNewGameState(1867);
state.gameConfig.gamepieces.practices.beastRendering.keywordOutputScale = { ...trophyScale };
const region = id => state.world.regions.find(row => row.id === id);
const siteOf = id => state.world.sites.find(site => site.regionId === id);
const trophies = () => state.civilization.history.monsterTrophies;
const capitalId = state.civilization.capitalRegionId;
const capital = siteOf(capitalId);
const hunterId = state.world.regions.find(row => row.controller === 'player' && row.id !== capitalId).id;
const hunter = siteOf(hunterId);
const crownId = state.world.regions.find(row => row.controller === 'external-a').id;
const crown = siteOf(crownId);
const live = () => { const lineage = state.civilization.vassalLineage; const vassal = lineage.vassalsById?.[lineage.currentVassalId]; return vassal; };
const pause = on => { eq(cmdSetPaused(state, on).ok, true, on ? 'pause-for-action' : 'unpause-for-tick'); syncPhaseToPaused(state); };
let serial = state.civilization.nextPracticeInstanceId;
const piece = (id, extra = {}) => {
  const def = state.gameConfig.gamepieces.practices[id];
  const slot = { practiceId: id, tier: def.minimumQuality, instanceId: `institution:${serial++}`, charge: 0, work: 0 };
  if (def.category === 'influence') slot.allegiance = extra.allegiance; else slot.stock = extra.stock ?? 0;
  return slot;
};
const board = (site, slots, allegiance, warrior = 0) => {
  site.detailedState.practiceSlots = [...slots, null, null, null, null, null].slice(0, 5);
  site.detailedState.structureSlots.fill(null);
  writePopulationBins(site.detailedState, people(allegiance, warrior));
  site.detailedState.garrison = { supplied: true, paid: 0, required: 0, tSec: state.tSec };
};
const plant = (hostId, defense = 0) => {
  for (const row of state.world.regions) delete row.monster;
  const id = adjacentRegionIds(state, hostId)[0];
  region(id).monster = { defense };
  state.civilization.chaos.monsterCount = 1;
  return id;
};
// Each planted encounter is an isolated effect fixture. Refill legal Food hosts
// between encounters rather than overfilling a small-capacity card.
const refillFood = () => {
  for (const site of [capital, hunter, crown]) for (const slot of site.detailedState.practiceSlots) {
    if (slot?.practiceId === 'dryFarming') slot.stock = stockCapacity(state, site.detailedState, slot);
    if (slot && 'stock' in slot) assert.ok(slot.stock <= stockCapacity(state, site.detailedState, slot), 'fixture Stock stays within capacity');
  }
};
const death = () => { refillFood(); pause(false); runPracticeActivation(state, 'death'); };
const ledger = () => pure(state, () => {
  const slot = capital.detailedState.practiceSlots.find(row => row?.practiceId === 'beastRendering');
  const sources = stockOutputBreakdown(state, capital.detailedState, slot).sources;
  eq(sources.every(source => String(source.id).startsWith('keyword:')), true, 'ledger-only-keyword');
  return sources.map(source => source.amount);
});
const access = expected => eq(keywordAccess(state, 'monsterTrophies', capitalId).active, expected, expected ? 'discipline-active' : 'discipline-dormant');

eq(state.rulesetId, 'full-map-redesign-v1', 'ordinary-full-map');
eq(state.gameConfig.keywordPrototype, undefined, 'no-keyword-prototype');
eq(trophies(), 0, 'history-starts-empty');
board(crown, [piece('fm_oathSupper', { allegiance: 'player' }), piece('monsterHunting'), piece('weaponsmithing', { stock: 1 }), piece('dryFarming', { stock: 10 })], 'external-a');
board(hunter, [piece('monsterHunting'), piece('weaponsmithing', { stock: 6 }), piece('fletching', { stock: 4 }), piece('dryFarming', { stock: 10 })], 'player');
board(capital, [piece('beastRendering'), piece('dryFarming', { stock: 10 }), piece('weaponsmithing', { stock: 5 })], 'player', 5);
state.civilization.nextPracticeInstanceId = serial;
const oath = crown.detailedState.practiceSlots[0], crownHunt = crown.detailedState.practiceSlots[1], playerHunt = hunter.detailedState.practiceSlots[0];
const render = () => capital.detailedState.practiceSlots.find(row => row?.practiceId === 'beastRendering');
const huntScale = state.gameConfig.gamepieces.practices.monsterHunting.keywordOutputScale;
deep(ledger(), [], 'score-zero-ledger');
access(false);

const crownMonster = plant(crownId);
death();
eq(region(crownMonster).monster, undefined, 'crown-hunt-resolved');
eq(trophies(), 0, 'crown-hunt-not-player');
eq(render().stock, 0, 'player-institution-ignored');
const crownEvent = state.civilization.practiceEvents.trace.filter(entry => entry.kind === 'monsterDestroyed').at(-1);
eq(crownEvent.faction, 'external-a', 'crown-journal-controller');
eq(crownEvent.controller, 'external-a', 'crown-journal-controller-field');
eq(crownEvent.instanceId, crownHunt.instanceId, 'hunt-names-hunting-practice');
eq(crownEvent.instanceId === oath.instanceId, false, 'player-oath-does-not-own-hunt');
crown.detailedState.practiceSlots[1] = null;

const beforeFounding = trophies();
playerHunt.stock = 0; render().stock = 0;
plant(hunterId); death();
eq(trophies(), beforeFounding + 1, 'pre-founding-persists');
eq(render().stock, Math.floor(2 * (1 + contrib(trophyScale, beforeFounding, false))), 'pre-founding-dormant-output');
eq(playerHunt.stock, Math.floor(3 * (1 + contrib(huntScale, beforeFounding, false))), 'hunter-activation-start');
access(false);

pause(true);
const founder = getVassalCandidatePool(state).candidates.find(candidate => candidate.founderClassId === 'warrior');
eq(selectLifeMapVassal(state, 1, null, founder).ok, true, 'select-founder');
applyClassAction(state, live(), { kind: 'train', classId: 'warrior', establishClass: true, count: 5 });
live().locationRegionId = capitalId; live().stats.intelligence = 10000; state.civilization.prestige = 100;
eq(trophies(), 1, 'founding-does-not-reset');
access(true);
deep(ledger(), [], 'per-floor-before-second-kill');

const score = trophies(), active = true;
playerHunt.stock = 0; render().stock = 0; render().charge = 0;
plant(hunterId); death();
eq(trophies(), score + 1, 'second-hunt-counts');
eq(render().stock, Math.floor(2 * (1 + contrib(trophyScale, score + 1, active))), 'same-kill-discharge-sees-new-score');
eq(playerHunt.stock, Math.floor(3 * (1 + contrib(huntScale, score, active))), 'hunter-ignores-same-kill-score');

capital.detailedState.practiceSlots[0] = null;
plant(hunterId); death(); plant(hunterId); death();
eq(trophies(), 4, 'later-hunts-persist');
capital.detailedState.practiceSlots[0] = piece('beastRendering');
state.civilization.nextPracticeInstanceId = serial;
deep(ledger(), [contrib(trophyScale, 4, true)], 'cap-binds-ledger');
render().stock = 0; render().charge = 0; plant(hunterId); death();
eq(trophies(), 5, 'fifth-hunt-counts');
eq(render().stock, Math.floor(2 * (1 + contrib(trophyScale, 5, true))), 'cap-binds-output');

pause(true);
live().isDead = true;
render().stock = 0; render().charge = 0; plant(hunterId); death();
eq(trophies(), 6, 'between-lives-persists');
eq(render().stock, Math.floor(2 * (1 + contrib(trophyScale, 6, false))), 'between-lives-dormant-output');
access(false);
state.civilization.vassalLineage.currentVassalId = null;
access(false);
eq(trophies(), 6, 'gap-retains-history');
pause(true);
generateCandidatePool(state);
const successor = { ...getVassalCandidatePool(state).candidates[0], classId: 'warrior', founderClassId: null };
eq(selectLifeMapVassal(state, 1, null, successor).ok, true, 'select-successor');
live().locationRegionId = capitalId; live().stats.intelligence = 10000;
eq(trophies(), 6, 'successor-no-reset');
access(true);
deep(ledger(), [3], 'successor-ledger-keeps-cap');

const held = trophies();
pause(true);
changeController(state, capitalId, 'external-a'); flushPracticeEvents(state);
eq(trophies(), held, 'loss-does-not-reset');
access(false);
deep(ledger(), [], 'loss-dormant-ledger');
changeController(state, capitalId, 'player'); flushPracticeEvents(state);
eq(trophies(), held, 'recapture-no-recount');
access(true);
deep(ledger(), [3], 'recapture-ledger');

const visit = { nodeId: 'trophy-audit', type: 'campaign', campaign: { failed: false, questRegionIds: [], duelDone: false } };
const option = stage => buildCampaignOptions(state, live(), visit).find(row => row.stage === stage);
pause(true);
const front = plant(hunterId, 0);
const clear = option('clear');
refillFood();
eq(clear.risk, 0, 'clear-risk');
eq(resolveCampaignAttempt(state, live(), visit, clear).ok, true, 'clear-resolved');
flushPracticeEvents(state);
eq(trophies(), held, 'front-cleared-not-trophy');
eq(region(front).monster.cleared, true, 'front-cleared-nest-remains');
playerHunt.stock = 0; death();
eq(region(front).monster, undefined, 'remaining-nest-hunted');
eq(trophies(), held + 1, 'hunt-destroys-remaining-nest-once');
death();
eq(trophies(), held + 1, 'repeat-hunt-no-second-count');

pause(true);
const nestRegion = plant(hunterId, 0);
const opened = option('clear');
refillFood();
eq(resolveCampaignAttempt(state, live(), visit, opened).ok, true, 'second-clear-resolved');
flushPracticeEvents(state);
eq(trophies(), held + 1, 'second-clear-not-trophy');
const nest = option('nest');
refillFood();
eq(nest.risk, 0, 'nest-risk');
const beforeNest = trophies();
eq(resolveCampaignAttempt(state, live(), visit, nest).ok, true, 'nest-resolution-once');
flushPracticeEvents(state);
eq(trophies(), beforeNest + 1, 'nest-counts-once');
eq(region(nestRegion).monster, undefined, 'nest-removed');
eq(resolveCampaignAttempt(state, live(), visit, nest).ok, false, 'repeat-nest-rejected');
eq(trophies(), beforeNest + 1, 'repeat-nest-no-second-count');

const neutral = state.world.sites.find(site => site.neutral);
const alliance = buildCampaignOptions(state, live(), visit).find(row => row.stage === 'alliance' && row.regionId === neutral.regionId);
eq(alliance.risk, 0, 'conquest-risk');
const beforeConquest = trophies();
refillFood();
eq(resolveCampaignAttempt(state, live(), visit, alliance).ok, true, 'neutral-conquest-resolved');
flushPracticeEvents(state);
eq(region(neutral.regionId).controller, 'player', 'neutral-conquest-captures');
eq(trophies(), beforeConquest, 'neutral-conquest-not-trophy');

pause(false);
for (const row of state.world.regions) delete row.monster;
region(capitalId).monster = { defense: 1 };
state.civilization.chaos.monsterCount = 1; state.civilization.chaos.monsterPressure = 0;
const beforeDefense = trophies();
addMonsterPressure(state, 100);
eq(region(capitalId).monster?.defense, 1, 'defense-holds');
eq(capital.simulationMode, 'detailed', 'defense-does-not-ruin');
eq(trophies(), beforeDefense, 'defense-not-trophy');

const probe = deserializeGameState(serializeGameState(state));
const probeRegion = probe.world.regions.find(row => row.controller === 'external-a').id;
const probed = () => probe.civilization.history.monsterTrophies;
const probedBefore = probed();
emitPracticeEvent(probe, { kind: 'monsterDestroyed', regionId: probeRegion, practiceId: 'monsterHunting' });
eq(probed(), probedBefore, 'omitted-faction-uses-controller');
emitPracticeEvent(probe, { kind: 'monsterDestroyed', regionId: probeRegion, faction: 'player', practiceId: 'monsterHunting' });
eq(probed(), probedBefore + 1, 'explicit-faction-overrides-controller');
eq(trophies(), beforeDefense, 'probe-does-not-touch-play');

pause(true);
const saved = serializeGameState(state);
const resumed = deserializeGameState(JSON.parse(JSON.stringify(saved)));
deep(serializeGameState(resumed), saved, 'json-round-trip');
const disarm = copy => {
  for (const row of copy.world.regions) delete row.monster;
  copy.civilization.chaos.monsterCount = 0; copy.civilization.chaos.monsterPressure = 0;
};
const left = state;
const right = resumed;
disarm(left); disarm(right);
for (const copy of [left, right]) { eq(cmdSetPaused(copy, false).ok, true, 'continuation-unpause'); syncPhaseToPaused(copy); eq(advanceReplayStateToSecond(copy, copy.tSec + 1).ok, true, 'official-second'); }
deep(serializeGameState(left), serializeGameState(right), 'continuation-parity');
eq(left.civilization.history.monsterTrophies, saved.civilization.history.monsterTrophies, 'continuation-no-recount');
eq(left.paused, false, 'continuation-ran-unpaused');

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/result.json`, JSON.stringify({ ok: true, checks: names.length, names, trophies: trophies(), scale: trophyScale, huntScale }, null, 2));
console.log(`[monster-trophies] OK ${names.length} assertions; trophies ${trophies()}`);
