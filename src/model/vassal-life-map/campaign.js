import { militarySummary, CONTROL_DEFAULTS, availableMilitaryWarriors as availableDetachment } from '../detailed-settlements/territory.js';
import { populationBins, selectPeople, removePeople, writePopulationBins } from '../detailed-settlements/population-ledger.js';
import { prestigeAccount, creditPrestige, quotePrestige } from './treasury.js';
import { VASSAL_WORKSHOP_RULES as RULES } from '../../defs/vassal-workshop-rules.js';
import { resolveLifeMapOptionCosts } from '../life-map-balance.js';
import { VASSAL_CLASS_RULES } from '../../defs/vassal-class-rules.js';
import { getRegionState, getRegionReference } from '../world-state.js';
import { stockTotal, consumeStock, stockProviderSlots, stockTraits, stockCapacity, planStock, applyStockPlan } from '../detailed-settlements/stock.js';
import { getRetinue, conquerSettlement, addMonsterPressure } from '../detailed-settlements/external-world.js';
import { emitPracticeEvent, withPracticeRoot, getActionMonsterPressureCost } from '../detailed-settlements/practice-events.js';
import { getPlayerDetailedSites, getDetailedSite, getVassalEffectiveStats, getAdjustedVassalPrestigeCost, getVassalActionPhaseCost, markHeirloomTimeAction } from './selectors.js';
import { generateRelicOffers } from './heirlooms.js';
import { connectedDistance } from './world-choices.js';

export function campaignForces(state, vassal) {
  const reachable=new Set(stockProviderSlots(state,getDetailedSite(state,vassal.locationRegionId)?.detailedState,false,{beneficiary:'player',discretionary:true}).map(s=>s.regionId));
  const sites = getPlayerDetailedSites(state).filter(s=>!state.rulesetId||reachable.has(s.regionId));
  const prowess = getVassalEffectiveStats(vassal).intelligence;
  const retinue = getRetinue(state,vassal).value;
  const warriors = state.rulesetId?sites.reduce((n,s)=>n+availableDetachment(state,s.regionId),0):sites.reduce((sum,site) => sum + Object.values(site.detailedState.populationByClass)
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
    const baseRisk = Math.min(100,Math.round(defense/Math.max(1,forces[mode].total+defense)*100));
    const risk=resolveLifeMapOptionCosts(state,nodeState,{id:`${mode}:${regionId}`,mode,risk:baseRisk}).risk;
    const foodCost = mode === 'duel' ? 0 : RULES.campaignFoodBase+distance*RULES.campaignFoodPerDistance;
    const warriorBonus=risk>0?VASSAL_CLASS_RULES.warrior.riskPrestige:0;
    targets.push({id:`${mode}:${regionId}`,regionId,mode,stage,defense,force:forces[mode].total,risk,baseRisk,distance,foodCost,
      label:`${label}: ${getRegionReference(state,regionId)}`,description:mode==='duel'?'+1 Prowess and 10 Prestige, plus the Warrior risk bonus.':mode==='quest'?'A Relic and 10 Prestige.':stage==='clear'?'Reset Monster Pressure; the nest remains.':stage==='nest'?'Destroy this Monster nest.':'Bring this settlement into your civilization.',
      phaseCost:RULES.campaignPhases,prestigeCost:mode==='attack'?RULES.campaignPrestige:0,
      warriorBonus,prestigeDelta:mode==='duel'?RULES.duelPrestige+warriorBonus:mode==='quest'?RULES.questPrestige+warriorBonus:
        stage==='nest'?12+defense*4+warriorBonus:warriorBonus});
  };
  if (!visit.failed) {
    for (const region of state.world.regions.filter(region=>region.monster)) {
      add('attack',region.id,region.monster.defense+(region.monster.cleared?RULES.nestDefenseBonus:0),region.monster.cleared?'nest':'clear',region.monster.cleared?'Destroy nest':'Clear monsters');
      if (!visit.questRegionIds.includes(region.id)) add('quest',region.id,RULES.questDefense,'quest','Quest');
    }
    for (const site of state.world.sites.filter(site=>state.rulesetId?site.simulationMode==='detailed'&&getRegionState(state,site.regionId).controller!=='player':site.neutral)) add('attack',site.regionId,state.rulesetId?Math.max(1,militarySummary(state,site.regionId).defense):site.neutral.defense,'alliance','Attack settlement');
    if (!visit.duelDone) add('duel',vassal.locationRegionId,RULES.duelDefense,'duel','Honour duel');
    if (!targets.some(target=>target.mode==='quest') && !visit.questRegionIds.includes(vassal.locationRegionId)) add('quest',vassal.locationRegionId,RULES.questDefense,'quest','Quest');
  }
  return [...targets,{id:'campaign-leave',label:'Leave Campaign',phaseCost:0,prestigeCost:0}].map(option=>resolveLifeMapOptionCosts(state,nodeState,option));
}

