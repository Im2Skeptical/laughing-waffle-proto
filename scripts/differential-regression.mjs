#!/usr/bin/env node
// Deterministic two-revision comparison harness. Loads each pinned tree as a
// separate ESM graph and compares complete serializeGameState snapshots.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SETUP_ID,
  PINNED,
  classifyActionKinds,
  diffValues,
  findRngSeed,
  gitRevParse,
  loadRevision,
  parseArgs,
  previewValue,
  reproductionCommand,
  statesEqual,
  writeJson,
  writeText,
} from "./differential-regression-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_REL = "scripts/differential-regression.mjs";
const MAX_RESOLVE_SEC = 96;

class SkipError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "SkipError";
    this.reason = reason;
  }
}

function kindOrSkip(api, kind, scenarioId) {
  if (!api.hasKind(kind)) {
    throw new SkipError(
      `${scenarioId}: ActionKind '${kind}' is not present in this revision`
    );
  }
  return kind;
}

function bootState(api, seed, fixtures, extra = {}) {
  const state = api.createInitialState(DEFAULT_SETUP_ID, seed);
  state.paused = true;
  state.phase = "planning";
  fixtures.push("paused planning at tSec=0");
  if (extra.quietChaos !== false) {
    state.gameConfig.settings.values.primordialBasePressure = 0;
    state.civilization.chaos.monsterLossThreshold = 1_000_000;
    fixtures.push("primordialBasePressure=0, monsterLossThreshold=1e6");
  }
  return state;
}

function dispatch(api, state, actions, timeline, kind, payload = {}) {
  const action = {
    kind,
    payload,
    tSec: Math.max(0, Math.floor(state?.tSec ?? 0)),
  };
  if (timeline) {
    const recorded = api.appendActionAtCursor(timeline, action, state);
    if (!recorded?.ok) {
      throw new Error(`appendActionAtCursor failed for ${kind}: ${recorded?.reason}`);
    }
  }
  const result = api.applyAction(state, action, { isReplay: true });
  actions.push({
    kind,
    payload,
    tSec: action.tSec,
    ok: result?.ok === true,
    reason: result?.reason ?? null,
  });
  if (!result?.ok) {
    throw new Error(`action ${kind} rejected: ${result?.reason ?? "unknown"}`);
  }
  return result;
}

function snapshotCheckpoint(api, name, state, extra = {}) {
  const data = api.serializeGameState(state);
  const roundtrip = api.serializeGameState(api.deserializeGameState(data));
  return {
    name,
    kind: extra.kind ?? "live",
    tSec: Math.max(0, Math.floor(state?.tSec ?? 0)),
    data,
    roundtripEqual: statesEqual(data, roundtrip),
  };
}

function rebuildCheckpoint(api, name, timeline, tSec) {
  const first = api.rebuildStateAtSecond(timeline, tSec);
  if (!first?.ok) {
    throw new Error(`rebuildStateAtSecond(${tSec}) failed: ${first?.reason}`);
  }
  const second = api.rebuildStateAtSecond(timeline, tSec);
  if (!second?.ok) {
    throw new Error(`second rebuildStateAtSecond(${tSec}) failed: ${second?.reason}`);
  }
  const data = api.serializeGameState(first.state);
  const data2 = api.serializeGameState(second.state);
  return {
    name,
    kind: "rebuild",
    tSec,
    data,
    rebuildDeterministic: statesEqual(data, data2),
    state: first.state,
  };
}

function expect(intended, name, met, detail = null) {
  intended.push({ name, met: met === true, detail });
}

function currentVassal(api, state) {
  return api.getCurrentLifeMapVassal(state);
}

function nodesOf(api, state) {
  const vassal = currentVassal(api, state);
  return vassal ? api.getVassalLifeMapNodes(vassal) : [];
}

function nodeByFamily(api, state, family) {
  return nodesOf(api, state).find((node) => node.family === family) ?? null;
}

function unlockNode(api, state, nodeId, fixtures) {
  const vassal = currentVassal(api, state);
  if (!vassal) throw new Error("unlockNode requires a current vassal");
  if (vassal.lifeMap.availableNodeIds.includes(nodeId)) return false;
  vassal.lifeMap.availableNodeIds = [nodeId];
  fixtures.push(`unlocked availableNodeIds -> [${nodeId}]`);
  return true;
}

function settlementDigest(state) {
  return (state?.world?.sites ?? []).map((site) => ({
    regionId: site.regionId,
    storedFood: site.detailedState?.storedFood ?? null,
    looseFood: site.detailedState?.looseFood ?? null,
    adults: site.detailedState?.populationByClass?.villager?.adults ?? null,
    children: site.detailedState?.populationByClass?.villager?.children ?? null,
  }));
}

function playerRegionId(state, fallbackVassal = null) {
  if (fallbackVassal?.locationRegionId) return fallbackVassal.locationRegionId;
  const capital = state?.civilization?.capitalRegionId;
  if (capital) return capital;
  return state?.world?.regions?.find((region) => region.controller === "player")?.id
    ?? null;
}

function findPublicWorksAddSeed(api, selectKind, enterKind, startSeed = 103, limit = 250) {
  for (let seed = startSeed; seed < limit; seed += 1) {
    const throwaway = [];
    const actions = [];
    const state = bootState(api, seed, throwaway);
    const pool = api.getVassalCandidatePool(state);
    dispatch(api, state, actions, null, selectKind, {
      candidateIndex: 0,
      expectedPoolHash: pool.expectedPoolHash,
    });
    const vassal = currentVassal(api, state);
    if (!vassal) continue;
    vassal.prestige = 500;
    const worksNode = nodeByFamily(api, state, "publicWorks");
    if (!worksNode) continue;
    unlockNode(api, state, worksNode.id, throwaway);
    dispatch(api, state, actions, null, enterKind, { nodeId: worksNode.id });
    const nodeState = vassal.lifeMap.nodeStates[worksNode.id];
    const offer = (nodeState?.inventory ?? []).find((entry) =>
      entry?.intervention?.kind === "structure" && entry?.intervention?.mode !== "upgrade"
    );
    if (offer) return seed;
  }
  return null;
}

function probeMoveOrigin(api, state, kind, nodeId, offerId, currentOrigin, capacity) {
  const snap = api.serializeGameState(state);
  for (let origin = 0; origin < capacity; origin += 1) {
    if (origin === currentOrigin) continue;
    const probe = api.deserializeGameState(snap);
    probe.paused = true;
    const result = api.applyAction(
      probe,
      { kind, payload: { nodeId, offerId, origin } },
      { isReplay: true }
    );
    if (result?.ok) return origin;
  }
  return null;
}

function requireIntended(intended, scenarioId) {
  const failed = intended.filter((entry) => entry.met !== true);
  if (failed.length) {
    const detail = failed
      .map((entry) => `${entry.name}${entry.detail != null ? ` (${previewValue(entry.detail, 120)})` : ""}`)
      .join("; ");
    throw new Error(`${scenarioId} intended behavior not met: ${detail}`);
  }
}

