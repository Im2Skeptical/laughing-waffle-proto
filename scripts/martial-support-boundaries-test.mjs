// Martial support / retinue boundaries on the public external-world API.
// Milestone: Support floor(Warriors/5); Retinue floor(Prestige/10), capped by
// ceil(Warriors/10) plus bonuses, and zero with no Warrior population.
// Structure quality uplift is +25% per qualityBonus. Card amounts are current
// warlordsHall / frontierKeep / beaconChain / fort / lastCitadel modifiers.
// Great Host: local = floor(warriors/5 + formation + siege + mobility), then
// floor(local * share) with share min(0.5, network + greatHost 0.5), then min(10, …).
// Upper 60 + formation 2 => local 14, share 0.5 => 7 (0.9 would be 12).
// Lake 120 + mobility 3 => local 27, share 0.5 => 13, per-source cap => 10. Total 17.
import { mkdirSync, writeFileSync } from 'node:fs';
import { canonicalizeSnapshot } from '../src/model/canonicalize.js';
import { fresh, clearDetailedPopulationAndFood, putStructure } from '../src/model/tests/detailed-settlements/helpers.js';
import { deserializeGameState, serializeGameState } from '../src/model/state.js';
import { flushPracticeEvents } from '../src/model/detailed-settlements/practices.js';
import { createNeutralSettlement, getMartialSupport, getRetinue, getSupportSources, recordSupportUsage } from '../src/model/detailed-settlements/external-world.js';

const ART = 'artifacts';

