// Joint-bin allocation and population-recipe atomicity. Gap: full-map-contract
// converts one 21-person mix and one double-consume failure, not ties, metadata,
// filters, sequential success, other-vs-ordinary reserves, or blocked no-ops.
// Shipped cards use runPracticeActivation. Synthetic defs are unit coverage. No tick.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState} from '../src/model/state.js';
import {allocatePopulation,populationBins,selectPeople,writePopulationBins,validatePopulationLedger} from '../src/model/detailed-settlements/population-ledger.js';
import {planPopulationRecipe} from '../src/model/detailed-settlements/political-recipes.js';
import {runPracticeActivation} from '../src/model/detailed-settlements/practices.js';
import {practiceEventJournal} from '../src/model/detailed-settlements/practice-events.js';
import {fullMapPractices} from '../src/defs/gamepieces/full-map-defs.js';

const art = 'artifacts/grok-nov07-spend/population-recipes';
const KEYS = ['age','allegiance','classId','count','kind','specialty'];
const detail = {allocation:[],filters:[],plans:[],activations:[]};
let passed = 0;
let cases = 0;
const row = (allegiance,classId,specialty,kind,age,count) => ({allegiance,classId,specialty,kind,age,count});
const idOf = b => [b.allegiance,b.classId,b.specialty,b.kind,b.age ?? ''].join('|');
const tally = bins => {
  const totals = new Map();
  for (const b of bins ?? []) totals.set(idOf(b),(totals.get(idOf(b)) ?? 0) + b.count);
  return [...totals.entries()].sort().map(([k,n]) => `${k}=${n}`).join(',');
};
function eq(actual, expected, name) {
  assert.deepEqual(actual, expected, name);
  passed++;
}
function walk(a, b, path, out) {
  if (Object.is(a, b)) return;
  const aObj = a !== null && typeof a === 'object';
  const bObj = b !== null && typeof b === 'object';
  if (aObj && bObj && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const key of keys) walk(a[key], b[key], `${path}${Array.isArray(a) ? `[${key}]` : `${path ? '.' : ''}${key}`}`, out);
    return;
  }
  out.push(path || '(root)');
}
function same(before, after, name) {
  const paths = [];
  walk(before, after, '', paths);
  if (!paths.length) assert.equal(JSON.stringify(before), JSON.stringify(after), name);
  assert.equal(paths.length, 0, `${name}:${paths[0] ?? ''}`);
  passed++;
  return paths;
}
function install(id, allegiance = 'player', stock = 0) {
  const influence = fullMapPractices[id]?.category === 'influence';
  return {practiceId:id,tier:'bronze',instanceId:`test:${id}`,charge:0,work:0,...(influence ? {allegiance} : {stock})};
}
function world() {
  const s = createNewGameState(424242);
  const regionId = s.world.regions.find(r => r.controller === 'player').id;
  s.world.connections = [];
  for (const site of s.world.sites) if (site.regionId !== regionId) site.neutral = site.neutral || {stocks:[]};
  const site = s.world.sites.find(entry => entry.regionId === regionId);
  delete site.neutral;
  site.simulationMode = 'detailed';
  site.detailedState.structureSlots.fill(null);
  site.detailedState.practiceSlots = [null,null,null,null,null];
  practiceEventJournal(s);
  return {s, site, d: site.detailedState, regionId};
}
function clock(raw) {
  return {rng:raw.rng,paused:raw.paused,phase:raw.phase,tSec:raw.tSec};
}
function orders(bins) {
  return [bins, [...bins].reverse(), [bins[1], bins[2], bins[0]]];
}
function expectAlloc(bins, request, expected, name) {
  for (const ordered of orders(bins)) {
    cases++;
    const before = structuredClone(ordered);
    const got = allocatePopulation(ordered, request);
    eq(ordered, before, 'allocation-input-is-pure');
    eq(tally(got), expected, name);
    for (const b of got) eq(Object.keys(b).sort(), KEYS, 'no-allocation-metadata');
    detail.allocation.push({request, tally:tally(got), name});
  }
}
function bare(bins, request) {
  cases++;
  const before = structuredClone(bins);
  const got = allocatePopulation(bins, request);
  eq(bins, before, 'allocation-input-is-pure');
  for (const b of got) eq(Object.keys(b).sort(), KEYS, 'no-allocation-metadata');
  return got;
}

