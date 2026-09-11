import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../../actions.js";
import { serializeGameState } from "../../state.js";
import {
  getCurrentLifeMapVassal,
  getVassalNodeDecisionPresentation,
} from "../../vassal-life-map.js";
import { stepDetailedSettlementsSecond } from "../../detailed-settlements.js";
import { getDetailedPracticeDef, getDetailedStructureDef } from "../../game-config.js";
import {
  dispatch,
  forceEnter,
  nodeIdForFamily,
  nodeIdForSignature,
  resolvePending,
  selectedState,
  selectedStateForSignature,
} from "./helpers.js";

const shopState = selectedState(102);
const shopVassal = getCurrentLifeMapVassal(shopState);
shopVassal.prestige = 500;
shopVassal.stats.intelligence = 0;
shopVassal.stats.effectiveness = 0;
const shopNode = forceEnter(shopState, nodeIdForFamily(shopState, "practiceReform"));
const entryInventory = serializeGameState(shopState).civilization.vassalLineage
  .vassalsById[shopVassal.vassalId].lifeMap.nodeStates[shopNode.nodeId].inventory;
dispatch(shopState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: shopNode.nodeId, offerId: shopNode.inventory[0].offerId,
});
dispatch(shopState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: shopNode.nodeId, offerId: shopNode.inventory[0].offerId,
});
assert.equal(shopVassal.prestige, 500, "staged purchases ghost Prestige until confirmation");
const stagedPresentation = getVassalNodeDecisionPresentation(shopState, shopNode.nodeId);
assert.equal(stagedPresentation.projectedPrestige,
  500 - shopNode.purchasedOffers.reduce((sum, purchase) => sum + purchase.prestigeCost, 0));
assert.ok(stagedPresentation.purchases.every((purchase) => purchase.presentation?.rule),
  "gamepiece purchases expose their actual rule text before confirmation");
assert.ok(stagedPresentation.settlement.practices.some((slot) => slot?.staged),
  "the decision presentation ghosts staged Practices into authoritative slots");
assert.equal(stagedPresentation.mortalityEstimate.totalPhaseCost,
  shopNode.accumulatedPhaseCost,
  "shop mortality includes all staged elapsed time");
assert.equal(shopNode.inventory.length, 1, "purchases remove offers without replenishment");
assert.equal(applyAction(shopState, {
  kind: ActionKinds.VASSAL_REROLL_SHOP, payload: { nodeId: shopNode.nodeId },
}, { isReplay: true }).reason, "stagedPurchases", "reroll requires an empty draft");
for (const purchase of [...shopNode.purchasedOffers]) {
  dispatch(shopState, ActionKinds.VASSAL_UNDO_SHOP_PURCHASE, {
    nodeId: shopNode.nodeId, offerId: purchase.offerId,
  });
}
assert.equal(shopNode.inventory.length, 3, "undo restores offers to their original inventory");
dispatch(shopState, ActionKinds.VASSAL_REROLL_SHOP, { nodeId: shopNode.nodeId });
assert.equal(shopNode.inventory.length, 3, "the single reroll discards and refills to three");
for (const offerId of shopNode.inventory.map((offer) => offer.offerId)) {
  dispatch(shopState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
    nodeId: shopNode.nodeId, offerId,
  });
}
assert.equal(shopNode.purchasedOffers.length, 3);
assert.notDeepEqual(shopNode.inventory, entryInventory, "rerolled inventory persists as new content");
dispatch(shopState, ActionKinds.VASSAL_REORDER_SHOP_PURCHASE, {
  nodeId: shopNode.nodeId,
  offerId: shopNode.purchasedOffers[2].offerId,
  toIndex: 0,
});
const purchasedOrder = shopNode.purchasedOffers.map((purchase) => purchase.offerId);
const stagedCost = shopNode.purchasedOffers.reduce((sum, purchase) => sum + purchase.prestigeCost, 0);
const rngBeforeShopConfirm = shopState.rng.vassalSeed;
dispatch(shopState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: shopNode.nodeId });
assert.equal(shopVassal.prestige, 500 - 6 - stagedCost,
  "confirm commits reroll and staged purchase Prestige exactly once");
assert.equal(shopNode.mortality, undefined, "shop confirmation does not roll before accumulated time");
resolvePending(shopState);
assert.deepEqual(
  shopVassal.lifeEvents.filter((event) => event.kind === "interventionApplied")
    .map((event) => event.offerId),
  [...purchasedOrder].reverse(),
  "unshift execution maps back to visible staged order"
);
assert.notEqual(shopState.rng.vassalSeed, rngBeforeShopConfirm);
const prestigeAfterShopResolution = shopVassal.prestige;
stepDetailedSettlementsSecond(shopState, shopState.tSec);
assert.equal(shopVassal.prestige, prestigeAfterShopResolution,
  "a completed node cannot grant recurring income twice");
