import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../../actions.js";
import { deserializeGameState, serializeGameState } from "../../state.js";
import { VASSAL_HEIRLOOM_DEFS } from "../../../defs/gamepieces/vassal-heirloom-defs.js";
import { VASSAL_LIFE_TUNING } from "../../../defs/gamepieces/vassal-life-map-defs.js";
import {
  confirmHeirloomLoadout,
  formatVassalPhaseDuration,
  getEquippedHeirloomModifiers,
  getOwnedHeirloomDefinitionIds,
  getVassalActionPhaseCost,
  getVassalDevelopmentIncome,
  getVassalHeirloomInventory,
  getVassalNodeResolutionGains,
  getVassalPrestigeIncome,
  getCurrentLifeMapVassal,
  getVassalLifeMapNodes,
  resolveVaultOverflow,
  validateVassalLifeMapState,
} from "../../vassal-life-map.js";
import {
  acquireHeirloom,
  generateRelicOffers,
  resolveHeirloomInheritance,
} from "../../vassal-life-map/heirlooms.js";
import {
  dispatch,
  forceEnter,
  nodeIdForFamily,
  selectedState,
} from "./helpers.js";

function equip(state, definitionId, inheritanceState = "unmarked") {
  const vassal = getCurrentLifeMapVassal(state);
  const lineage = state.civilization.vassalLineage;
  const item = {
    instanceId: `heirloom-${lineage.nextHeirloomInstanceId++}`,
    definitionId,
    inheritanceState,
    protectionSpent: false,
  };
  const empty = vassal.heirlooms.equipped.findIndex((slot) => !slot);
  assert.ok(empty >= 0, "expected an empty equipped slot");
  vassal.heirlooms.equipped[empty] = item;
  return item;
}

function vault(state, definitionId, inheritanceState = "sanctified") {
  const lineage = state.civilization.vassalLineage;
  const item = {
    instanceId: `heirloom-${lineage.nextHeirloomInstanceId++}`,
    definitionId,
    inheritanceState,
    protectionSpent: false,
  };
  const empty = state.civilization.heirloomVault.findIndex((slot) => !slot);
  assert.ok(empty >= 0, "expected an empty vault slot");
  state.civilization.heirloomVault[empty] = item;
  return item;
}

const inventoryState = selectedState(1101);
assert.deepEqual(getVassalHeirloomInventory(getCurrentLifeMapVassal(inventoryState)).equipped, [null, null, null]);
assert.deepEqual(getVassalHeirloomInventory(getCurrentLifeMapVassal(inventoryState)).carry, [null, null, null]);
assert.equal(inventoryState.civilization.heirloomVault.filter(Boolean).length, 0);

const foxState = selectedState(1102);
const foxVassal = getCurrentLifeMapVassal(foxState);
const cunningBefore = foxVassal.stats.cunning;
const prestigeBefore = getVassalPrestigeIncome(foxVassal);
equip(foxState, "foxMask");
assert.equal(getVassalPrestigeIncome(foxVassal), prestigeBefore + 1);
assert.equal(getEquippedHeirloomModifiers(foxVassal).bonusCunning, 1);
assert.equal(getVassalPrestigeIncome(foxVassal) - foxVassal.stats.cunning, prestigeBefore - cunningBefore + 1);

const notebookState = selectedState(1103);
const notebookVassal = getCurrentLifeMapVassal(notebookState);
const baseDev = getVassalDevelopmentIncome(notebookVassal);
equip(notebookState, "tutorsNotebook");
assert.equal(
  getVassalNodeResolutionGains(notebookVassal, "crisis").development,
  baseDev + 3
);
equip(notebookState, "pilgrimsStaff");
assert.equal(
  getVassalNodeResolutionGains(notebookVassal, "travel").development,
  baseDev + 3 + 6
);

