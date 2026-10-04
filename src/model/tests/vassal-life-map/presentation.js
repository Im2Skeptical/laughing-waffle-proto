import assert from "node:assert/strict";
import {
  getCurrentLifeMapVassal,
  getVassalDevelopmentIncome,
  getVassalNodeDecisionPresentation,
  getVassalPrestigeIncome,
  getVassalStatPresentation,
} from "../../vassal-life-map.js";
import { dispatch, forceEnter, nodeIdForFamily, selectedState } from "./helpers.js";
import { ActionKinds } from "../../actions.js";

// Class stats replace their base stat's meaning throughout node choices.
for (const [classId, statId, label, omittedLabel] of [
  ["scholar", "cunning", "Ingenuity", "Cunning"],
  ["warrior", "intelligence", "Prowess", "Intelligence"],
  [null, "cunning", "Cunning", null],
]) {
  const state = selectedState(1041);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.classId = classId;
  const patronage = forceEnter(state, nodeIdForFamily(state, "patronage"));
  const option = patronage.options.find(entry => entry.statId === "cunning");
  assert.equal(option.statLabel, classId === "scholar" ? "Ingenuity" : "Cunning",
    "patronage must name the stat this class actually develops");
  if (classId === "scholar") {
    assert.match(option.label, /Ingenuity/);
    const before = vassal.stats.cunning;
    const incomeBefore = getVassalPrestigeIncome(vassal);
    option.phaseCost = 0;
    dispatch(state, ActionKinds.VASSAL_SELECT_LIFE_OPTION, { nodeId: patronage.nodeId, optionId: option.id });
    dispatch(state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: patronage.nodeId });
    assert.equal(vassal.stats.cunning, before + 1);
    assert.equal(getVassalPrestigeIncome(vassal), incomeBefore,
      "Scholar Ingenuity does not acquire ordinary Cunning income");
  }
  const developmentState = selectedState(1041);
  const developmentVassal = getCurrentLifeMapVassal(developmentState);
  developmentVassal.classId = classId;
  const development = forceEnter(developmentState, nodeIdForFamily(developmentState, "development"));
  for (const entry of development.options) {
    assert.equal(entry.statLabel, getVassalStatPresentation(developmentVassal, entry.statId).label);
    if (entry.lossStatId) {
      assert.equal(entry.lossStatLabel, getVassalStatPresentation(developmentVassal, entry.lossStatId).label);
    }
    if (omittedLabel) {
      assert.notEqual(entry.statLabel, omittedLabel);
      assert.notEqual(entry.lossStatLabel, omittedLabel);
    }
  }
  assert.equal(getVassalStatPresentation(vassal, statId).label, label);

  // Earn real level-up choices and confirm the class stat through the action API.
  developmentVassal.initialAge = 20;
  developmentVassal.stats.wisdom = 40;
  const steady = development.options.find(entry => entry.id === "steadyPractice");
  steady.phaseCost = 0;
  dispatch(developmentState, ActionKinds.VASSAL_SELECT_LIFE_OPTION,
    { nodeId: development.nodeId, optionId: steady.id });
  dispatch(developmentState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: development.nodeId });
  assert.ok(developmentVassal.developmentChoiceQueue.some(choice => choice.offeredStatIds.includes(statId)),
    "class stat remains available for earned levels");
  while (developmentVassal.developmentChoiceQueue.length) {
    const choice = developmentVassal.developmentChoiceQueue[0];
    const offeredLabels = choice.offeredStatIds.map(id => getVassalStatPresentation(developmentVassal, id).label);
    if (omittedLabel) assert.ok(!offeredLabels.includes(omittedLabel), "level-up omits the replaced base stat");
    const chosen = choice.offeredStatIds.includes(statId) ? statId : choice.offeredStatIds[0];
    const before = developmentVassal.stats[chosen];
    dispatch(developmentState, ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT,
      { choiceId: choice.choiceId, statId: chosen });
    assert.equal(developmentVassal.stats[chosen], before + 1);
  }
}

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
