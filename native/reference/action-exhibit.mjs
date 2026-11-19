import { ensureCommissionOffers } from "../../src/model/vassal-life-map/commissions.js";
import { enterVassalLifeNode, selectLifeMapVassal, selectVassalNodeOption } from "../../src/model/vassal-life-map.js";
import { VASSAL_SIGNATURE_NODE_VARIANTS } from "../../src/defs/gamepieces/vassal-life-map-defs.js";

const definitions = ["abacus", "foxMask", "minorSeal", "signetRing", "tutorsNotebook", "hourglass", "travellersBoots"];
const relic = (index) => ({
  instanceId: "heirloom-" + (index + 1),
  definitionId: definitions[index],
  inheritanceState: "sanctified",
  protectionSpent: false,
});

function requireAction(result) {
  if (!result.ok) throw new Error("Action exhibit: " + result.reason);
  return result;
}

export function prepareActionExhibit(state, variant) {
  const civ = state.civilization;
  const lineage = civ.vassalLineage;
  if (variant === "overflow") {
    lineage.pendingVaultOverflow = definitions.map((_, index) => relic(index));
    lineage.nextHeirloomInstanceId = definitions.length + 1;
    return state;
  }
  if (variant === "regional-practices") {
    state.world.regions.find(region => region.controller === "player").installedPracticeIds = [];
    return state;
  }
  const martial = variant === "choice-challenge" || variant.startsWith("choice-campaign");
  const { vassal } = requireAction(selectLifeMapVassal(state, martial ? 1 : 0));
  const map = vassal.lifeMap;
  if (variant.startsWith("choice-")) {
    const [family, outcome] = variant.slice("choice-".length).split("-");
    const node = map.graph.nodes.find(node => family === "legacyPlus" ? node.id === map.graph.bossNodeId : node.depth === 1);
    node.family = ["legacyPlus", "specialRelic"].includes(family) ? (family === "legacyPlus" ? "legacy" : "relic") : family;
    if (family === "legacyPlus") {
      const { id, groupId, label, glyph, color, description } = VASSAL_SIGNATURE_NODE_VARIANTS.legacyPlus;
      node.signatureNode = { variantId: id, id, groupId, label, glyph, color, description };
    }
    if (family === "specialRelic") node.specialRelic = true;
    if (family === "specialRelic" && outcome === "mandate") {
      vassal.heirlooms.equipped[0] = relic(0);
      vassal.heirlooms.equipped[0].definitionId = "mandateOfHeaven";
      lineage.nextHeirloomInstanceId = 2;
    }
    if (family === "crossroads" && outcome === "reward") state.rng.vassalSeed = 7;
    const site = state.world.sites.find(site => site.regionId === vassal.locationRegionId);
    if (family === "crisis") {
      site.detailedState.practiceSlots[0].stock = site.detailedState.practiceSlots[1].stock = 0;
      if (outcome === "delay" || outcome === "rescue") {
        state.world.regions.find(region => region.id === "R08").monster = { defense: 2 };
        state.civilization.chaos.monsterCount += 1;
        state.civilization.chaos.monsterPressure = 4;
      }
      if (outcome === "rescue") {
        site.detailedState.practiceSlots[0].stock = 1;
        state.gameConfig.gamepieces.practices.fm_fallowFields.stockTraits.push("Mobility");
        const slot = site.detailedState.practiceSlots[2];
        slot.practiceId = "rescueParties";
        slot.stock = 0;
      }
    }
    if (family === "challenge" || family === "campaign") {
      vassal.classId = lineage.establishedClassId = "warrior";
      vassal.founderClassId = null;
    }
    if (family === "campaign" && outcome) {
      site.detailedState.practiceSlots[1].stock = 6;
      const choices = state.gameConfig.lifeMapGenerator.design.optionCosts.campaign;
      const mode = outcome === "quest" ? "quest" : outcome === "defeat" ? "duel" : "attack";
      choices[mode].time = .0625;
      choices[mode].risk = outcome === "defeat" ? 1 : 0;
      if (outcome === "nest") state.world.regions.find(region => region.monster).monster.cleared = true;
    }
    map.availableNodeIds = [node.id];
    return state;
  }
  if (variant === "founding") {
    map.availableNodeIds = [map.graph.foundingNodeId];
    return state;
  }
  if (variant !== "scholar-shop" && variant !== "structure-shop") throw new Error("Unknown action exhibit " + variant);
  const structures = variant === "structure-shop";
  if (!structures) {
    vassal.classId = lineage.establishedClassId = "scholar";
    vassal.founderClassId = null;
  }
  const graphNode = map.graph.nodes.find(node => node.family === (structures ? "publicWorks" : "practiceReform"));
  map.availableNodeIds = [graphNode.id];
  requireAction(enterVassalLifeNode(state, graphNode.id));
  requireAction(selectVassalNodeOption(state, graphNode.id, structures ? "Housing" : "random"));
  if (structures) return state;
  ensureCommissionOffers(state, vassal);
  vassal.developmentChoiceQueue.push({
    choiceId: "vassal-1:level:1",
    offeredStatIds: ["cunning", "wisdom", "intelligence"],
  });
  vassal.nextDevelopmentChoiceId = 2;
  civ.heirloomVault[2] = relic(0);
  civ.heirloomVault[4] = relic(1);
  lineage.nextHeirloomInstanceId = 3;
  lineage.pendingHeirloomLoadout = true;
  return state;
}
