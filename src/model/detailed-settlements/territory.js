import { transitionTown } from './neutral-market.js';
import { getRegionState, getAdjacentRegionIds, getConnectedRegionIds } from '../world-state.js';
import { getDetailedSettlementSites, getDetailedSettlement } from './queries.js';
import { allegianceSummary, populationBins } from './population-ledger.js';
import { stockTotal, planStock, applyStockPlan, structureModifiers } from './stock.js';
import { getCurrentLifeMapVassal } from '../vassal-life-map/selectors.js';
import { emitPracticeEvent } from './practice-events.js';
import { getGameSetting } from '../game-config.js';
import { unrestSummary, secondsPerYear } from './unrest.js';
import { cancelMoonMigrationForRegion } from './phases/migration.js';

export const CONTROL_DEFAULTS = Object.freeze({claim:.75,retain:.70,claimChecks:2,unaffiliatedPerForce:10,rivalCiviliansPerForce:5,warriorsPerForce:1});
export function occupationResistance(settlement,holder) {
  let unaffiliated=0,rivalCivilians=0,rivalWarriors=0;
  for(const b of populationBins(settlement)) {
    if(b.allegiance===holder)continue;
    if(b.allegiance==='neutral')unaffiliated+=b.count;
    else if(b.specialty==='warrior'&&b.kind!=='children')rivalWarriors+=b.count;
    else rivalCivilians+=b.count;
  }
  // Integer tenths keep exact thresholds (e.g. 90 neutral residents = 9).
  const scale=CONTROL_DEFAULTS.unaffiliatedPerForce;
  const units=unaffiliated+rivalCivilians*(scale/CONTROL_DEFAULTS.rivalCiviliansPerForce)+rivalWarriors*scale;
  return {unaffiliated,rivalCivilians,rivalWarriors,units,required:Math.ceil(units/scale)};
}
// Counterfactual population pressure uses the current non-loyal mix. Force has
// diminishing leverage: required allegiance = retain / (1 + Force / pressure).
// With no opposition yet, use unaffiliated resistance for the counterfactual.
function holdingPressure(total,{disloyal=total,units=total}={}) {
  return total*(disloyal>0?units/disloyal:1)/CONTROL_DEFAULTS.unaffiliatedPerForce;
}
export function minimumHoldingShare(total,force,composition) {
  if(total<=0)return 0;
  return CONTROL_DEFAULTS.retain/(1+Math.max(0,force)/holdingPressure(total,composition));
}
export function minimumHoldingAllegiance(total,force,composition) {
  return total>0?Math.max(1,Math.ceil(total*minimumHoldingShare(total,force,composition)-1e-9)):0;
}
export function minimumHoldingForce(total,loyal,composition) {
  if(total<=0)return 0;
  if(loyal<=0)return null;
  return Math.max(0,holdingPressure(total,composition)*(CONTROL_DEFAULTS.retain*total/loyal-1));
}
function localMilitarySummary(state,regionId,faction=getRegionState(state,regionId)?.controller,{assumeSupplied=false}={}) {
  const settlement=getDetailedSettlement(state,regionId);
  const market=state.world.sites.find(s=>s.regionId===regionId)?.neutral;
  if(market)return {faction,warriors:0,adultWarriors:0,warriorForce:0,bonusForce:0,supplied:false,force:0,defense:market.defense,upkeep:0};
  const eligible=populationBins(settlement).filter(b=>b.kind!=='children'&&b.specialty==='warrior'&&(faction==='frontier'||b.allegiance===faction));
  const warriors=eligible.reduce((n,b)=>n+b.count,0),adultWarriors=eligible.filter(b=>b.kind==='adults').reduce((n,b)=>n+b.count,0);
  const armed=Math.min(warriors,stockTotal(state,settlement,'Arms'));
  const supplied=assumeSupplied||settlement?.garrison?.supplied===true;
  const modifiers=structureModifiers(state,settlement);
  let occupationBonus=0,defenseBonus=0,uncommittedWarriors=warriors;
  for(const m of modifiers) {
    if(m.kind==='occupation'&&armed>0&&uncommittedWarriors>=(m.warriors??1)&&stockTotal(state,settlement,'Arms')>=(m.arms??1)){occupationBonus+=m.amount;uncommittedWarriors-=m.warriors??1;}
    if(m.kind==='localDefense'&&armed>0)defenseBonus+=m.amount;
  }
  for(const b of Object.values(settlement?.politicalForce??{}))if(b.allegiance===faction&&b.untilSec>state.tSec){if(b.defenseOnly)defenseBonus+=b.amount;else occupationBonus+=b.amount;}
  const warriorForce=warriors/CONTROL_DEFAULTS.warriorsPerForce,bonusForce=supplied?occupationBonus:0,force=warriorForce+bonusForce;
  const upkeep=modifiers.reduce((n,m)=>n+(m.kind==='garrisonUpkeep'?m.amount:0),0);
  return {faction,warriors,adultWarriors,warriorForce,bonusForce,supplied,force,defense:force+(supplied?defenseBonus:0),upkeep};
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
  if(!target||!garrisonSupportTargets(state,regionId).includes(target)||!base.warriors)return null;
  const mods=structureModifiers(state,settlement),network=mods.some(m=>m.kind==='networkGarrison');
  const warriors=network?base.warriors:1;
  const bonus=base.supplied?mods.reduce((n,m)=>n+(m.kind==='occupation'&&m.adjacent?m.amount:0),0):0;
  return {regionId,target,warriors,adultWarriors:Math.min(base.adultWarriors,warriors),force:network?base.force:Math.min(base.force,warriors/CONTROL_DEFAULTS.warriorsPerForce+bonus)};
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
  const availableWarriors=base.warriors-(sent?.warriors??0),availableAdultWarriors=base.adultWarriors-(sent?.adultWarriors??0);
  const warriorForce=availableWarriors/CONTROL_DEFAULTS.warriorsPerForce;
  return {...base,availableWarriors,availableAdultWarriors,warriorForce,bonusForce:Math.max(0,force-warriorForce-receivedForce),force,defense:Math.max(0,base.defense-(sent?.force??0))+receivedForce,
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
  const resistance=occupationResistance(settlement,region?.controller),composition={disloyal,units:resistance.units};
  const required=minimumHoldingForce(total,loyal,composition);
  const supported=total>0&&share>=CONTROL_DEFAULTS.retain;
  const minimumShare=minimumHoldingShare(total,military.force,composition);
  const minimumLoyal=minimumHoldingAllegiance(total,military.force,composition);
  const occupied=total>0&&military.force>0&&loyal>=minimumLoyal;
  const unrest=unrestSummary(state,settlement);
  return {holder:region?.controller,support,total,loyal,disloyal,share,required,resistance,...military,minimumLoyal,minimumShare,unrest,supported,occupied,
    status:unrest?'unrest':region?.controller==='frontier'?'unheld':supported?'supported':occupied?'occupied':'contested'};
}
export function availableMilitaryWarriors(state,regionId,faction=getRegionState(state,regionId)?.controller) {
  const support=controlSummary(state,regionId),military=militarySummary(state,regionId,faction);
  const otherForce=Math.max(0,military.force-military.availableAdultWarriors);
  const reserved=support.holder===faction&&!support.supported?(support.required===null?military.availableAdultWarriors:Math.ceil(Math.max(0,support.required-otherForce))):0;
  return Math.max(0,military.availableAdultWarriors-reserved);
}
export function changeController(state,regionId,faction,{military=false}={}) {
  const region=getRegionState(state,regionId),settlement=getDetailedSettlement(state,regionId);
  if(!settlement||region.controller===faction)return;
  const previous=region.controller;region.controller=faction;
  transitionTown(state,state.world.sites.find(s=>s.regionId===regionId),faction);
  const control=settlement.control??={unrest:null};
  control.unrest=null;
  control.claimant=null;control.claimChecks=0;
  emitPracticeEvent(state,{kind:'controlChanged',regionId,previousController:previous,faction,military});
}
// Keep the developed board active during disorder. Ordinary unheld towns still
// use their storefront lifecycle, which begins only when the episode expires.
function beginUnrest(state,site) {
  const region=getRegionState(state,site.regionId),previousController=region.controller;
  region.controller='frontier';
  const control=site.detailedState.control;
  control.unrest={startedSec:state.tSec,untilSec:state.tSec+getGameSetting(state,'unrestDurationYears')*secondsPerYear(state),previousController};
  control.claimant=null;control.claimChecks=0;
  (site.detailedState.garrison??={}).supportTargetRegionId=null;
  emitPracticeEvent(state,{kind:'controlChanged',regionId:site.regionId,previousController,faction:'frontier',military:false});
  emitPracticeEvent(state,{kind:'unrestStarted',regionId:site.regionId,previousController,untilSec:control.unrest.untilSec});
}

export function stepUnrest(state) {
  if(!state.rulesetId)return;
  for(const site of getDetailedSettlementSites(state)) {
    const episode=site.detailedState.control?.unrest;
    if(!episode)continue;
    const elapsed=Math.max(0,Math.min(state.tSec,episode.untilSec)-Math.max(state.tSec-1,episode.startedSec));
    state.civilization.chaos.pendingUnrestIncome=(state.civilization.chaos.pendingUnrestIncome??0)
      +elapsed*getGameSetting(state,'unrestChaosPerYear')/secondsPerYear(state);
    if(state.tSec>=episode.untilSec) {
      cancelMoonMigrationForRegion(state,site.regionId);
      site.detailedState.control.unrest=null;
      site.detailedState.control.claimant=null;site.detailedState.control.claimChecks=0;
      transitionTown(state,site,'frontier');
      emitPracticeEvent(state,{kind:'unrestEnded',regionId:site.regionId});
    }
  }
}
export function resolveControl(state) {
  if(!state.rulesetId)return;
  const snapshots=getDetailedSettlementSites(state).map(s=>({site:s,summary:controlSummary(state,s.regionId)}));
  const transfers=[];
  for(const {site,summary:s} of snapshots) {
    const c=site.detailedState.control??={unrest:null,claimChecks:0};
    if(c.unrest)continue;
    if(s.holder!=='frontier'&&s.total>0&&!s.supported&&!s.occupied){beginUnrest(state,site);continue;}
    const claimant=Object.keys(s.support).sort().find(f=>f!=='neutral'&&f!==s.holder&&s.support[f]/s.total>=CONTROL_DEFAULTS.claim);
    c.claimChecks=claimant&&!(s.occupied&&s.holder!=='frontier')?(c.claimant===claimant?c.claimChecks+1:1):0;
    c.claimant=claimant??null;
    if(!s.total)transfers.push([site.regionId,'frontier']);
    else if(c.claimChecks>=2)transfers.push([site.regionId,claimant]);
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
    if(site.neutral)continue;
    const settlement=site.detailedState,m=localMilitarySummary(state,site.regionId);
    const cost=m.upkeep;
    const payment = {settlement,cost};
    if(!pay(payment,true))pending.push(payment);
  }
  for(const payment of pending)pay(payment,false);
}