assert.equal(applyAction(shopState, {
  kind: ActionKinds.VASSAL_REROLL_SHOP, payload: { nodeId: shopNode.nodeId },
}, { isReplay: true }).ok, false, "reroll remains unavailable after resolution");

for (const [family, seed] of [["publicWorks", 103], ["routes", 104]]) {
  const state = selectedState(seed);
  const nodeId = nodeIdForFamily(state, family);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.prestige = 500;
  const node = forceEnter(state, nodeId);
  assert.ok(node.inventory.length <= 3);
  assert.ok(node.inventory.every((offer) =>
    offer.intervention.kind === (node.family === "publicWorks" ? "structure" : "connection")
  ));
  if (node.family === "routes") {
    assert.ok(node.inventory.every((offer) => offer.intervention.mode === "add"),
      "ordinary Route shops never offer removal");
  }
  if (node.family === "publicWorks") {
    assert.ok(node.inventory.every((offer) =>
      offer.intervention.targetRegionId === vassal.locationRegionId
    ));
  } else {
    assert.ok(node.inventory.every((offer) =>
      [offer.intervention.regionAId, offer.intervention.regionBId]
        .includes(vassal.locationRegionId)
    ));
    const routePreview = getVassalNodeDecisionPresentation(state, node.nodeId, {
      previewOfferId: node.inventory[0]?.offerId,
    });
    assert.equal(routePreview.contextKind, "regionalMap");
    assert.ok(routePreview.regionalMap.regions.some((region) => region.current));
    if (node.inventory[0]) {
      assert.ok(routePreview.regionalMap.connections.some((connection) =>
        connection.status.startsWith("preview-")));
    }
  }
}

const practiceTierState = selectedState(1602);
const practiceTierVassal = getCurrentLifeMapVassal(practiceTierState);
practiceTierVassal.prestige = 500;
const practiceTierSettlement = practiceTierState.world.sites.find(
  (site) => site.regionId === practiceTierVassal.locationRegionId
).detailedState;
practiceTierSettlement.practiceSlots = [
  { practiceId: "forage", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "cultivate", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "administrate", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "vigil", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "exchange", tier: "bronze", charge: 0, work: 0 },
];
const practiceTierNode = forceEnter(practiceTierState,
  nodeIdForFamily(practiceTierState, "practiceReform"));
assert.equal(new Set(practiceTierNode.inventory.map((offer) => offer.intervention.practiceId)).size,
  practiceTierNode.inventory.length, "practice shop offers have unique identities");
assert.ok(practiceTierNode.inventory.every((offer) =>
  offer.intervention.mode === "learn" || offer.intervention.tier === "bronze"),
"installed practices roll at their matching tier");
const learnOffer = practiceTierNode.inventory.find((offer) => offer.intervention.mode === "learn");
assert.ok(learnOffer, "a shop with uninstalled practices offers a Learn purchase");
dispatch(practiceTierState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: practiceTierNode.nodeId, offerId: learnOffer.offerId,
});
dispatch(practiceTierState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: practiceTierNode.nodeId });
resolvePending(practiceTierState);
assert.equal(practiceTierSettlement.practiceSlots[0].practiceId, learnOffer.intervention.practiceId,
  "learning inserts the practice into the leftmost slot");
assert.equal(practiceTierSettlement.practiceSlots[0].tier, "bronze");
assert.equal(practiceTierSettlement.practiceSlots.length, 5);
assert.equal(practiceTierSettlement.practiceSlots.some((slot) => slot?.practiceId === "exchange"), false,
  "a full board discards its rightmost practice when learning");

let upgradeShop = null;
for (let seed = 1601; seed < 1700 && !upgradeShop; seed += 1) {
  const state = selectedState(seed);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.prestige = 500;
  const settlement = state.world.sites.find((site) => site.regionId === vassal.locationRegionId).detailedState;
  settlement.practiceSlots = [{ practiceId: "forage", tier: "gold", charge: 0, work: 0 }, null, null, null, null];
  const node = forceEnter(state, nodeIdForFamily(state, "practiceReform"));
  const offer = node.inventory.find((entry) => entry.intervention.practiceId === "forage");
  if (offer) upgradeShop = { state, settlement, node, offer };
}
assert.ok(upgradeShop, "a deterministic practice roll can produce the installed practice");
assert.equal(upgradeShop.offer.intervention.tier, "gold");
assert.equal(upgradeShop.offer.intervention.resultingTier, "diamond");
dispatch(upgradeShop.state, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: upgradeShop.node.nodeId, offerId: upgradeShop.offer.offerId,
});
dispatch(upgradeShop.state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: upgradeShop.node.nodeId });
resolvePending(upgradeShop.state);
assert.deepEqual(upgradeShop.settlement.practiceSlots[0],
  { practiceId: "forage", tier: "diamond", charge: 0, work: 0 },
  "matching-tier purchases upgrade and move the practice leftmost");