function runNewRunAndCandidateSelection(api, options) {
  const scenarioId = "new-run-and-candidate-selection";
  const selectKind = kindOrSkip(api, "settlementSelectVassal", scenarioId);
  const rerollKind = kindOrSkip(api, "settlementRerollVassals", scenarioId);
  const selectSeed = options.seed ?? 99117;
  const rerollSeed = 1234;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];

  const selectState = bootState(api, selectSeed, fixtures);
  const rngBefore = { ...selectState.rng };
  const pool = api.getVassalCandidatePool(selectState);
  expect(intended, "candidate-pool-nonempty", pool.candidates.length >= 1, pool.candidates.length);
  expect(intended, "candidate-pool-hash", typeof pool.expectedPoolHash === "string");
  checkpoints.push(snapshotCheckpoint(api, "after-init", selectState));

  const timeline = api.createTimelineFromInitialState(selectState);
  dispatch(api, selectState, actions, timeline, selectKind, {
    candidateIndex: 1,
    expectedPoolHash: pool.expectedPoolHash,
  });
  const vassal = currentVassal(api, selectState);
  expect(intended, "selected-vassal", !!vassal, vassal?.vassalId ?? null);
  expect(intended, "life-map-graph", Array.isArray(vassal?.lifeMap?.graph?.nodes) && vassal.lifeMap.graph.nodes.length > 0);
  expect(intended, "rng-world-unchanged", selectState.rng.seed === rngBefore.seed);
  expect(intended, "rng-vassal-unchanged", selectState.rng.vassalSeed === rngBefore.vassalSeed);
  expect(
    intended,
    "rng-life-map-advanced",
    selectState.rng.vassalLifeMapSeed !== rngBefore.vassalLifeMapSeed
  );
  checkpoints.push(snapshotCheckpoint(api, "after-select", selectState));
  checkpoints.push(rebuildCheckpoint(api, "rebuild-after-select", timeline, 0));

  const rerollFixtures = [];
  const rerollState = bootState(api, rerollSeed, rerollFixtures);
  const rerollPoolBefore = api.getVassalCandidatePool(rerollState);
  const rerollTimeline = api.createTimelineFromInitialState(rerollState);
  dispatch(api, rerollState, actions, rerollTimeline, rerollKind, {});
  const rerollPoolAfter = api.getVassalCandidatePool(rerollState);
  expect(intended, "reroll-index", rerollPoolAfter.rerollIndex === 1, rerollPoolAfter.rerollIndex);
  expect(
    intended,
    "reroll-changed-pool",
    rerollPoolAfter.expectedPoolHash !== rerollPoolBefore.expectedPoolHash
  );
  checkpoints.push(snapshotCheckpoint(api, "after-reroll", rerollState));
  checkpoints.push(rebuildCheckpoint(api, "rebuild-after-reroll", rerollTimeline, 0));
  requireIntended(intended, scenarioId);

  return {
    scenarioId,
    classId: "new-runs-and-candidate-selection",
    seed: selectSeed,
    extraSeeds: [rerollSeed],
    fixtures: [...fixtures, ...rerollFixtures],
    actions,
    intended,
    checkpoints,
  };
}

function runLifeMapEntryOptionConfirm(api, options) {
  const scenarioId = "life-map-entry-option-confirm";
  const selectKind = kindOrSkip(api, "settlementSelectVassal", scenarioId);
  const enterKind = kindOrSkip(api, "vassalEnterLifeNode", scenarioId);
  const optionKind = kindOrSkip(api, "vassalSelectLifeOption", scenarioId);
  const confirmKind = kindOrSkip(api, "vassalConfirmLifeNode", scenarioId);
  const seed = options.seed ?? 99117;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];

  const state = bootState(api, seed, fixtures);
  const pool = api.getVassalCandidatePool(state);
  const timeline = api.createTimelineFromInitialState(state);
  dispatch(api, state, actions, timeline, selectKind, {
    candidateIndex: 1,
    expectedPoolHash: pool.expectedPoolHash,
  });
  const vassal = currentVassal(api, state);
  expect(intended, "selected-vassal", !!vassal);
  const availableIds = vassal.lifeMap.availableNodeIds ?? [];
  expect(intended, "available-entry-nodes", availableIds.length >= 1, availableIds);
  const patronageId = availableIds.find((id) =>
    vassal.lifeMap.graph.nodes.find((node) => node.id === id)?.family === "patronage"
  );
  const nodeId = patronageId ?? availableIds[0];
  dispatch(api, state, actions, timeline, enterKind, { nodeId });
  const nodeState = vassal.lifeMap.nodeStates[nodeId];
  expect(intended, "entered-node", !!nodeState, nodeId);
  const option = nodeState.options?.find((entry) => entry.id === "cultivateConnections")
    ?? nodeState.options?.[0]
    ?? null;
  expect(intended, "option-available", !!option, nodeState.options?.map((entry) => entry.id) ?? []);
  dispatch(api, state, actions, timeline, optionKind, { nodeId, optionId: option.id });
  expect(intended, "option-selected", nodeState.selectedOptionId === option.id, nodeState.selectedOptionId);
  dispatch(api, state, actions, timeline, confirmKind, { nodeId });
  const pending = vassal.lifeMap.pendingResolution;
  expect(intended, "pending-resolution", !!pending && Number.isFinite(pending.resolveSec), pending);
  checkpoints.push(snapshotCheckpoint(api, "after-confirm", state));
  checkpoints.push(rebuildCheckpoint(api, "rebuild-after-confirm", timeline, 0));
  requireIntended(intended, scenarioId);
  return {
    scenarioId,
    classId: "life-map-entry-option-selection",
    seed,
    fixtures,
    actions,
    intended,
    checkpoints,
  };
}

