// New pool boundaries. Existing tests already pin one 1:3 edge, carry exclusion,
// equipped exclusion, overflow exhaustion, and inheritance. Offer generation
// leaves tSec at 0 and does not arm pendingResolution. Phase ints return the
// requested minimum so a cost range cannot impersonate a wrong relic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLabNodeSandbox} from '../src/model/dev-lab/node-sandbox.js';
import {getRelicPoolAppearance, validateRelicPools} from '../src/model/vassal-life-map/relic-pools.js';
import {createHeirloomInstance, generateRelicOffers, getOwnedHeirloomDefinitionIds} from '../src/model/vassal-life-map/heirlooms.js';
import {getCurrentLifeMapVassal} from '../src/model/vassal-life-map.js';
import {VASSAL_HEIRLOOM_DEFINITION_IDS, VASSAL_HEIRLOOM_QUALITIES} from '../src/defs/gamepieces/vassal-heirloom-defs.js';
import {deserializeGameState, serializeGameState} from '../src/model/state.js';

// Reachable uint32 RNG draws immediately around cumulative boundaries.
const below = value => (Math.ceil(value * 4294967296) - 1) / 4294967296;
const atOrAbove = value => Math.ceil(value * 4294967296) / 4294967296;
const UNDER_QUARTER = below(0.25);
const UNDER_FIFTH = below(0.2);
const UNDER_SEVEN_TENTHS = below(0.7);
const UNDER_TWO_FIFTHS = below(0.4);
const AT_UNIT = 1 / 100001;
const UNDER_UNIT = below(AT_UNIT);
const IDS = VASSAL_HEIRLOOM_DEFINITION_IDS;
const failures = [];
const passed = [];
const expect = (id, fn) => {
  try { fn(); passed.push(id); }
  catch (error) { failures.push({id, message: error.message}); }
};
const saved = {
  relic: serializeGameState(createLabNodeSandbox({type: 'relic', seed: 7}).state),
  special: serializeGameState(createLabNodeSandbox({type: 'specialRelic', seed: 11}).state),
};
const load = (kind) => {
  const state = deserializeGameState(saved[kind]);
  return {state, vassal: getCurrentLifeMapVassal(state), design: state.gameConfig.lifeMapGenerator.design};
};
const fillRules = (rules, ids, spec) => {
  for (const id of ids) {
    const rule = spec[id];
    rules[id] = rule ? {enabled: rule.enabled !== false, weight: rule.weight} : {enabled: false, weight: 1};
  }
};
const setQualities = (design, spec) => fillRules(design.relicPools.relic.qualities, VASSAL_HEIRLOOM_QUALITIES, spec);
const setEntries = (design, spec) => fillRules(design.relicPools.specialRelic.entries, IDS, spec);
const place = (state, vassal, where, id) => {
  const item = createHeirloomInstance(state, id);
  if (where === 'overflow') {
    const lineage = state.civilization.vassalLineage;
    lineage.pendingVaultOverflow = [...(lineage.pendingVaultOverflow ?? []), item];
    return;
  }
  const slots = where === 'vault' ? state.civilization.heirloomVault : vassal.heirlooms[where];
  const index = slots.findIndex((slot) => !slot);
  assert.ok(index >= 0, where);
  slots[index] = item;
};
const idsOf = (offers) => offers.map((row) => row.definitionId);
const share = (rows, quality) => {
  const group = rows.filter((row) => row.quality === quality && row.available);
  if (!group.length) {
    assert.ok(rows.filter((row) => row.quality === quality).every((row) => row.chance === 0));
    return 0;
  }
  assert.ok(group.every((row) => row.chance === group[0].chance));
  return group[0].chance * group.length;
};

