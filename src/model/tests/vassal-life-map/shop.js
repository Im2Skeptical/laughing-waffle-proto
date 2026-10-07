import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../../actions.js";
import { deserializeGameState, serializeGameState } from "../../state.js";
import { getResearchProgression } from '../../research-progression.js';
import {
  getCurrentLifeMapVassal,
  getVassalNodeDecisionPresentation,
} from "../../vassal-life-map.js";
import { getHousingCapacity, stepDetailedSettlementsSecond } from "../../detailed-settlements.js";
import { getDetailedPracticeDef, getDetailedStructureDef } from "../../game-config.js";
import { detailedSettlementPracticeDefs, settlementStructureDefs } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { VASSAL_SIGNATURE_NODE_VARIANTS } from "../../../defs/gamepieces/vassal-life-map-defs.js";
import { appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond } from "../../timeline/index.js";
import { advanceReplayStateToSecond, initializeReplayClock } from "../../replay-second-runner.js";
import {
  dispatch,
  forceEnter,
  nodeIdForFamily,
  nodeIdForSignature,
  resolvePending,
  selectedState,
  selectedStateForSignature,
} from "./helpers.js";

function offerDefinition(state, offer) {
  const action = offer.intervention;
  return action.kind === "practice"
    ? getDetailedPracticeDef(state, action.practiceId)
    : getDetailedStructureDef(state, action.structureId);
}

for (const classId of [null, "scholar", "warrior"]) {
  for (const research of [0, 100000]) {
    for (const [family, tag] of [["foodShop", "Food"], ["housingShop", "Housing"]]) {
      const state = selectedState(102);
      const vassal = getCurrentLifeMapVassal(state);
      vassal.classId = classId;
      vassal.prestige = 500;
      state.civilization.research.total = research;
      const nodeId = nodeIdForFamily(state, family);
      vassal.lifeMap.availableNodeIds = [nodeId];
      const timeline = createTimelineFromInitialState(state);
      const act = (kind, payload) => {
        assert.equal(appendActionAtCursor(timeline, { kind, payload, tSec: state.tSec }, state).ok, true);
        dispatch(state, kind, payload);
      };
      act(ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId });
      const shop = vassal.lifeMap.nodeStates[nodeId];
      const checkInventory = () => {
        assert.equal(shop.contentMode, "shop");
        assert.equal(shop.signatureNode, null, "ordinary supply shops do not require signatures");
        assert.equal(shop.inventory.length, 3, `${classId}/${family}: three tagged offers`);
        assert.ok(shop.inventory.every(offer => {
          const def = offerDefinition(state, offer);
          return def.tags.includes(tag) && ["common", classId].includes(def.pool);
        }), `${classId}/${family}: only eligible cards with the advertised tag`);
        assert.equal(new Set(shop.inventory.map(offer =>
          `${offer.intervention.kind}:${offerDefinition(state, offer).id}`)).size, 3);
        assert.equal(getVassalNodeDecisionPresentation(state, nodeId).contextKind, "settlement");
        if (research === 100000 && classId) {
          const eligibleClassCount = [...Object.values(detailedSettlementPracticeDefs), ...Object.values(settlementStructureDefs)]
            .filter(def => def.pool === classId && def.tags.includes(tag)).length;
          assert.equal(shop.inventory.filter(offer => offerDefinition(state, offer).pool === classId).length,
            Math.min(2, eligibleClassCount), "tagged shops retain the available class/Common mix");
        }
      };
      checkInventory();
      const restored = deserializeGameState(serializeGameState(state));
      act(ActionKinds.VASSAL_REROLL_SHOP, { nodeId });
      dispatch(restored, ActionKinds.VASSAL_REROLL_SHOP, { nodeId });
      checkInventory();
      assert.deepEqual(serializeGameState(restored), serializeGameState(state),
        "ordinary tagged shops reroll identically after reload");
      // Both node types use the ordinary draft/checkout and authoritative replay.
      const offer = shop.inventory[0];
      act(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: offer.offerId });
      act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
      const resolveSec = vassal.lifeMap.pendingResolution.resolveSec;
      initializeReplayClock(state, state.tSec);
      assert.equal(advanceReplayStateToSecond(state, resolveSec).ok, true);
      const replay = rebuildStateAtSecond(timeline, state.tSec);
      assert.equal(replay.ok, true);
      assert.deepEqual(serializeGameState(replay.state).civilization, serializeGameState(state).civilization);
      assert.deepEqual(replay.state.rng, state.rng);
      const local = state.world.sites.find(site => site.regionId === vassal.locationRegionId).detailedState;
      const action = offer.intervention;
      assert.ok(action.kind === "practice"
        ? local.practiceSlots.some(slot => slot?.practiceId === action.practiceId)
        : local.structureSlots.some(slot => slot?.structureId === action.structureId),
      "confirmed supply purchases are installed at the Vassal's settlement");
    }
  }
}