function runShopStagingUndoConfirm(api, options) {
  const scenarioId = "shop-staging-undo-confirm";
  const selectKind = kindOrSkip(api, "settlementSelectVassal", scenarioId);
  const enterKind = kindOrSkip(api, "vassalEnterLifeNode", scenarioId);
  const purchaseKind = kindOrSkip(api, "vassalPurchaseShopOffer", scenarioId);
  const undoKind = kindOrSkip(api, "vassalUndoShopPurchase", scenarioId);
  const rerollKind = kindOrSkip(api, "vassalRerollShop", scenarioId);
  const reorderKind = kindOrSkip(api, "vassalReorderShopPurchase", scenarioId);
  const confirmKind = kindOrSkip(api, "vassalConfirmLifeNode", scenarioId);
  const moveKind = api.hasKind("vassalMoveShopStructure") ? "vassalMoveShopStructure" : null;
  const practiceSeed = options.seed ?? 102;
  const structureSeed = 103;
  let usedStructureSeed = null;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];

  const practice = bootState(api, practiceSeed, fixtures);
  const practicePool = api.getVassalCandidatePool(practice);
  dispatch(api, practice, actions, null, selectKind, {
    candidateIndex: 0,
    expectedPoolHash: practicePool.expectedPoolHash,
  });
  const practiceVassal = currentVassal(api, practice);
  expect(intended, "practice-vassal", !!practiceVassal);
  practiceVassal.prestige = 500;
  fixtures.push("practiceReform prestige=500");
  const practiceNode = nodeByFamily(api, practice, "practiceReform");
  expect(intended, "practiceReform-node", !!practiceNode, practiceNode?.id ?? null);
  unlockNode(api, practice, practiceNode.id, fixtures);
  const practiceTimeline = api.createTimelineFromInitialState(practice);
  dispatch(api, practice, actions, practiceTimeline, enterKind, { nodeId: practiceNode.id });
  const shopNode = practiceVassal.lifeMap.nodeStates[practiceNode.id];
  expect(intended, "shop-inventory", Array.isArray(shopNode.inventory) && shopNode.inventory.length >= 2, shopNode.inventory?.length ?? 0);
  const firstOffer = shopNode.inventory[0].offerId;
  const secondOffer = shopNode.inventory[1].offerId;
  dispatch(api, practice, actions, practiceTimeline, purchaseKind, {
    nodeId: practiceNode.id, offerId: firstOffer,
  });
  dispatch(api, practice, actions, practiceTimeline, purchaseKind, {
    nodeId: practiceNode.id, offerId: secondOffer,
  });
  expect(intended, "staged-purchases", shopNode.purchasedOffers.length === 2, shopNode.purchasedOffers.length);
  expect(intended, "prestige-ghosted", practiceVassal.prestige === 500, practiceVassal.prestige);
  dispatch(api, practice, actions, practiceTimeline, undoKind, {
    nodeId: practiceNode.id, offerId: secondOffer,
  });
  dispatch(api, practice, actions, practiceTimeline, undoKind, {
    nodeId: practiceNode.id, offerId: firstOffer,
  });
  expect(intended, "undo-restored-inventory", shopNode.purchasedOffers.length === 0, shopNode.purchasedOffers.length);
  const inventoryBeforeReroll = JSON.parse(JSON.stringify(shopNode.inventory));
  dispatch(api, practice, actions, practiceTimeline, rerollKind, { nodeId: practiceNode.id });
  expect(intended, "reroll-refilled", shopNode.inventory.length === 3, shopNode.inventory.length);
  expect(
    intended,
    "reroll-new-offers",
    JSON.stringify(shopNode.inventory) !== JSON.stringify(inventoryBeforeReroll),
    {
      before: inventoryBeforeReroll.map((offer) => offer.offerId),
      after: shopNode.inventory.map((offer) => offer.offerId),
    }
  );
  const rerolledIds = shopNode.inventory.map((offer) => offer.offerId);
  for (const offerId of rerolledIds.slice(0, 2)) {
    dispatch(api, practice, actions, practiceTimeline, purchaseKind, {
      nodeId: practiceNode.id, offerId,
    });
  }
  expect(intended, "two-staged-after-reroll", shopNode.purchasedOffers.length >= 2, shopNode.purchasedOffers.length);
  const lastOfferId = shopNode.purchasedOffers.at(-1).offerId;
  const orderBefore = shopNode.purchasedOffers.map((purchase) => purchase.offerId);
  dispatch(api, practice, actions, practiceTimeline, reorderKind, {
    nodeId: practiceNode.id, offerId: lastOfferId, toIndex: 0,
  });
  const orderAfter = shopNode.purchasedOffers.map((purchase) => purchase.offerId);
  expect(intended, "reorder-moved-last-to-front", orderAfter[0] === lastOfferId, { orderBefore, orderAfter });
  dispatch(api, practice, actions, practiceTimeline, confirmKind, { nodeId: practiceNode.id });
  expect(intended, "shop-confirmed-pending", !!practiceVassal.lifeMap.pendingResolution);
  checkpoints.push(snapshotCheckpoint(api, "practice-shop-confirmed", practice));
  checkpoints.push(rebuildCheckpoint(api, "rebuild-practice-shop", practiceTimeline, 0));

  if (!moveKind) {
    fixtures.push("skipped publicWorks move: vassalMoveShopStructure missing");
  } else {
    const moveSeed = findPublicWorksAddSeed(api, selectKind, enterKind, structureSeed);
    usedStructureSeed = moveSeed;
    expect(intended, "publicWorks-add-seed", Number.isFinite(moveSeed), moveSeed);
    const structureFixtures = [`publicWorks add-mode seed ${moveSeed}`];
    const structure = bootState(api, moveSeed, structureFixtures);
    const structurePool = api.getVassalCandidatePool(structure);
    dispatch(api, structure, actions, null, selectKind, {
      candidateIndex: 0,
      expectedPoolHash: structurePool.expectedPoolHash,
    });
    const structureVassal = currentVassal(api, structure);
    expect(intended, "structure-vassal", !!structureVassal);
    structureVassal.prestige = 500;
    structureFixtures.push("publicWorks prestige=500");
    const worksNode = nodeByFamily(api, structure, "publicWorks");
    expect(intended, "publicWorks-node", !!worksNode, worksNode?.id ?? null);
    const region = structure.world.regions.find((entry) => entry.id === structureVassal.locationRegionId);
    const site = structure.world.sites.find((entry) => entry.regionId === structureVassal.locationRegionId);
    if (region && region.structureCapacity < 8) {
      region.structureCapacity = 8;
      const slots = site?.detailedState?.structureSlots;
      if (Array.isArray(slots)) {
        while (slots.length < 8) slots.push(null);
      }
      structureFixtures.push("structureCapacity=8 with padded structureSlots");
    }
    unlockNode(api, structure, worksNode.id, structureFixtures);
    const structureTimeline = api.createTimelineFromInitialState(structure);
    dispatch(api, structure, actions, structureTimeline, enterKind, { nodeId: worksNode.id });
    const worksState = structureVassal.lifeMap.nodeStates[worksNode.id];
    expect(intended, "structure-inventory", Array.isArray(worksState.inventory) && worksState.inventory.length >= 1, worksState.inventory?.length ?? 0);
    const addOffer = worksState.inventory.find((entry) =>
      entry?.intervention?.kind === "structure" && entry?.intervention?.mode !== "upgrade"
    );
    expect(intended, "structure-add-offer", !!addOffer, worksState.inventory.map((entry) => entry.intervention?.mode));
    const offerId = addOffer.offerId;
    dispatch(api, structure, actions, structureTimeline, purchaseKind, {
      nodeId: worksNode.id, offerId,
    });
    expect(intended, "structure-staged", worksState.purchasedOffers.length >= 1);
    const currentOrigin = worksState.purchasedOffers[0]?.placement?.origin;
    expect(intended, "structure-origin", Number.isFinite(currentOrigin), currentOrigin);
    const nextOrigin = probeMoveOrigin(
      api,
      structure,
      moveKind,
      worksNode.id,
      offerId,
      currentOrigin,
      region?.structureCapacity ?? 8
    );
    expect(intended, "structure-move-target", Number.isFinite(nextOrigin), nextOrigin);
    dispatch(api, structure, actions, structureTimeline, moveKind, {
      nodeId: worksNode.id, offerId, origin: nextOrigin,
    });
    expect(
      intended,
      "structure-moved",
      worksState.purchasedOffers[0]?.placement?.origin === nextOrigin,
      worksState.purchasedOffers[0]?.placement?.origin
    );
    dispatch(api, structure, actions, structureTimeline, undoKind, {
      nodeId: worksNode.id, offerId,
    });
    expect(intended, "structure-undo", worksState.purchasedOffers.length === 0);
    dispatch(api, structure, actions, structureTimeline, purchaseKind, {
      nodeId: worksNode.id, offerId,
    });
    dispatch(api, structure, actions, structureTimeline, confirmKind, { nodeId: worksNode.id });
    expect(intended, "structure-confirmed", !!structureVassal.lifeMap.pendingResolution);
    checkpoints.push(snapshotCheckpoint(api, "public-works-confirmed", structure));
    checkpoints.push(rebuildCheckpoint(api, "rebuild-public-works", structureTimeline, 0));
    fixtures.push(...structureFixtures);
  }

  requireIntended(intended, scenarioId);
  return {
    scenarioId,
    classId: "life-map-shop-staging-undo-confirm",
    seed: practiceSeed,
    extraSeeds: usedStructureSeed != null ? [usedStructureSeed] : [],
    fixtures,
    actions,
    intended,
    checkpoints,
  };
}