const tie = [
  row('player','villager','warrior','adults',null,1),
  row('external-a','villager','ordinary','adults',null,1),
  row('neutral','stranger','scholar','elder',61,1),
];
const uneven = [
  row('neutral','villager','ordinary','adults',null,4),
  row('player','villager','scholar','children',null,2),
  row('external-a','stranger','warrior','elder',61,1),
];
const pure = world();
expectAlloc(tie, 0, '', 'allocation-exact-total');
expectAlloc(tie, -4, '', 'allocation-exact-total');
expectAlloc(tie, 0.9, '', 'allocation-exact-total');
expectAlloc(tie, 1, 'external-a|villager|ordinary|adults|=1', 'tie-break-locale-key');
expectAlloc(tie, 2, 'external-a|villager|ordinary|adults|=1,neutral|stranger|scholar|elder|61=1', 'tie-break-locale-key');
expectAlloc(tie, 3, 'external-a|villager|ordinary|adults|=1,neutral|stranger|scholar|elder|61=1,player|villager|warrior|adults|=1', 'allocation-exact-total');
expectAlloc(uneven, 1, 'neutral|villager|ordinary|adults|=1', 'allocation-exact-total');
expectAlloc(uneven, 3, 'neutral|villager|ordinary|adults|=2,player|villager|scholar|children|=1', 'allocation-exact-total');
expectAlloc(uneven, 4, 'external-a|stranger|warrior|elder|61=1,neutral|villager|ordinary|adults|=2,player|villager|scholar|children|=1', 'allocation-exact-total');
expectAlloc(uneven, 7, 'external-a|stranger|warrior|elder|61=1,neutral|villager|ordinary|adults|=4,player|villager|scholar|children|=2', 'identity-fields-preserved');
{
  const got = bare(uneven, 100);
  eq(got.reduce((n,b) => n + b.count, 0), 7, 'allocation-no-overdraw');
  for (const b of got) assert.ok(uneven.find(s => idOf(s) === idOf(b)).count >= b.count, 'allocation-no-overdraw');
  passed++;
  eq(tally(bare([row('player','villager','ordinary','adults',null,5)], 2)), 'player|villager|ordinary|adults|=2', 'identity-fields-preserved');
  eq(tally(bare([], 4)), '', 'allocation-exact-total');
}

const filterBins = [
  row('player','villager','scholar','adults',null,3),
  row('external-a','villager','warrior','adults',null,2),
  row('neutral','villager','ordinary','children',null,4),
  row('external-a','stranger','warrior','elder',61,1),
  row('player','villager','ordinary','elder',70,2),
];
writePopulationBins(pure.d, filterBins);
const filterBefore = serializeGameState(pure.s);
const filters = [
  [{},12],[ {kind:'adults'},5],[ {kind:'children'},4],[ {kind:'elder'},3],[ {specialty:'warrior'},3],
  [{specialty:'scholar'},3],[ {specialty:'ordinary'},6],[ {classId:'stranger'},1],[ {classId:'villager'},11],
  [{allegiance:'player'},5],[ {allegiance:'beneficiary'},5],[ {opposing:true},7],
  [{kind:'adults',specialty:'warrior',opposing:true},2],[ {kind:'children',allegiance:'neutral'},4],
];
for (const [filter, sum] of filters) {
  cases++;
  const got = selectPeople(pure.d, 100, filter, 'player');
  eq(got.reduce((n,b) => n + b.count, 0), sum, 'filter-exact-total');
  for (const b of got) eq(Object.keys(b).sort(), KEYS, 'no-allocation-metadata');
  detail.filters.push({filter, sum:got.reduce((n,b) => n + b.count, 0)});
}
cases++;
eq(tally(selectPeople(pure.d, 1, {}, 'player')), 'neutral|villager|ordinary|children|=1', 'filter-allocation-largest-remainder');
cases++;
eq(tally(selectPeople(pure.d, 1, {kind:'elder',specialty:'warrior',classId:'stranger'}, 'player')), 'external-a|stranger|warrior|elder|61=1', 'identity-fields-preserved');
eq(selectPeople(pure.d, 0, {}, 'player'), [], 'filter-exact-total');
same(filterBefore, serializeGameState(pure.s), 'pure-filter-leaves-full-state');
eq(clock(serializeGameState(pure.s)), clock(filterBefore), 'pure-filter-clock');

