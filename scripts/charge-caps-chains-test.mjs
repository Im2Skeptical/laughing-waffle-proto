import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createLabFixture, practiceSlot, fiveSlots, setFixturePopulation } from '../src/model/dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { emitPracticeEvent, withPracticeRoot } from '../src/model/detailed-settlements/practice-events.js';
import { flushPracticeEvents } from '../src/model/detailed-settlements/practices.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';

// Pinned from current card text and docs/civcontent-2.6-implementation.md.
// Shop and preview banks cap at 3. Each support bank caps at 10.
// Reaction safety cap default is 200. These are not read from effect rows.
const SHOP_CAP = 3;
const PREVIEW_CAP = 3;
const SUPPORT_CAP = 10;
const REACTION_CAP = 200;
const SHOP_RESEARCH = 3;
const SHOP_CHAOS = 10;
const FORMATION_GAIN = 2;
const COORDINATION_GAIN = 1;
const PREVIEW_GAIN = 1;
const SHOP_GAIN = 1;
const PLAGUE_YIELD = 2;
const PLAGUE_CAPACITY = 5;
const CHARCOAL_YIELD = 3;
const CHARCOAL_CAPACITY = 6;
const SMELT_YIELD = 2;
const TOOL_YIELD = 2;

const report = { cases: [], limits: [] };

function record(name, observed) {
  report.cases.push({ name, observed });
}

function board(cards, population = 0, scholars = 0, warriors = 0) {
  const state = createLabFixture('charge');
  for (const site of getDetailedSettlementSites(state)) {
    site.detailedState.practiceSlots = fiveSlots();
    site.detailedState.structureSlots.fill(null);
    setFixturePopulation(site.detailedState, 0);
  }
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  const local = site.detailedState;
  local.practiceSlots = fiveSlots(...cards.map((card) => practiceSlot(card.id, card.stock ?? 0)));
  for (const [index, card] of cards.entries()) {
    if (card.charge != null) local.practiceSlots[index].charge = card.charge;
  }
  setFixturePopulation(local, population, scholars, warriors);
  assert.equal(local.practiceSlots.length, 5);
  return { state, local, region: site.regionId };
}

function fire(host, event) {
  emitPracticeEvent(host.state, { regionId: host.region, ...event });
  flushPracticeEvents(host.state);
}

function kinds(host, kind) {
  return host.state.civilization.practiceEvents.trace.filter((entry) => entry.kind === kind);
}

function shopHost(shop, charge) {
  const host = board([
    { id: 'experimentation', charge },
    { id: 'logging' },
    { id: 'quarrying' },
    { id: 'surfaceMining' },
    { id: 'pastoralism' },
  ], 5, 1, 0);
  host.local.shopQualityBonus = shop;
  return host;
}

function knowledge(host) {
  return fire(host, { kind: 'stockConsumed', practiceId: 'scholarship', traits: ['Record'], tags: ['Knowledge'] });
}