for (const classId of [null, "scholar", "warrior"]) {
  for (const research of [0, 100000]) {
    for (const family of ["practiceReform", "publicWorks", "neutralMarket", "classMarket"]) {
      if (!classId && family === "classMarket") continue;
      for (const seed of [102, 409, 1602]) {
        const state = selectedState(seed);
        const vassal = getCurrentLifeMapVassal(state);
        vassal.classId = classId;
        vassal.prestige = 500;
        state.civilization.research.total = research;
        const nodeId = nodeIdForFamily(state, family);
        vassal.lifeMap.availableNodeIds = [nodeId];
        const timeline = createTimelineFromInitialState(state);
        const act = (kind, payload) => {
          assert.equal(appendActionAtCursor(timeline, { kind, payload, tSec: state.tSec }, state).ok, true);
          dispatch(state, kind, payload);
        };
        act(ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId });
        const shop = vassal.lifeMap.nodeStates[nodeId];
        const checkInventory = () => {
          const pools = shop.inventory.map(offer => offerDefinition(state, offer).pool);
          const commonCount = !classId || family === "neutralMarket" ? 3 : family === "classMarket" ? 0 : 1;
          assert.equal(pools.length, 3, `${classId}/${family}: three offers`);
          assert.equal(pools.filter(pool => pool === "common").length, commonCount,
            `${classId}/${family}: advertised neutral count`);
          assert.ok(pools.every(pool => pool === "common" || pool === classId));
          if (["practiceReform", "publicWorks"].includes(family)) {
            assert.ok(shop.inventory.every(offer => offer.intervention.kind ===
              (family === "practiceReform" ? "practice" : "structure")));
          }
          const identities = shop.inventory.map(offer => `${offer.intervention.kind}:${offerDefinition(state, offer).id}`);
          assert.equal(new Set(identities).size, 3, "no duplicate cards in an inventory");
          assert.equal(getVassalNodeDecisionPresentation(state, nodeId).contextKind, "settlement");
        };
        checkInventory();
        const restored = deserializeGameState(serializeGameState(state));
        act(ActionKinds.VASSAL_REROLL_SHOP, { nodeId });
        dispatch(restored, ActionKinds.VASSAL_REROLL_SHOP, { nodeId });
        checkInventory();
        assert.deepEqual(serializeGameState(restored), serializeGameState(state),
          "saved shops reroll identically after reload");
        const replay = rebuildStateAtSecond(timeline, state.tSec);
        assert.equal(replay.ok, true);
        assert.deepEqual(serializeGameState(replay.state).civilization, serializeGameState(state).civilization,
          "entry and reroll match authoritative replay");
        assert.deepEqual(replay.state.rng, state.rng);
        if (seed === 102 && research === 0 && ["neutralMarket", "classMarket"].includes(family)) {
          // Both card kinds use the usual draft, checkout, and replay paths.
          for (const kind of ["practice", "structure"]) {
            const def = shop.inventory.find(offer => offer.intervention.kind === kind);
            if (!def) continue;
            act(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: def.offerId });
          }
          act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
          const resolveSec = vassal.lifeMap.pendingResolution.resolveSec;
          initializeReplayClock(state, state.tSec);
          assert.equal(advanceReplayStateToSecond(state, resolveSec).ok, true);
          const purchasedReplay = rebuildStateAtSecond(timeline, state.tSec);
          assert.equal(purchasedReplay.ok, true);
          assert.deepEqual(serializeGameState(purchasedReplay.state).civilization, serializeGameState(state).civilization);
          assert.deepEqual(purchasedReplay.state.rng, state.rng);
        }
      }
    }
  }
}