const planSlot = {practiceId:'cp_ironCommunion',tier:'bronze',instanceId:'unit-plan',stock:0,charge:0,work:0};
function planOf(bins, def) {
  cases++;
  writePopulationBins(pure.d, bins);
  const before = serializeGameState(pure.s);
  const plan = planPopulationRecipe(pure.s, pure.site, planSlot, {effects:[], ...def}, [], true);
  same(before, serializeGameState(pure.s), 'unit-coverage-plan-does-not-commit');
  detail.plans.push({ok:plan.ok, victims:tally(plan.victims), coverage:'unit'});
  return plan;
}
const warrior = n => [row('external-a','villager','warrior','adults',null,n)];
const consumeWarrior = {populationConsume:[{amount:1,filter:{specialty:'warrior'}}]};
{
  const blocked = planOf(warrior(1), {populationConsume:[{amount:1,filter:{specialty:'warrior'}},{amount:1,filter:{kind:'adults'}}]});
  eq(blocked.ok, false, 'consume-clauses-disjoint');
  const both = planOf([...warrior(1), row('player','villager','scholar','children',null,1)], {populationConsume:[{amount:1,filter:{specialty:'warrior'}},{amount:1,filter:{specialty:'scholar',kind:'children'}}]});
  eq(both.ok, true, 'consume-clauses-disjoint');
  eq(tally(both.victims), 'external-a|villager|warrior|adults|=1,player|villager|scholar|children|=1', 'consume-clauses-disjoint');
  const split = planOf(warrior(2), {populationConsume:[{amount:1,filter:{specialty:'warrior'}},{amount:1,filter:{kind:'adults'}}]});
  eq(split.ok, true, 'consume-sequential-exact-total');
  eq(tally(split.victims), 'external-a|villager|warrior|adults|=2', 'consume-sequential-exact-total');
  eq(planOf(warrior(3), {...consumeWarrior, populationRequire:[{amount:3,filter:{specialty:'warrior'},other:true}]}).ok, false, 'other-reserve-after-victims');
  eq(planOf(warrior(3), {...consumeWarrior, populationRequire:[{amount:2,filter:{specialty:'warrior'},other:true}]}).ok, true, 'other-reserve-after-victims');
  eq(planOf(warrior(3), {...consumeWarrior, populationRequire:[{amount:3,filter:{specialty:'warrior'}}]}).ok, true, 'ordinary-require-counts-victims');
  eq(planOf(warrior(3), {...consumeWarrior, populationRequire:[{amount:4,filter:{specialty:'warrior'}}]}).ok, false, 'ordinary-require-counts-victims');
}

