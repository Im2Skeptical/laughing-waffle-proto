import assert from "node:assert/strict";
import {
  getCurrentLifeMapVassal,
  getVassalDevelopmentIncome,
  getVassalNodeDecisionPresentation,
  getVassalPrestigeIncome,
} from "../../vassal-life-map.js";
import { forceEnter, nodeIdForFamily, selectedState } from "./helpers.js";

const patronagePresentationState = selectedState(1041);
const patronagePresentationVassal = getCurrentLifeMapVassal(patronagePresentationState);
const patronagePresentationNode = forceEnter(patronagePresentationState,
  nodeIdForFamily(patronagePresentationState, "patronage"));
const patronageOption = patronagePresentationNode.options.find((option) => option.statId)
  ?? patronagePresentationNode.options[0];
const patronagePresentation = getVassalNodeDecisionPresentation(
  patronagePresentationState, patronagePresentationNode.nodeId,
  { previewOptionId: patronageOption.id }
);
assert.equal(patronagePresentation.contextKind, "vassal");
assert.equal(patronagePresentation.vassalProjection.optionId, patronageOption.id);
assert.equal(patronagePresentation.vassalProjection.ifSurvives.prestigeIncome,
  getVassalPrestigeIncome({
    ...patronagePresentationVassal,
    stats: Object.fromEntries(patronagePresentation.vassalProjection.immediate.stats
      .map((stat) => [stat.statId, stat.value])),
  }));

// Development previews must apply both sides of a trade, including income changes.
const tradeState = selectedState(102);
const tradeVassal = getCurrentLifeMapVassal(tradeState);
tradeVassal.prestige = 500;
const tradeNode = forceEnter(tradeState, nodeIdForFamily(tradeState, "development"));
const tradeOption = tradeNode.options.find((option) => option.lossStatId);
assert.ok(tradeOption);
tradeVassal.stats[tradeOption.lossStatId] = 4;
const tradePreview = getVassalNodeDecisionPresentation(tradeState, tradeNode.nodeId,
  { previewOptionId: tradeOption.id }).vassalProjection;
const expectedTrade = structuredClone(tradeVassal);
expectedTrade.stats[tradeOption.statId] += tradeOption.statDelta;
expectedTrade.stats[tradeOption.lossStatId] += tradeOption.lossStatDelta;
assert.equal(tradePreview.ifSurvives.prestigeIncome, getVassalPrestigeIncome(expectedTrade));
assert.equal(tradePreview.ifSurvives.developmentIncome, getVassalDevelopmentIncome(expectedTrade));
assert.equal(tradePreview.immediate.stats.find((stat) => stat.statId === tradeOption.lossStatId).value,
  expectedTrade.stats[tradeOption.lossStatId]);
assert.equal(tradeVassal.stats[tradeOption.lossStatId], 4, "preview leaves state untouched");