for (const classId of ["scholar", "warrior"]) {
  for (const variantId of ["foodShop", "knowledgeShop", "housingShop"]) {
    const state = selectedState(102);
    const vassal = getCurrentLifeMapVassal(state);
    vassal.classId = classId;
    state.civilization.research.total = 100000;
    const node = vassal.lifeMap.graph.nodes.find(entry => entry.family === "signature");
    node.signatureNode = { ...VASSAL_SIGNATURE_NODE_VARIANTS[variantId], variantId };
    const shop = forceEnter(state, node.id);
    assert.equal(shop.inventory.length, 3);
    const eligibleClassCount = [...Object.values(detailedSettlementPracticeDefs), ...Object.values(settlementStructureDefs)]
      .filter(def => def.pool === classId && def.tags.includes(node.signatureNode.tag)).length;
    const classCount = Math.min(2, eligibleClassCount);
    assert.equal(shop.inventory.filter(offer => offerDefinition(state, offer).pool === classId).length, classCount,
      `${classId}/${variantId}: class quota uses the available tagged pool`);
    assert.equal(shop.inventory.filter(offer => offerDefinition(state, offer).pool === "common").length, 3 - classCount);
    assert.ok(shop.inventory.every(offer => offerDefinition(state, offer).tags.includes(node.signatureNode.tag)));
  }
}

const extraState = selectedState(102);
const extraVassal = getCurrentLifeMapVassal(extraState);
extraVassal.classId = "scholar";
extraVassal.heirlooms.equipped[0] = {
  instanceId: "extra-offer", definitionId: "merchantsLens", inheritanceState: "unmarked", protectionSpent: false,
};
const extraShop = forceEnter(extraState, nodeIdForFamily(extraState, "practiceReform"));
assert.equal(extraShop.inventory.length, 4, "Merchant's Lens keeps its additional offer");
assert.equal(extraShop.inventory.filter(offer => offerDefinition(extraState, offer).pool === "common").length, 1);

// Exhausted eligible class pools use legal neutral cards without duplicating or
// offering another class, and fully upgraded Practices remain excluded.
const thinState = selectedState(102);
const thinVassal = getCurrentLifeMapVassal(thinState);
thinVassal.classId = "scholar";
for (const def of Object.values(thinState.gameConfig.gamepieces.practices)) {
  if (def.pool === "scholar") def.minimumQuality = "diamond";
}
const thinShop = forceEnter(thinState, nodeIdForFamily(thinState, "practiceReform"));
assert.equal(thinShop.inventory.length, 3);
assert.ok(thinShop.inventory.every(offer => offerDefinition(thinState, offer).pool === "common"));

function addsHousing(def) {
  return def.housing > 0 || (def.effects ?? []).some(effect =>
    effect.op === "addHousingForPhase" && effect.amount > 0);
}

// The library reads exactly the quality probabilities consumed by the shop,
// without advancing a random stream or modifying a save.
for (const [research, expected] of [
  [0, [1, 0, 0, 0]], [99, [1, 0, 0, 0]], [100, [.9, .1, 0, 0]],
  [200, [.7, .3, 0, 0]], [300, [.5, .5, 0, 0]], [499, [.5, .5, 0, 0]],
  [500, [1 / 3, 1 / 3, 1 / 3, 0]], [1999, [1 / 3, 1 / 3, 1 / 3, 0]],
  [2000, [.25, .25, .25, .25]],
]) {
  const state = { civilization: { research: { total: research } } };
  const before = JSON.stringify(state);
  const progression = getResearchProgression(state);
  progression.tiers.forEach((tier, index) => assert.ok(Math.abs(tier.chance - expected[index]) < 1e-10,
    `${research} Research: ${tier.id} matches the shop quality distribution`));
  assert.equal(JSON.stringify(state), before, 'reading research probabilities leaves state untouched');
}
{
  const state = { civilization: { research: { total: 30 } }, gameConfig: { settings: { values: {
    researchSilverThreshold: 20, researchSilverFullThreshold: 40,
    researchGoldThreshold: 60, researchDiamondThreshold: 80,
  } } } };
  const progression = getResearchProgression(state);
  assert.ok(Math.abs(progression.tiers[1].chance - .3) < 1e-10, 'custom run settings control odds');
  assert.equal(progression.nextMilestone.research, 40, 'Silver full rate is the next progression milestone');
  assert.deepEqual(progression.tiers.map(tier => tier.threshold), [0, 20, 60, 80]);
  state.gameConfig.settings.values.researchGoldThreshold = 35;
  state.civilization.research.total = 36;
  assert.equal(getResearchProgression(state).nextMilestone.research, 80,
    'a Gold unlock supersedes the Silver-only rate milestone');
  state.gameConfig.settings.values.researchGoldThreshold = 60;
  state.gameConfig.settings.values.researchSilverFullThreshold = 20;
  state.civilization.research.total = 20;
  assert.equal(getResearchProgression(state).nextMilestone.research, 21,
    'coincident Silver settings preserve the shop interpolation boundary');
}

