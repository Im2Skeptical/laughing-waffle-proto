// Malformed payloads for active Vassal Life Map commands through applyAction.
// Rejects must be ok:false, throw-free, and leave the serialized state identical.
// Accepted coercions (finite index floor, omitted shop origin) are controls.
// node scripts/life-action-input-boundaries-test.mjs
import fs from "node:fs";
import path from "node:path";
import { ActionKinds, applyAction } from "../src/model/actions.js";
import { createLabNodeSandbox } from "../src/model/dev-lab/node-sandbox.js";
import { createInitialState } from "../src/model/init.js";
import { deserializeGameState, serializeGameState } from "../src/model/state.js";
import {
  getCurrentLifeMapVassal,
  getVassalCandidatePool,
  getVassalLifeMapNodes,
} from "../src/model/vassal-life-map.js";

const ARTIFACT = path.resolve("artifacts/life-action-input-boundaries/failures.json");
const REPRO = "node scripts/life-action-input-boundaries-test.mjs";
const failures = [];
let rejects = 0;
let accepts = 0;

function preview(value) {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function firstDifference(actual, expected, pathName = "$") {
  if (Object.is(actual, expected)) return null;
  const objects = actual != null && expected != null && typeof actual === "object" && typeof expected === "object";
  if (!objects) return { path: pathName, actual: preview(actual), expected: preview(expected) };
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      return { path: pathName, actual: preview(actual), expected: preview(expected) };
    }
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstDifference(actual[index], expected[index], `${pathName}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  for (const key of [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort()) {
    const next = `${pathName}.${key}`;
    if (!Object.prototype.hasOwnProperty.call(actual, key)) return { path: next, actual: "missing", expected: preview(expected[key]) };
    if (!Object.prototype.hasOwnProperty.call(expected, key)) return { path: next, actual: preview(actual[key]), expected: "missing" };
    const difference = firstDifference(actual[key], expected[key], next);
    if (difference) return difference;
  }
  return null;
}

function freeze(state) {
  state.paused = true;
  return serializeGameState(state);
}

function revive(raw) {
  return deserializeGameState(JSON.parse(JSON.stringify(raw)));
}

function fail(row) {
  failures.push(row);
}

function reject(raw, kind, payload, reason) {
  const before = JSON.parse(JSON.stringify(raw));
  const state = revive(raw);
  let result;
  try {
    result = applyAction(state, { kind, payload });
  } catch (error) {
    fail({ kind, payload, expected: reason, threw: error.message });
    return;
  }
  if (result?.ok !== false) {
    fail({ kind, payload, expected: reason, accepted: result?.reason ?? result });
    return;
  }
  if (result.reason !== reason) {
    fail({ kind, payload, expected: reason, reason: result.reason });
    return;
  }
  const difference = firstDifference(serializeGameState(state), before);
  if (difference) fail({ kind, payload, expected: reason, mutated: difference });
  else rejects += 1;
}

function accept(raw, kind, payload, read) {
  const state = revive(raw);
  let result;
  try {
    result = applyAction(state, { kind, payload });
  } catch (error) {
    fail({ positive: true, kind, payload, threw: error.message });
    return;
  }
  if (result?.ok !== true) {
    fail({ positive: true, kind, payload, reason: result?.reason ?? null });
    return;
  }
  const check = read(state);
  if (check !== true) fail({ positive: true, kind, payload, field: check });
  else accepts += 1;
}

function lab(type) {
  const { state, nodeId } = createLabNodeSandbox({ type, classId: "unclassed", prestige: 100, seed: 4 });
  const vassal = getCurrentLifeMapVassal(state);
  const site = state.world.sites.find((entry) => entry.regionId === vassal.locationRegionId);
  site.detailedState.structureSlots.fill(null);
  return { state, nodeId, vassal };
}

function offer(state, nodeId, kind) {
  const inventory = getCurrentLifeMapVassal(state).lifeMap.nodeStates[nodeId].inventory;
  const found = inventory.find((entry) => entry.intervention?.kind === kind && entry.intervention.mode !== "remove");
  if (!found) throw new Error(`no ${kind} offer on ${nodeId}`);
  return found;
}

const candidateRaw = freeze(createInitialState("devPlaytesting01", 3));
const candidatePool = getVassalCandidatePool(revive(candidateRaw));
const poolHash = candidatePool.expectedPoolHash;
const selectKind = ActionKinds.SETTLEMENT_SELECT_VASSAL;

for (const candidateIndex of [null, "0", undefined]) {
  reject(candidateRaw, selectKind, { candidateIndex, expectedPoolHash: poolHash }, "missingCandidateIndex");
}
reject(candidateRaw, selectKind, { candidateIndex: -1, expectedPoolHash: poolHash }, "invalidCandidate");
reject(candidateRaw, selectKind, { candidateIndex: -0.2, expectedPoolHash: poolHash }, "invalidCandidate");
reject(candidateRaw, selectKind, { candidateIndex: 99, expectedPoolHash: poolHash }, "invalidCandidate");
reject(candidateRaw, selectKind, { candidateIndex: 0, expectedPoolHash: "stale-pool" }, "selectionPoolMismatch");
reject(candidateRaw, selectKind, { candidateIndex: -1, expectedPoolHash: "stale-pool" }, "selectionPoolMismatch");
accept(candidateRaw, selectKind, { candidateIndex: 0, expectedPoolHash: poolHash }, (state) => {
  const id = state.civilization.vassalLineage.currentVassalId;
  return id === "vassal-1" ? true : { currentVassalId: id };
});
accept(candidateRaw, selectKind, { candidateIndex: 0.2, expectedPoolHash: poolHash }, (state) => {
  const id = state.civilization.vassalLineage.currentVassalId;
  return id === "vassal-1" ? true : { currentVassalId: id, note: "floor" };
});

const travel = revive(candidateRaw);
applyAction(travel, { kind: selectKind, payload: { candidateIndex: 0, expectedPoolHash: poolHash } });
const travelVassal = getCurrentLifeMapVassal(travel);
const openNodeId = travelVassal.lifeMap.availableNodeIds[0];
const closedNodeId = getVassalLifeMapNodes(travelVassal).find((node) => node.id !== openNodeId)?.id;
if (!openNodeId || !closedNodeId) throw new Error("travel fixture has no open and closed node");
const travelRaw = freeze(travel);
const enterKind = ActionKinds.VASSAL_ENTER_LIFE_NODE;
for (const nodeId of [null, "", "missing-node", closedNodeId, 0]) {
  reject(travelRaw, enterKind, { nodeId }, "nodeUnavailable");
}
accept(travelRaw, enterKind, { nodeId: openNodeId }, (state) => {
  const current = getCurrentLifeMapVassal(state).lifeMap.currentNodeId;
  return current === openNodeId ? true : { currentNodeId: current };
});

const patronage = lab("patronage");
const optionId = patronage.vassal.lifeMap.nodeStates[patronage.nodeId].options[0]?.id;
if (!optionId) throw new Error("patronage fixture has no option");
const patronageRaw = freeze(patronage.state);
const selectOption = ActionKinds.VASSAL_SELECT_LIFE_OPTION;
const confirmKind = ActionKinds.VASSAL_CONFIRM_LIFE_NODE;
reject(patronageRaw, enterKind, { nodeId: patronage.nodeId }, "nodeAlreadyActive");
for (const badOption of [null, "", "missing-option", 0]) {
  reject(patronageRaw, selectOption, { nodeId: patronage.nodeId, optionId: badOption }, "invalidOption");
}
reject(patronageRaw, selectOption, { nodeId: "missing-node", optionId }, "nodeUnavailable");
reject(patronageRaw, selectOption, { nodeId: closedNodeId, optionId }, "nodeUnavailable");
reject(patronageRaw, confirmKind, { nodeId: patronage.nodeId }, "optionRequired");
reject(patronageRaw, confirmKind, { nodeId: null }, "nodeUnavailable");
reject(patronageRaw, confirmKind, { nodeId: "missing-node" }, "nodeUnavailable");
accept(patronageRaw, selectOption, { nodeId: patronage.nodeId, optionId }, (state) => {
  const selected = getCurrentLifeMapVassal(state).lifeMap.nodeStates[patronage.nodeId].selectedOptionId;
  return selected === optionId ? true : { selectedOptionId: selected };
});
{
  const state = revive(patronageRaw);
  const picked = applyAction(state, { kind: selectOption, payload: { nodeId: patronage.nodeId, optionId } });
  const confirmed = picked?.ok ? applyAction(state, { kind: confirmKind, payload: { nodeId: patronage.nodeId } }) : picked;
  const pending = getCurrentLifeMapVassal(state).lifeMap.pendingResolution;
  if (confirmed?.ok === true && pending?.nodeId === patronage.nodeId && pending.kind === "nodeResolution") accepts += 1;
  else fail({ positive: true, kind: confirmKind, reason: confirmed?.reason ?? null, pending: pending?.kind ?? null });
}

const practice = lab("practiceReform");
const practiceOffer = offer(practice.state, practice.nodeId, "practice");
const practiceRaw = freeze(practice.state);
const purchaseKind = ActionKinds.VASSAL_PURCHASE_SHOP_OFFER;
const purchasePayload = { nodeId: practice.nodeId, offerId: practiceOffer.offerId, replacePracticeId: "forage" };
for (const toIndex of [-1, 1.5, "0", 8]) {
  reject(practiceRaw, purchaseKind, { ...purchasePayload, toIndex }, "invalidPurchaseOrder");
}
reject(practiceRaw, purchaseKind, { ...purchasePayload, replacePracticeId: "not-a-practice", toIndex: 0 }, "invalidReplacement");
reject(practiceRaw, purchaseKind, { nodeId: practice.nodeId, offerId: "missing-offer" }, "offerUnavailable");
reject(practiceRaw, purchaseKind, { nodeId: practice.nodeId, offerId: null }, "offerUnavailable");
reject(practiceRaw, purchaseKind, { nodeId: null, offerId: practiceOffer.offerId }, "shopUnavailable");
reject(practiceRaw, purchaseKind, { nodeId: "missing-node", offerId: practiceOffer.offerId }, "shopUnavailable");
accept(practiceRaw, purchaseKind, { ...purchasePayload, toIndex: 0 }, (state) => {
  const bought = getCurrentLifeMapVassal(state).lifeMap.nodeStates[practice.nodeId].purchasedOffers;
  return bought.length === 1 && bought[0].tableauIndex === 0 ? true : { bought: bought.map((entry) => entry.tableauIndex) };
});

const stagedPractice = revive(practiceRaw);
const stagedBuy = applyAction(stagedPractice, { kind: purchaseKind, payload: { ...purchasePayload, toIndex: 4 } });
if (!stagedBuy?.ok) throw new Error(`practice stage failed: ${stagedBuy?.reason}`);
const stagedPracticeRaw = freeze(stagedPractice);
const reorderKind = ActionKinds.VASSAL_REORDER_SHOP_PURCHASE;
for (const toIndex of [-1, "0", null, 9]) {
  reject(stagedPracticeRaw, reorderKind, { nodeId: practice.nodeId, offerId: practiceOffer.offerId, toIndex }, "invalidPurchaseOrder");
}
reject(stagedPracticeRaw, reorderKind, { nodeId: practice.nodeId, offerId: "practice:not-installed", toIndex: 0 }, "invalidPurchaseOrder");
reject(stagedPracticeRaw, reorderKind, { nodeId: "missing-node", offerId: practiceOffer.offerId, toIndex: 0 }, "shopUnavailable");
accept(stagedPracticeRaw, reorderKind, { nodeId: practice.nodeId, offerId: practiceOffer.offerId, toIndex: 0.2 }, (state) => {
  const bought = getCurrentLifeMapVassal(state).lifeMap.nodeStates[practice.nodeId].purchasedOffers[0];
  return bought?.tableauIndex === 0 ? true : { tableauIndex: bought?.tableauIndex ?? null, note: "floor" };
});

const works = lab("publicWorks");
const structureOffer = offer(works.state, works.nodeId, "structure");
const worksRaw = freeze(works.state);
for (const origin of [-1, 1.5, "0", 99]) {
  reject(worksRaw, purchaseKind, { nodeId: works.nodeId, offerId: structureOffer.offerId, origin }, "outsideConstructionStrip");
}
reject(worksRaw, purchaseKind, { nodeId: works.nodeId, offerId: practiceOffer.offerId, origin: 0 }, "offerUnavailable");
accept(worksRaw, purchaseKind, { nodeId: works.nodeId, offerId: structureOffer.offerId }, (state) => {
  const bought = getCurrentLifeMapVassal(state).lifeMap.nodeStates[works.nodeId].purchasedOffers;
  return bought.length === 1 && Number.isInteger(bought[0].placement?.origin) ? true : { origin: bought[0]?.placement?.origin ?? null };
});

const stagedWorks = revive(worksRaw);
const stagedStructure = applyAction(stagedWorks, {
  kind: purchaseKind, payload: { nodeId: works.nodeId, offerId: structureOffer.offerId, origin: 0 },
});
if (!stagedStructure?.ok) throw new Error(`structure stage failed: ${stagedStructure?.reason}`);
const stagedWorksRaw = freeze(stagedWorks);
const boughtId = getCurrentLifeMapVassal(stagedWorks).lifeMap.nodeStates[works.nodeId].purchasedOffers[0].offerId;
const undoKind = ActionKinds.VASSAL_UNDO_SHOP_PURCHASE;
const moveKind = ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE;
for (const offerId of [null, "missing-purchase", practiceOffer.offerId]) {
  reject(stagedWorksRaw, undoKind, { nodeId: works.nodeId, offerId }, "purchaseUnavailable");
}
reject(stagedWorksRaw, undoKind, { nodeId: "missing-node", offerId: boughtId }, "shopUnavailable");
reject(stagedWorksRaw, reorderKind, { nodeId: works.nodeId, offerId: boughtId, toIndex: 0 }, "invalidPurchaseOrder");
for (const origin of [-1, 1.5, "0", null]) {
  reject(stagedWorksRaw, moveKind, { nodeId: works.nodeId, offerId: boughtId, origin }, "outsideConstructionStrip");
}
reject(stagedWorksRaw, moveKind, { nodeId: works.nodeId, offerId: "structure:missing", origin: 1 }, "placementUnavailable");
reject(stagedWorksRaw, moveKind, { nodeId: works.nodeId, offerId: null, origin: 1 }, "placementLocked");
reject(stagedWorksRaw, moveKind, { nodeId: null, offerId: boughtId, origin: 1 }, "shopUnavailable");
accept(stagedWorksRaw, undoKind, { nodeId: works.nodeId, offerId: boughtId }, (state) => {
  const nodeState = getCurrentLifeMapVassal(state).lifeMap.nodeStates[works.nodeId];
  const restored = nodeState.inventory.some((entry) => entry.offerId === structureOffer.offerId);
  return nodeState.purchasedOffers.length === 0 && restored ? true : { purchased: nodeState.purchasedOffers.length, restored };
});
accept(stagedWorksRaw, moveKind, { nodeId: works.nodeId, offerId: boughtId, origin: 2 }, (state) => {
  const origin = getCurrentLifeMapVassal(state).lifeMap.nodeStates[works.nodeId].purchasedOffers[0]?.placement?.origin;
  return origin === 2 ? true : { origin };
});

const development = revive(patronageRaw);
const developmentVassal = getCurrentLifeMapVassal(development);
developmentVassal.developmentChoiceQueue = [{
  choiceId: "dev-boundary-1",
  offeredStatIds: ["wisdom", "cunning", "effectiveness"],
}];
const wisdomBefore = developmentVassal.stats.wisdom;
const developmentRaw = freeze(development);
const developKind = ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT;
reject(developmentRaw, developKind, { choiceId: "stale-choice", statId: "wisdom" }, "staleDevelopmentChoice");
reject(developmentRaw, developKind, { choiceId: null, statId: "wisdom" }, "staleDevelopmentChoice");
for (const statId of ["strength", null, 1, "wisdom "]) {
  reject(developmentRaw, developKind, { choiceId: "dev-boundary-1", statId }, "invalidStat");
}
accept(developmentRaw, developKind, { choiceId: "dev-boundary-1", statId: "wisdom" }, (state) => {
  const vassal = getCurrentLifeMapVassal(state);
  const value = vassal.stats.wisdom;
  return value === wisdomBefore + 1 && vassal.developmentChoiceQueue.length === 0 ? true : { value, queue: vassal.developmentChoiceQueue.length };
});

const loadout = revive(patronageRaw);
const lineage = loadout.civilization.vassalLineage;
lineage.pendingHeirloomLoadout = true;
loadout.civilization.heirloomVault = Array.from({ length: 6 }, () => null);
loadout.civilization.heirloomVault[0] = { instanceId: "boundary-ring", definitionId: "signetRing", inheritanceState: "sanctified", protectionSpent: false };
loadout.civilization.heirloomVault[1] = { instanceId: "boundary-boots", definitionId: "travellersBoots", inheritanceState: "fragile", protectionSpent: false };
const loadoutRaw = freeze(loadout);
const loadoutKind = ActionKinds.VASSAL_CONFIRM_HEIRLOOM_LOADOUT;
reject(loadoutRaw, loadoutKind, { equippedInstanceIds: ["missing-heirloom"] }, "invalidLoadout");
reject(loadoutRaw, loadoutKind, { equippedInstanceIds: ["boundary-ring", "missing-heirloom"] }, "invalidLoadout");
reject(loadoutRaw, loadoutKind, { equippedInstanceIds: ["a", "b", "c", "d"] }, "tooManyEquippedHeirlooms");
accept(loadoutRaw, loadoutKind, { equippedInstanceIds: ["boundary-ring"] }, (state) => {
  const equipped = getCurrentLifeMapVassal(state).heirlooms.equipped[0];
  const pending = state.civilization.vassalLineage.pendingHeirloomLoadout;
  return equipped?.instanceId === "boundary-ring" && pending === false ? true : { instanceId: equipped?.instanceId ?? null, pending };
});

if (failures.length) {
  fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  fs.writeFileSync(ARTIFACT, JSON.stringify({ command: REPRO, rejects, accepts, failures }, null, 2));
  const first = failures[0];
  throw new Error(`${failures.length} boundary failures; first ${first.kind} ${first.expected ?? first.reason ?? first.threw ?? "field"}; ${ARTIFACT}`);
}
console.log(`life-action-input-boundaries: ${rejects} rejects, ${accepts} accepts`);
