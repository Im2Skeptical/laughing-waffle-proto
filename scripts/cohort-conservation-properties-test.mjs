// Public composition seams only. Does not tick time or draw RNG.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInitialState } from '../src/model/init.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getDetailedSettlement } from '../src/model/detailed-settlements/queries.js';
import { selectPopulationComposition } from '../src/model/detailed-settlements/helpers.js';
import {
  addCompositionToStrangers,
  addMoonMigrationIntent,
  getReservedSourceComposition,
  removePopulationComposition,
  selectUnreservedPopulation,
} from '../src/model/detailed-settlements/phases/migration.js';
import { createMoonTurn } from '../src/model/detailed-settlements/phases/moon-turn.js';

const CLASSES = ['villager', 'stranger'];
const SPECS = ['scholar', 'warrior'];
const SHAPES = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0, 0, 0, 0], [2, 0, 0, 1, 0, 0, 1, 0, 0],
  [0, 2, 0, 0, 1, 0, 0, 1, 0], [0, 0, 2, 0, 0, 1, 0, 0, 1], [2, 2, 1, 1, 0, 0, 0, 1, 1],
  [3, 1, 2, 1, 1, 0, 0, 0, 1], [1, 3, 1, 0, 2, 0, 1, 1, 1], [2, 2, 2, 2, 0, 1, 0, 2, 0],
];
const failures = [];