for (const def of [...Object.values(detailedSettlementPracticeDefs), ...Object.values(settlementStructureDefs)]) {
  assert.equal(def.tags.includes("Housing"), addsHousing(def),
    `${def.label}: Housing identifies cards that directly increase housing capacity`);
}

for (const classId of [null, "scholar", "warrior"]) {
  for (const research of [0, 100000]) {
    const state = selectedState(102);
    const vassal = getCurrentLifeMapVassal(state);
    vassal.classId = classId;
    vassal.prestige = 500;
    vassal.initialAge = 20;
    state.civilization.research.total = research;
    const node = vassal.lifeMap.graph.nodes.find(entry => entry.family === "signature");
    const nodeId = node.id;
    node.signatureNode = { ...VASSAL_SIGNATURE_NODE_VARIANTS.housingShop, variantId: "housingShop" };
    vassal.lifeMap.availableNodeIds = [nodeId];
    const timeline = createTimelineFromInitialState(state);
    const act = (kind, payload) => {
      const result = appendActionAtCursor(timeline, { kind, payload, tSec: state.tSec }, state);
      assert.equal(result.ok, true, result.reason);
      dispatch(state, kind, payload);
    };
    act(ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId });
    const shop = vassal.lifeMap.nodeStates[nodeId];
    assert.ok(shop.inventory.length > 0, "Housing Shop has eligible offers at every maturity");
    for (const offer of shop.inventory) {
      const action = offer.intervention;
      const def = action.kind === "practice"
        ? getDetailedPracticeDef(state, action.practiceId)
        : getDetailedStructureDef(state, action.structureId);
      assert.ok(addsHousing(def), `${offer.label} must increase housing capacity`);
      assert.ok(["common", classId].includes(def.pool), "shop respects class access");
    }
    const offer = shop.inventory.find(entry => entry.intervention.kind === "structure");
    assert.ok(offer, "Housing Shop offers a dwelling");
    const capacityBefore = getHousingCapacity(state, vassal.locationRegionId);
    act(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: offer.offerId });
    act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
    resolvePending(state);
    assert.equal(getHousingCapacity(state, vassal.locationRegionId), capacityBefore,
      "a commissioned dwelling adds Housing only after its paid construction cycles");
    const replay = rebuildStateAtSecond(timeline, state.tSec);
    assert.equal(replay.ok, true);
    assert.deepEqual(serializeGameState(replay.state).civilization, serializeGameState(state).civilization,
      "Housing Shop purchase matches authoritative replay");
    assert.deepEqual(replay.state.rng, state.rng);
  }
}

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

let stoneHouseShop = null;
for (let seed = 0; seed < 1000 && !stoneHouseShop; seed += 1) {
  const state = selectedState(seed);
  state.civilization.research.total = state.gameConfig.settings.values.researchSilverThreshold;
  const vassal = getCurrentLifeMapVassal(state);
  vassal.prestige = 500;
  const settlement = state.world.sites.find(
    (site) => site.regionId === vassal.locationRegionId
  ).detailedState;
  state.gameConfig.gamepieces.structures.stoneHouse.localCurrencyCost=3;
  settlement.practiceSlots[1]={practiceId:"barter",tier:"bronze",stock:2};
  const origin = settlement.structureSlots.findIndex((slot, index) =>
    index >= 2 && slot == null);
  if (origin < 0) continue;
  settlement.structureSlots[origin] = {
    structureId: "stoneHouse", width: 1, origin, placementId: `existing:${origin}`,
  };
  const node = forceEnter(state, nodeIdForFamily(state, "publicWorks"));
  const offer = node.inventory.find((entry) => entry.intervention.structureId === "stoneHouse");
  if (offer) stoneHouseShop = { state, vassal, settlement, node, offer };
}
assert.ok(stoneHouseShop, "a deterministic Public Works roll offers a Stone House");
assert.equal(stoneHouseShop.offer.intervention.mode, "add",
  "an installed structure never turns a duplicate offer into an upgrade");
assert.equal(stoneHouseShop.offer.intervention.tier, "silver",
  "structure tier is the definition's research unlock tier");
assert.equal(stoneHouseShop.offer.baseCurrencyCost, 3);
assert.equal(applyAction(stoneHouseShop.state, {
  kind: ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,
  payload: { nodeId: stoneHouseShop.node.nodeId, offerId: stoneHouseShop.offer.offerId },
}, { isReplay: true }).reason, "insufficientCurrency");
stoneHouseShop.settlement.practiceSlots[1].stock = 3;
dispatch(stoneHouseShop.state, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: stoneHouseShop.node.nodeId, offerId: stoneHouseShop.offer.offerId,
});
const stoneHousePreview = getVassalNodeDecisionPresentation(
  stoneHouseShop.state, stoneHouseShop.node.nodeId
);
assert.equal(stoneHousePreview.stagedCurrencyCost, 3);
assert.equal(stoneHousePreview.settlement.currentCurrency, 3);
assert.equal(stoneHousePreview.settlement.currency, 0,
  "staging reserves local Gold in the settlement projection");
