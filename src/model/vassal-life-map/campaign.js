import { VASSAL_WORKSHOP_RULES as RULES } from '../../defs/vassal-workshop-rules.js';
import { getLifeMapCostMultiplier } from '../life-map-design.js';
import { VASSAL_CLASS_RULES } from '../../defs/vassal-class-rules.js';
import { getRegionState, getRegionReference } from '../world-state.js';
import { stockTotal, consumeStock } from '../detailed-settlements/stock.js';
import { getRetinue, conquerSettlement } from '../detailed-settlements/external-world.js';
import { emitPracticeEvent, withPracticeRoot } from '../detailed-settlements/practice-events.js';
import { getPlayerDetailedSites, getDetailedSite, getVassalEffectiveStats, getAdjustedVassalPrestigeCost } from './selectors.js';
import { generateRelicOffers } from './heirlooms.js';
import { connectedDistance } from './world-choices.js';

export function campaignForces(state, vassal) {
  const sites = getPlayerDetailedSites(state);
  const prowess = getVassalEffectiveStats(vassal).intelligence;
  const retinue = getRetinue(state,vassal).value;
  const warriors = sites.reduce((sum,site) => sum + Object.values(site.detailedState.populationByClass)
    .reduce((n,cohort) => n + (cohort.specialists?.warrior?.adults ?? 0),0),0);
  const arms = sites.reduce((sum,site) => sum + stockTotal(state,site.detailedState,'Arms'),0);
  return Object.fromEntries(['attack','duel','quest'].map(mode => {
    const usedRetinue = mode === 'duel' ? 0 : retinue, armedWarriors = mode === 'attack' ? Math.min(warriors,arms) : 0;
    return [mode,{prowess,retinue:usedRetinue,warriors,arms,armedWarriors,total:prowess+usedRetinue+armedWarriors}];
  }));
}

export function buildCampaignOptions(state,vassal,nodeState) {
  if (vassal.classId !== 'warrior') return [];
  const forces = campaignForces(state,vassal), visit = nodeState.campaign;
  const targets = [];
  const add = (mode,regionId,defense,stage,label) => {
    const distance = connectedDistance(state,vassal.locationRegionId,regionId,true);
    const risk = Math.min(100,Math.round(defense/Math.max(1,forces[mode].total+defense)*100*getLifeMapCostMultiplier(vassal,'risk')));
    const foodCost = mode === 'duel' ? 0 : RULES.campaignFoodBase+distance*RULES.campaignFoodPerDistance;
    const warriorBonus=risk>0?VASSAL_CLASS_RULES.warrior.riskPrestige:0;
    targets.push({id:`${mode}:${regionId}`,regionId,mode,stage,defense,force:forces[mode].total,risk,distance,foodCost,
      label:`${label}: ${getRegionReference(state,regionId)}`,description:mode==='duel'?'+1 Prowess and 10 Prestige, plus the Warrior risk bonus.':mode==='quest'?'A Relic and 10 Prestige.':stage==='clear'?'Reset Monster expansion progress; the nest remains.':stage==='nest'?'Destroy this Monster nest.':'Bring this settlement into your civilization.',
      phaseCost:RULES.campaignPhases,prestigeCost:mode==='attack'?RULES.campaignPrestige:0,
      warriorBonus,prestigeDelta:mode==='duel'?RULES.duelPrestige+warriorBonus:mode==='quest'?RULES.questPrestige+warriorBonus:
        stage==='nest'?12+defense*4+warriorBonus:warriorBonus});
  };
  if (!visit.failed) {
    for (const region of state.world.regions.filter(region=>region.monster)) {
      add('attack',region.id,region.monster.defense+(region.monster.cleared?RULES.nestDefenseBonus:0),region.monster.cleared?'nest':'clear',region.monster.cleared?'Destroy nest':'Clear monsters');
      if (!visit.questRegionIds.includes(region.id)) add('quest',region.id,RULES.questDefense,'quest','Quest');
    }
    for (const site of state.world.sites.filter(site=>site.neutral)) add('attack',site.regionId,site.neutral.defense,'alliance','Attack settlement');
    if (!visit.duelDone) add('duel',vassal.locationRegionId,RULES.duelDefense,'duel','Honour duel');
    if (!targets.some(target=>target.mode==='quest') && !visit.questRegionIds.includes(vassal.locationRegionId)) add('quest',vassal.locationRegionId,RULES.questDefense,'quest','Quest');
  }
  return [...targets,{id:'campaign-leave',label:'Leave Campaign',phaseCost:0,prestigeCost:0}];
}

export function campaignBlockReason(state,vassal,option) {
  if (vassal.classId !== 'warrior') return 'Campaign requires a Warrior';
  if (option.id === 'campaign-leave') return null;
  const settlement = getDetailedSite(state,vassal.locationRegionId)?.detailedState;
  return vassal.prestige < getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0) ? 'Insufficient Prestige'
    : stockTotal(state,settlement,'Edible') < option.foodCost ? 'Insufficient Food' : null;
}

// Validated before any payment or RNG. Defeat ends this visit, not the life.
export function resolveCampaignAttempt(state,vassal,nodeState,selected) {
  const option = buildCampaignOptions(state,vassal,nodeState).find(option=>option.id===selected.id && option.stage===selected.stage);
  if (!option || campaignBlockReason(state,vassal,option)) return {ok:false,reason:'campaignUnavailable'};
  return withPracticeRoot(state,{kind:'vassalAction',regionId:vassal.locationRegionId,classId:vassal.classId,actionKind:'campaign'},
    ()=>applyCampaignAttempt(state,vassal,nodeState,option));
}