const diamondShopState = selectedState(1701);
const diamondVassal = getCurrentLifeMapVassal(diamondShopState);
diamondShopState.world.sites.find((site) => site.regionId === diamondVassal.locationRegionId)
  .detailedState.practiceSlots[0] = { practiceId: "forage", tier: "diamond", charge: 0, work: 0 };
const diamondShopNode = forceEnter(diamondShopState,
  nodeIdForFamily(diamondShopState, "practiceReform"));
assert.equal(diamondShopNode.inventory.some((offer) => offer.intervention.practiceId === "forage"), false,
  "Diamond practices are excluded from future shop rolls");

const removalState = selectedStateForSignature("removePractice");
const removalVassal = getCurrentLifeMapVassal(removalState);
removalVassal.prestige = 500;
const removalSite = removalState.world.sites.find((site) =>
  site.regionId === removalVassal.locationRegionId).detailedState;
const removalNode = forceEnter(removalState, nodeIdForSignature(removalState, "removePractice"));
assert.ok(removalNode.inventory.length > 0);
const removedPracticeId = removalNode.inventory[0].intervention.practiceId;
dispatch(removalState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: removalNode.nodeId, offerId: removalNode.inventory[0].offerId,
});
dispatch(removalState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: removalNode.nodeId });
assert.equal(removalSite.practiceSlots.some((slot) => slot?.practiceId === removedPracticeId), false,
  "a staged signature removal is applied on confirmation");

const routeRemovalState = selectedStateForSignature("removeRoute");
const routeRemovalVassal = getCurrentLifeMapVassal(routeRemovalState);
routeRemovalVassal.prestige = 500;
const routeRemovalNode = forceEnter(routeRemovalState,
  nodeIdForSignature(routeRemovalState, "removeRoute"));
assert.ok(routeRemovalNode.inventory.length > 0);
const initialConnectionCount = routeRemovalState.world.connections.length;
dispatch(routeRemovalState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: routeRemovalNode.nodeId, offerId: routeRemovalNode.inventory[0].offerId,
});
dispatch(routeRemovalState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, {
  nodeId: routeRemovalNode.nodeId,
});
assert.equal(routeRemovalState.world.connections.length, initialConnectionCount - 1,
  "Route removal is available only through its signature shop");

const foodShopState = selectedStateForSignature("foodShop");
const foodShopVassal = getCurrentLifeMapVassal(foodShopState);
foodShopVassal.prestige = 500;
const foodShopNode = forceEnter(foodShopState, nodeIdForSignature(foodShopState, "foodShop"));
assert.ok(foodShopNode.inventory.length > 0);
const taggedOfferKinds = new Set(foodShopNode.inventory.map((offer) => offer.intervention.kind));
assert.ok(foodShopNode.inventory.every((offer) => {
  const intervention = offer.intervention;
  const def = intervention.kind === "practice"
    ? getDetailedPracticeDef(foodShopState, intervention.practiceId)
    : getDetailedStructureDef(foodShopState, intervention.structureId);
  return def.tags.includes("Food");
}), "tagged shops contain only gamepieces carrying their advertised tag");
dispatch(foodShopState, ActionKinds.VASSAL_REROLL_SHOP, { nodeId: foodShopNode.nodeId });
foodShopNode.inventory.forEach((offer) => taggedOfferKinds.add(offer.intervention.kind));
assert.deepEqual([...taggedOfferKinds].sort(), ["practice", "structure"],
  "tagged shops mix eligible Practices and Structures across their draft and reroll");

const frontierRouteState = selectedState(104);
const frontierVassal = getCurrentLifeMapVassal(frontierRouteState);
frontierRouteState.world.connections = [];
for (const region of frontierRouteState.world.regions) {
  if (region.id !== frontierVassal.locationRegionId) region.controller = "frontier";
}
const frontierRouteNode = forceEnter(frontierRouteState, nodeIdForFamily(frontierRouteState, "routes"));
assert.ok(frontierRouteNode.inventory.length > 0, "Routes offers adjacent frontier connections");
frontierVassal.prestige = 500;
const frontierOffer = frontierRouteNode.inventory[0];
dispatch(frontierRouteState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,
  { nodeId: frontierRouteNode.nodeId, offerId: frontierOffer.offerId });
dispatch(frontierRouteState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: frontierRouteNode.nodeId });
assert.ok(frontierRouteState.world.connections.some((edge) =>
  edge.regionAId === frontierOffer.intervention.regionAId && edge.regionBId === frontierOffer.intervention.regionBId));
