// src/model/tests/debug-overrides.js
// Focused checks for replayable settlement debug overrides.

import assert from "node:assert/strict";

import { ActionKinds, applyAction } from "../actions.js";
import { GRAPH_METRICS } from "../graph-metrics.js";
import { createInitialState } from "../init.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import {
  getSettlementCurrentVassal,
  getSettlementDebugOverrideSlotSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementStructureSlots,
} from "../settlement-state.js";
import { createProjectionCache } from "../timegraph/projection-cache.js";
import { createTimeGraphController } from "../timegraph/controller-core.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
  replaceActionsAtSecond,
} from "../timeline/index.js";
import { createTimegraphForecastWorkerService } from "../../controllers/timegraph-forecast-worker-service.js";

function createSettlementState() {
  return createInitialState("devPlaytesting01");
}

function debugOverrideAction(overrides, tSec = 0) {
  return {
    kind: ActionKinds.DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES,
    tSec,
    payload: {
      overrides,
    },
  };
}

function cheatVassalAction(spec, tSec = 0) {
  return {
    kind: ActionKinds.DEBUG_SELECT_CHEAT_VASSAL,
    tSec,
    payload: {
      tSec,
      spec,
    },
  };
}

function applyDebugOverride(state, overrides) {
  return applyAction(state, debugOverrideAction(overrides), { isReplay: true });
}

function applyCheatVassal(state, spec, tSec = 0) {
  return applyAction(state, cheatVassalAction(spec, tSec), { isReplay: true });
}

function buildCheatVassalSpec(overrides = {}) {
  return {
    sourceClassId: "villager",
    initialAgeYears: 50,
    deathAgeYears: 70,
    professionId: "builder",
    traitId: "pious",
    agendaByClass: {
      villager: ["floodRites", "riverRecessionFarming", "rest"],
      stranger: ["asTheRomans", "becomeVillagers", "raiseAsVillagers"],
    },
    ...overrides,
  };
}

function getPracticeCard(state, classId, slotIndex) {
  return getSettlementPracticeSlotsByClass(state, classId)?.[slotIndex]?.card ?? null;
}

function getStructure(state, slotIndex) {
  return getSettlementStructureSlots(state)?.[slotIndex]?.structure ?? null;
}

function testPracticeOverride() {
  const state = createSettlementState();
  const naturalSlot0 = getPracticeCard(state, "villager", 0)?.defId ?? null;
  const naturalSlot1 = getPracticeCard(state, "villager", 1)?.defId ?? null;
  const result = applyDebugOverride(state, [
    {
      zone: "practice",
      classId: "villager",
      slotIndex: 0,
      defId: "rest",
      tier: "gold",
    },
  ]);

  assert.equal(result.ok, true);
  const card = getPracticeCard(state, "villager", 0);
  assert.equal(card.defId, "rest");
  assert.equal(card.tier, "gold");
  assert.equal(getPracticeCard(state, "villager", 1)?.defId ?? null, naturalSlot1);
  assert.equal(
    getSettlementDebugOverrideSlotSummary(state).practices.villager[0],
    true
  );

  const clearResult = applyDebugOverride(state, [
    {
      zone: "practice",
      classId: "villager",
      slotIndex: 0,
      defId: null,
    },
  ]);
  assert.equal(clearResult.ok, true);
  assert.equal(getPracticeCard(state, "villager", 0), null);
  assert.equal(
    getSettlementDebugOverrideSlotSummary(state).practices.villager[0],
    true
  );

  const clearOverrideResult = applyDebugOverride(state, [
    {
      zone: "practice",
      classId: "villager",
      slotIndex: 0,
      clearOverride: true,
    },
  ]);
  assert.equal(clearOverrideResult.ok, true);
  assert.equal(getPracticeCard(state, "villager", 0)?.defId ?? null, naturalSlot0);
  assert.equal(
    getSettlementDebugOverrideSlotSummary(state).practices.villager[0],
    false
  );
}

