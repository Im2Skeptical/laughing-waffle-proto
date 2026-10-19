import { createAuthoredVassalLifeMapGeneratorConfig, generateVassalLifeMap, validateVassalLifeMapGeneratorConfig } from '../vassal-life-map-generator.js';
import { createRng } from '../rng.js';
import { getVassalStockOutputIds, VASSAL_NODE_FAMILIES, VASSAL_SIGNATURE_NODE_VARIANTS } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { getVassalShopCandidatePool } from '../vassal-life-map/shop.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../game-config.js';
import { VASSAL_INTERVENTION_PRACTICE_IDS } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { getCurrentLifeMapVassal, enterVassalLifeNode } from '../vassal-life-map.js';
import { getOwnedHeirloomDefinitionIds } from '../vassal-life-map/heirlooms.js';
import { getRelicPoolAppearance } from '../vassal-life-map/relic-pools.js';
import { getStockShopGenerationContext } from '../vassal-life-map/stock-shops.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { LIFEGRAPH_NODE_IDS, lifeMapAllowedScopes, lifeMapScopeMatches } from '../life-map-design.js';
import { getLifeMapOptionSpecs, LIFEGRAPH_SHOP_SERVICE_SPECS, lifeMapOptionKey, lifeMapDesignNodeId, getLifeMapBalanceValue, lifeMapPhasesPerYear } from '../life-map-balance.js';
import { LIFEGRAPH_PREVIOUS_GENERATOR } from '../../defs/lifegraph-defaults.js';
import { getVassalActionPhaseCost, getAdjustedVassalPrestigeCost } from '../vassal-life-map/selectors.js';
import { getVassalRiskDeathChance } from '../vassal-life-map/class-rules.js';
import { getActionMonsterPressureCost } from '../detailed-settlements/practice-events.js';

export const LIFEGRAPH_STORAGE_KEY='civsurvivor.lifegraph-workbench.v1';
export const LIFEGRAPH_PRESETS_KEY='civsurvivor.lifegraph-workbench.presets.v1';
export const LIFEGRAPH_DRAFT_SCHEMA=1;
const clone=value=>JSON.parse(JSON.stringify(value));

export function createLifegraphDraft(){
  const generatorConfig=createAuthoredVassalLifeMapGeneratorConfig();
  generatorConfig.design.enabled=true;
  return {schemaVersion:LIFEGRAPH_DRAFT_SCHEMA,kind:'lifegraph-workbench',name:'Lifegraph experiment',generatorConfig,
    preview:{classId:'scholar',founding:false,seed:1,research:0,prestige:100,age:18,stats:4,signature:'none'},reviews:{}};
}
export function createPreviousLifegraphDraft(){return {...createLifegraphDraft(),name:'Previous defaults',generatorConfig:clone(LIFEGRAPH_PREVIOUS_GENERATOR)};}

export function validateLifegraphDraft(value){
  const errors=[];
  if(value?.schemaVersion!==LIFEGRAPH_DRAFT_SCHEMA||value?.kind!=='lifegraph-workbench')return ['Expected a current Lifegraph workbench export.'];
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>120)errors.push('Give this experiment a name (up to 120 characters).');
  errors.push(...validateVassalLifeMapGeneratorConfig(value.generatorConfig).errors);
  const p=value.preview;
  if(!p||!['scholar','warrior','unclassed'].includes(p.classId))errors.push('Choose a preview class.');
  if(typeof p?.founding!=='boolean'||p.founding&&p.classId==='unclassed')errors.push('Founding previews require Scholar or Warrior.');
  for(const [key,max]of [['seed',4294967295],['research',1000000],['prestige',10000],['age',100],['stats',100]])if(!Number.isInteger(p?.[key])||p[key]<0||p[key]>max)errors.push(`Preview ${key} must be an integer from 0 to ${max}.`);
  if(p?.signature!=='none'&&!VASSAL_SIGNATURE_NODE_VARIANTS[p?.signature])errors.push('Unknown signature.');
  if(!value.reviews||typeof value.reviews!=='object'||Array.isArray(value.reviews))errors.push('Invalid review notes.');
  else for(const [id,r]of Object.entries(value.reviews))if(!LIFEGRAPH_NODE_IDS.includes(id)||!r||typeof r.notes!=='string'||r.notes.length>20000||!['open','resolved'].includes(r.status))errors.push(`Invalid review for ${id}.`);
  return errors;
}