const board = (...pieces) => [...pieces, ...Array(5 - pieces.length).fill(null)];
function fire(pieces, bins, type, stage, season) {
  const ctx = world();
  if (season) ctx.s.currentSeasonIndex = ctx.s.seasons.indexOf(season);
  ctx.d.practiceSlots = board(...pieces);
  writePopulationBins(ctx.d, bins);
  const before = serializeGameState(ctx.s);
  assert.equal(before.paused, false, 'unpaused-official-activation');
  runPracticeActivation(ctx.s, type, stage);
  return {ctx, before, after:serializeGameState(ctx.s)};
}
function siteOf(raw, regionId) {
  return raw.world.sites.find(entry => entry.regionId === regionId);
}
function strayPaths(result, allowStock) {
  const paths = [];
  walk(result.before, result.after, '', paths);
  const index = result.after.world.sites.findIndex(site => site.regionId === result.ctx.regionId);
  const root = `world.sites[${index}].detailedState`;
  return paths.filter(p => {
    if (p.startsWith('civilization.practiceEvents') || p.startsWith(`${root}.populationByClass`) || p.startsWith(`${root}.practiceActivationTrace`)) return false;
    return !(allowStock && /^\.practiceSlots\[\d+\]\.stock$/.test(p.slice(root.length)));
  });
}
function assertStill(pieces, bins, type, stage, name, season) {
  cases++;
  const result = fire(pieces, bins, type, stage, season);
  same(result.before, result.after, name);
  eq(clock(result.after), clock(result.before), name);
  detail.activations.push({name, coverage:'shipped-card', unchanged:true});
}
assertStill([install('fm_forcedPageantry')], [row('external-a','villager','ordinary','children',null,1)], 'faith', undefined, 'missing-stock-blocks-without-conversion');
assertStill([install('fm_civicRegisters'), install('recordKeeping','player',1)], [row('external-a','villager','ordinary','adults',null,2)], 'housing', undefined, 'housed-condition-blocks-without-partial-pay');
assertStill([install('fm_frontierRelief'), install('dryFarming','player',3)], [row('external-a','villager','ordinary','adults',null,4)], 'food', 'afterMeals', 'relief-condition-blocks-without-partial-pay');
assertStill([install('cp_ironCommunion','player',5)], warrior(7), 'season', undefined, 'headroom-blocks-without-partial-pay', 'summer');
function committed(pieces, bins, type, name, binsAfter, stock, kinds, allowStock) {
  cases++;
  const result = fire(pieces, bins, type);
  const trace = result.after.civilization.practiceEvents.trace;
  eq(strayPaths(result, allowStock), [], name);
  eq(tally(populationBins(siteOf(result.after, result.ctx.regionId).detailedState)), binsAfter, name);
  eq(validatePopulationLedger(result.ctx.d), [], 'committed-derived-ledger-is-consistent');
  eq(siteOf(result.after, result.ctx.regionId).detailedState.practiceSlots[1].stock, stock, name);
  eq(trace.map(event => event.kind), kinds, 'commit-event-counts');
  eq(trace.filter(event => event.kind === 'populationConverted').map(event => event.amount), [1], name);
  eq(clock(result.after), clock(result.before), 'commit-clock');
  detail.activations.push({name, coverage:'shipped-card', bins:binsAfter, kinds:trace.map(event => event.kind)});
}
committed(
  [install('fm_publicDrills'), install('fe_roadRequisition','player',1)],
  [row('external-a','villager','ordinary','adults',null,1), row('player','villager','scholar','children',null,1), row('external-a','villager','warrior','elder',61,1), row('neutral','villager','ordinary','children',null,1), row('external-a','villager','scholar','adults',null,1)],
  'birth', 'commit-changes-allegiance-and-trained-specialty-only',
  'external-a|villager|scholar|adults|=1,external-a|villager|warrior|elder|61=1,neutral|villager|ordinary|children|=1,player|villager|scholar|children|=1,player|villager|warrior|adults|=1',
  1, ['activated','scheduledActivation','populationConverted','practiceResolved'], false);
committed(
  [install('fm_oathSupper'), install('forage','player',2)],
  [row('external-a','villager','warrior','adults',null,1), row('external-a','villager','ordinary','children',null,1)],
  'faith', 'capped-conversion-converts-available-only',
  'external-a|villager|ordinary|children|=1,player|villager|warrior|adults|=1',
  0, ['activated','scheduledActivation','populationConverted','stockConsumed','practiceResolved'], true);

fs.mkdirSync(art, {recursive:true});
const summary = {gap:'proportional ties, metadata, filters, sequential consume success, other-vs-ordinary reserve, blocked stock/housed/relief/headroom no-ops, shipped commit identity and capped event counts', bug:null, cases, passed, seed:424242, lineTarget:220};
fs.writeFileSync(`${art}/cases.json`, JSON.stringify(detail, null, 2));
fs.writeFileSync(`${art}/run.json`, JSON.stringify(summary, null, 2));
console.log(`population-recipe-contracts: ${passed} checks, ${cases} cases`);