// Ordinary: float, index, phase. Special: float, phase. Counts are call counts.
function draw(kind, setup, floats, indexes = [], special = false) {
  const loaded = load(kind);
  setup(loaded);
  const pending = loaded.vassal.lifeMap.pendingResolution ?? null;
  const f = [...floats];
  const ix = [...indexes];
  let wantIndex = false;
  let floatCalls = 0;
  let intCalls = 0;
  loaded.state.rngNextVassalFloat = () => {
    assert.equal(wantIndex, false);
    floatCalls += 1;
    wantIndex = !special;
    if (!f.length) return 0;
    return f.shift();
  };
  loaded.state.rngNextVassalInt = (min, max) => {
    intCalls += 1;
    if (!wantIndex) return min;
    wantIndex = false;
    const value = ix.length ? ix.shift() : min;
    assert.ok(value >= min && value <= max, `${value} outside ${min}..${max}`);
    return value;
  };
  const offers = generateRelicOffers(loaded.state, loaded.vassal, {special});
  assert.equal(f.length + ix.length, 0, 'unused scripted draw');
  assert.equal(wantIndex, false);
  assert.equal(loaded.state.tSec, 0);
  assert.equal(loaded.vassal.lifeMap.pendingResolution ?? null, pending);
  return {offers, floatCalls, intCalls, loaded};
}

expect('weight 0 is rejected and 100000 is accepted', () => {
  const rejected = load('relic');
  rejected.design.relicPools.relic.qualities.bronze = {enabled: true, weight: 0};
  assert.ok(validateRelicPools(rejected.design.relicPools).some((error) => error.includes('qualities.bronze')));
  const legal = load('relic');
  legal.design.relicPools.relic.qualities.diamond = {enabled: true, weight: 100000};
  legal.design.relicPools.specialRelic.entries.travellersBoots = {enabled: true, weight: 100000};
  assert.deepEqual(validateRelicPools(legal.design.relicPools), []);
  legal.design.relicPools.relic.qualities.gold = {enabled: 1, weight: 1};
  assert.ok(validateRelicPools(legal.design.relicPools).some((error) => error.includes('qualities.gold')));
});

expect('2:5:3 and 1:100000 shares omit disabled weight', () => {
  const ratio = load('relic');
  setQualities(ratio.design, {bronze: {weight: 1}, silver: {weight: 3}});
  const third = getRelicPoolAppearance(ratio.design, 'relic');
  assert.equal(third.find((row) => row.id === 'signetRing').chance, 1 / 24);
  assert.equal(third.find((row) => row.id === 'courtiersBrooch').chance, 3 / 16);
  const wider = load('relic');
  setQualities(wider.design, {bronze: {weight: 2}, silver: {weight: 5}, gold: {weight: 3}});
  const wide = getRelicPoolAppearance(wider.design, 'relic');
  assert.equal(share(wide, 'bronze'), 0.2);
  assert.equal(share(wide, 'silver'), 0.5);
  assert.equal(share(wide, 'gold'), 0.3);
  assert.equal(wide.find((row) => row.id === 'royalWarrant').chance, 3 / 20);
  const extreme = load('relic');
  setQualities(extreme.design, {bronze: {weight: 1}, diamond: {weight: 100000}});
  const edges = getRelicPoolAppearance(extreme.design, 'relic');
  assert.equal(share(edges, 'bronze'), AT_UNIT);
  assert.equal(share(edges, 'diamond'), 100000 / 100001);
  const hidden = load('relic');
  setQualities(hidden.design, {bronze: {weight: 2}, silver: {enabled: false, weight: 5}, gold: {weight: 3}, diamond: {enabled: false, weight: 100000}});
  const quiet = getRelicPoolAppearance(hidden.design, 'relic');
  assert.equal(share(quiet, 'bronze'), 0.4);
  assert.equal(share(quiet, 'gold'), 0.6);
  assert.equal(share(quiet, 'silver') + share(quiet, 'diamond'), 0);
  const special = load('special');
  setEntries(special.design, {signetRing: {weight: 2}, travellersBoots: {enabled: false, weight: 5}, tutorsNotebook: {weight: 3}});
  const specialRows = getRelicPoolAppearance(special.design, 'specialRelic');
  assert.equal(specialRows.find((row) => row.id === 'signetRing').chance, 0.4);
  assert.equal(specialRows.find((row) => row.id === 'travellersBoots').chance, 0);
});

