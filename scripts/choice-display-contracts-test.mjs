// Public choice descriptions and reward quotes agree with committed actions.
// Presentation reads leave the complete serialized state/RNG untouched.
import assert from 'node:assert/strict';
import { createLabNodeSandbox } from '../src/model/dev-lab/node-sandbox.js';
import { getCurrentLifeMapVassal, getVassalNodeDecisionPresentation } from '../src/model/vassal-life-map.js';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { serializeGameState } from '../src/model/state.js';
import { optionEffect } from '../src/views/vassal-node-decision/cards.js';
import { campaignRiskText } from '../src/views/vassal-node-decision/world-screen.js';

const challenge = createLabNodeSandbox({type:'challenge',classId:'warrior',intelligence:1,seed:42});
const act = (kind,payload) => assert.equal(applyAction(challenge.state,{kind,payload},{isReplay:true}).ok,true);
act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId:challenge.nodeId,optionId:'challenge-3'});
const before = serializeGameState(challenge.state);
const shown = getVassalNodeDecisionPresentation(challenge.state,challenge.nodeId);
const option = shown.nodeState.options.find(option=>option.id==='challenge-3');
assert.equal(option.immediateDeathChance,0,'Prowess can remove the displayed death risk');
assert.equal(option.riskPrestigeBonus,15,'raw dangerous action still grants its Warrior bonus');
assert.match(optionEffect(option),/\+24 Prestige \(9 base \+ 15 Warrior bonus\)/);
assert.deepEqual(serializeGameState(challenge.state),before,'reward reads do not mutate state');
const prestige = getCurrentLifeMapVassal(challenge.state).prestige;
act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:challenge.nodeId});
assert.equal(getCurrentLifeMapVassal(challenge.state).prestige-prestige,24,'displayed reward is committed');

const legacy = createLabNodeSandbox({type:'legacy',classId:'warrior',seed:42});
const found = getVassalNodeDecisionPresentation(legacy.state,legacy.nodeId).nodeState.options.find(option=>option.id==='found-settlement');
assert.match(found.description,/settlement with 10 adult Villagers/);
assert.doesNotMatch(found.description,/Move|No Prestige cost/);
assert.match(optionEffect({...found,settlementRegionId:'R02'}),/Found this settlement with 10 Villager adults/);

const campaign = createLabNodeSandbox({type:'campaign',classId:'warrior',seed:42});
const quest = getVassalNodeDecisionPresentation(campaign.state,campaign.nodeId).campaign.options.find(option=>option.id==='quest');
assert.match(quest.description,/Relic and Prestige/);
assert.doesNotMatch(quest.description,/10 Prestige/,'actual adjusted reward belongs in the footer');
assert.equal(campaignRiskText({force:11,defense:4,baseRisk:27,risk:50}),'50% defeat risk');
assert.match(campaignRiskText({force:11,defense:4,baseRisk:27,risk:27}),/4 .* \(11 \+ 4\) = 27%/);
assert.equal(campaignRiskText({force:11,defense:4,baseRisk:27,risk:0}),'0% defeat risk');
console.log('[choice-display-contracts] Challenge reward/commit, Legacy copy, Quest reward and risk overrides OK');