function brief(value) {
  const text = JSON.stringify(value);
  return text && text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function diff(actual, expected, path = '') {
  if (Object.is(actual, expected)) return null;
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    for (const key of [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort()) {
      const found = diff(actual[key], expected[key], `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }
  return { path: path || '$', actual, expected };
}

function check(name, actual, expected) {
  const found = diff(actual, expected);
  if (!found) return;
  const detail = { name, path: found.path, actual: brief(found.actual), expected: brief(found.expected) };
  const error = new Error(`${detail.name} ${detail.path}: ${detail.actual} !== ${detail.expected}`);
  error.detail = detail;
  throw error;
}

function site(state, regionId) {
  return state.world.sites.find(entry => entry.regionId === regionId);
}

function warriors(entry, count) {
  const cohort = entry.detailedState.populationByClass.villager;
  for (const classState of Object.values(entry.detailedState.populationByClass)) {
    classState.children = classState.children ?? 0;
    classState.eldersByAge = Array.isArray(classState.eldersByAge) ? classState.eldersByAge : [];
    classState.specialists.scholar = { children: 0, adults: 0, eldersByAge: [] };
    classState.specialists.warrior = { children: 0, adults: 0, eldersByAge: [] };
  }
  cohort.specialists.warrior.adults = count;
  if (cohort.adults < count) cohort.adults = count;
}

function blankStrip(entry) {
  entry.detailedState.structureSlots = Array.from({ length: entry.detailedState.structureSlots.length }, () => null);
}

function place(entry, structureId, origin, qualityBonus = 0) {
  putStructure(entry.detailedState, structureId, origin);
  entry.detailedState.structureSlots.find(item => item?.structureId === structureId && item.origin === origin).qualityBonus = qualityBonus;
}

function authored() {
  const state = clearDetailedPopulationAndFood(fresh(12345));
  for (const entry of state.world.sites) {
    blankStrip(entry);
    if (entry.detailedState.practiceSlots.length !== 5) throw new Error('practice slots');
  }
  const neutral = createNeutralSettlement(state, 'reed-delta', 0);
  if (!neutral.ok) throw new Error(neutral.reason);
  warriors(neutral.site, 15);
  return state;
}

function snap(state) {
  return JSON.stringify(serializeGameState(state));
}

function seal(state) {
  canonicalizeSnapshot(state);
  const raw = snap(state);
  const live = deserializeGameState(JSON.parse(raw));
  check('sealed fixture', JSON.parse(snap(live)), JSON.parse(raw));
  return { live, raw };
}

function unchanged(state, raw, name) {
  check(name, JSON.parse(snap(state)), JSON.parse(raw));
}

function bank(entry, value) {
  entry.detailedState.supportBank = value;
}

function useSupport(raw, regionId, kind, defense, classId, rows, label) {
  const original = deserializeGameState(JSON.parse(raw));
  const clone = deserializeGameState(JSON.parse(raw));
  const expect = deserializeGameState(JSON.parse(raw));
  recordSupportUsage(original, regionId, kind, defense, classId);
  recordSupportUsage(clone, regionId, kind, defense, classId);
  const journal = expect.civilization.practiceEvents ?? { nextId: 1, pending: [], trace: [] };
  let nextId = journal.nextId ?? 1;
  const pending = [...(journal.pending ?? [])];
  for (const row of rows) {
    const id = nextId++;
    pending.push({ ...row, id, rootId: id, parentId: null, tSec: expect.tSec });
    if (row.kind === 'supportContributed') site(expect, row.regionId).detailedState.supportBank = {};
  }
  expect.civilization.practiceEvents = { ...journal, nextId, pending, trace: journal.trace ?? [] };
  check(`${label} pending`, JSON.parse(snap(original)), JSON.parse(snap(expect)));
  check(`${label} clone pending`, JSON.parse(snap(clone)), JSON.parse(snap(original)));
  flushPracticeEvents(original);
  flushPracticeEvents(clone);
  check(`${label} flushed`, JSON.parse(snap(original)), JSON.parse(snap(clone)));
}

try {
  const coordDraft = authored();
  warriors(site(coordDraft, 'river-crown'), 9);
  warriors(site(coordDraft, 'upper-floodplain'), 40);
  warriors(site(coordDraft, 'lake-country'), 40);
  warriors(site(coordDraft, 'cedar-woods'), 10);
  warriors(site(coordDraft, 'west-levee'), 4);
  bank(site(coordDraft, 'river-crown'), { formation: 4, siege: 1, mobility: 2, coordination: 1 });
  place(site(coordDraft, 'upper-floodplain'), 'warlordsHall', 0, 0);
  place(site(coordDraft, 'lake-country'), 'warlordsHall', 0, 4);
  place(site(coordDraft, 'cedar-woods'), 'fort', 0, 0);
  place(site(coordDraft, 'cedar-woods'), 'lastCitadel', 2, 0);
  coordDraft.civilization.history.lostSettlements = 4;
  const { live: coord, raw: coordRaw } = seal(coordDraft);
  check('coordination sources', getSupportSources(coord, 'river-crown'), [
    { regionId: 'river-crown', amount: 8 },
    { regionId: 'upper-floodplain', amount: 2 },
  ]);
  check('coordination total', getMartialSupport(coord, 'river-crown'), 10);
  check('warrior floor', getMartialSupport(coord, 'west-levee'), 0);
  check('quality 0 warlordsHall', getMartialSupport(coord, 'upper-floodplain'), 10);
  check('quality 4 warlordsHall', getMartialSupport(coord, 'lake-country'), 12);
  check('defense gates off', getMartialSupport(coord, 'cedar-woods'), 2);
  check('defense gates on', getMartialSupport(coord, 'cedar-woods', true), 13);
  unchanged(coord, coordRaw, 'coordination queries');

  const hostDraft = authored();
  warriors(site(hostDraft, 'upper-floodplain'), 60);
  warriors(site(hostDraft, 'lake-country'), 120);
  warriors(site(hostDraft, 'west-levee'), 120);
  bank(site(hostDraft, 'river-crown'), { greatHost: 1 });
  bank(site(hostDraft, 'upper-floodplain'), { formation: 2 });
  bank(site(hostDraft, 'lake-country'), { mobility: 3 });
  bank(site(hostDraft, 'west-levee'), { siege: 5 });
  place(site(hostDraft, 'river-crown'), 'frontierKeep', 0, 0);
  place(site(hostDraft, 'river-crown'), 'beaconChain', 2, 0);
  const { live: host, raw: hostRaw } = seal(hostDraft);
  check('greatHost share and per-source cap', getSupportSources(host, 'river-crown'), [
    { regionId: 'river-crown', amount: 0 },
    { regionId: 'upper-floodplain', amount: 7 },
    { regionId: 'lake-country', amount: 10 },
  ]);
  check('greatHost total', getMartialSupport(host, 'river-crown'), 17);
  unchanged(host, hostRaw, 'host queries');
  useSupport(hostRaw, 'river-crown', 'campaign', false, 'warrior', [
    { kind: 'supportContributed', regionId: 'upper-floodplain', actionKind: 'campaign', amount: 7, classId: 'warrior' },
    { kind: 'supportContributed', regionId: 'lake-country', actionKind: 'campaign', amount: 10, classId: 'warrior' },
    { kind: 'martialActionResolved', regionId: 'river-crown', actionKind: 'campaign', sourceRegionIds: ['upper-floodplain', 'lake-country'], classId: 'warrior' },
  ], 'usage');

  const emptyDraft = authored();
  place(site(emptyDraft, 'river-crown'), 'retinueHall', 0, 2);
  bank(site(emptyDraft, 'river-crown'), { coordination: 0, formation: 0, siege: 0, mobility: 0 });
  bank(site(emptyDraft, 'upper-floodplain'), { formation: 4 });
  const { live: empty, raw: emptyRaw } = seal(emptyDraft);
  check('retinue without warriors', getRetinue(empty, { classId: 'warrior', prestige: 50 }), { value: 0, cap: 0, population: 0, nextPrestige: null });
  unchanged(empty, emptyRaw, 'empty retinue query');
  useSupport(emptyRaw, 'river-crown', 'defense', true, null, [
    { kind: 'martialActionResolved', regionId: 'river-crown', actionKind: 'defense', sourceRegionIds: [], classId: null },
  ], 'zero sources');

  const retinueDraft = authored();
  for (const entry of retinueDraft.world.sites) if (entry.regionId !== 'reed-delta') blankStrip(entry);
  warriors(site(retinueDraft, 'river-crown'), 10);
  place(site(retinueDraft, 'river-crown'), 'retinueHall', 0, 2);
  const { live: retinue, raw: retinueRaw } = seal(retinueDraft);
  check('retinue prestige floor', getRetinue(retinue, { classId: 'warrior', prestige: 0 }), { value: 0, cap: 4, population: 10, nextPrestige: 10 });
  check('retinue below cap', getRetinue(retinue, { classId: 'warrior', prestige: 35 }), { value: 3, cap: 4, population: 10, nextPrestige: 40 });
  check('retinue cap clamp', getRetinue(retinue, { classId: 'warrior', prestige: 100 }), { value: 4, cap: 4, population: 10, nextPrestige: null });
  check('retinue class gate', getRetinue(retinue, { classId: 'scholar', prestige: 100 }), { value: 0, cap: 0, population: 10, nextPrestige: null });
  unchanged(retinue, retinueRaw, 'retinue queries');
  console.log('martial-support-boundaries ok');
} catch (error) {
  mkdirSync(ART, { recursive: true });
  writeFileSync(`${ART}/martial-support-boundaries-failures.json`, JSON.stringify(error.detail ?? { message: error.message }));
  console.error(error.message);
  process.exitCode = 1;
}