expect('ordinary 1:3 and 1:100000 selection boundaries', () => {
  const ratio = (loaded) => {
    setQualities(loaded.design, {bronze: {weight: 1}, silver: {weight: 3}});
    setEntries(loaded.design, {signetRing: {weight: 1}, crownOfAges: {weight: 100000}});
  };
  const lower = draw('relic', ratio, [UNDER_QUARTER, UNDER_QUARTER, UNDER_QUARTER], [0, 0, 0]);
  assert.deepEqual(idsOf(lower.offers), ['signetRing', 'travellersBoots', 'tutorsNotebook']);
  assert.equal(lower.floatCalls, 3);
  assert.equal(lower.intCalls, 6);
  assert.ok(lower.offers.every((row) => row.immediateDeathChance === 0));
  const at = draw('relic', ratio, [0.25, 0.25, 0.25], [0, 0, 0]);
  assert.deepEqual(idsOf(at.offers), ['courtiersBrooch', 'pilgrimsStaff', 'merchantsLens']);
  const indexed = draw('relic', ratio, [0.25, 0.25, 0.25], [3, 0, 0]);
  assert.deepEqual(idsOf(indexed.offers), ['hourglass', 'courtiersBrooch', 'pilgrimsStaff']);
  const extreme = ({design}) => setQualities(design, {bronze: {weight: 1}, diamond: {weight: 100000}});
  const crossed = draw('relic', extreme, [UNDER_UNIT, atOrAbove(AT_UNIT), UNDER_UNIT], [0, 1, 0]);
  assert.deepEqual(idsOf(crossed.offers), ['signetRing', 'mandateOfHeaven', 'travellersBoots']);
  const blocked = draw('relic', ({design}) => setQualities(design, {bronze: {weight: 1}, gold: {enabled: false, weight: 100000}}), [below(1), below(1), below(1)], [0, 0, 0]);
  assert.deepEqual(idsOf(blocked.offers), ['signetRing', 'travellersBoots', 'tutorsNotebook']);
});

expect('equipped, carry, vault, and overflow each remove the next bronze', () => {
  const result = draw('relic', (loaded) => {
    setQualities(loaded.design, {bronze: {weight: 1}});
    place(loaded.state, loaded.vassal, 'equipped', 'signetRing');
    place(loaded.state, loaded.vassal, 'carry', 'travellersBoots');
    place(loaded.state, loaded.vassal, 'vault', 'tutorsNotebook');
    place(loaded.state, loaded.vassal, 'overflow', 'minorSeal');
  }, [0, 0], [0, 0]);
  assert.deepEqual(idsOf(result.offers), ['foxMask', 'abacus']);
  assert.equal(result.floatCalls, 2);
  assert.equal(result.intCalls, 4);
});

expect('one survivor per quality keeps the whole 2:5:3 weight', () => {
  const setup = (loaded) => {
    setQualities(loaded.design, {
      bronze: {weight: 2}, silver: {weight: 5}, gold: {weight: 3}, diamond: {enabled: false, weight: 100000},
    });
    for (const id of IDS) {
      if (['abacus', 'hourglass', 'scholarsCodex', 'crownOfAges', 'mandateOfHeaven'].includes(id)) continue;
      const equipped = loaded.vassal.heirlooms.equipped.filter(Boolean).length;
      const carry = loaded.vassal.heirlooms.carry.filter(Boolean).length;
      place(loaded.state, loaded.vassal, equipped < 3 ? 'equipped' : carry < 3 ? 'carry' : 'vault', id);
    }
  };
  const loaded = load('relic');
  setup(loaded);
  const rows = getRelicPoolAppearance(loaded.design, 'relic', [...getOwnedHeirloomDefinitionIds(loaded.state, loaded.vassal)]);
  assert.equal(rows.find((row) => row.id === 'abacus').chance, 0.2);
  assert.equal(rows.find((row) => row.id === 'hourglass').chance, 0.5);
  assert.equal(rows.find((row) => row.id === 'scholarsCodex').chance, 0.3);
  assert.equal(rows.find((row) => row.id === 'crownOfAges').owned, false);
  assert.equal(rows.find((row) => row.id === 'crownOfAges').chance, 0);
  // Follow-ups are recomputed after the first relic leaves the pool.
  for (const [float, ids] of [
    [UNDER_FIFTH, ['abacus', 'hourglass', 'scholarsCodex']],
    [atOrAbove(0.2), ['hourglass', 'abacus', 'scholarsCodex']],
    [UNDER_SEVEN_TENTHS, ['hourglass', 'abacus', 'scholarsCodex']],
    [atOrAbove(0.7), ['scholarsCodex', 'abacus', 'hourglass']],
    [below(1), ['scholarsCodex', 'abacus', 'hourglass']],
  ]) {
    const result = draw('relic', setup, [float, 0, 0], [0, 0, 0]);
    assert.deepEqual(idsOf(result.offers), ids);
    if (float === atOrAbove(0.7)) assert.equal(result.offers[0].immediateDeathChance, 0);
  }
});