dispatch(stoneHouseShop.state, ActionKinds.VASSAL_UNDO_SHOP_PURCHASE, {
  nodeId: stoneHouseShop.node.nodeId, offerId: stoneHouseShop.offer.offerId,
});
const undoneStoneHousePreview = getVassalNodeDecisionPresentation(
  stoneHouseShop.state, stoneHouseShop.node.nodeId
);
assert.equal(undoneStoneHousePreview.stagedCurrencyCost, 0);
assert.equal(undoneStoneHousePreview.settlement.currency, 3,
  "undo releases reserved local Gold without mutating the settlement");
dispatch(stoneHouseShop.state, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: stoneHouseShop.node.nodeId, offerId: stoneHouseShop.offer.offerId,
});
dispatch(stoneHouseShop.state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, {
  nodeId: stoneHouseShop.node.nodeId,
});
assert.equal(stoneHouseShop.settlement.practiceSlots[1].stock, 0,
  "confirmation deducts the reserved local Gold exactly once");
assert.equal(stoneHouseShop.settlement.structureSlots.filter(
  (slot) => slot?.structureId === "stoneHouse"
).length, 2, "confirming a duplicate builds a second Stone House");
assert.ok(stoneHouseShop.settlement.structureSlots.filter(
  (slot) => slot?.structureId === "stoneHouse"
).every((slot) => slot.tier == null), "structure placements do not serialize quality tiers");

// Upgrading the paying host creates a new slot but must not restore spent Currency.
const payingUpgrade=selectedState(808),payingVassal=getCurrentLifeMapVassal(payingUpgrade);
payingVassal.prestige=100;
const payingSite=payingUpgrade.world.sites.find(s=>s.regionId===payingVassal.locationRegionId).detailedState;
payingSite.practiceSlots[0]={practiceId:'barter',tier:'bronze',stock:3};
const payingNode=forceEnter(payingUpgrade,nodeIdForFamily(payingUpgrade,'practiceReform'));
payingNode.inventory=[{offerId:'paid-upgrade',basePrestigeCost:1,baseCurrencyCost:3,basePhaseCost:1,intervention:{kind:'practice',mode:'upgrade',practiceId:'barter',tier:'bronze',resultingTier:'silver',targetRegionId:payingVassal.locationRegionId}}];
dispatch(payingUpgrade,ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:payingNode.nodeId,offerId:'paid-upgrade'});
dispatch(payingUpgrade,ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:payingNode.nodeId});
assert.equal(payingSite.practiceSlots.find(p=>p?.practiceId==='barter').stock,0);

const practiceTierState = selectedState(1602);
const practiceTierVassal = getCurrentLifeMapVassal(practiceTierState);
practiceTierVassal.prestige = 500;
const practiceTierSettlement = practiceTierState.world.sites.find(
  (site) => site.regionId === practiceTierVassal.locationRegionId
).detailedState;
practiceTierSettlement.practiceSlots = [
  { practiceId: "forage", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "pastoralism", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "logging", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "quarrying", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "barter", tier: "bronze", stock: 0, charge: 0, work: 0 },
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
  nodeId: practiceTierNode.nodeId, offerId: learnOffer.offerId, toIndex: 0,
});
dispatch(practiceTierState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: practiceTierNode.nodeId });
resolvePending(practiceTierState);
assert.equal(practiceTierSettlement.practiceSlots[0].practiceId, learnOffer.intervention.practiceId,
  "learning inserts the practice into the leftmost slot");
assert.equal(practiceTierSettlement.practiceSlots[0].tier, "bronze");
assert.equal(practiceTierSettlement.practiceSlots.length, 5);
assert.equal(practiceTierSettlement.practiceSlots.some((slot) => slot?.practiceId === "barter"), false,
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
const upgradedPractice = upgradeShop.settlement.practiceSlots[0];
assert.equal(upgradedPractice.practiceId, "forage", "matching-tier purchases move the practice leftmost");
assert.equal(upgradedPractice.tier, "diamond", "matching-tier purchases upgrade the practice");
// resolvePending advances production and meals; remaining Stock depends on balance.

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
