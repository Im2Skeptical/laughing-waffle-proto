// Disposable Campaign rules. World outcomes are recorded here, never applied to player New Game.
import { getWorldDefinition, getWorldConnectionCandidates, getRegionReference } from '../../../src/model/world-state.js';
import { getVassalEffectiveStats } from '../../../src/model/vassal-life-map.js';
import { getRetinue } from '../../../src/model/detailed-settlements/external-world.js';
import { stockTotal } from '../../../src/model/detailed-settlements/stock.js';
import { VASSAL_CLASS_RULES } from '../../../src/defs/vassal-class-rules.js';

export const CAMPAIGN_TUNING = Object.freeze({prestigeCost:5,foodBase:1,foodPerDistance:1,nestDefenseBonus:4,questDefense:4,questPrestige:10});
export const CAMPAIGN_INPUTS = Object.freeze({prowess:6,prestige:40,warriors:18,arms:12,food:30});
const actor=session=>session.state.civilization.vassalLineage.vassalsById[session.vassalId];

export function campaignDistance(state, origin, destination) {
  if(origin===destination)return 0;
  const definition=getWorldDefinition(state),edges=getWorldConnectionCandidates(definition),queue=[[origin,0]],seen=new Set([origin]);
  for(let i=0;i<queue.length;i++) {
    const [id,distance]=queue[i];
    for(const edge of edges) {
      const next=edge.regionAId===id?edge.regionBId:edge.regionBId===id?edge.regionAId:null;
      if(!next||seen.has(next))continue;if(next===destination)return distance+1;
      seen.add(next);queue.push([next,distance+1]);
    }
  }
  // Islands remain targetable too; distance changes the supply price, never range eligibility.
  const a=definition.regions.find(region=>region.id===origin)?.display?.labelPoint;
  const b=definition.regions.find(region=>region.id===destination)?.display?.labelPoint;
  return a&&b?Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)*Math.sqrt(definition.regions.length))):definition.regions.length;
}
export function createCampaignExperiment(state,vassal,tuning={}) {
  const sites=state.world.sites.filter(site=>site.detailedState&&state.world.regions.find(region=>region.id===site.regionId)?.controller==='player');
  const source=sites.find(site=>site.regionId===vassal.locationRegionId)?.detailedState;
  const monsters=state.world.regions.filter(region=>region.monster).map(region=>({regionId:region.id,defense:region.monster.defense,expansion:state.civilization.chaos.monsterPressure,cleared:false,nest:true}));
  return {mode:'monsters',selectedTargetId:null,failed:false,tuning:{...CAMPAIGN_TUNING,...tuning},
    resources:{prowess:getVassalEffectiveStats(vassal).intelligence,prestige:vassal.prestige,food:source?stockTotal(state,source,'Edible'):0,
      arms:sites.reduce((sum,site)=>sum+stockTotal(state,site.detailedState,'Arms'),0),warriors:sites.reduce((sum,site)=>sum+Object.values(site.detailedState.populationByClass).reduce((count,cohort)=>count+(cohort.specialists?.warrior?.adults??0),0),0)},
    retinueBonus:vassal.classId==='warrior'?getRetinue(state,vassal).value-Math.floor(vassal.prestige/VASSAL_CLASS_RULES.warrior.prestigePerRetinue):0,
    hasRetinue:vassal.classId==='warrior',monsters,
    neutrals:state.world.sites.filter(site=>site.neutral).map(site=>({regionId:site.regionId,defense:site.neutral.defense,allied:false})),
    quests:(monsters.length?monsters:[{regionId:vassal.locationRegionId}]).map(target=>({regionId:target.regionId,done:false})),history:[]};
}
export function seedCampaignExample(session,inputs={}) {
  const campaign=session.campaign,vassal=actor(session);
  const values={...CAMPAIGN_INPUTS,...inputs};
  if(Object.values(values).some(value=>!Number.isInteger(value)||value<0||value>10000))throw new Error('Campaign inputs must be whole numbers from 0 to 10000.');
  campaign.resources=values;campaign.retinueBonus=0;campaign.hasRetinue=true;
  vassal.stats.intelligence=values.prowess;vassal.prestige=values.prestige;
  const unused=session.state.world.regions.filter(region=>region.id!==vassal.locationRegionId&&region.controller==='frontier'&&!campaign.monsters.some(target=>target.regionId===region.id)&&!campaign.neutrals.some(target=>target.regionId===region.id))
    .sort((a,b)=>campaignDistance(session.state,vassal.locationRegionId,b.id)-campaignDistance(session.state,vassal.locationRegionId,a.id)||(a.id<b.id?-1:a.id>b.id?1:0));
  for(const [region,defense,expansion] of [[unused.at(-1),8,40],[unused[0],18,70]]) {
    if(region&&!campaign.monsters.some(target=>target.regionId===region.id))campaign.monsters.push({regionId:region.id,defense,expansion,cleared:false,nest:true});
  }
  for(const monster of campaign.monsters)if(!monster.expansion)monster.expansion=40;
  campaign.quests=campaign.monsters.map(target=>({regionId:target.regionId,done:false}));
}
export function campaignForce(campaign,solo=false) {
  const r=campaign.resources,retinue=campaign.hasRetinue?Math.floor(r.prestige/VASSAL_CLASS_RULES.warrior.prestigePerRetinue)+campaign.retinueBonus:0;
  const armedWarriors=Math.min(r.warriors,r.arms);
  return {prowess:r.prowess,retinue:solo?0:retinue,warriors:r.warriors,arms:r.arms,armedWarriors:solo?0:armedWarriors,total:r.prowess+(solo?0:retinue+armedWarriors)};
}
export function getCampaignPresentation(session) {
  const c=session.campaign,r=c.resources,vassal=actor(session),force=campaignForce(c),solo=campaignForce(c,true);
  const target=(mode,regionId,defense,stage,label,description)=>{
    const distance=campaignDistance(session.state,vassal.locationRegionId,regionId),personal=mode==='quest';
    const foodCost=c.tuning.foodBase+distance*c.tuning.foodPerDistance,prestigeCost=personal?0:c.tuning.prestigeCost;
    const strength=personal?solo:force,risk=Math.round(defense/Math.max(1,strength.total+defense)*100);
    return {id:`${mode}:${regionId}`,regionId,mode,stage,label:`${label} · ${getRegionReference(session.state,regionId)}`,description,defense,force:strength.total,risk,distance,
      foodCost,cost:prestigeCost,phases:0,blocked:c.failed?'Expedition ended':r.prestige<prestigeCost?'Insufficient Prestige':r.food<foodCost?'Insufficient food':null};
  };
  const allTargets=[
    ...c.monsters.filter(monster=>monster.nest).map(monster=>target('monsters',monster.regionId,monster.defense+(monster.cleared?c.tuning.nestDefenseBonus:0),monster.cleared?'nest':'clear',monster.cleared?'Destroy nest':'Clear monsters',monster.cleared?'Destroy the nest after clearing its monsters.':`Clear monsters; expansion buildup ${monster.expansion} → 0.`)),
    ...c.neutrals.filter(site=>!site.allied).map(site=>target('neutrals',site.regionId,site.defense,'alliance','Win allegiance','Success converts this neutral settlement to allied.')),
    ...c.quests.filter(quest=>!quest.done).map(quest=>target('quest',quest.regionId,c.tuning.questDefense,'quest','Solo quest',`Success: a monster relic and ${c.tuning.questPrestige} Prestige. Prowess only.`)),
  ];
  const selected=allTargets.find(target=>target.id===c.selectedTargetId&&target.mode===c.mode);
  const options=[
    {id:'monsters',label:'Hunt monsters',description:'Clear expansion buildup. · Then destroy the nest.'},
    {id:'neutrals',label:'Win allegiance',description:'Defeat a neutral settlement. · It becomes allied.'},
    {id:'quest',label:'Solo quest',description:`Prowess only. · Monster relic +${c.tuning.questPrestige} Prestige. · No Prestige cost.`},
  ].map(option=>{
    const targets=allTargets.filter(target=>target.mode===option.id),affordable=targets.filter(target=>!target.blocked);
    const price=selected?.mode===option.id?selected:[...(affordable.length?affordable:targets)].sort((a,b)=>a.foodCost-b.foodCost)[0];
    return {...option,cost:price?.cost??0,phases:0,foodCost:price?.foodCost??0,from:selected?.mode!==option.id&&targets.some(target=>target.foodCost!==price?.foodCost),blocked:c.failed?'Expedition ended':!targets.length?'No remaining targets':!affordable.length?price?.blocked:null,
      riskLabel:selected?.mode===option.id?`${selected.risk}% defeat risk\nForce ${selected.force} vs Defence ${selected.defense}`:'Choose a target'};
  });
  return {mode:c.mode,selectedTargetId:c.selectedTargetId,targets:allTargets.filter(target=>target.mode===c.mode),allTargets,options,force,solo,resources:{...r},failed:c.failed,lastResult:c.history.at(-1)??null,
    progress:[...c.monsters.filter(monster=>monster.cleared).map(monster=>({regionId:monster.regionId,label:monster.nest?'Buildup cleared':'Nest destroyed'})),...c.neutrals.filter(site=>site.allied).map(site=>({regionId:site.regionId,label:'Allied'}))]};
}
export function selectCampaignMode(session,mode) {
  const option=getCampaignPresentation(session).options.find(option=>option.id===mode);
  if(!option||option.blocked)throw new Error(option?.blocked??'Choose a Campaign option.');
  session.campaign.mode=mode;session.campaign.selectedTargetId=null;
}
export function selectCampaignTarget(session,regionId) {
  const target=getCampaignPresentation(session).targets.find(target=>target.regionId===regionId);
  if(!target||target.blocked)throw new Error(target?.blocked??'Choose a highlighted target.');
  session.campaign.selectedTargetId=target.id;
}
export function resolveCampaignAttempt(session) {
  const c=session.campaign,p=getCampaignPresentation(session),target=p.targets.find(target=>target.id===c.selectedTargetId);
  if(!target||target.blocked)throw new Error(target?.blocked??'Choose a Campaign target.');
  const roll=session.state.rngNextVassalInt(1,100),success=roll>target.risk;
  c.resources.food-=target.foodCost;c.resources.prestige-=target.cost;
  let text;
  if(!success){c.failed=true;text=`Defeat at ${getRegionReference(session.state,target.regionId)}. Expedition ends.`;}
  else if(target.stage==='clear') {
    const monster=c.monsters.find(monster=>monster.regionId===target.regionId);monster.cleared=true;monster.expansion=0;
    text=`Monsters cleared at ${getRegionReference(session.state,target.regionId)}. Buildup reset; the nest remains.`;
  } else if(target.stage==='nest') {c.monsters.find(monster=>monster.regionId===target.regionId).nest=false;text=`Nest destroyed at ${getRegionReference(session.state,target.regionId)}.`;}
  else if(target.stage==='alliance') {c.neutrals.find(site=>site.regionId===target.regionId).allied=true;text=`${getRegionReference(session.state,target.regionId)} is now allied.`;}
  else {c.quests.find(quest=>quest.regionId===target.regionId).done=true;c.resources.prestige+=c.tuning.questPrestige;text=`Quest complete. Monster relic and +${c.tuning.questPrestige} Prestige.`;}
  const result={targetId:target.id,regionId:target.regionId,stage:target.stage,risk:target.risk,roll,success,foodCost:target.foodCost,prestigeCost:target.cost,text,...(success&&target.stage==='quest'?{relic:'Monster relic'}:{})};
  c.history.push(result);actor(session).prestige=c.resources.prestige;
  if(!success||target.stage!=='clear')c.selectedTargetId=null;
  return result;
}