function runPhaseAdvancementSettlement(api, options) {
  const scenarioId = "phase-advancement-settlement";
  const selectKind = kindOrSkip(api, "settlementSelectVassal", scenarioId);
  const enterKind = kindOrSkip(api, "vassalEnterLifeNode", scenarioId);
  const confirmKind = kindOrSkip(api, "vassalConfirmLifeNode", scenarioId);
  const chooseKind = api.hasKind("vassalChooseDevelopmentStat")
    ? "vassalChooseDevelopmentStat"
    : null;
  const idleSeed = 24680;
  const resolveSeed = options.seed ?? 105;
  const horizon = options.horizonSec ?? 24;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];

  const idle = bootState(api, idleSeed, fixtures);
  const idleBefore = settlementDigest(idle);
  const idleTimeline = api.createTimelineFromInitialState(idle);
  const idleRebuilt = rebuildCheckpoint(api, `rebuild-idle-${horizon}s`, idleTimeline, horizon);
  expect(intended, "idle-rebuild-ok", !!idleRebuilt.data);
  expect(intended, "idle-tsec", idleRebuilt.state.tSec === horizon, idleRebuilt.state.tSec);
  const idleAfter = settlementDigest(idleRebuilt.state);
  expect(
    intended,
    "settlement-state-evolved",
    JSON.stringify(idleBefore) !== JSON.stringify(idleAfter)
      || idleRebuilt.state.simStepIndex > 0,
    { before: idleBefore, after: idleAfter, simStepIndex: idleRebuilt.state.simStepIndex }
  );
  checkpoints.push(idleRebuilt);

  const resolveState = bootState(api, resolveSeed, fixtures);
  const resolvePool = api.getVassalCandidatePool(resolveState);
  dispatch(api, resolveState, actions, null, selectKind, {
    candidateIndex: 0,
    expectedPoolHash: resolvePool.expectedPoolHash,
  });
  const vassal = currentVassal(api, resolveState);
  expect(intended, "resolve-vassal", !!vassal);
  vassal.stats.wisdom = 8;
  fixtures.push("development wisdom=8");
  const shopNode = nodeByFamily(api, resolveState, "practiceReform");
  expect(intended, "empty-shop-node", !!shopNode, shopNode?.id ?? null);
  unlockNode(api, resolveState, shopNode.id, fixtures);
  const resolveTimeline = api.createTimelineFromInitialState(resolveState);
  dispatch(api, resolveState, actions, resolveTimeline, enterKind, { nodeId: shopNode.id });
  dispatch(api, resolveState, actions, resolveTimeline, confirmKind, { nodeId: shopNode.id });
  const pending = vassal.lifeMap.pendingResolution;
  expect(intended, "empty-shop-pending", !!pending && Number.isFinite(pending.resolveSec), pending);
  const resolveSec = pending.resolveSec;
  expect(intended, "empty-shop-bounded", resolveSec <= MAX_RESOLVE_SEC, resolveSec);
  const resolved = rebuildCheckpoint(api, `rebuild-resolve-${resolveSec}`, resolveTimeline, resolveSec);
  const resolvedVassal = currentVassal(api, resolved.state)
    ?? resolved.state.civilization?.vassalLineage?.vassalsById?.[vassal.vassalId];
  const nodeAfter = resolvedVassal?.lifeMap?.nodeStates?.[shopNode.id];
  expect(intended, "node-resolved", nodeAfter?.resolved === true, nodeAfter?.resolved ?? null);
  expect(intended, "pending-cleared", resolvedVassal?.lifeMap?.pendingResolution == null);
  checkpoints.push(snapshotCheckpoint(api, "empty-shop-confirmed-live", resolveState));
  checkpoints.push(resolved);

  if (chooseKind) {
    const liveAtResolve = api.rebuildStateAtSecond(resolveTimeline, resolveSec);
    const resolvedCurrent = currentVassal(api, liveAtResolve.state);
    const queue = resolvedCurrent?.developmentChoiceQueue ?? [];
    const queueLengthBefore = queue.length;
    expect(intended, "development-choice-queued", queueLengthBefore >= 1, queueLengthBefore);
    const choice = queue[0];
    expect(intended, "development-choice-present", !!choice);
    dispatch(api, liveAtResolve.state, actions, resolveTimeline, chooseKind, {
      choiceId: choice.choiceId,
      statId: choice.offeredStatIds[0],
    });
    expect(
      intended,
      "development-choice-consumed",
      (currentVassal(api, liveAtResolve.state)?.developmentChoiceQueue?.length ?? 0) === queueLengthBefore - 1
    );
    checkpoints.push(snapshotCheckpoint(api, "after-development-choice", liveAtResolve.state));
    checkpoints.push(rebuildCheckpoint(api, "rebuild-development-choice", resolveTimeline, resolveSec));
  }

  requireIntended(intended, scenarioId);
  return {
    scenarioId,
    classId: "phase-advancement-and-settlement-outcomes",
    seed: resolveSeed,
    extraSeeds: [idleSeed],
    fixtures,
    actions,
    intended,
    checkpoints,
  };
}