function testStructureOverride() {
  const state = createSettlementState();
  const result = applyDebugOverride(state, [
    {
      zone: "structure",
      slotIndex: 4,
      defId: "granary",
      tier: "diamond",
    },
  ]);

  assert.equal(result.ok, true);
  const structure = getStructure(state, 4);
  assert.equal(structure.defId, "granary");
  assert.equal(structure.tier, "diamond");
  assert.equal(state.hub.occ[4]?.instanceId, structure.instanceId);
  assert.equal(getSettlementDebugOverrideSlotSummary(state).structures[4], true);

  const clearOverrideResult = applyDebugOverride(state, [
    {
      zone: "structure",
      slotIndex: 4,
      clearOverride: true,
    },
  ]);
  assert.equal(clearOverrideResult.ok, true);
  assert.equal(getStructure(state, 4)?.defId, "granary");
  assert.equal(getSettlementDebugOverrideSlotSummary(state).structures[4], false);
}

function testCheatVassalSelectionExactAndReplay() {
  const state = createSettlementState();
  const spec = buildCheatVassalSpec();
  const result = applyCheatVassal(state, spec, 0);
  assert.equal(result.ok, true);
  const selected = getSettlementCurrentVassal(state);
  assert.equal(selected.sourceClassId, "villager");
  assert.equal(selected.currentClassId, "villager");
  assert.equal(selected.initialAgeYears, 50);
  assert.equal(selected.deathAgeYears, 70);
  assert.equal(selected.professionId, "builder");
  assert.equal(selected.traitId, "pious");
  assert.equal(selected.isElder, true);
  assert.deepEqual(selected.agendaByClass.villager, spec.agendaByClass.villager);
  assert.deepEqual(selected.agendaByClass.stranger, spec.agendaByClass.stranger);
  assert.equal(
    selected.lifeEvents.some((event) => event.kind === "becameElder" && event.tSec === 0),
    true
  );

  const timeline = createTimelineFromInitialState(createSettlementState());
  replaceActionsAtSecond(timeline, 0, [cheatVassalAction(spec, 0)], {
    truncateFuture: false,
  });
  const rebuilt = rebuildStateAtSecond(timeline, 0);
  assert.equal(rebuilt.ok, true);
  const replayed = getSettlementCurrentVassal(rebuilt.state);
  assert.equal(replayed.sourceClassId, selected.sourceClassId);
  assert.equal(replayed.initialAgeYears, selected.initialAgeYears);
  assert.equal(replayed.deathAgeYears, selected.deathAgeYears);
  assert.equal(replayed.professionId, selected.professionId);
  assert.equal(replayed.traitId, selected.traitId);
  assert.deepEqual(replayed.agendaByClass, selected.agendaByClass);
}

function testCheatVassalValidationRejectsBadSpec() {
  let state = createSettlementState();
  let result = applyCheatVassal(state, buildCheatVassalSpec({ sourceClassId: "noble" }), 0);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "badSourceClassId");
  assert.equal(getSettlementCurrentVassal(state), null);

  state = createSettlementState();
  result = applyCheatVassal(state, buildCheatVassalSpec({ professionId: "astrologer" }), 0);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "badProfessionId");

  state = createSettlementState();
  result = applyCheatVassal(state, buildCheatVassalSpec({ traitId: "lucky" }), 0);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "badTraitId");

  state = createSettlementState();
  result = applyCheatVassal(
    state,
    buildCheatVassalSpec({
      agendaByClass: {
        villager: ["asTheRomans"],
        stranger: ["asTheRomans"],
      },
    }),
    0
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "practiceClassMismatch");

  state = createSettlementState();
  result = applyCheatVassal(
    state,
    buildCheatVassalSpec({ initialAgeYears: 30, deathAgeYears: 30 }),
    0
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "badDeathAge");
}

function testCheatVassalPastEventsApplyAtSelection() {
  const state = createSettlementState();
  const spec = buildCheatVassalSpec({
    sourceClassId: "stranger",
    initialAgeYears: 50,
    deathAgeYears: 55,
    professionId: "scribe",
    traitId: "pious",
  });
  const result = applyCheatVassal(state, spec, 0);
  assert.equal(result.ok, true);
  const selected = getSettlementCurrentVassal(state);
  assert.equal(selected.currentClassId, "villager");
  assert.equal(selected.professionId, "scribe");
  assert.equal(selected.traitId, "pious");
  assert.equal(selected.isElder, true);
  assert.equal(selected.joinedCouncilSec, 0);
}