expect('special 2:5:3 boundary and a disabled weight', () => {
  const full = ({design}) => setEntries(design, {signetRing: {weight: 2}, travellersBoots: {weight: 5}, tutorsNotebook: {weight: 3}});
  const offers = draw('special', full, [UNDER_FIFTH, 0.625, 0], [], true);
  assert.deepEqual(idsOf(offers.offers), ['signetRing', 'tutorsNotebook', 'travellersBoots']);
  assert.ok(offers.offers.every((row) => row.immediateDeathChance === 0.35));
  assert.equal(offers.floatCalls, 3);
  assert.equal(offers.intCalls, 3);
  const quiet = ({design}) => setEntries(design, {
    signetRing: {weight: 2}, travellersBoots: {enabled: false, weight: 5}, tutorsNotebook: {weight: 3},
  });
  assert.deepEqual(idsOf(draw('special', quiet, [UNDER_TWO_FIFTHS, 0], [], true).offers), ['signetRing', 'tutorsNotebook']);
  assert.deepEqual(idsOf(draw('special', quiet, [atOrAbove(0.4), 0], [], true).offers), ['tutorsNotebook', 'signetRing']);
});

expect('an empty pool draws nothing and the other pool cannot fill it', () => {
  const ordinary = draw('relic', (loaded) => {
    setQualities(loaded.design, {});
    setEntries(loaded.design, {signetRing: {weight: 1}, crownOfAges: {weight: 100000}});
  }, [], []);
  assert.equal(ordinary.offers.length, 1);
  assert.equal(ordinary.offers[0].emptyRelic, true);
  assert.equal(ordinary.offers[0].phaseCost, 0);
  assert.equal(ordinary.offers[0].immediateDeathChance, 0);
  assert.equal(ordinary.floatCalls + ordinary.intCalls, 0);
  const special = draw('special', (loaded) => {
    setQualities(loaded.design, {bronze: {weight: 1}, diamond: {weight: 100000}});
    setEntries(loaded.design, {});
  }, [], [], true);
  assert.equal(special.offers[0].emptyRelic, true);
  assert.equal(special.floatCalls + special.intCalls, 0);
  const crossed = draw('special', (loaded) => {
    setQualities(loaded.design, {bronze: {weight: 1}, diamond: {weight: 100000}});
    setEntries(loaded.design, {signetRing: {weight: 1}, travellersBoots: {weight: 3}});
  }, [0.25, 0], [], true);
  assert.deepEqual(idsOf(crossed.offers), ['travellersBoots', 'signetRing']);
});

const log = {cases: passed.length + failures.length, passed: passed.length, failures};
fs.mkdirSync('artifacts/grok-oct24-spend/relic-review', {recursive: true});
fs.writeFileSync('artifacts/grok-oct24-spend/relic-review/case-log.json', JSON.stringify(log, null, 2));
if (failures.length) {
  console.error(failures.map((failure) => `${failure.id}: ${failure.message}`).join('\n'));
  process.exit(1);
}
console.log(`[relic-pool-contracts] ${log.cases} cases passed`);