function runVassalCrisisDeath(api, options) {
  const scenarioId = "vassal-crisis-death";
  const selectKind = kindOrSkip(api, "settlementSelectVassal", scenarioId);
  const enterKind = kindOrSkip(api, "vassalEnterLifeNode", scenarioId);
  const optionKind = kindOrSkip(api, "vassalSelectLifeOption", scenarioId);
  const confirmKind = kindOrSkip(api, "vassalConfirmLifeNode", scenarioId);
  const seed = options.seed ?? 106;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];

  const state = bootState(api, seed, fixtures);
  const pool = api.getVassalCandidatePool(state);
  dispatch(api, state, actions, null, selectKind, {
    candidateIndex: 0,
    expectedPoolHash: pool.expectedPoolHash,
  });
  const vassal = currentVassal(api, state);
  expect(intended, "crisis-vassal", !!vassal);
  const crisisNode = nodeByFamily(api, state, "crisis");
  expect(intended, "crisis-node", !!crisisNode, crisisNode?.id ?? null);
  unlockNode(api, state, crisisNode.id, fixtures);
  dispatch(api, state, actions, null, enterKind, { nodeId: crisisNode.id });
  const nodeState = vassal.lifeMap.nodeStates[crisisNode.id];
  const option = nodeState.options?.find((entry) => entry.id === "rallyLoyalists")
    ?? nodeState.options?.[0]
    ?? null;
  expect(intended, "crisis-option", !!option, nodeState.options?.map((entry) => entry.id) ?? []);
  dispatch(api, state, actions, null, optionKind, { nodeId: crisisNode.id, optionId: option.id });
  const chance = api.VASSAL_LIFE_TUNING.crisisImmediateDeathChance;
  const deathSeed = findRngSeed(api, (roll) => roll < chance);
  state.rng.vassalSeed = deathSeed;
  fixtures.push(`rng.vassalSeed=${deathSeed} for crisisImmediateDeathChance=${chance}`);
  const timeline = api.createTimelineFromInitialState(state);
  dispatch(api, state, actions, timeline, confirmKind, { nodeId: crisisNode.id });
  expect(intended, "current-vassal-cleared", currentVassal(api, state) == null);
  expect(intended, "death-cause-crisis", vassal.deathCause === "crisis", vassal.deathCause);
  checkpoints.push(snapshotCheckpoint(api, "after-crisis-death", state));
  checkpoints.push(rebuildCheckpoint(api, "rebuild-crisis-death", timeline, 0));
  requireIntended(intended, scenarioId);
  return {
    scenarioId,
    classId: "vassal-death",
    seed,
    fixtures,
    actions,
    intended,
    checkpoints,
  };
}

function runVassalLegacyRetirement(api, options) {
  const scenarioId = "vassal-legacy-retirement";
  const selectKind = kindOrSkip(api, "settlementSelectVassal", scenarioId);
  const enterKind = kindOrSkip(api, "vassalEnterLifeNode", scenarioId);
  const optionKind = kindOrSkip(api, "vassalSelectLifeOption", scenarioId);
  const confirmKind = kindOrSkip(api, "vassalConfirmLifeNode", scenarioId);
  const seed = options.seed ?? 108;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];

  const state = bootState(api, seed, fixtures);
  const pool = api.getVassalCandidatePool(state);
  dispatch(api, state, actions, null, selectKind, {
    candidateIndex: 0,
    expectedPoolHash: pool.expectedPoolHash,
  });
  const vassal = currentVassal(api, state);
  expect(intended, "legacy-vassal", !!vassal);
  vassal.prestige = 0;
  fixtures.push("legacy prestige=0");
  const legacyNode = nodeByFamily(api, state, "legacy")
    ?? nodesOf(api, state).find((node) => node.id === vassal.lifeMap.graph.bossNodeId)
    ?? null;
  expect(intended, "legacy-node", !!legacyNode, legacyNode?.id ?? null);
  unlockNode(api, state, legacyNode.id, fixtures);
  const timeline = api.createTimelineFromInitialState(state);
  dispatch(api, state, actions, timeline, enterKind, { nodeId: legacyNode.id });
  const nodeState = vassal.lifeMap.nodeStates[legacyNode.id];
  const option = nodeState.options?.find((entry) => entry.id === "humbleRemembrance")
    ?? nodeState.options?.find((entry) => entry.prestigeCost === 0)
    ?? null;
  expect(intended, "free-legacy-option", !!option, nodeState.options?.map((entry) => entry.id) ?? []);
  dispatch(api, state, actions, timeline, optionKind, {
    nodeId: legacyNode.id, optionId: option.id,
  });
  dispatch(api, state, actions, timeline, confirmKind, { nodeId: legacyNode.id });
  expect(intended, "current-vassal-cleared", currentVassal(api, state) == null);
  expect(intended, "ended-reason-retired", vassal.endedReason === "retired", vassal.endedReason);
  checkpoints.push(snapshotCheckpoint(api, "after-legacy-retirement", state));
  checkpoints.push(rebuildCheckpoint(api, "rebuild-legacy-retirement", timeline, 0));
  requireIntended(intended, scenarioId);
  return {
    scenarioId,
    classId: "vassal-retirement",
    seed,
    fixtures,
    actions,
    intended,
    checkpoints,
  };
}

function runSerializationAndRebuild(api, options) {
  const scenarioId = "serialization-and-rebuild";
  const selectKind = kindOrSkip(api, "settlementSelectVassal", scenarioId);
  const enterKind = kindOrSkip(api, "vassalEnterLifeNode", scenarioId);
  const optionKind = kindOrSkip(api, "vassalSelectLifeOption", scenarioId);
  const confirmKind = kindOrSkip(api, "vassalConfirmLifeNode", scenarioId);
  const seed = options.seed ?? 99117;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];

  const state = bootState(api, seed, fixtures);
  const pool = api.getVassalCandidatePool(state);
  const timeline = api.createTimelineFromInitialState(state);
  dispatch(api, state, actions, timeline, selectKind, {
    candidateIndex: 1,
    expectedPoolHash: pool.expectedPoolHash,
  });
  const vassal = currentVassal(api, state);
  const nodeId = vassal.lifeMap.availableNodeIds[0];
  dispatch(api, state, actions, timeline, enterKind, { nodeId });
  const optionId = vassal.lifeMap.nodeStates[nodeId].options[0].id;
  dispatch(api, state, actions, timeline, optionKind, { nodeId, optionId });
  dispatch(api, state, actions, timeline, confirmKind, { nodeId });
  const live = snapshotCheckpoint(api, "live-after-sequence", state);
  expect(intended, "roundtrip-equal", live.roundtripEqual === true);
  checkpoints.push(live);
  const rebuild0 = rebuildCheckpoint(api, "rebuild-t0", timeline, 0);
  expect(intended, "rebuild-t0-deterministic", rebuild0.rebuildDeterministic === true);
  checkpoints.push(rebuild0);
  const rebuild12 = rebuildCheckpoint(api, "rebuild-t12", timeline, 12);
  expect(intended, "rebuild-t12-deterministic", rebuild12.rebuildDeterministic === true);
  expect(intended, "rebuild-t12-time", rebuild12.state.tSec === 12, rebuild12.state.tSec);
  checkpoints.push(rebuild12);
  requireIntended(intended, scenarioId);
  return {
    scenarioId,
    classId: "serialization-roundtrip-and-authoritative-rebuild",
    seed,
    fixtures,
    actions,
    intended,
    checkpoints,
  };
}

