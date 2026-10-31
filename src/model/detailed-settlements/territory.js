import { getRegionState, getAdjacentRegionIds, getConnectedRegionIds } from '../world-state.js';
import { getDetailedSettlementSites, getDetailedSettlement } from './queries.js';
import { allegianceSummary, populationBins } from './population-ledger.js';
import { stockTotal, planStock, applyStockPlan, structureModifiers } from './stock.js';
import { getCurrentLifeMapVassal } from '../vassal-life-map/selectors.js';
import { creditPrestige } from '../vassal-life-map/treasury.js';
import { emitPracticeEvent } from './practice-events.js';

export const CONTROL_DEFAULTS = Object.freeze({claim:.6,retain:.45,claimChecks:2,lossUnrest:75,lossChecks:2,disloyalPerForce:25,warriorsPerForce:5,warriorsPerMeal:10});
function localMilitarySummary(state,regionId,faction=getRegionState(state,regionId)?.controller,{assumeSupplied=false}={}) {
  const settlement=getDetailedSettlement(state,regionId);
  const warriors=populationBins(settlement).filter(b=>b.kind==='adults'&&b.specialty==='warrior'&&(faction==='frontier'||b.allegiance===faction)).reduce((n,b)=>n+b.count,0);
  const armed=Math.min(warriors,stockTotal(state,settlement,'Arms'));
  const supplied=assumeSupplied||settlement?.garrison?.supplied===true;
  const modifiers=structureModifiers(state,settlement);
  let occupationBonus=0,defenseBonus=0,uncommittedWarriors=warriors;
  for(const m of modifiers) {
    if(m.kind==='occupation'&&armed>0&&uncommittedWarriors>=(m.warriors??1)&&stockTotal(state,settlement,'Arms')>=(m.arms??1)){occupationBonus+=m.amount;uncommittedWarriors-=m.warriors??1;}
    if(m.kind==='localDefense'&&armed>0)defenseBonus+=m.amount;
  }
  for(const b of Object.values(settlement?.politicalForce??{}))if(b.allegiance===faction&&b.untilSec>state.tSec){if(b.defenseOnly)defenseBonus+=b.amount;else occupationBonus+=b.amount;}
  const force=supplied?armed/CONTROL_DEFAULTS.warriorsPerForce+occupationBonus:0;
  return {faction,warriors,armed,supplied,force,defense:supplied?force+defenseBonus:0,upkeep:Math.ceil(armed/CONTROL_DEFAULTS.warriorsPerMeal)};
}
// A source makes at most one explicit adjacent commitment. People/equipment
// allocated there are unavailable to its own holding or a directed campaign.
export function garrisonSupportTargets(state,regionId) {
  const settlement=getDetailedSettlement(state,regionId),holder=getRegionState(state,regionId)?.controller;
  const enabled=structureModifiers(state,settlement).some(m=>m.kind==='networkGarrison'||m.kind==='occupation'&&m.adjacent);
  return !enabled||!['player','external-a'].includes(holder)?[]:getAdjacentRegionIds(state,regionId).filter(id=>getConnectedRegionIds(state,regionId).includes(id)&&getRegionState(state,id)?.controller===holder&&getDetailedSettlement(state,id));
}
function outgoingGarrison(state,regionId,base) {
  const settlement=getDetailedSettlement(state,regionId),target=settlement?.garrison?.supportTargetRegionId;
  if(!base.supplied||!target||!garrisonSupportTargets(state,regionId).includes(target)||!base.armed)return null;
  const mods=structureModifiers(state,settlement),network=mods.some(m=>m.kind==='networkGarrison');
  const warriors=network?base.armed:1;
  const bonus=mods.reduce((n,m)=>n+(m.kind==='occupation'&&m.adjacent?m.amount:0),0);
  return {regionId,target,warriors,force:network?base.force:Math.min(base.force,warriors/CONTROL_DEFAULTS.warriorsPerForce+bonus)};
}
export function militarySummary(state,regionId,faction=getRegionState(state,regionId)?.controller,options={}) {
  const base=localMilitarySummary(state,regionId,faction,options),sent=outgoingGarrison(state,regionId,base);
  const incoming=[];
  for(const id of getAdjacentRegionIds(state,regionId)){
    if(getRegionState(state,id)?.controller!==faction||getDetailedSettlement(state,id)?.garrison?.supportTargetRegionId!==regionId)continue;
    const contribution=outgoingGarrison(state,id,localMilitarySummary(state,id,faction));
    if(contribution?.target===regionId)incoming.push(contribution);
  }
  const receivedForce=incoming.reduce((n,s)=>n+s.force,0),force=Math.max(0,base.force-(sent?.force??0))+receivedForce;
  return {...base,armed:base.armed-(sent?.warriors??0),force,defense:Math.max(0,base.defense-(sent?.force??0))+receivedForce,
    supportTarget:sent?.target??null,sentForce:sent?.force??0,receivedForce,supportSources:incoming};
}
export function assignGarrisonSupport(state,{regionId,targetRegionId=null}={}) {
  if(!state.rulesetId||getRegionState(state,regionId)?.controller!=='player')return {ok:false,reason:'garrisonUnavailable'};
  if(targetRegionId!==null&&!garrisonSupportTargets(state,regionId).includes(targetRegionId))return {ok:false,reason:'supportTargetUnavailable'};
  const settlement=getDetailedSettlement(state,regionId);
  settlement.garrison??={supplied:false};settlement.garrison.supportTargetRegionId=targetRegionId;
  emitPracticeEvent(state,{kind:'garrisonAssigned',regionId,targetRegionId,faction:'player'});
  return {ok:true};
}
export function controlSummary(state,regionId) {
  const region=getRegionState(state,regionId),settlement=getDetailedSettlement(state,regionId);
  const support=allegianceSummary(settlement),total=Object.values(support).reduce((n,c)=>n+c,0),loyal=support[region?.controller]??0;
  const disloyal=total-loyal,share=total?loyal/total:0,military=militarySummary(state,regionId);
  const required=Math.ceil(disloyal/CONTROL_DEFAULTS.disloyalPerForce);
  const supported=total>0&&share>=CONTROL_DEFAULTS.retain;
  const occupied=total>0&&military.armed>0&&military.force>=required;
  const unrest=settlement?.control?.unrest??0;
  return {holder:region?.controller,support,total,loyal,disloyal,share,required,...military,unrest,supported,occupied,
    status:supported?'supported':occupied?'occupied':'contested',targetUnrest:supported?0:occupied?25+50*disloyal/Math.max(1,total):100};
}
export function availableMilitaryWarriors(state,regionId,faction=getRegionState(state,regionId)?.controller) {
  const support=controlSummary(state,regionId),military=militarySummary(state,regionId,faction);
  const reserved=support.holder===faction&&!support.supported?Math.ceil(support.required*CONTROL_DEFAULTS.warriorsPerForce):0;
  return Math.max(0,military.armed-reserved);
}
export function changeController(state,regionId,faction,{military=false}={}) {
  const region=getRegionState(state,regionId),settlement=getDetailedSettlement(state,regionId);
  if(!settlement||region.controller===faction)return;
  const previous=region.controller;region.controller=faction;
  const control=settlement.control??={unrest:0};
  control.unrest=military?Math.max(50,control.unrest):Math.max(0,control.unrest-20);
  control.claimant=null;control.claimChecks=0;control.lossChecks=0;
  emitPracticeEvent(state,{kind:'controlChanged',regionId,previousController:previous,faction,military});
}
export function resolveControl(state) {
  if(!state.rulesetId)return;
  const snapshots=getDetailedSettlementSites(state).map(s=>({site:s,summary:controlSummary(state,s.regionId)}));
  const transfers=[];
  for(const {site,summary:s} of snapshots) {
    const c=site.detailedState.control??={unrest:0,claimChecks:0,lossChecks:0};
    c.unrest=Math.max(0,Math.min(100,c.unrest+Math.max(-10,Math.min(15,s.targetUnrest-c.unrest))));
    const claimant=Object.keys(s.support).sort().find(f=>f!=='neutral'&&f!==s.holder&&s.support[f]/s.total>=CONTROL_DEFAULTS.claim);
    c.claimChecks=claimant&&!(s.occupied&&s.holder!=='frontier')?(c.claimant===claimant?c.claimChecks+1:1):0;
    c.claimant=claimant??null;
    c.lossChecks=!s.supported&&!s.occupied&&c.unrest>=75?(c.lossChecks??0)+1:0;
    if(!s.total)transfers.push([site.regionId,'frontier']);
    else if(c.claimChecks>=2)transfers.push([site.regionId,claimant]);
    else if(c.lossChecks>=2)transfers.push([site.regionId,'frontier']);
  }
  for(const [id,faction] of transfers)changeController(state,id,faction);
  if(!getDetailedSettlementSites(state,{playerOnly:true}).length){state.runStatus={complete:true,reason:'territorialLoss',year:state.year,tSec:state.tSec};state.paused=true;}
}
export function payGarrisonUpkeep(state) {
  if(!state.rulesetId)return;
  const pending = [];
  // Preserve every garrison's local priority before holder-allied shared retries.
  const pay = ({settlement,cost}, localOnly) => {
    const plan=planStock(state,settlement,cost?[{traits:['Edible'],amount:cost}]:[],[],null,false,localOnly);
    const supplied=plan.ok&&applyStockPlan(state,settlement,plan);
    settlement.garrison={...settlement.garrison,supplied,paid:supplied?cost:0,required:cost,tSec:state.tSec};
    return supplied;
  };
  for(const site of getDetailedSettlementSites(state)) {
    const settlement=site.detailedState,m=localMilitarySummary(state,site.regionId);
    const extra=structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='garrisonUpkeep'?m.amount:0),0);
    const cost=m.upkeep+extra;
    const payment = {settlement,cost};
    if(!pay(payment,true))pending.push(payment);
  }
  for(const payment of pending)pay(payment,false);
}
export function accrueTerritorialPrestige(state,tSec) {
  if(!state.rulesetId)return;
  const treasury=state.civilization.treasury;
  const elapsed=Math.max(0,tSec-treasury.lastSec);treasury.lastSec=tSec;
  const rate=getDetailedSettlementSites(state,{playerOnly:true}).reduce((n,s)=>n+(populationBins(s.detailedState).length?1-(s.detailedState.control?.unrest??0)/100:0),0);
  const amount=treasury.remainder+elapsed*rate/(state.seasonDurationSec*state.seasons.length);
  const paid=Math.floor(amount+1e-9);treasury.remainder=amount-paid;
  if(paid){creditPrestige(state,getCurrentLifeMapVassal(state),paid);emitPracticeEvent(state,{kind:'prestigeIncome',faction:'player',amount:paid,source:'territory'});}
}