const travelState = selectedState(1104);
const travelVassal = getCurrentLifeMapVassal(travelState);
const travelNodeId = nodeIdForFamily(travelState, "travel");
const travelNode = forceEnter(travelState, travelNodeId);
const travelOption = travelNode.options[0];
assert.ok(travelOption, "expected a travel option");
const baseTravelCost = getVassalActionPhaseCost(travelVassal, travelOption.phaseCost, {
  nodeState: travelNode, isTravel: true,
});
equip(travelState, "travellersBoots");
const bootedCost = getVassalActionPhaseCost(travelVassal, travelOption.phaseCost, {
  nodeState: travelNode, isTravel: true,
});
assert.ok(bootedCost < baseTravelCost, "Traveller's Boots reduce travel time");
equip(travelState, "crownOfAges");
const crownedCost = getVassalActionPhaseCost(travelVassal, travelOption.phaseCost, {
  nodeState: travelNode, isTravel: true,
});
assert.ok(crownedCost < bootedCost, "Crown of Ages further reduces action time");

const shopState = selectedState(1105);
const shopVassal = getCurrentLifeMapVassal(shopState);
const reformId = nodeIdForFamily(shopState, "practiceReform");
const reformBefore = forceEnter(shopState, reformId);
const offerCountBefore = reformBefore.inventory.length;
shopVassal.lifeMap.currentNodeId = null;
shopVassal.lifeMap.availableNodeIds = [reformId];
delete shopVassal.lifeMap.nodeStates[reformId];
equip(shopState, "merchantsLens");
const reformAfter = forceEnter(shopState, reformId);
assert.equal(reformAfter.inventory.length, offerCountBefore + 1,
  "Merchant's Lens adds a Practice Reform offer");

const uniqueState = selectedState(1106);
const uniqueVassal = getCurrentLifeMapVassal(uniqueState);
equip(uniqueState, "signetRing");
const owned = getOwnedHeirloomDefinitionIds(uniqueState, uniqueVassal);
assert.equal(owned.has("signetRing"), true);
const offers = generateRelicOffers(uniqueState, uniqueVassal);
assert.equal(offers.some((offer) => offer.definitionId === "signetRing"), false);
assert.equal(new Set(offers.map((offer) => offer.definitionId)).size, offers.filter((o) => o.definitionId).length);

const acquireState = selectedState(1107);
const acquireVassal = getCurrentLifeMapVassal(acquireState);
const first = acquireHeirloom(acquireState, acquireVassal, "abacus", { destination: "equip" });
assert.equal(first.ok, true);
assert.equal(acquireVassal.heirlooms.equipped[0].definitionId, "abacus");
assert.equal(acquireVassal.heirlooms.equipped[0].inheritanceState, "sanctified");
acquireHeirloom(acquireState, acquireVassal, "foxMask", { destination: "equip" });
acquireHeirloom(acquireState, acquireVassal, "minorSeal", { destination: "equip" });
const displaced = acquireHeirloom(acquireState, acquireVassal, "hourglass", {
  destination: "equip", replaceEquippedIndex: 1,
});
assert.equal(displaced.ok, true);
assert.equal(acquireVassal.heirlooms.equipped[1].definitionId, "hourglass");
assert.equal(acquireVassal.heirlooms.carry[0].definitionId, "foxMask");
const declined = acquireHeirloom(acquireState, acquireVassal, "signetRing", { destination: "decline" });
assert.equal(declined.declined, true);
assert.equal(acquireVassal.heirlooms.equipped.some((item) => item?.definitionId === "signetRing"), false);
const duplicate = acquireHeirloom(acquireState, acquireVassal, "abacus", { destination: "carry" });
assert.equal(duplicate.ok, false);
assert.equal(duplicate.reason, "duplicateHeirloom");

const inheritState = selectedState(1108);
const inheritVassal = getCurrentLifeMapVassal(inheritState);
equip(inheritState, "signetRing", "sanctified");
equip(inheritState, "courtiersBrooch", "unmarked");
equip(inheritState, "royalWarrant", "fragile");
const originalFloat = inheritState.rngNextVassalFloat.bind(inheritState);
let fragileRoll = 0.1;
inheritState.rngNextVassalFloat = () => {
  const roll = fragileRoll;
  inheritState.rngNextVassalFloat = originalFloat;
  return roll;
};
const brokeReport = resolveHeirloomInheritance(inheritState, inheritVassal);
assert.equal(brokeReport.entries.find((entry) => entry.definitionId === "signetRing").toState, "sanctified");
assert.equal(brokeReport.entries.find((entry) => entry.definitionId === "courtiersBrooch").toState, "fragile");
assert.equal(brokeReport.entries.find((entry) => entry.definitionId === "royalWarrant").outcome, "broke");
assert.equal(
  inheritState.civilization.heirloomVault.filter(Boolean).map((item) => item.definitionId).sort().join(","),
  "courtiersBrooch,signetRing"
);