function testTimelineReplayAndTruncation() {
  const baseState = createSettlementState();
  const timeline = createTimelineFromInitialState(baseState);

  replaceActionsAtSecond(
    timeline,
    3,
    [
      debugOverrideAction(
        [
          {
            zone: "practice",
            classId: "villager",
            slotIndex: 0,
            defId: "rest",
            tier: "silver",
          },
        ],
        3
      ),
    ],
    { truncateFuture: false }
  );
  replaceActionsAtSecond(
    timeline,
    8,
    [
      debugOverrideAction(
        [
          {
            zone: "practice",
            classId: "villager",
            slotIndex: 1,
            defId: "riverRecessionFarming",
            tier: "gold",
          },
        ],
        8
      ),
    ],
    { truncateFuture: false }
  );

  const firstReplay = rebuildStateAtSecond(timeline, 8);
  const secondReplay = rebuildStateAtSecond(timeline, 8);
  assert.equal(firstReplay.ok, true);
  assert.equal(secondReplay.ok, true);
  assert.deepEqual(
    serializeGameState(firstReplay.state),
    serializeGameState(secondReplay.state)
  );
  assert.equal(getPracticeCard(firstReplay.state, "villager", 0).defId, "rest");
  assert.equal(
    getPracticeCard(firstReplay.state, "villager", 1).defId,
    "riverRecessionFarming"
  );

  replaceActionsAtSecond(
    timeline,
    5,
    [
      debugOverrideAction(
        [
          {
            zone: "practice",
            classId: "villager",
            slotIndex: 0,
            defId: "monsterHunt",
            tier: "diamond",
          },
        ],
        5
      ),
    ]
  );

  assert.equal(timeline.actions.some((action) => action.tSec > 5), false);
  const rebuilt = rebuildStateAtSecond(timeline, 8);
  assert.equal(rebuilt.ok, true);
  assert.equal(getPracticeCard(rebuilt.state, "villager", 0).defId, "monsterHunt");
  assert.notEqual(
    getPracticeCard(rebuilt.state, "villager", 1)?.defId,
    "riverRecessionFarming"
  );
}

function testForecastProjectionAppliesFutureDebugActions() {
  const baseState = createSettlementState();
  const timeline = createTimelineFromInitialState(baseState);
  replaceActionsAtSecond(
    timeline,
    7,
    [
      debugOverrideAction(
        [
          {
            zone: "practice",
            classId: "villager",
            slotIndex: 0,
            defId: "emergencyFoodReserve",
            tier: "gold",
          },
        ],
        7
      ),
    ],
    { truncateFuture: false }
  );

  const projectionCache = createProjectionCache();
  const projected = projectionCache.ensureStateAtSecond(timeline, 8, undefined, 5);
  assert.equal(projected.ok, true);
  const projectedState = deserializeGameState(projected.stateData);
  assert.equal(getPracticeCard(projectedState, "villager", 0).defId, "emergencyFoodReserve");
  assert.equal(getPracticeCard(projectedState, "villager", 0).tier, "gold");
}

function testDebugOverrideTruncatesFutureVassalSelections() {
  const baseState = createSettlementState();
  const timeline = createTimelineFromInitialState(baseState);
  const vassalAction = (tSec, candidateIndex = 0) => ({
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
    tSec,
    payload: {
      candidateIndex,
      expectedPoolHash: "testPoolHash",
      tSec,
    },
  });

  replaceActionsAtSecond(timeline, 0, [vassalAction(0, 0)], {
    truncateFuture: false,
  });
  replaceActionsAtSecond(timeline, 10, [vassalAction(10, 1)], {
    truncateFuture: false,
  });
  replaceActionsAtSecond(timeline, 12, [debugOverrideAction([], 12)], {
    truncateFuture: false,
  });

  replaceActionsAtSecond(
    timeline,
    6,
    [
      debugOverrideAction(
        [
          {
            zone: "practice",
            classId: "villager",
            slotIndex: 0,
            defId: "rest",
            tier: "gold",
          },
        ],
        6
      ),
    ],
    { truncateFuture: true }
  );

  assert.deepEqual(
    timeline.actions.map((action) => [action.kind, action.tSec]),
    [
      [ActionKinds.SETTLEMENT_SELECT_VASSAL, 0],
      [ActionKinds.DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES, 6],
    ]
  );
}