export function campaignBlockReason(state,vassal,option) {
  if (vassal.classId !== 'warrior') return 'Campaign requires a Warrior';
  if (option.id === 'campaign-leave') return null;
  const settlement = getDetailedSite(state,vassal.locationRegionId)?.detailedState;
  if(state.rulesetId)return planStock(state,settlement,[{traits:['Edible'],amount:option.foodCost}],[],null,false,false,{beneficiary:'player',discretionary:true}).ok?null:'Missing player-controlled expedition Food';
  return prestigeAccount(state,vassal).prestige < getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0) ? 'Insufficient Prestige'
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
  const authored=state.gameConfig.lifeMapGenerator.design.enabled;
  const phaseCost=authored?getVassalActionPhaseCost(vassal,option.phaseCost,{nodeState}):option.phaseCost;
  const source = getDetailedSite(state,vassal.locationRegionId).detailedState;
  const cost=getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0);
  const substitution=state.rulesetId&&cost>prestigeAccount(state,vassal).prestige?10:0;
  prestigeAccount(state,vassal).prestige -= substitution?0:cost;
  if(state.rulesetId)applyStockPlan(state,source,planStock(state,source,[{traits:['Edible'],amount:option.foodCost}],[],null,false,false,{beneficiary:'player',discretionary:true}));else consumeStock(state,source,'Edible',option.foodCost);
  const roll = state.rngNextVassalInt(1,100), success = roll > option.risk;
  const visit = nodeState.campaign;
  const result = {stage:option.stage,regionId:option.regionId,roll,risk:option.risk,success,text:''};
  if (!success) {visit.failed=true;result.text='Defeat. The expedition ends; your Vassal returns.';}
  else if (option.stage === 'clear') {
    state.civilization.chaos.monsterPressure = 0;
    getRegionState(state,option.regionId).monster.cleared = true;
    result.text='Monsters cleared. Monster Pressure reset; the nest remains.';
  } else if (option.stage === 'nest') {
    delete getRegionState(state,option.regionId).monster;
    const site = state.world.sites.find(site=>site.regionId===option.regionId);
    if (site?.simulationMode === 'ruin') conquerSettlement(state,option.regionId,3);
    state.civilization.chaos.monsterCount = state.world.regions.filter(region=>region.monster).length;
    state.civilization.history.victories++;
    state.civilization.research.total += option.defense*3;
    emitPracticeEvent(state,{kind:'monsterDestroyed',regionId:vassal.locationRegionId,classId:'warrior',faction:'player'});
    result.text='Monster nest destroyed.';
  } else if (option.stage === 'alliance') {
    if(state.rulesetId)moveCampaignGarrison(state,vassal,option.regionId);
    conquerSettlement(state,option.regionId,option.force-option.defense);
    result.text='Settlement allied with your civilization.';
  } else if (option.stage === 'duel') {
    visit.duelDone=true;vassal.stats.intelligence++;
    emitPracticeEvent(state,{kind:'challengeCompleted',regionId:vassal.locationRegionId,classId:'warrior'});
    result.text=`Duel won. +1 Prowess and +${option.prestigeDelta} Prestige.`;
  } else {
    visit.questRegionIds.push(option.regionId);
    const reward = generateRelicOffers(state,vassal).find(offer=>offer.definitionId);
    if (reward) nodeState.rewardAcquisition={...reward,id:'campaign-reward',phaseCost:option.phaseCost,effects:[],immediateDeathChance:0};
    result.text=`Quest complete. +${option.prestigeDelta} Prestige and a Relic.`;
  }
  if(success) {
    creditPrestige(state,vassal,option.prestigeDelta);
    if(option.risk>0)emitPracticeEvent(state,{kind:'dangerSurvived',regionId:vassal.locationRegionId,classId:'warrior',martial:true});
  }
  if (success && option.mode === 'attack') emitPracticeEvent(state,{kind:'campaignWon',regionId:vassal.locationRegionId,classId:'warrior'});
  visit.lastResult=result;
  if(authored&&!nodeState.rewardAcquisition)markHeirloomTimeAction(nodeState,phaseCost);
  const pressure=getActionMonsterPressureCost(option)+substitution;
  if(pressure>0)addMonsterPressure(state,pressure);
  return {ok:true,phaseCost,needsAcquisition:!!nodeState.rewardAcquisition};
}