function runForecastReplayAgreement(api, options) {
  const scenarioId = "forecast-replay-agreement";
  const selectKind = kindOrSkip(api, "settlementSelectVassal", scenarioId);
  const seed = options.seed ?? 99117;
  const horizon = options.horizonSec ?? 24;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];

  const state = bootState(api, seed, fixtures);
  const pool = api.getVassalCandidatePool(state);
  dispatch(api, state, actions, null, selectKind, {
    candidateIndex: 1,
    expectedPoolHash: pool.expectedPoolHash,
  });
  const timeline = api.createTimelineFromInitialState(state);
  const boundary = api.serializeGameState(state);
  const projection = api.buildProjectionChunkFromStateData(boundary, 0, horizon);
  expect(intended, "projection-ok", projection?.ok === true, projection?.reason ?? null);
  expect(intended, "projection-end", projection.endSec === horizon, projection.endSec);
  const rebuilt = rebuildCheckpoint(api, `rebuild-${horizon}s`, timeline, horizon);
  const forecastData = projection.lastStateData;
  expect(intended, "forecast-last-state", !!forecastData);
  const agreement = diffValues(rebuilt.data, forecastData);
  expect(intended, "forecast-matches-rebuild", agreement.count === 0, {
    diffCount: agreement.count,
    diffs: agreement.diffs,
  });
  checkpoints.push({
    name: `forecast-${horizon}s`,
    kind: "forecast",
    tSec: projection.endSec,
    data: forecastData,
    roundtripEqual: true,
  });
  checkpoints.push(rebuilt);
  requireIntended(intended, scenarioId);
  return {
    scenarioId,
    classId: "forecast-replay-agreement",
    seed,
    fixtures,
    actions,
    intended,
    checkpoints,
  };
}

function runRegionalPracticeRoundtrip(api, options) {
  const scenarioId = "regional-practice-install-uninstall";
  const installKind = kindOrSkip(api, "regionInstallPractice", scenarioId);
  const uninstallKind = kindOrSkip(api, "regionUninstallPractice", scenarioId);
  const seed = options.seed ?? 24680;
  const fixtures = [];
  const actions = [];
  const intended = [];
  const checkpoints = [];
  const state = bootState(api, seed, fixtures);
  const regionId = playerRegionId(state);
  expect(intended, "player-region", typeof regionId === "string", regionId);
  const region = state.world.regions.find((entry) => entry.id === regionId);
  if (!Array.isArray(region?.installedPracticeIds)) {
    throw new SkipError(
      `${scenarioId}: region.installedPracticeIds is absent (legacy field removed from serialized world state); ${installKind}/${uninstallKind} cannot reach intended install/uninstall behavior`
    );
  }
  const timeline = api.createTimelineFromInitialState(state);
  dispatch(api, state, actions, timeline, installKind, { regionId, practiceId: "cultivate" });
  expect(intended, "installed-cultivate", region.installedPracticeIds.includes("cultivate"), region.installedPracticeIds);
  dispatch(api, state, actions, timeline, uninstallKind, {
    regionId,
    installedIndex: region.installedPracticeIds.lastIndexOf("cultivate"),
  });
  expect(intended, "uninstalled-cultivate", !region.installedPracticeIds.includes("cultivate"), region.installedPracticeIds);
  checkpoints.push(snapshotCheckpoint(api, "after-regional-practice", state));
  checkpoints.push(rebuildCheckpoint(api, "rebuild-regional-practice", timeline, 0));
  requireIntended(intended, scenarioId);
  return {
    scenarioId,
    classId: "phase-advancement-and-settlement-outcomes",
    seed,
    fixtures,
    actions,
    intended,
    checkpoints,
  };
}

const SCENARIOS = [
  {
    id: "new-run-and-candidate-selection",
    classId: "new-runs-and-candidate-selection",
    requiredKinds: ["settlementSelectVassal", "settlementRerollVassals"],
    run: runNewRunAndCandidateSelection,
  },
  {
    id: "life-map-entry-option-confirm",
    classId: "life-map-entry-option-selection",
    requiredKinds: [
      "settlementSelectVassal",
      "vassalEnterLifeNode",
      "vassalSelectLifeOption",
      "vassalConfirmLifeNode",
    ],
    run: runLifeMapEntryOptionConfirm,
  },
  {
    id: "shop-staging-undo-confirm",
    classId: "life-map-shop-staging-undo-confirm",
    requiredKinds: [
      "settlementSelectVassal",
      "vassalEnterLifeNode",
      "vassalPurchaseShopOffer",
      "vassalUndoShopPurchase",
      "vassalRerollShop",
      "vassalReorderShopPurchase",
      "vassalConfirmLifeNode",
    ],
    run: runShopStagingUndoConfirm,
  },
  {
    id: "phase-advancement-settlement",
    classId: "phase-advancement-and-settlement-outcomes",
    requiredKinds: [
      "settlementSelectVassal",
      "vassalEnterLifeNode",
      "vassalConfirmLifeNode",
    ],
    run: runPhaseAdvancementSettlement,
  },
  {
    id: "vassal-crisis-death",
    classId: "vassal-death",
    requiredKinds: [
      "settlementSelectVassal",
      "vassalEnterLifeNode",
      "vassalSelectLifeOption",
      "vassalConfirmLifeNode",
    ],
    run: runVassalCrisisDeath,
  },
  {
    id: "vassal-legacy-retirement",
    classId: "vassal-retirement",
    requiredKinds: [
      "settlementSelectVassal",
      "vassalEnterLifeNode",
      "vassalSelectLifeOption",
      "vassalConfirmLifeNode",
    ],
    run: runVassalLegacyRetirement,
  },
  {
    id: "serialization-and-rebuild",
    classId: "serialization-roundtrip-and-authoritative-rebuild",
    requiredKinds: [
      "settlementSelectVassal",
      "vassalEnterLifeNode",
      "vassalSelectLifeOption",
      "vassalConfirmLifeNode",
    ],
    run: runSerializationAndRebuild,
  },
  {
    id: "forecast-replay-agreement",
    classId: "forecast-replay-agreement",
    requiredKinds: ["settlementSelectVassal"],
    run: runForecastReplayAgreement,
  },
  {
    id: "regional-practice-install-uninstall",
    classId: "phase-advancement-and-settlement-outcomes",
    requiredKinds: ["regionInstallPractice", "regionUninstallPractice"],
    run: runRegionalPracticeRoundtrip,
  },
];

function stripCheckpointData(checkpoint) {
  const { data, state, ...rest } = checkpoint;
  return {
    ...rest,
    roundtripEqual: checkpoint.roundtripEqual ?? null,
    rebuildDeterministic: checkpoint.rebuildDeterministic ?? null,
  };
}

