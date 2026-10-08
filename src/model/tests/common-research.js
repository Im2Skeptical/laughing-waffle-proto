import assert from 'node:assert/strict';
import { createLabFixture, fiveSlots, practiceSlot, setFixturePopulation } from '../dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../detailed-settlements/queries.js';
import { evaluateDetailedPracticeSlot, runPracticeActivation } from '../detailed-settlements/practices.js';
import { assignDetailedSettlementWorkers } from '../detailed-settlements/workers.js';
import { getGamepieceFace } from '../gamepiece-presentation.js';
import { getCurrentLifeMapVassal } from '../vassal-life-map.js';
import { generateShopInventory } from '../vassal-life-map/shop.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../timeline/index.js';
import { canonicalizeSnapshot } from '../canonicalize.js';

function observationFixture() {
  const state = createLabFixture('charge');
  for (const site of getDetailedSettlementSites(state)) site.detailedState.practiceSlots = fiveSlots();
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  site.detailedState.practiceSlots = fiveSlots(practiceSlot('observation'), practiceSlot('forage'));
  return { state, site, local: site.detailedState };
}

for (const [population, scholars, warriors] of [[0, 0, 0], [60, 0, 0], [60, 2, 0], [60, 0, 10]]) {
  const { state, site, local } = observationFixture();
  setFixturePopulation(local, population, scholars, warriors);
  const research = state.civilization.research.total;
  const rng = JSON.stringify(state.rng);
  for (const phase of ['housing', 'faith', 'migration', 'death']) runPracticeActivation(state, phase);
  assert.equal(state.civilization.research.total, research, 'Observation only activates at Birth');
  runPracticeActivation(state, 'birth');
  assert.equal(state.civilization.research.total, research + 1, 'Observation needs no population, specialist or Stock inputs');
  const evaluation = evaluateDetailedPracticeSlot(state, site.regionId, 0);
  assert.equal(assignDetailedSettlementWorkers(state, site.regionId)[0].effectiveWorkers, 0, 'Observation leaves workers for other Practices');
  assert.equal(evaluation.effects[0].scaledValue.effectiveValue, 1, 'card inspection matches fixed Research yield');
  assert.equal(JSON.stringify(state.rng), rng, 'Observation consumes no RNG');
  assert.equal(local.practiceSlots[0].stock, 0, 'Research is not hosted Stock');
  const face = getGamepieceFace(state, 'practice', 'observation', 'bronze', { evaluation });
  assert.equal(face.label, 'Observation');
  assert.match(evaluation.rule, /1 Research/);
  assert.ok(face.detailLines.some(line => /1 Research/.test(line)), 'shared inspection exposes the Research effect');
}

for (const classId of [null, 'scholar', 'warrior']) {
  const state = createLabFixture('scholar');
  for (const site of getDetailedSettlementSites(state)) site.detailedState.practiceSlots = fiveSlots();
  state.civilization.research.total = 0;
  const vassal = getCurrentLifeMapVassal(state);
  vassal.classId = classId;
  let offered = false;
  for (let visit = 0; visit < 128 && !offered; visit++) {
    const inventory = generateShopInventory(state, vassal, { nodeId: `observation-${visit}`, family: 'practiceReform', purchasedOffers: [] });
    const observation = inventory.find(offer => offer.intervention.practiceId === 'observation');
    if (observation) {
      assert.equal(observation.intervention.resultingTier, 'bronze', 'Observation is available before Research unlocks');
      offered = true;
    }
  }
  assert.ok(offered, `${classId ?? 'unclassed'} shops offer the Common Research practice at zero Research`);
}

const { state } = observationFixture();
const timeline = createTimelineFromInitialState(state);
advanceReplayStateToSecond(state, 13);
const restored = deserializeGameState(serializeGameState(state));
advanceReplayStateToSecond(state, 37);
advanceReplayStateToSecond(restored, 37);
assert.ok(state.civilization.research.total > 0, 'real simulation ticks activate Observation');
const snapshot = value => canonicalizeSnapshot(serializeGameState(value));
assert.deepEqual(snapshot(restored), snapshot(state), 'Observation survives save/reload without changing the timeline');
assert.deepEqual(snapshot(rebuildStateAtSecond(timeline, 37)), snapshot(state), 'authoritative replay reproduces Observation Research');
console.log('[common-research] OK: Birth yield, no staffing or Stock gate, zero-Research shops, save/reload and replay');