function applyCampaignAttempt(state,vassal,nodeState,option) {
  const source = getDetailedSite(state,vassal.locationRegionId).detailedState;
  vassal.prestige -= getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0);
  consumeStock(state,source,'Edible',option.foodCost);
  const roll = state.rngNextVassalInt(1,100), success = roll > option.risk;
  const visit = nodeState.campaign;
  const result = {stage:option.stage,regionId:option.regionId,roll,risk:option.risk,success,text:''};
  if (!success) {visit.failed=true;result.text='Defeat. The expedition ends; your Vassal returns.';}
  else if (option.stage === 'clear') {
    state.civilization.chaos.monsterPressure = 0;
    getRegionState(state,option.regionId).monster.cleared = true;
    result.text='Monsters cleared. Expansion progress reset; the nest remains.';
  } else if (option.stage === 'nest') {
    delete getRegionState(state,option.regionId).monster;
    const site = state.world.sites.find(site=>site.regionId===option.regionId);
    if (site?.simulationMode === 'ruin') conquerSettlement(state,option.regionId,3);
    state.civilization.chaos.monsterCount = state.world.regions.filter(region=>region.monster).length;
    state.civilization.history.victories++;
    state.civilization.research.total += option.defense*3;
    emitPracticeEvent(state,{kind:'monsterDestroyed',regionId:vassal.locationRegionId,classId:'warrior'});
    result.text='Monster nest destroyed.';
  } else if (option.stage === 'alliance') {
    conquerSettlement(state,option.regionId,option.force-option.defense);
    result.text='Settlement allied with your civilization.';
  } else if (option.stage === 'duel') {
    visit.duelDone=true;vassal.stats.intelligence++;
    emitPracticeEvent(state,{kind:'challengeCompleted',regionId:vassal.locationRegionId,classId:'warrior'});
    result.text=`Duel won. +1 Prowess and +${option.prestigeDelta} Prestige.`;
  } else {
    visit.questRegionIds.push(option.regionId);
    const reward = generateRelicOffers(state,vassal).find(offer=>offer.definitionId);
    if (reward) nodeState.rewardAcquisition={...reward,id:'campaign-reward',phaseCost:RULES.campaignPhases,effects:[],immediateDeathChance:0};
    result.text=`Quest complete. +${option.prestigeDelta} Prestige and a Relic.`;
  }
  if(success) {
    vassal.prestige+=option.prestigeDelta;
    if(option.risk>0)emitPracticeEvent(state,{kind:'dangerSurvived',regionId:vassal.locationRegionId,classId:'warrior',martial:true});
  }
  if (success && option.mode === 'attack') emitPracticeEvent(state,{kind:'campaignWon',regionId:vassal.locationRegionId,classId:'warrior'});
  visit.lastResult=result;
  return {ok:true,phaseCost:RULES.campaignPhases,needsAcquisition:!!nodeState.rewardAcquisition};
}

export function getCampaignPresentation(state,vassal,nodeState) {
  const forces=campaignForces(state,vassal), mode=nodeState.campaign.mode;
  const allTargets=buildCampaignOptions(state,vassal,nodeState).filter(option=>option.mode).map(option=>({...option,
    cost:getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0),phases:option.phaseCost,
    blocked:campaignBlockReason(state,vassal,option),riskLabel:`${option.risk}% defeat risk\nForce ${option.force} vs Defence ${option.defense}`}));
  const selected=allTargets.find(target=>target.id===nodeState.selectedOptionId);
  const options=[{id:'attack',label:'Attack',description:'Attack a monster region or neutral settlement.'},
    {id:'duel',label:'Honour duel',description:'Prowess only. Victory: +1 Prowess and a Prestige prize.'},
    {id:'quest',label:'Quest',description:'Prowess + Retinue. Victory: a Relic and 10 Prestige.'}].map(option=>{
      const targets=allTargets.filter(target=>target.mode===option.id), priced=selected?.mode===option.id?selected:targets.filter(target=>!target.blocked).sort((a,b)=>a.foodCost-b.foodCost)[0]??targets[0];
      return {...option,cost:priced?.cost??0,phases:priced?.phases??0,foodCost:priced?.foodCost??0,
        prestigeDelta:priced?.prestigeDelta??0,blocked:!targets.length?'No remaining encounters':targets.every(target=>target.blocked)?priced.blocked:null,
        riskLabel:selected?.mode===option.id?selected.riskLabel:'Choose a target',from:!selected&&targets.some(target=>target.foodCost!==priced?.foodCost)};
    });
  return {mode,forces,activeForce:forces[mode],force:forces.attack,options,allTargets,targets:allTargets.filter(target=>target.mode===mode),selectedTargetId:nodeState.selectedOptionId,
    failed:nodeState.campaign.failed,lastResult:nodeState.campaign.lastResult,
    resources:{prestige:vassal.prestige,food:stockTotal(state,getDetailedSite(state,vassal.locationRegionId)?.detailedState,'Edible')},
    progress:state.world.regions.filter(region=>region.monster?.cleared).map(region=>({regionId:region.id,label:'Buildup cleared'}))};
}