const surviveState = selectedState(1109);
const surviveVassal = getCurrentLifeMapVassal(surviveState);
equip(surviveState, "royalWarrant", "fragile");
const surviveOriginal = surviveState.rngNextVassalFloat.bind(surviveState);
surviveState.rngNextVassalFloat = () => {
  surviveState.rngNextVassalFloat = surviveOriginal;
  return 0.9;
};
const survivedReport = resolveHeirloomInheritance(surviveState, surviveVassal);
assert.equal(survivedReport.entries[0].outcome, "survived");
assert.equal(survivedReport.entries[0].toState, "fragile");
assert.equal(surviveState.civilization.heirloomVault[0].definitionId, "royalWarrant");

const overflowState = selectedState(1110);
const overflowVassal = getCurrentLifeMapVassal(overflowState);
const overflowIds = [
  "signetRing", "travellersBoots", "tutorsNotebook", "minorSeal", "foxMask", "abacus",
];
overflowIds.forEach((id) => vault(overflowState, id, "sanctified"));
equip(overflowState, "courtiersBrooch", "sanctified");
const overflowReport = resolveHeirloomInheritance(overflowState, overflowVassal);
assert.equal(overflowReport.overflowRequired, true);
assert.equal((overflowState.civilization.vassalLineage.pendingVaultOverflow ?? []).length, 7);
const keep = overflowState.civilization.vassalLineage.pendingVaultOverflow
  .slice(0, 6).map((item) => item.instanceId);
const overflowResult = resolveVaultOverflow(overflowState, keep);
assert.equal(overflowResult.ok, true);
assert.equal(overflowState.civilization.heirloomVault.filter(Boolean).length, 6);
assert.equal(overflowState.civilization.vassalLineage.pendingVaultOverflow, null);

const loadoutState = selectedState(1111);
const ring = vault(loadoutState, "signetRing", "sanctified");
const boots = vault(loadoutState, "travellersBoots", "fragile");
loadoutState.civilization.vassalLineage.pendingHeirloomLoadout = true;
const loadout = confirmHeirloomLoadout(loadoutState, [ring.instanceId, boots.instanceId]);
assert.equal(loadout.ok, true);
const loaded = getCurrentLifeMapVassal(loadoutState);
assert.equal(loaded.heirlooms.equipped[0].definitionId, "signetRing");
assert.equal(loaded.heirlooms.equipped[0].inheritanceState, "unmarked");
assert.equal(loaded.heirlooms.equipped[1].inheritanceState, "fragile");
assert.equal(loaded.heirlooms.carry.every((slot) => slot == null), true);
assert.equal(loadoutState.civilization.vassalLineage.pendingHeirloomLoadout, false);

const mandateState = selectedState(1112);
const mandateVassal = getCurrentLifeMapVassal(mandateState);
equip(mandateState, "mandateOfHeaven", "fragile");
mandateVassal.initialAge = 85;
const patronageId = nodeIdForFamily(mandateState, "patronage");
const patronageNode = forceEnter(mandateState, patronageId);
patronageNode.options[0].phaseCost = 0;
dispatch(mandateState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: patronageId, optionId: patronageNode.options[0].id,
});
mandateState.rngNextVassalFloat = () => 0;
const mandateResult = applyAction(mandateState, {
  kind: ActionKinds.VASSAL_CONFIRM_LIFE_NODE, payload: { nodeId: patronageId },
}, { isReplay: true });
assert.equal(mandateResult.ok, true);
assert.equal(getCurrentLifeMapVassal(mandateState)?.vassalId, mandateVassal.vassalId,
  "Mandate of Heaven prevents an otherwise fatal natural-mortality roll");
assert.equal(getVassalHeirloomInventory(mandateVassal).equipped[0].protectionSpent, true);