export const nodeDesignId=lifeMapDesignNodeId;
export function lifegraphNodeLabel(id){return id.startsWith('signature:')?VASSAL_SIGNATURE_NODE_VARIANTS[id.slice(10)]?.label:VASSAL_NODE_FAMILIES[id]?.label??id;}

// Reuse one captured fixture; graph batches never initialize hundreds of worlds.
// The fixture and every open decision remain disposable model states.
export function createLifegraphPreviewState(baseState,draft){
  const state=deserializeGameState(serializeGameState(baseState));
  state.gameConfig.lifeMapGenerator=clone(draft.generatorConfig);
  state.civilization.research.total=draft.preview.research;
  const vassal=getCurrentLifeMapVassal(state),p=draft.preview;
  vassal.classId=p.classId==='unclassed'?null:p.classId;vassal.founderClassId=p.founding?vassal.classId:null;
  vassal.archetype=vassal.classId??'Unclassed';vassal.prestige=p.prestige;vassal.initialAge=p.age;
  vassal.stats=Object.fromEntries(Object.keys(vassal.stats).map(key=>[key,p.stats]));
  vassal.commission=null;vassal.commissionOffers=[];vassal.developmentChoiceQueue=[];
  state.rng.vassalSeed=p.seed;state.rng.vassalDevelopmentSeed=p.seed;state.rng.vassalLifeMapSeed=p.seed;
  return state;
}

export function generateLifegraphPreview(state,draft,seed=draft.preview.seed){
  const vassal=getCurrentLifeMapVassal(state),signature=draft.preview.signature;
  const context=getStockShopGenerationContext(state,vassal);
  const result=generateVassalLifeMap(draft.generatorConfig,createRng(seed),{graphId:`lifegraph-${draft.preview.classId}-${seed}`,generationSeed:seed,
    classId:vassal.classId,founderClassId:draft.preview.founding?vassal.classId:null,signatureNode:signature==='none'?null:{...VASSAL_SIGNATURE_NODE_VARIANTS[signature],variantId:signature},...context});
  return result;
}

export function openLifegraphNode(state,graph,nodeId,settings){
  const next=deserializeGameState(serializeGameState(state)),vassal=getCurrentLifeMapVassal(next);
  const target=graph.nodes.find(n=>n.id===nodeId);
  if(vassal.founderClassId){
    const lineage=next.civilization.vassalLineage;
    const founding=graph.nodes.find(n=>n.id===graph.foundingNodeId),established=founding&&target.depth>founding.depth;
    vassal.classId=established?vassal.founderClassId:null;
    vassal.archetype=vassal.founderClassId==='scholar'?'Philosopher':'Warlord';
    lineage.founderClassId=vassal.founderClassId;lineage.establishedClassId=vassal.classId;lineage.pendingCandidates=[];
    if(!vassal.classId){vassal.commission=null;vassal.commissionOffers=[];}
  }
  vassal.lifeMap={graph:clone(graph),currentNodeId:null,completedNodeIds:[],availableNodeIds:[nodeId],nodeStates:{},pendingResolution:null};
  vassal.commissionOffers=[];
  const result=enterVassalLifeNode(next,nodeId);
  if(!result.ok)throw new Error(result.reason);
  return {state:next,nodeId,settings:{...settings,type:graph.nodes.find(n=>n.id===nodeId).family}};
}

