import { ensureCommissionOffers } from "../../src/model/vassal-life-map/commissions.js";
import { enterVassalLifeNode, selectLifeMapVassal, selectVassalNodeOption } from "../../src/model/vassal-life-map.js";

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
  const { vassal } = requireAction(selectLifeMapVassal(state, 0));
  const map = vassal.lifeMap;
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