let relicFound = null;
for (let seed = 1200; seed < 1400 && !relicFound; seed += 1) {
  const state = selectedState(seed);
  const node = getVassalLifeMapNodes(getCurrentLifeMapVassal(state))
    .find((entry) => entry.family === "relic");
  if (node) relicFound = { state, nodeId: node.id };
}
assert.ok(relicFound, "a generated Life Map includes a Relic node");
const relicNode = forceEnter(relicFound.state, relicFound.nodeId);
assert.ok(relicNode.options.length >= 1);
assert.equal(formatVassalPhaseDuration(VASSAL_LIFE_TUNING.relicChoicePhaseCost), "5 years");
assert.ok(relicNode.options.every((option) => option.phaseCost === VASSAL_LIFE_TUNING.relicChoicePhaseCost));
const chosen = relicNode.options.find((option) => option.definitionId) ?? relicNode.options[0];
const expectedRelicPhaseCost = getVassalActionPhaseCost(
  getCurrentLifeMapVassal(relicFound.state), chosen.phaseCost, { nodeState: relicNode },
);
dispatch(relicFound.state, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: relicFound.nodeId, optionId: chosen.id,
});
if (chosen.definitionId) {
  dispatch(relicFound.state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, {
    nodeId: relicFound.nodeId, acquire: { destination: "equip" },
  });
  const relicVassal = getCurrentLifeMapVassal(relicFound.state);
  assert.equal(relicVassal.lifeMap.pendingResolution?.phaseCost, expectedRelicPhaseCost);
  assert.ok(expectedRelicPhaseCost > 0, "confirming a Relic choice spends time");
  assert.equal(relicVassal.heirlooms.equipped.some((item) => item?.definitionId === chosen.definitionId), true);
  assert.equal(VASSAL_HEIRLOOM_DEFS[chosen.definitionId].quality, chosen.quality);
}

const emptyRelicState = selectedState(1114);
emptyRelicState.civilization.vassalLineage.pendingVaultOverflow = Object.keys(VASSAL_HEIRLOOM_DEFS)
  .map((definitionId, index) => ({
    instanceId: `owned-${index}`,
    definitionId,
    inheritanceState: "sanctified",
    protectionSpent: false,
  }));
const emptyOffers = generateRelicOffers(emptyRelicState, getCurrentLifeMapVassal(emptyRelicState));
assert.equal(emptyOffers.length, 1);
assert.equal(emptyOffers[0].emptyRelic, true);
assert.equal(emptyOffers[0].phaseCost, VASSAL_LIFE_TUNING.relicChoicePhaseCost);

const crownState = selectedState(1115);
const crownNodeId = nodeIdForFamily(crownState, "relic");
const crownNode = forceEnter(crownState, crownNodeId);
const crownOption = crownNode.options[0];
crownOption.definitionId = "crownOfAges";
crownOption.label = "Crown of Ages";
const crownExpected = getVassalActionPhaseCost(
  getCurrentLifeMapVassal(crownState), crownOption.phaseCost, { nodeState: crownNode },
);
dispatch(crownState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: crownNodeId, optionId: crownOption.id,
});
dispatch(crownState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, {
  nodeId: crownNodeId, acquire: { destination: "equip" },
});
const crowned = getCurrentLifeMapVassal(crownState);
assert.equal(crowned.heirlooms.equipped.some((item) => item?.definitionId === "crownOfAges"), true);
assert.equal(crowned.lifeMap.pendingResolution?.phaseCost, crownExpected,
  "the Heirloom found by a Relic choice does not discount that choice");

const roundTripState = selectedState(1113);
equip(roundTripState, "scholarsCodex", "fragile");
assert.equal(validateVassalLifeMapState(roundTripState).ok, true);
assert.deepEqual(
  deserializeGameState(serializeGameState(roundTripState)).civilization.heirloomVault,
  roundTripState.civilization.heirloomVault
);
assert.deepEqual(
  deserializeGameState(serializeGameState(roundTripState)).civilization.vassalLineage
    .vassalsById[getCurrentLifeMapVassal(roundTripState).vassalId].heirlooms,
  getCurrentLifeMapVassal(roundTripState).heirlooms
);

const blockedSelect = selectedState(1114);
blockedSelect.civilization.vassalLineage.currentVassalId = null;
blockedSelect.civilization.vassalLineage.pendingVaultOverflow = [{
  instanceId: "heirloom-blocked", definitionId: "signetRing",
  inheritanceState: "sanctified", protectionSpent: false,
}];
const blocked = applyAction(blockedSelect, {
  kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
  payload: { candidateIndex: 0 },
}, { isReplay: true });
assert.equal(blocked.ok, false);
assert.equal(blocked.reason, "heirloomOverflowPending");