export function openLifegraphNodeType(state,graph,designId,settings){
  const classId=getCurrentLifeMapVassal(state).classId;
  if(!lifeMapAllowedScopes(designId).some(scope=>lifeMapScopeMatches(scope,classId)))throw new Error('Switch to the compatible class to play this node type.');
  const copy=clone(graph),variant=designId.startsWith('signature:')?VASSAL_SIGNATURE_NODE_VARIANTS[designId.slice(10)]:null;
  const family=variant?variant.id==='legacyPlus'?'legacy':'signature':designId==='specialRelic'?'relic':designId;
  if(family==='legacy'&&!copy.bossNodeId){
    const depth=copy.generatorConfig.normalDepthCount,min=Math.min(...copy.nodes.map(n=>n.depth));
    copy.generatorConfig.design.bookends.legacy={enabled:true,depth:'end'};
    copy.bossNodeId='life-isolated-legacy';
    for(const n of copy.nodes){n.position.x*=(depth-1-min)/(depth-min);if(n.depth===depth-1)copy.edges.push({fromNodeId:n.id,toNodeId:copy.bossNodeId});}
    copy.nodes.push({id:copy.bossNodeId,depth,lane:Math.floor((copy.generatorConfig.laneCount-1)/2),band:'legacy',family:'legacy',bookend:'legacy',generationRuleId:'legacy',position:{x:1,y:.5}});
  }
  const target=copy.nodes.find(n=>nodeDesignId(n)===designId)??(family==='legacy'?copy.nodes.find(n=>n.family==='legacy'):family==='signature'?copy.nodes.find(n=>n.family==='signature'):null)
    ??copy.nodes.find(n=>!n.signatureNode&&!n.bookend&&!n.milestoneId&&n.family!=='legacy'&&!copy.edges.some(e=>(e.fromNodeId===n.id&&nodeDesignId(copy.nodes.find(x=>x.id===e.toNodeId))===designId||e.toNodeId===n.id&&nodeDesignId(copy.nodes.find(x=>x.id===e.fromNodeId))===designId)&&copy.generatorConfig.nonRepeatFamilyIds.includes(designId)));
  if(!target)throw new Error('No suitable node slot for this isolated type preview.');
  if(nodeDesignId(target)===designId)return openLifegraphNode(state,copy,target.id,settings);
  target.family=family;delete target.signatureNode;delete target.specialRelic;delete target.generationRuleId;delete target.stockOutput;
  if(variant)target.signatureNode={...variant,variantId:variant.id};
  if(family==='relic')target.specialRelic=designId==='specialRelic';
  if(family==='stockShop')target.stockOutput='Timber';
  return openLifegraphNode(state,copy,target.id,settings);
}

export function getLifegraphChoiceReview(state,graph,designId,settings){
  let scenario=null,error='';
  try{scenario=openLifegraphNodeType(state,graph,designId,settings);}catch(e){error=e.message;}
  const vassal=scenario?getCurrentLifeMapVassal(scenario.state):getCurrentLifeMapVassal(state);
  const node=scenario?vassal.lifeMap.nodeStates[scenario.nodeId]:null,design=state.gameConfig.lifeMapGenerator.design;
  const relicPool=['relic','specialRelic'].includes(designId)?getRelicPoolAppearance(design,designId,getOwnedHeirloomDefinitionIds(scenario?.state??state,vassal)):null;
  return {error,relicPool,offers:relicPool?(node?.options??[]).filter(option=>option.definitionId).map(option=>({id:option.definitionId,label:option.label,quality:option.quality})):null,choices:getLifeMapOptionSpecs(designId).map(spec=>{
    const option=node?.options.find(option=>lifeMapOptionKey(node,option)===spec.id);
    const shared=LIFEGRAPH_SHOP_SERVICE_SPECS.some(s=>s.id===spec.id);
    const rule=shared?design.shopServices[spec.id]:design.optionCosts[designId][spec.id];
    const base=Object.fromEntries(['time','prestige','risk','monsterPressure'].map(kind=>[kind,rule[kind]==='calculated'?(kind==='risk'?(option?.risk??0)/100:getActionMonsterPressureCost(option)):getLifeMapBalanceValue(design,kind,rule[kind]??'free')]));
    const effects=[];
    if(spec.description)effects.push(spec.description);
    if(option?.description)effects.push(option.description);
    if(option?.statDelta)effects.push(`${option.statDelta>0?'+':''}${option.statDelta} ${option.statLabel??option.statId}`);
    if(option?.lossStatDelta)effects.push(`${option.lossStatDelta} ${option.lossStatLabel??option.lossStatId}`);
    if(option?.prestigeDelta)effects.push(`${option.prestigeDelta>0?'+':''}${option.prestigeDelta} Prestige`);
    if(option?.classAction?.research)effects.push(`+${option.classAction.research} Research before class bonuses`);
    const phases=option?.mode&&!design.enabled?option.phaseCost:getVassalActionPhaseCost(vassal,option?.phaseCost??0,{nodeState:node,isTravel:!!option?.locationRegionId});
    const preview=option?{years:phases/lifeMapPhasesPerYear(state),prestige:getAdjustedVassalPrestigeCost(vassal,option.prestigeCost??0),risk:option.mode?(option.risk??0)/100:getVassalRiskDeathChance(vassal,option.immediateDeathChance??0),monsterPressure:getActionMonsterPressureCost(option)}:null;
    return {id:spec.id,label:spec.label,sampleLabel:option?.label??'',riskLabel:['campaign','signature:monsterHunt'].includes(designId)?'Defeat risk':'Death risk',costKinds:spec.costKinds??['time','prestige','risk','monsterPressure'],effects,rule,base,preview,available:!!option,shared};
  })};
}