try {
const shopBelow = shopHost(SHOP_CAP - SHOP_GAIN, 3);
const researchBefore = shopBelow.state.civilization.research.total;
const chaosBefore = shopBelow.state.civilization.chaos.chaosPower;
knowledge(shopBelow);
assert.equal(shopBelow.local.shopQualityBonus, SHOP_CAP);
assert.equal(shopBelow.state.civilization.research.total - researchBefore, SHOP_RESEARCH);
assert.equal(shopBelow.state.civilization.chaos.chaosPower - chaosBefore, SHOP_CHAOS);
assert.equal(shopBelow.local.practiceSlots[0].charge, 0);
record('shop-one-below', { shop: shopBelow.local.shopQualityBonus, charge: 0 });

const shopFull = shopHost(SHOP_CAP, 3);
const researchAtCap = shopFull.state.civilization.research.total;
knowledge(shopFull);
assert.equal(shopFull.local.shopQualityBonus, SHOP_CAP);
assert.equal(shopFull.state.civilization.research.total - researchAtCap, SHOP_RESEARCH);
assert.equal(shopFull.local.practiceSlots[0].charge, 0);
record('shop-at-cap', { shop: SHOP_CAP, researchDelta: SHOP_RESEARCH });

function previewHost(preview, stock, charge) {
  const host = board([
    { id: 'plagueLedger', charge, stock },
    { id: 'logging' },
    { id: 'quarrying' },
    { id: 'forage' },
    { id: 'pastoralism' },
  ]);
  host.local.previewBonus = preview;
  return host;
}

function premature(host) {
  fire(host, { kind: 'populationDied', premature: true });
}

const previewBelow = previewHost(PREVIEW_CAP - PREVIEW_GAIN, 0, 2);
premature(previewBelow);
assert.equal(previewBelow.local.previewBonus, PREVIEW_CAP);
assert.equal(previewBelow.local.practiceSlots[0].stock, PLAGUE_YIELD);
assert.equal(previewBelow.local.practiceSlots[0].charge, 0);
record('preview-one-below', { preview: PREVIEW_CAP, stock: PLAGUE_YIELD });

const previewAtCap = previewHost(PREVIEW_CAP, 0, 2);
premature(previewAtCap);
assert.equal(previewAtCap.local.previewBonus, PREVIEW_CAP);
assert.equal(previewAtCap.local.practiceSlots[0].stock, PLAGUE_YIELD);
assert.equal(previewAtCap.local.practiceSlots[0].charge, 0);
record('preview-at-cap', { preview: PREVIEW_CAP, stock: PLAGUE_YIELD });

function supportHost(formation, coordination) {
  const host = board([
    { id: 'formationTraining', charge: 3 },
    { id: 'warCouncil', charge: 3 },
    { id: 'logging' },
    { id: 'quarrying' },
    { id: 'pastoralism' },
  ]);
  host.local.supportBank = { formation, coordination, siege: 4 };
  return host;
}

function defend(host) {
  fire(host, { kind: 'supportContributed', actionKind: 'defense' });
}

const supportOpen = supportHost(0, 0);
defend(supportOpen);
assert.equal(supportOpen.local.supportBank.formation, FORMATION_GAIN);
assert.equal(supportOpen.local.supportBank.coordination, COORDINATION_GAIN);
assert.equal(supportOpen.local.supportBank.siege, 4);
assert.equal(supportOpen.local.practiceSlots[0].charge, 0);
assert.equal(supportOpen.local.practiceSlots[1].charge, 0);
record('support-open', { formation: FORMATION_GAIN, coordination: COORDINATION_GAIN, siege: 4 });

const supportBelow = supportHost(SUPPORT_CAP - 1, SUPPORT_CAP - 1);
defend(supportBelow);
assert.equal(supportBelow.local.supportBank.formation, SUPPORT_CAP);
assert.equal(supportBelow.local.supportBank.coordination, SUPPORT_CAP);
assert.equal(supportBelow.local.supportBank.siege, 4);
record('support-one-below', { formation: SUPPORT_CAP, coordination: SUPPORT_CAP });

const supportAtCap = supportHost(SUPPORT_CAP, SUPPORT_CAP);
defend(supportAtCap);
assert.equal(supportAtCap.local.supportBank.formation, SUPPORT_CAP);
assert.equal(supportAtCap.local.supportBank.coordination, SUPPORT_CAP);
assert.equal(supportAtCap.local.supportBank.siege, 4);
assert.equal(supportAtCap.local.practiceSlots[0].charge, 0);
record('support-at-cap', { formation: SUPPORT_CAP, coordination: SUPPORT_CAP });

function metallurgy(charcoalStock, charcoalCharge, smeltCharge = 0) {
  return board([
    { id: 'charcoalBurning', charge: charcoalCharge, stock: charcoalStock },
    { id: 'smelting', charge: smeltCharge },
    { id: 'toolmaking' },
    { id: 'logging', stock: 1 },
    { id: 'surfaceMining', stock: 1 },
  ]);
}

function timber(host) {
  fire(host, { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'] });
}

const room = metallurgy(CHARCOAL_CAPACITY - 1, 2);
timber(room);
assert.equal(room.local.practiceSlots[0].stock, CHARCOAL_CAPACITY);
assert.equal(room.local.practiceSlots[0].charge, 0);
assert.equal(room.local.practiceSlots[1].charge, 1);
assert.equal(room.local.practiceSlots[1].stock, 0);
record('stock-one-below-capacity', { stock: CHARCOAL_CAPACITY, charge: 0, smeltCharge: 1 });

const fullHost = metallurgy(CHARCOAL_CAPACITY, 2);
timber(fullHost);
assert.equal(fullHost.local.practiceSlots[0].stock, CHARCOAL_CAPACITY);
assert.equal(fullHost.local.practiceSlots[0].charge, 2);
assert.equal(fullHost.local.practiceSlots[1].stock, 0);
assert.equal(fullHost.local.practiceSlots[1].charge, 0);
const blocked = kinds(fullHost, 'dischargeBlocked');
assert.equal(blocked.length, 1);
assert.equal(blocked[0].targetPracticeId, 'charcoalBurning');
assert.equal(blocked[0].reason, 'Stock capacity is full');
assert.equal(blocked[0].regionId, fullHost.region);
assert.ok(blocked[0].rootId != null);
assert.ok(blocked[0].parentId != null);
record('stock-full-host', { stock: CHARCOAL_CAPACITY, charge: 2, reason: blocked[0].reason });

const chain = metallurgy(0, 1, 1);
withPracticeRoot(chain.state, { kind: 'phaseResolved', regionId: chain.region }, () => {
  emitPracticeEvent(chain.state, { kind: 'stockGenerated', regionId: chain.region, practiceId: 'logging', traits: ['Timber'] });
  emitPracticeEvent(chain.state, { kind: 'stockGenerated', regionId: chain.region, practiceId: 'logging', traits: ['Timber'] });
  emitPracticeEvent(chain.state, { kind: 'stockGenerated', regionId: chain.region, practiceId: 'logging', traits: ['Timber'] });
});
flushPracticeEvents(chain.state);
const discharged = kinds(chain, 'discharged').map((entry) => entry.targetPracticeId);
assert.deepEqual(discharged, ['charcoalBurning', 'smelting', 'toolmaking']);
const deferred = kinds(chain, 'cascadeDeferred');
const rootId = kinds(chain, 'discharged')[0].rootId;
assert.ok(deferred.length >= 1);
assert.ok(deferred.every((entry) => entry.targetPracticeId === 'charcoalBurning'
  && entry.reason === 'Already Discharged in this root chain'
  && entry.rootId === rootId
  && entry.parentId != null));
assert.equal(chain.local.practiceSlots[0].charge, 2);
assert.equal(chain.local.practiceSlots[0].stock, CHARCOAL_YIELD);
assert.equal(chain.local.practiceSlots[1].charge, 0);
assert.equal(chain.local.practiceSlots[1].stock, SMELT_YIELD);
assert.equal(chain.local.practiceSlots[2].charge, 0);
assert.equal(chain.local.practiceSlots[2].stock, TOOL_YIELD);
assert.equal(chain.local.practiceSlots[3].stock, 1);
assert.equal(chain.local.practiceSlots[4].stock, 1);
record('once-per-root-retained', {
  charge: 2,
  stock: CHARCOAL_YIELD,
  discharged,
  deferred: deferred.length,
  rootId,
});

timber(chain);
assert.equal(chain.local.practiceSlots[0].charge, 0);
assert.equal(chain.local.practiceSlots[0].stock, CHARCOAL_YIELD * 2);
assert.equal(kinds(chain, 'discharged').filter((entry) => entry.targetPracticeId === 'charcoalBurning').length, 2);
assert.equal(chain.local.practiceSlots[1].charge, 1);
assert.equal(chain.local.practiceSlots[1].stock, SMELT_YIELD);
record('later-root-spends-retained', { charge: 0, stock: CHARCOAL_YIELD * 2 });

const safety = board([
  { id: 'charcoalBurning' },
  { id: 'smelting' },
  { id: 'toolmaking' },
  { id: 'logging' },
  { id: 'surfaceMining' },
]);
assert.equal(safety.state.gameConfig.settings.values.practiceReactionResolutionCap, REACTION_CAP);
const safetyQueued = withPracticeRoot(safety.state, { kind: 'phaseResolved', regionId: safety.region }, () => {
  const events = [];
  for (let index = 0; index < REACTION_CAP + 1; index += 1) {
    events.push(emitPracticeEvent(safety.state, { kind: 'systemEvent', regionId: safety.region }));
  }
  return events;
});
flushPracticeEvents(safety.state);
const capTrace = kinds(safety, 'cascadeSafetyCap');
assert.equal(capTrace.length, 1);
assert.equal(capTrace[0].reason, `Practice reaction safety cap ${REACTION_CAP} reached; remaining root events stopped`);
// The root event counts first: exactly 199 child events reach the 200-event cap.
assert.equal(capTrace[0].parentId, safetyQueued[REACTION_CAP - 2].id, 'cap stops at exactly the 200th event');
assert.equal(kinds(safety, 'systemEvent').at(-1).id, safetyQueued[REACTION_CAP - 2].id);
assert.equal(safety.state.civilization.practiceEvents.pending.length, 0);
assert.equal(safety.state.civilization.practiceEvents.activeRoot, undefined);
assert.equal(kinds(safety, 'discharged').length, 0);
record('reaction-safety-cap', { pending: 0, reason: capTrace[0].reason });
timber(safety);
assert.equal(safety.local.practiceSlots[0].charge, 1, 'a new root remains usable after the safety cap');
record('reaction-cap-next-root', { charge: 1 });

const pendingHost = metallurgy(0, 2, 0);
emitPracticeEvent(pendingHost.state, { kind: 'stockGenerated', regionId: pendingHost.region, practiceId: 'logging', traits: ['Timber'] });
const pendingSaved = JSON.stringify(serializeGameState(pendingHost.state));
const pendingCopy = deserializeGameState(JSON.parse(pendingSaved));
const pendingRoundTrip = JSON.stringify(serializeGameState(pendingCopy));
assert.equal(pendingSaved === pendingRoundTrip, true);
assert.equal(pendingCopy.civilization.practiceEvents.pending.length >= 1, true);
const queued = pendingCopy.civilization.practiceEvents.pending.at(-1);
assert.equal(queued.kind === 'stockGenerated' && queued.rootId === queued.id && queued.parentId == null, true);
flushPracticeEvents(pendingHost.state);
flushPracticeEvents(pendingCopy);
const continued = JSON.stringify(serializeGameState(pendingHost.state));
const continuedCopy = JSON.stringify(serializeGameState(pendingCopy));
assert.equal(continued === continuedCopy, true);
assert.equal(pendingHost.local.practiceSlots[0].charge, 0);
assert.equal(pendingHost.local.practiceSlots[0].stock, CHARCOAL_YIELD);
assert.equal(pendingCopy.world.sites.find((site) => site.regionId === pendingHost.region).detailedState.practiceSlots[0].stock, CHARCOAL_YIELD);
record('json-pending-chain', { equal: true, stock: CHARCOAL_YIELD, charge: 0 });

const live = createLabFixture('charge');
const timeline = createTimelineFromInitialState(live);
assert.equal(advanceReplayStateToSecond(live, 6).ok, true);
const rebuilt = rebuildStateAtSecond(timeline, 6);
assert.equal(rebuilt.ok, true);
assert.ok(JSON.stringify(serializeGameState(live)) === JSON.stringify(serializeGameState(rebuilt.state)), 'full-state tick replay');
record('official-tick-replay', { tSec: 6 });

report.limits.push('Gameplay event emitters are not covered. Injection through emitPracticeEvent does not validate those emitters.');
report.limits.push('Mutation probes were left to the supervisor. This script does not edit production files.');
report.limits.push('Shop, preview, and support expectations are pinned literals. Card effect rows are not read back as oracles.');
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/charge-caps-chains-report.json', JSON.stringify(report, null, 2));
console.log(`charge-caps-chains: ${report.cases.length} passed`);
console.log('artifact: artifacts/charge-caps-chains-report.json');
} catch (error) {
  mkdirSync('artifacts', { recursive: true });
  report.failure = { message: error.message, stack: error.stack, actual: error.actual, expected: error.expected };
  writeFileSync('artifacts/charge-caps-chains-report.json', JSON.stringify(report, null, 2));
  const preview = value => String(JSON.stringify(value)).slice(0, 160);
  console.error(`charge-caps-chains: failed after ${report.cases.at(-1)?.name ?? 'setup'} expected=${preview(error.expected)} actual=${preview(error.actual)} repro=node scripts/charge-caps-chains-test.mjs artifact=artifacts/charge-caps-chains-report.json`);
  process.exitCode = 1;
}