function testCheatVassalSelectionTruncatesFutureVassalSelections() {
  const baseState = createSettlementState();
  const timeline = createTimelineFromInitialState(baseState);
  const vassalAction = (tSec, candidateIndex = 0) => ({
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
    tSec,
    payload: {
      candidateIndex,
      expectedPoolHash: "testPoolHash",
      tSec,
    },
  });

  replaceActionsAtSecond(timeline, 0, [vassalAction(0, 0)], {
    truncateFuture: false,
  });
  replaceActionsAtSecond(timeline, 10, [vassalAction(10, 1)], {
    truncateFuture: false,
  });

  replaceActionsAtSecond(timeline, 6, [cheatVassalAction(buildCheatVassalSpec(), 6)], {
    truncateFuture: true,
  });

  assert.deepEqual(
    timeline.actions.map((action) => [action.kind, action.tSec]),
    [
      [ActionKinds.SETTLEMENT_SELECT_VASSAL, 0],
      [ActionKinds.DEBUG_SELECT_CHEAT_VASSAL, 6],
    ]
  );
}

function testTargetedGraphInvalidationDropsStaleForecastCoverage() {
  const baseState = createSettlementState();
  const timeline = createTimelineFromInitialState(baseState);
  const projectionCache = createProjectionCache();
  const controller = createTimeGraphController({
    getTimeline: () => timeline,
    getCursorState: () => baseState,
    metric: GRAPH_METRICS.settlement,
    projectionCache,
    forecastStepSec: 1,
    horizonSec: 40,
  });

  controller.setActive(true);
  const coverageRes = controller.ensureForecastCoverageTo(30);
  assert.equal(coverageRes.ok, true);
  assert.equal(controller.getData().forecastCoverageEndSec >= 30, true);

  replaceActionsAtSecond(
    timeline,
    12,
    [
      debugOverrideAction(
        [
          {
            zone: "practice",
            classId: "villager",
            slotIndex: 0,
            defId: "rest",
            tier: "silver",
          },
        ],
        12
      ),
    ],
    { truncateFuture: true }
  );
  controller.handleInvalidate("actionScheduled");

  assert.equal(controller.getData().forecastCoverageEndSec < 12, true);
}

function createFakeForecastWorker() {
  return {
    listeners: new Map(),
    messages: [],
    terminated: false,
    addEventListener(type, fn) {
      this.listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (this.listeners.get(type) === fn) {
        this.listeners.delete(type);
      }
    },
    postMessage(message) {
      this.messages.push(message);
    },
    terminate() {
      this.terminated = true;
    },
  };
}

function testForecastWorkerInvalidationTerminatesInFlightWorker() {
  const baseState = createSettlementState();
  const timeline = createTimelineFromInitialState(baseState);
  const projectionCache = createProjectionCache();
  const workers = [];
  const service = createTimegraphForecastWorkerService({
    createWorker: () => {
      const worker = createFakeForecastWorker();
      workers.push(worker);
      return worker;
    },
    requestCadenceMs: 0,
    earlyRequestCadenceMs: 0,
  });
  const timelineToken = projectionCache.getTimelineToken(timeline);
  const boundaryStateData = serializeGameState(baseState);

  const request = () =>
    service.requestCoverage({
      projectionCache,
      timeline,
      timelineToken,
      historyEndSec: 0,
      stepSec: 1,
      desiredEndSec: 360,
      boundaryStateData,
      scheduledActionsBySecond: [],
    });

  const first = request();
  assert.equal(first.ok, true);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].messages.length, 1);

  service.handleTimelineInvalidation("actionScheduled");
  assert.equal(workers[0].terminated, true);

  const second = request();
  assert.equal(second.ok, true);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].terminated, false);
  assert.equal(workers[1].messages.length, 1);
}

export function runDebugOverrideSuite() {
  testPracticeOverride();
  testStructureOverride();
  testCheatVassalSelectionExactAndReplay();
  testCheatVassalValidationRejectsBadSpec();
  testCheatVassalPastEventsApplyAtSelection();
  testTimelineReplayAndTruncation();
  testForecastProjectionAppliesFutureDebugActions();
  testDebugOverrideTruncatesFutureVassalSelections();
  testCheatVassalSelectionTruncatesFutureVassalSelections();
  testTargetedGraphInvalidationDropsStaleForecastCoverage();
  testForecastWorkerInvalidationTerminatesInFlightWorker();
  return { ok: true };
}