export function diagnoseLifegraph(graph){
  const byId=new Map(graph.nodes.map(n=>[n.id,n])),design=graph.generatorConfig.design;
  const finalDepth=Math.max(...graph.nodes.map(n=>n.depth));
  const isShop=n=>['practiceReform','publicWorks','neutralMarket','classMarket','foodShop','housingShop','stockShop'].includes(n.family)||n.signatureNode?.groupId==='tagShop';
  const families=Object.fromEntries(LIFEGRAPH_NODE_IDS.map(id=>[id,{count:0,early:0,mid:0,late:0,minOnRoute:0,maxOnRoute:0}]));
  const warnings=[];let longestShopRun=0;
  const run=new Map();
  const extrema=predicate=>{
    const min=new Map(),max=new Map();
    for(const n of graph.nodes){const parents=graph.edges.filter(e=>e.toNodeId===n.id).map(e=>e.fromNodeId);const hit=predicate(n)?1:0;
      min.set(n.id,hit+(parents.length?Math.min(...parents.map(id=>min.get(id))):0));max.set(n.id,hit+(parents.length?Math.max(...parents.map(id=>max.get(id))):0));}
    const terminals=graph.nodes.filter(n=>!graph.edges.some(e=>e.fromNodeId===n.id));
    return {min:Math.min(...terminals.map(n=>min.get(n.id))),max:Math.max(...terminals.map(n=>max.get(n.id)))};
  };
  for(const node of graph.nodes){
    const id=nodeDesignId(node),row=families[id];if(row){row.count++;if(node.band in row)row[node.band]++;}
    const parents=graph.edges.filter(e=>e.toNodeId===node.id).map(e=>e.fromNodeId);
    run.set(node.id,isShop(node)?1+Math.max(0,...parents.map(id=>run.get(id))):0);longestShopRun=Math.max(longestShopRun,run.get(node.id));
    if(node.depth<finalDepth&&!graph.edges.some(e=>e.fromNodeId===node.id))warnings.push({code:'deadEnd',nodeId:node.id,message:`${node.id} has no onward route.`});
  }
  for(const [id,row]of Object.entries(families)){const range=extrema(n=>nodeDesignId(n)===id);row.minOnRoute=range.min;row.maxOnRoute=range.max;}
  if(longestShopRun>=3)warnings.push({code:'shopCluster',message:`A route contains ${longestShopRun} consecutive shops.`});
  for(const id of ['practiceReform','publicWorks','foodShop','housingShop'])if(!families[id].count)warnings.push({code:'missingFamily',designId:id,message:`No ${lifegraphNodeLabel(id)} on this graph.`});
  const supply=extrema(n=>n.family==='stockShop');
  if(supply.min===0)warnings.push({code:'supplyAvoidable',message:'A complete route avoids all Stock Supply shops.'});
  const stockDepths=graph.nodes.filter(n=>n.family==='stockShop').map(n=>n.depth);
  if(new Set(stockDepths).size<stockDepths.length)warnings.push({code:'exclusiveSupply',message:'Stock Supply outputs share a depth and cannot all be visited.'});
  if(design.enabled)for(const pool of design.pools){let longest=0;const runs=new Map();for(const n of graph.nodes){const ps=graph.edges.filter(e=>e.toNodeId===n.id).map(e=>e.fromNodeId);const count=design.nodes[nodeDesignId(n)]?.poolId===pool.id?1+Math.max(0,...ps.map(id=>runs.get(id))):0;runs.set(n.id,count);longest=Math.max(longest,count);}if(longest>pool.maxConsecutive)warnings.push({code:'poolSpacing',message:`${pool.label}: longest run ${longest} exceeds preferred maximum ${pool.maxConsecutive}. Guarantees or thin pools can force this.`});}
  return {families,longestShopRun,shopRange:extrema(isShop),stockRange:supply,warnings};
}