function compareScenarioRuns(scenario, baselineRun, refactorRun, scriptRel) {
  const mismatches = [];
  const checkpointNames = new Set([
    ...baselineRun.checkpoints.map((checkpoint) => checkpoint.name),
    ...refactorRun.checkpoints.map((checkpoint) => checkpoint.name),
  ]);
  for (const name of checkpointNames) {
    const left = baselineRun.checkpoints.find((checkpoint) => checkpoint.name === name);
    const right = refactorRun.checkpoints.find((checkpoint) => checkpoint.name === name);
    if (!left || !right) {
      mismatches.push({
        seed: baselineRun.seed,
        actionSequence: baselineRun.actions,
        expected: left ? `checkpoint ${name} present on baseline` : { missing: true },
        actual: right ? `checkpoint ${name} present on refactor` : { missing: true },
        reproduction: reproductionCommand(scriptRel, scenario.id, { seed: baselineRun.seed }),
        checkpoint: name,
      });
      continue;
    }
    const compared = diffValues(left.data, right.data);
    if (compared.count > 0) {
      mismatches.push({
        seed: baselineRun.seed,
        actionSequence: baselineRun.actions,
        expected: compared.diffs.map((diff) => ({ path: diff.path, value: diff.expected })),
        actual: compared.diffs.map((diff) => ({ path: diff.path, value: diff.actual })),
        diffCount: compared.count,
        reproduction: reproductionCommand(scriptRel, scenario.id, { seed: baselineRun.seed }),
        checkpoint: name,
      });
    }
    if (left.roundtripEqual === false || right.roundtripEqual === false) {
      mismatches.push({
        seed: baselineRun.seed,
        actionSequence: baselineRun.actions,
        expected: "serialize->deserialize->serialize equals live",
        actual: {
          baselineRoundtripEqual: left.roundtripEqual,
          refactorRoundtripEqual: right.roundtripEqual,
        },
        reproduction: reproductionCommand(scriptRel, scenario.id, { seed: baselineRun.seed }),
        checkpoint: `${name}:roundtrip`,
      });
    }
    if (left.rebuildDeterministic === false || right.rebuildDeterministic === false) {
      mismatches.push({
        seed: baselineRun.seed,
        actionSequence: baselineRun.actions,
        expected: "rebuildStateAtSecond is deterministic",
        actual: {
          baselineRebuildDeterministic: left.rebuildDeterministic,
          refactorRebuildDeterministic: right.rebuildDeterministic,
        },
        reproduction: reproductionCommand(scriptRel, scenario.id, { seed: baselineRun.seed }),
        checkpoint: `${name}:rebuild-determinism`,
      });
    }
  }
  return mismatches;
}

function publicCheckpoint(checkpoint) {
  return stripCheckpointData(checkpoint);
}