function note(label, detail) {
  failures.push({ label, detail });
}
function elders(age, count) {
  return count > 0 ? [{ age, count }] : [];
}
function emptyCohort() {
  return {
    children: 0, adults: 0, eldersByAge: [],
    specialists: {
      scholar: { children: 0, adults: 0, eldersByAge: [] },
      warrior: { children: 0, adults: 0, eldersByAge: [] },
    },
  };
}
function fill(spec, age = 60) {
  const [c, a, e, sc, sa, se, wc, wa, we] = spec;
  return {
    children: c, adults: a, eldersByAge: elders(age, e),
    specialists: {
      scholar: { children: sc, adults: sa, eldersByAge: elders(age, se) },
      warrior: { children: wc, adults: wa, eldersByAge: elders(age, we) },
    },
  };
}
function settlement(villager, stranger) {
  return { populationByClass: { villager, stranger } };
}
function headClass(cohort) {
  let eldersCount = 0;
  for (const row of cohort?.eldersByAge ?? []) eldersCount += row.count;
  return (cohort?.children ?? 0) + (cohort?.adults ?? 0) + eldersCount;
}
function headOf(pop, ids) {
  let total = 0;
  for (const id of ids) total += headClass(pop[id]);
  return total;
}
function tally(pops) {
  const bins = new Map();
  const add = (key, count) => bins.set(key, (bins.get(key) ?? 0) + count);
  for (const pop of pops) {
    for (const id of CLASSES) {
      const cohort = pop[id];
      add('age|child', cohort.children);
      add('age|adult', cohort.adults);
      for (const row of cohort.eldersByAge) add(`age|${row.age}`, row.count);
      for (const spec of SPECS) {
        const part = cohort.specialists[spec];
        add(`${spec}|child`, part.children);
        add(`${spec}|adult`, part.adults);
        for (const row of part.eldersByAge) add(`${spec}|${row.age}`, row.count);
      }
    }
  }
  return JSON.stringify([...bins.entries()].sort());
}
function subsetFaults(pop) {
  const faults = [];
  for (const id of CLASSES) {
    const cohort = pop[id];
    if (cohort.children < 0 || cohort.adults < 0) faults.push(`${id} negative`);
    let specChildren = 0;
    let specAdults = 0;
    const specElders = new Map();
    for (const spec of SPECS) {
      const part = cohort.specialists[spec];
      if (part.children < 0 || part.adults < 0) faults.push(`${id}.${spec} negative`);
      specChildren += part.children;
      specAdults += part.adults;
      for (const row of part.eldersByAge) {
        if (row.count < 0) faults.push(`${id}.${spec} elder negative`);
        specElders.set(row.age, (specElders.get(row.age) ?? 0) + row.count);
      }
    }
    if (specChildren > cohort.children || specAdults > cohort.adults) faults.push(`${id} subset`);
    const have = new Map(cohort.eldersByAge.map((row) => [row.age, row.count]));
    for (const [age, count] of specElders) {
      if (count > (have.get(age) ?? 0)) faults.push(`${id} elder subset ${age}`);
    }
    for (const row of cohort.eldersByAge) if (row.count < 0) faults.push(`${id} elder negative`);
  }
  return faults;
}
function elderMap(rows) {
  const bins = new Map();
  for (const row of rows ?? []) bins.set(row.age, (bins.get(row.age) ?? 0) + row.count);
  return bins;
}
function exceed(label, got, lim) {
  if ((got?.children ?? 0) > (lim?.children ?? 0) || (got?.adults ?? 0) > (lim?.adults ?? 0)) return label;
  const left = elderMap(lim?.eldersByAge);
  for (const [age, count] of elderMap(got?.eldersByAge)) {
    if (count > (left.get(age) ?? 0)) return `${label} elder ${age}`;
  }
  if (!got?.specialists && !lim?.specialists) return null;
  for (const spec of SPECS) {
    const hit = exceed(`${label}.${spec}`, got?.specialists?.[spec], lim?.specialists?.[spec]);
    if (hit) return hit;
  }
  return null;
}
function remain(src, reserved, withSpecs) {
  const reservedElders = elderMap(reserved?.eldersByAge);
  const out = {
    children: Math.max(0, (src?.children ?? 0) - (reserved?.children ?? 0)),
    adults: Math.max(0, (src?.adults ?? 0) - (reserved?.adults ?? 0)),
    eldersByAge: [...elderMap(src?.eldersByAge).entries()]
      .map(([age, count]) => ({ age, count: Math.max(0, count - (reservedElders.get(age) ?? 0)) }))
      .filter((row) => row.count > 0),
  };
  if (withSpecs) {
    out.specialists = {
      scholar: remain(src?.specialists?.scholar, reserved?.specialists?.scholar, false),
      warrior: remain(src?.specialists?.warrior, reserved?.specialists?.warrior, false),
    };
  }
  return out;
}
function sumIntents(intents) {
  const total = settlement(emptyCohort(), emptyCohort()).populationByClass;
  for (const intent of intents) {
    for (const id of CLASSES) {
      const part = intent.composition[id];
      const dest = total[id];
      dest.children += part.children;
      dest.adults += part.adults;
      const ages = elderMap(dest.eldersByAge);
      for (const row of part.eldersByAge) ages.set(row.age, (ages.get(row.age) ?? 0) + row.count);
      dest.eldersByAge = [...ages.entries()].map(([age, count]) => ({ age, count }));
      for (const spec of SPECS) {
        const bin = dest.specialists[spec];
        const src = part.specialists[spec];
        bin.children += src.children;
        bin.adults += src.adults;
        const specAges = elderMap(bin.eldersByAge);
        for (const row of src.eldersByAge) specAges.set(row.age, (specAges.get(row.age) ?? 0) + row.count);
        bin.eldersByAge = [...specAges.entries()].map(([age, count]) => ({ age, count }));
      }
    }
  }
  return total;
}
function firstDiff(left, right, path = '$') {
  if (Object.is(left, right)) return null;
  if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') {
    return `${path} ${JSON.stringify(left)} !== ${JSON.stringify(right)}`;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return `${path} length`;
    for (let i = 0; i < left.length; i += 1) {
      const diff = firstDiff(left[i], right[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const diff = firstDiff(left[key], right[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

let cohorts = 0;
for (const shape of SHAPES) {
  const swapped = [shape[0], shape[1], shape[2], shape[6], shape[7], shape[8], shape[3], shape[4], shape[5]];
  for (const [place, villager, stranger, classIds] of [
    ['villager', shape, [0, 0, 0, 0, 0, 0, 0, 0, 0], ['villager']],
    ['stranger', [0, 0, 0, 0, 0, 0, 0, 0, 0], shape, ['stranger']],
    ['both', shape, swapped, ['villager', 'stranger']],
  ]) {
    cohorts += 1;
    const sourcePop = settlement(fill(villager), fill(stranger)).populationByClass;
    const total = headOf(sourcePop, classIds);
    for (const [kind, request] of [['zero', 0], ['one', 1], ['exact', total], ['over', total + 1]]) {
      const label = `${place}/${shape.join(',')}/${kind}`;
      const source = settlement(fill(villager), fill(stranger));
      const before = JSON.stringify(source);
      const selected = selectPopulationComposition(source, classIds, request);
      const again = selectPopulationComposition(source, classIds, request);
      if (JSON.stringify(selected) !== JSON.stringify(again) || JSON.stringify(source) !== before) {
        note(label, 'selection mutated its source or was not repeatable');
      }
      const other = CLASSES.filter((id) => !classIds.includes(id));
      if (headOf(selected, classIds) !== Math.min(request, total) || headOf(selected, other) !== 0) {
        note(label, `selected ${headOf(selected, classIds)} expected ${Math.min(request, total)}`);
      }
      const dest = settlement(emptyCohort(), emptyCohort());
      const conserved = tally([source.populationByClass, dest.populationByClass]);
      removePopulationComposition(source, selected);
      addCompositionToStrangers(dest, selected);
      const moved = headClass(dest.populationByClass.stranger);
      if (tally([source.populationByClass, dest.populationByClass]) !== conserved) {
        note(label, 'age or specialist totals changed across source and stranger destination');
      }
      if (moved !== headOf(selected, CLASSES) || headClass(dest.populationByClass.villager) !== 0) {
        note(label, `destination stranger holds ${moved}, villager ${headClass(dest.populationByClass.villager)}`);
      }
      const faults = [...subsetFaults(source.populationByClass), ...subsetFaults(dest.populationByClass)];
      if (faults.length) note(label, faults.join('; '));
    }
  }
}

const control = settlement(emptyCohort(), emptyCohort());
control.populationByClass.villager = {
  children: 2, adults: 2, eldersByAge: [{ age: 60, count: 2 }, { age: 70, count: 1 }],
  specialists: {
    scholar: { children: 1, adults: 0, eldersByAge: [{ age: 70, count: 1 }] },
    warrior: { children: 0, adults: 1, eldersByAge: [] },
  },
};
const pinOne = settlement(emptyCohort(), emptyCohort()).populationByClass;
pinOne.villager.eldersByAge = [{ age: 60, count: 1 }];
const pinThree = settlement(emptyCohort(), emptyCohort()).populationByClass;
pinThree.villager.children = 2;
pinThree.villager.eldersByAge = [{ age: 60, count: 1 }];
pinThree.villager.specialists.scholar.children = 1;
for (const [request, expected] of [[1, pinOne], [3, pinThree]]) {
  const got = selectPopulationComposition(control, ['villager', 'stranger'], request);
  const diff = firstDiff(got, expected);
  if (diff) note(`priority request ${request}`, diff);
}

// An intent list that reserves the same adults twice is not a reachable planner
// path. addAgeCohort does not clamp a negative specialist; it assumes a valid
// composition. That fixture was not an engine bug.
let sequences = 0;
function roomFor(original, summed, classIds) {
  let room = 0;
  for (const id of classIds) room += headClass(remain(original[id], summed[id], true));
  return room;
}
function runSequence(label, villager, stranger, classIds) {
  sequences += 1;
  const source = settlement(fill(villager), fill(stranger));
  const original = JSON.parse(JSON.stringify(source.populationByClass));
  const turn = { migrationIntents: [] };
  const other = CLASSES.filter((id) => !classIds.includes(id));
  for (const request of [headOf(original, classIds) + 3, 2, 1]) {
    const summed = sumIntents(turn.migrationIntents);
    const room = roomFor(original, summed, classIds);
    const beforeSource = JSON.stringify(source);
    const beforeTurn = JSON.stringify(turn);
    const selected = selectUnreservedPopulation(turn, 'src', source, classIds, request);
    if (JSON.stringify(source) !== beforeSource || JSON.stringify(turn) !== beforeTurn) {
      note(label, 'reservation read mutated the cohort or the turn');
    }
    const got = headOf(selected, classIds);
    if (got !== Math.min(request, room) || headOf(selected, other) !== 0) {
      note(label, `selected ${got} expected ${Math.min(request, room)}`);
    }
    if (got > 0) addMoonMigrationIntent({}, turn, { sourceId: 'src', composition: selected });
  }
  const summed = sumIntents(turn.migrationIntents);
  const reservedDiff = firstDiff(getReservedSourceComposition(turn, 'src'), summed);
  if (reservedDiff) note(label, `reserved sum ${reservedDiff}`);
  for (const id of CLASSES) {
    const hit = exceed(id, summed[id], original[id]);
    if (hit) note(label, `overbook ${hit}`);
  }
  const finalRoom = roomFor(original, summed, classIds);
  const tail = selectUnreservedPopulation(turn, 'src', source, classIds, 9);
  if (headOf(tail, classIds) !== Math.min(9, finalRoom)) {
    note(label, `tail ${headOf(tail, classIds)} expected ${Math.min(9, finalRoom)}`);
  }
  if (JSON.stringify(source.populationByClass) !== JSON.stringify(original)) note(label, 'source changed');
}
const zeroShape = [0, 0, 0, 0, 0, 0, 0, 0, 0];

function zeroClass(cohort) {
  cohort.children = 0;
  cohort.adults = 0;
  cohort.eldersByAge = [];
  cohort.specialists = emptyCohort().specialists;
}
function authorPending() {
  const state = createInitialState('devPlaytesting01', 880);
  for (const regionId of ['cedar-woods', 'west-levee']) {
    const pop = getDetailedSettlement(state, regionId).populationByClass;
    zeroClass(pop.villager);
    zeroClass(pop.stranger);
  }
  const home = getDetailedSettlement(state, 'cedar-woods').populationByClass;
  home.villager.children = 2;
  home.villager.adults = 2;
  home.villager.eldersByAge = [{ age: 60, count: 2 }, { age: 70, count: 1 }];
  home.villager.specialists.scholar.children = 1;
  home.villager.specialists.scholar.eldersByAge = [{ age: 70, count: 1 }];
  home.villager.specialists.warrior.adults = 1;
  state.civilization.currentMoonTurn = createMoonTurn(state, { moonIndex: 0, id: 'migration', phaseIndex: 4 });
  const reserved = settlement(emptyCohort(), emptyCohort()).populationByClass;
  reserved.villager.eldersByAge = [{ age: 60, count: 1 }];
  state.civilization.currentMoonTurn.migrationIntents.push({
    sourceId: 'cedar-woods', composition: reserved,
  });
  return deserializeGameState(serializeGameState(state));
}
function movePending(state) {
  const turn = state.civilization.currentMoonTurn;
  const source = getDetailedSettlement(state, 'cedar-woods');
  const selected = selectUnreservedPopulation(turn, 'cedar-woods', source, CLASSES, 4);
  removePopulationComposition(source, selected);
  addCompositionToStrangers(getDetailedSettlement(state, 'west-levee'), selected);
}
function intentCapture() {
  const composition = {
    villager: {
      children: 2, adults: 2,
      eldersByAge: [{ age: 60, count: 2 }, { age: 70, count: 1 }],
      specialists: {
        scholar: { children: 1, adults: 0, eldersByAge: [{ age: 70, count: 1 }] },
        warrior: { children: 0, adults: 1, eldersByAge: [{ age: 60, count: 1 }] },
      },
    },
    stranger: {
      children: 1, adults: 0, eldersByAge: [],
      specialists: {
        scholar: { children: 0, adults: 0, eldersByAge: [] },
        warrior: { children: 1, adults: 0, eldersByAge: [] },
      },
    },
  };
  const expected = JSON.parse(JSON.stringify(composition));
  const turn = { migrationIntents: [] };
  if (!addMoonMigrationIntent({}, turn, { sourceId: 'src', composition })) {
    note('intent capture', 'rejected valid composition');
    return;
  }
  const pendingJson = JSON.stringify(turn.migrationIntents[0].composition);
  composition.villager.children = 0;
  composition.villager.adults = 9;
  composition.villager.eldersByAge[0].count = 0;
  composition.villager.eldersByAge.push({ age: 80, count: 4 });
  composition.villager.specialists.scholar.children = 9;
  composition.villager.specialists.scholar.eldersByAge[0].age = 99;
  composition.villager.specialists.scholar.eldersByAge[0].count = 9;
  composition.villager.specialists.warrior.adults = 8;
  composition.villager.specialists.warrior.eldersByAge[0].count = 7;
  composition.stranger.children = 5;
  composition.stranger.specialists.warrior.children = 5;
  const queued = turn.migrationIntents[0].composition;
  if (pendingJson !== JSON.stringify(queued)) note('intent capture', 'caller edits changed queued JSON');
  const capturedDifference = firstDiff(queued, expected);
  if (capturedDifference) note('intent capture', capturedDifference);
  const faults = subsetFaults(queued);
  if (faults.length) note('intent capture', faults.join('; '));
}
try {
  intentCapture();
  for (const shape of SHAPES) runSequence(`seq villager/${shape.join(',')}`, shape, zeroShape, ['villager']);
  for (const shape of SHAPES.slice(0, 4)) runSequence(`seq stranger/${shape.join(',')}`, zeroShape, shape, ['stranger']);
  const pending = authorPending();
  const twin = deserializeGameState(serializeGameState(pending));
  const opened = serializeGameState(pending);
  const openedTwin = serializeGameState(twin);
  if (headOf(getDetailedSettlement(pending, 'cedar-woods').populationByClass, CLASSES) !== 7) {
    note('fixture', 'control source is not 7');
  }
  const intentBefore = JSON.stringify(opened.civilization.currentMoonTurn.migrationIntents);
  if (JSON.stringify(openedTwin.civilization.currentMoonTurn.migrationIntents) !== intentBefore) {
    note('pending intent roundtrip', 'migration intent changed across serializeGameState');
  }
  const rngBefore = JSON.stringify(opened.rng);
  const conserved = tally([
    getDetailedSettlement(pending, 'cedar-woods').populationByClass,
    getDetailedSettlement(pending, 'west-levee').populationByClass,
  ]);
  movePending(pending);
  movePending(twin);
  const sourcePop = getDetailedSettlement(pending, 'cedar-woods').populationByClass;
  const destPop = getDetailedSettlement(pending, 'west-levee').populationByClass;
  if (headOf(sourcePop, CLASSES) !== 3) note('moved', `source left ${headOf(sourcePop, CLASSES)}`);
  if (headClass(destPop.stranger) !== 4 || headClass(destPop.villager) !== 0) {
    note('moved', `destination stranger ${headClass(destPop.stranger)}`);
  }
  if (tally([sourcePop, destPop]) !== conserved) note('moved', 'age or specialist totals changed');
  const faults = [...subsetFaults(sourcePop), ...subsetFaults(destPop)];
  if (faults.length) note('moved', faults.join('; '));
  const continued = serializeGameState(pending);
  const continuedTwin = serializeGameState(twin);
  if (JSON.stringify(continued.civilization.currentMoonTurn.migrationIntents) !== intentBefore) {
    note('moved', 'reserved elder-60 intent was not preserved');
  }
  if (JSON.stringify(continued.rng) !== rngBefore) note('rng', 'rng changed');
  const left = JSON.stringify(continued);
  const right = JSON.stringify(continuedTwin);
  if (left !== right) note('serialized state equality', firstDiff(continued, continuedTwin) ?? 'mismatch');
} catch (error) {
  const line = String(error.stack || '').split('\n').find((row) => row.includes('cohort-conservation')) || '';
  note('threw', `${error.message} ${line.trim()}`);
}

if (cohorts < 30 || cohorts > 80) note('matrix size', `${cohorts} cohorts`);
if (sequences < 10 || sequences > 20) note('sequence size', `${sequences} sequences`);
if (failures.length) {
  mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../artifacts/cohort-conservation-properties-test.json', import.meta.url), JSON.stringify({
    cohorts, sequences, failures: failures.slice(0, 12),
  }, null, 2));
  console.error(`cohort-conservation ${failures.length} failure(s); first: ${failures[0].label}: ${failures[0].detail}`);
  process.exit(1);
}
console.log(`cohort-conservation ok cohorts=${cohorts} sequences=${sequences}`);