// Exact shared inventory eligibility, before random sampling and quality rolls.
// Counts are distinct eligible cards, never a count of generated offers.
export function diagnoseLifegraphCardPools(state){
  const vassal=getCurrentLifeMapVassal(state),rows=[];
  const add=(id,label,nodeState,options)=>{
    const cards=getVassalShopCandidatePool(state,vassal,nodeState,options).filter(c=>nodeState.family!=='neutralMarket'||c.pool==='common').filter(c=>nodeState.family!=='classMarket'||c.pool===vassal.classId)
      .map(c=>({...c,label:(c.kind==='practice'?getDetailedPracticeDef(state,c.definitionId):getDetailedStructureDef(state,c.definitionId)).label}));
    rows.push({id,label,count:cards.length,common:cards.filter(c=>c.pool==='common').length,specific:cards.filter(c=>c.pool===vassal.classId).length,status:cards.length===0?'empty':cards.length<3?'thin':'varied',cards});
  };
  const eligible=VASSAL_INTERVENTION_PRACTICE_IDS.map(id=>getDetailedPracticeDef(state,id)).filter(d=>d&&!d.locked&&['common',vassal.classId].includes(d.pool));
  const stateFor=family=>({family,purchasedOffers:[]});
  add('practice:random','Practice · Random',stateFor('practiceReform'),{kind:'practice'});
  add('practice:Food','Practice · Food',stateFor('practiceReform'),{kind:'practice',specialty:'Food'});
  for(const output of getVassalStockOutputIds(eligible))add(`stock:${output}`,`Practice · ${output}`,stateFor('stockShop'),{kind:'practice',stockOutput:output});
  for(const tag of ['Food','Housing','Knowledge'])add(`tag:${tag}`,`Mixed shop · ${tag}`,stateFor('foodShop'),{requiredTag:tag});
  for(const category of ['Housing','Stock','Special'])add(`structure:${category}`,`Structure · ${category}`,{...stateFor('publicWorks'),shopSelection:{selectedTag:category}},{kind:'structure'});
  for(const family of vassal.classId?['neutralMarket','classMarket']:['neutralMarket'])add(family,lifegraphNodeLabel(family),stateFor(family),{});
  for(const id of ['relic','specialRelic']){
    const cards=getRelicPoolAppearance(state.gameConfig.lifeMapGenerator.design,id,getOwnedHeirloomDefinitionIds(state,vassal))
      .filter(row=>row.available).map(row=>({...row,kind:'Relic',pool:row.quality}));
    rows.push({id,label:lifegraphNodeLabel(id),relicPool:true,count:cards.length,common:0,specific:0,status:cards.length===0?'empty':cards.length<3?'thin':'varied',cards});
  }
  return rows;
}