function runOneScenario(scenario, baselineApi, refactorApi, options, kinds) {
  const missing = scenario.requiredKinds.filter((kind) => !kinds.shared.includes(kind));
  if (missing.length) {
    return {
      id: scenario.id,
      classId: scenario.classId,
      status: "skip",
      skipReason: `ActionKind(s) missing from intersection: ${missing.join(", ")}`,
      seed: options.seed ?? null,
      fixtures: [],
      actions: [],
      intended: [],
      checkpoints: [],
      mismatches: [],
    };
  }

  let baselineRun;
  let refactorRun;
  try {
    baselineRun = scenario.run(baselineApi, options);
  } catch (error) {
    if (error instanceof SkipError) {
      return {
        id: scenario.id,
        classId: scenario.classId,
        status: "skip",
        skipReason: error.reason,
        seed: options.seed ?? null,
        fixtures: [],
        actions: [],
        intended: [],
        checkpoints: [],
        mismatches: [],
      };
    }
    return {
      id: scenario.id,
      classId: scenario.classId,
      status: "fail",
      error: `baseline: ${error?.stack || error?.message || String(error)}`,
      seed: options.seed ?? null,
      fixtures: [],
      actions: [],
      intended: [],
      checkpoints: [],
      mismatches: [{
        seed: options.seed ?? null,
        actionSequence: [],
        expected: "scenario completes on baseline",
        actual: error?.message || String(error),
        reproduction: reproductionCommand(SCRIPT_REL, scenario.id, { seed: options.seed }),
      }],
    };
  }
  try {
    refactorRun = scenario.run(refactorApi, options);
  } catch (error) {
    if (error instanceof SkipError) {
      return {
        id: scenario.id,
        classId: scenario.classId,
        status: "skip",
        skipReason: error.reason,
        seed: baselineRun.seed,
        fixtures: baselineRun.fixtures,
        actions: baselineRun.actions,
        intended: baselineRun.intended,
        checkpoints: baselineRun.checkpoints.map(publicCheckpoint),
        mismatches: [],
      };
    }
    return {
      id: scenario.id,
      classId: scenario.classId,
      status: "fail",
      error: `refactor: ${error?.stack || error?.message || String(error)}`,
      seed: baselineRun.seed,
      fixtures: baselineRun.fixtures,
      actions: baselineRun.actions,
      intended: baselineRun.intended,
      checkpoints: baselineRun.checkpoints.map(publicCheckpoint),
      mismatches: [{
        seed: baselineRun.seed,
        actionSequence: baselineRun.actions,
        expected: "scenario completes on refactor",
        actual: error?.message || String(error),
        reproduction: reproductionCommand(SCRIPT_REL, scenario.id, { seed: baselineRun.seed }),
      }],
    };
  }

  const mismatches = compareScenarioRuns(scenario, baselineRun, refactorRun, SCRIPT_REL);
  const status = mismatches.length ? "fail" : "pass";
  return {
    id: scenario.id,
    classId: scenario.classId,
    status,
    seed: baselineRun.seed,
    extraSeeds: baselineRun.extraSeeds ?? [],
    fixtures: baselineRun.fixtures,
    actions: baselineRun.actions,
    intended: baselineRun.intended.map((entry) => ({
      name: entry.name,
      met: entry.met,
      detail: entry.detail == null ? null : previewValue(entry.detail, 160),
    })),
    checkpoints: baselineRun.checkpoints.map(publicCheckpoint),
    mismatches,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Workstream B — Differential regression");
  lines.push("");
  lines.push(`Baseline: \`${report.pinned.baseline.resolved}\` (${report.pinned.baseline.subject})`);
  lines.push(`Refactor: \`${report.pinned.refactor.resolved}\` (${report.pinned.refactor.subject})`);
  lines.push("");
  lines.push(`Command: \`${report.verification.command}\``);
  lines.push(`Result: **${report.summary.failed ? "FAIL" : "PASS"}** — ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped / ${report.summary.total} scenarios.`);
  lines.push("");
  lines.push("## Comparison");
  lines.push("");
  lines.push(report.comparison.method);
  lines.push("");
  lines.push(`Shared ActionKinds: ${report.comparison.sharedActionKinds.length}. Baseline-only kinds are not exercised.`);
  lines.push(`Suppressed fields: ${report.comparison.suppressedFields.length ? report.comparison.suppressedFields.join(", ") : "none"}.`);
  lines.push("");
  lines.push("## Scenarios");
  lines.push("");
  lines.push("| ID | Class | Seed | Status | Checkpoints | Notes |");
  lines.push("|---|---|---|---|---|---|");
  for (const scenario of report.scenarios) {
    const note = scenario.skipReason
      || scenario.error
      || (scenario.mismatches?.length ? `${scenario.mismatches.length} mismatch(es)` : "compared");
    lines.push(`| ${scenario.id} | ${scenario.classId} | ${scenario.seed ?? "—"} | ${scenario.status} | ${scenario.checkpoints?.length ?? 0} | ${String(note).replace(/\|/g, "/")} |`);
  }
  lines.push("");
  lines.push("## Mismatches");
  lines.push("");
  const mismatches = report.scenarios.flatMap((scenario) =>
    (scenario.mismatches ?? []).map((mismatch) => ({ scenarioId: scenario.id, ...mismatch }))
  );
  if (!mismatches.length) {
    lines.push("None. Cross-tree serialized states, including RNG streams, matched at every compared checkpoint.");
  } else {
    for (const mismatch of mismatches) {
      lines.push(`- **${mismatch.scenarioId}** seed ${mismatch.seed} checkpoint \`${mismatch.checkpoint ?? "?"}\``);
      lines.push(`  - expected: \`${JSON.stringify(mismatch.expected)}\``);
      lines.push(`  - actual: \`${JSON.stringify(mismatch.actual)}\``);
      lines.push(`  - reproduce: \`${mismatch.reproduction}\``);
    }
  }
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("From `nav-diff-harness`:");
  lines.push("");
  lines.push("```");
  lines.push(report.reproduction.all);
  lines.push("```");
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const item of report.limitations) lines.push(`- ${item}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildLimitations(kinds) {
  return [
    "Each revision is imported from its own worktree via file: URLs so module graphs and mutable module state stay separate.",
    "Only ActionKinds present in both revisions are dispatched. Baseline-only leftover kinds (inventory/build/tag/routing/skill) are listed but not exercised.",
    "Shop, crisis, and legacy nodes that are not yet naturally available are unlocked by writing lifeMap.availableNodeIds, matching existing model tests. That write is a fixture, not a public action.",
    "Affordability and mortality use documented fixtures (prestige, wisdom, structureCapacity, rng.vassalSeed) because no public ActionKind sets those fields.",
    "Live paused snapshots are compared to live paused snapshots; rebuild/forecast snapshots are compared to rebuild/forecast snapshots. Replay unpauses via initializeReplayClock, so live-vs-rebuild full-state equality is not required.",
    `Idle settlement and forecast horizons default to 24 seconds. Node resolution is exercised when resolveSec <= ${MAX_RESOLVE_SEC}.`,
    "No serialized fields are suppressed. Source-level ActionKinds inventory differences are reported under comparison.baselineOnlyActionKinds, not as behavioral mismatches.",
    kinds.baselineOnly.length
      ? `Baseline-only ActionKinds: ${kinds.baselineOnly.join(", ")}.`
      : "No baseline-only ActionKinds.",
    kinds.refactorOnly.length
      ? `Refactor-only ActionKinds: ${kinds.refactorOnly.join(", ")}.`
      : "No refactor-only ActionKinds.",
  ];
}

async function main() {
  const args = parseArgs(process.argv, SCRIPT_DIR);
  if (args.help) {
    process.stdout.write(
      [
        "Usage: node scripts/differential-regression.mjs [options]",
        "  --baseline <dir>   Baseline worktree (default sibling nav-bench-baseline)",
        "  --refactor <dir>   Refactor worktree (default sibling nav-bench-refactor)",
        "  --scenario <id>    Run one scenario (repeatable)",
        "  --seed <n>         Override the primary seed",
        "  --horizon <n>      Forecast/idle horizon seconds (default 24)",
        "  --out <file.json>  Write machine-readable report",
        "  --md <file.md>     Write concise markdown report",
        "",
      ].join("\n")
    );
    return 0;
  }

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const command = [
    "node",
    SCRIPT_REL,
    "--baseline", args.baseline,
    "--refactor", args.refactor,
    ...args.scenarios.flatMap((id) => ["--scenario", id]),
    ...(Number.isFinite(args.seed) ? ["--seed", String(args.seed)] : []),
    "--horizon", String(args.horizonSec),
  ].join(" ");

  const baselineGit = gitRevParse(args.baseline);
  const refactorGit = gitRevParse(args.refactor);
  const pinned = {
    baseline: {
      requested: PINNED.baseline,
      resolved: baselineGit.sha,
      subject: baselineGit.subject,
      root: path.resolve(args.baseline),
      ok: baselineGit.ok && baselineGit.sha === PINNED.baseline,
      error: baselineGit.error ?? null,
    },
    refactor: {
      requested: PINNED.refactor,
      resolved: refactorGit.sha,
      subject: refactorGit.subject,
      root: path.resolve(args.refactor),
      ok: refactorGit.ok && refactorGit.sha === PINNED.refactor,
      error: refactorGit.error ?? null,
    },
  };

  const selected = args.scenarios.length
    ? SCENARIOS.filter((scenario) => args.scenarios.includes(scenario.id))
    : SCENARIOS;
  if (args.scenarios.length && selected.length !== args.scenarios.length) {
    const known = new Set(SCENARIOS.map((scenario) => scenario.id));
    const unknown = args.scenarios.filter((id) => !known.has(id));
    throw new Error(`Unknown scenario id(s): ${unknown.join(", ")}`);
  }

  const baselineApi = await loadRevision(args.baseline, "baseline");
  const refactorApi = await loadRevision(args.refactor, "refactor");
  const kinds = classifyActionKinds(baselineApi.ActionKinds, refactorApi.ActionKinds);

  const scenarioResults = [];
  for (const scenario of selected) {
    const result = runOneScenario(
      scenario,
      baselineApi,
      refactorApi,
      { seed: args.seed, horizonSec: args.horizonSec },
      kinds
    );
    scenarioResults.push(result);
    const mark = result.status === "pass" ? "PASS" : result.status === "skip" ? "SKIP" : "FAIL";
    const extra = result.skipReason || result.error || `${result.mismatches.length} mismatch(es)`;
    process.stdout.write(`[${mark}] ${scenario.id} seed=${result.seed ?? "—"} ${extra}\n`);
  }

  const summary = {
    total: scenarioResults.length,
    passed: scenarioResults.filter((entry) => entry.status === "pass").length,
    failed: scenarioResults.filter((entry) => entry.status === "fail").length,
    skipped: scenarioResults.filter((entry) => entry.status === "skip").length,
    mismatchCount: scenarioResults.reduce((sum, entry) => sum + (entry.mismatches?.length ?? 0), 0),
  };

  const report = {
    workstream: "B",
    generatedAt: new Date().toISOString(),
    pinned,
    comparison: {
      method: "Load baseline and refactor as separate ESM graphs. Intersect public ActionKinds. Run explicit-seed bounded scenarios. Compare complete serializeGameState objects, including rng streams, at named live/rebuild/forecast checkpoints. Key order is ignored; missing or extra fields are mismatches. No fields are dropped.",
      sharedActionKinds: kinds.shared,
      baselineOnlyActionKinds: kinds.baselineOnly,
      refactorOnlyActionKinds: kinds.refactorOnly,
      suppressedFields: [],
    },
    verification: {
      command,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      shaMatch: pinned.baseline.ok && pinned.refactor.ok,
    },
    scenarios: scenarioResults,
    summary,
    limitations: buildLimitations(kinds),
    reproduction: {
      all: `node ${SCRIPT_REL}`,
      failed: scenarioResults
        .filter((entry) => entry.status === "fail")
        .map((entry) => reproductionCommand(SCRIPT_REL, entry.id, { seed: entry.seed })),
    },
  };

  if (args.out) writeJson(path.resolve(args.out), report);
  if (args.md) writeText(path.resolve(args.md), renderMarkdown(report));

  if (!pinned.baseline.ok || !pinned.refactor.ok) {
    process.stderr.write(
      `Pinned SHA mismatch: baseline ${pinned.baseline.resolved} (want ${PINNED.baseline}), refactor ${pinned.refactor.resolved} (want ${PINNED.refactor})\n`
    );
  }
  return summary.failed > 0 ? 1 : 0;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