export function getCampaignPresentation(state,vassal,nodeState) {
  const forces=campaignForces(state,vassal), mode=nodeState.campaign.mode;
  const allTargets=buildCampaignOptions(state,vassal,nodeState).filter(option=>option.mode).map(option=>({...option,
    monsterPressureCost:getActionMonsterPressureCost(option)+(state.rulesetId?quotePrestige(state.civilization.prestige,getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0)).monsterPressureCost:0),
    cost:state.rulesetId?quotePrestige(state.civilization.prestige,getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0)).prestigeCost:getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0),phases:state.gameConfig.lifeMapGenerator.design.enabled?getVassalActionPhaseCost(vassal,option.phaseCost,{nodeState}):option.phaseCost,
    blocked:campaignBlockReason(state,vassal,option),riskLabel:`${option.risk}% defeat risk\nForce ${option.force} vs Defence ${option.defense}`}));
  const selected=allTargets.find(target=>target.id===nodeState.selectedOptionId);
  const options=[{id:'attack',label:'Attack',description:'Attack a monster region or neutral settlement.'},
    {id:'duel',label:'Honour duel',description:'Prowess only. Victory: +1 Prowess and a Prestige prize.'},
    {id:'quest',label:'Quest',description:'Prowess + Retinue. Victory: a Relic and Prestige.'}].map(option=>{
      const targets=allTargets.filter(target=>target.mode===option.id), priced=selected?.mode===option.id?selected:targets.filter(target=>!target.blocked).sort((a,b)=>a.foodCost-b.foodCost)[0]??targets[0];
      return {...option,cost:priced?.cost??0,phases:priced?.phases??0,foodCost:priced?.foodCost??0,monsterPressureCost:priced?.monsterPressureCost??0,
        prestigeDelta:priced?.prestigeDelta??0,blocked:!targets.length?'No remaining encounters':targets.every(target=>target.blocked)?priced.blocked:null,
        riskLabel:selected?.mode===option.id?selected.riskLabel:'Choose a target',from:!selected&&targets.some(target=>target.foodCost!==priced?.foodCost)};
    });
  return {mode,forces,activeForce:forces[mode],force:forces.attack,options,allTargets,targets:allTargets.filter(target=>target.mode===mode),selectedTargetId:nodeState.selectedOptionId,
    failed:nodeState.campaign.failed,lastResult:nodeState.campaign.lastResult,
    resources:{prestige:prestigeAccount(state,vassal).prestige,food:stockTotal(state,getDetailedSite(state,vassal.locationRegionId)?.detailedState,'Edible')},
    progress:state.world.regions.filter(region=>region.monster?.cleared).map(region=>({regionId:region.id,label:'Buildup cleared'}))};
}

function moveCampaignGarrison(state,vassal,targetId) {
  const target=getDetailedSite(state,targetId)?.detailedState;
  if(!target)return;
  const opposition=populationBins(target).filter(b=>b.allegiance!=='player').reduce((n,b)=>n+b.count,0);
  const required=Math.ceil(opposition/CONTROL_DEFAULTS.disloyalPerForce);
  const destinations=target.practiceSlots.filter(p=>stockTraits(state,p).includes('Arms'));
  const reachable=[...new Set(stockProviderSlots(state,getDetailedSite(state,vassal.locationRegionId)?.detailedState,false,{beneficiary:'player',discretionary:true}).map(p=>p.regionId))];
  // Allocate the smallest real detachment. Existing loyal residents and captured
  // equipment count; only missing equipment travels with the expedition.
  for(const id of reachable){
    if(id===targetId)continue;
    const source=getDetailedSite(state,id)?.detailedState;
    while(availableDetachment(state,id)>0){
      const defense=militarySummary(state,targetId,'player',{assumeSupplied:true});
      if(defense.armed>0&&defense.force>=required)break;
      const needsArms=stockTotal(state,target,'Arms')<=defense.warriors;
      const destination=destinations.find(p=>(p.stock??0)<stockCapacity(state,target,p));
      if(needsArms&&!destination)break;
      const troops=removePeople(source,selectPeople(source,1,{kind:'adults',specialty:'warrior',allegiance:'player'}));
      if(!troops.length)break;
      if(needsArms){consumeStock(state,source,'Arms',1);destination.stock=(destination.stock??0)+1;}
      writePopulationBins(target,[...populationBins(target),...troops.map(b=>({...b,classId:'stranger'}))]);
    }
  }
  target.garrison={supplied:false,paid:0,required:0,tSec:state.tSec};
}
