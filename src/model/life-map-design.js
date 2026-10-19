import { VASSAL_NORMAL_NODE_FAMILY_IDS, VASSAL_SIGNATURE_NODE_VARIANTS } from '../defs/gamepieces/vassal-life-map-defs.js';
import { validateLifeMapBalance } from './life-map-balance.js';
import { LIFEGRAPH_DEFAULT_GENERATOR } from '../defs/lifegraph-defaults.js';

export const LIFEGRAPH_RARITIES = Object.freeze(['common', 'uncommon', 'rare']);
export const LIFEGRAPH_TIMINGS = Object.freeze(['early', 'mid', 'late']);
export const LIFEGRAPH_NODE_IDS = Object.freeze([...VASSAL_NORMAL_NODE_FAMILY_IDS, 'stockShop', 'legacy',
  ...Object.keys(VASSAL_SIGNATURE_NODE_VARIANTS).map(id => `signature:${id}`)]);
const clone = value => JSON.parse(JSON.stringify(value));

export function createLifeMapDesign() {
  return clone(LIFEGRAPH_DEFAULT_GENERATOR.design);
}

export function canonicalizeLifeMapDesign(value) {
  const fallback=createLifeMapDesign();
  if (!value || typeof value!=='object' || Array.isArray(value)) return fallback;
  // Current-schema values are retained for validation; malformed imports must not
  // silently become a different, apparently valid experiment.
  return {...fallback,...clone(value)};
}

export function lifeMapScopeMatches(scope, classId) {
  return scope === 'common' || scope === (classId??'unclassed') || scope === 'specialist' && ['scholar','warrior'].includes(classId);
}

export function lifeMapNodeEnabled(design, id, classId, band = null) {
  const rule=design.nodes[id];
  return !!rule?.enabled && lifeMapScopeMatches(rule.scope,classId) && (!band || rule.timings.includes(band));
}

export function lifeMapAllowedScopes(id){
  if(id==='discovery')return ['scholar'];
  if(['campaign','challenge','signature:monsterHunt'].includes(id))return ['warrior'];
  if(['training','classMarket'].includes(id))return ['specialist','scholar','warrior'];
  return ['common','specialist','scholar','warrior','unclassed'];
}

export function validateLifeMapDesign(design, depthCount) {
  const errors=[];
  const fail=message=>errors.push(`design.${message}`);
  if (!design || typeof design!=='object') return ['design: expected an object'];
  if(typeof design.enabled!=='boolean')fail('enabled: expected a boolean');
  const pools=Array.isArray(design.pools)?design.pools:[];
  if(!pools.length||pools.length>24)fail('pools: expected 1–24 families');
  const ids=new Set();
  for(const pool of pools){
    if(!pool||typeof pool!=='object'){fail('pools: expected family objects');continue;}
    if(!/^[a-z][a-zA-Z0-9-]{0,39}$/.test(pool.id)||ids.has(pool.id))fail('pools: unique family ids required');
    ids.add(pool.id);
    if(typeof pool.label!=='string'||!pool.label.trim()||pool.label.length>80)fail(`pools.${pool.id}.label: expected a name`);
    if(!LIFEGRAPH_RARITIES.includes(pool.occurrence))fail(`pools.${pool.id}.occurrence: choose a tier`);
    if(!Number.isInteger(pool.maxConsecutive)||pool.maxConsecutive<1||pool.maxConsecutive>20)fail(`pools.${pool.id}.maxConsecutive: expected 1–20`);
  }
  for(const [key,tiers]of [['occurrence',LIFEGRAPH_RARITIES]])for(const tier of tiers){
    const n=design[key]?.[tier];if(!Number.isFinite(n)||n<=0||n>100)fail(`${key}.${tier}: expected more than 0, up to 100`);
  }
  errors.push(...validateLifeMapBalance(design));
  for(const id of LIFEGRAPH_NODE_IDS){
    const rule=design.nodes?.[id];
    if(!rule||typeof rule.enabled!=='boolean'){fail(`nodes.${id}: enabled must be a boolean`);continue;}
    if(!ids.has(rule.poolId))fail(`nodes.${id}.poolId: unknown family`);
    if(!['common','specialist','scholar','warrior','unclassed'].includes(rule.scope))fail(`nodes.${id}.scope: unknown class`);
    else if(!lifeMapAllowedScopes(id).includes(rule.scope))fail(`nodes.${id}.scope: incompatible with this action’s class rules`);
    if(!LIFEGRAPH_RARITIES.includes(rule.occurrence))fail(`nodes.${id}.occurrence: choose a tier`);
    if(!Array.isArray(rule.timings)||!rule.timings.length||rule.timings.some(t=>!LIFEGRAPH_TIMINGS.includes(t))||new Set(rule.timings).size!==rule.timings.length)fail(`nodes.${id}.timings: select unique timing bands`);
  }
  if(design.nodes?.legacy?.enabled!==true)fail('nodes.legacy: the terminal node must stay enabled');
  const supply=design.stockSupply;
  if(!supply||typeof supply.enabled!=='boolean'||!Number.isInteger(supply.randomCount)||supply.randomCount<0||supply.randomCount>10||!Number.isInteger(supply.unmetCount)||supply.unmetCount<0||supply.unmetCount>10)fail('stockSupply: invalid counts');
  else if(!Number.isInteger(supply.minDepth)||!Number.isInteger(supply.maxDepth)||supply.minDepth<1||supply.maxDepth<supply.minDepth||design.enabled&&supply.enabled&&supply.maxDepth>depthCount)fail('stockSupply: depth range must fit the graph');
  const guarantees=Array.isArray(design.guarantees)?design.guarantees:[];
  if(!Array.isArray(design.guarantees)||guarantees.length>40)fail('guarantees: expected up to 40 rules');
  const ruleIds=new Set();
  for(const g of guarantees){
    if(!g||typeof g!=='object'){fail('guarantees: expected rule objects');continue;}
    if(typeof g.id!=='string'||!g.id||ruleIds.has(g.id))fail('guarantees: unique rule ids required');ruleIds.add(g.id);
    if(!['map','eachRoute'].includes(g.coverage)||!['common','scholar','warrior','specialist','unclassed'].includes(g.scope)||!Number.isInteger(g.count)||g.count<1||g.count>10)fail(`guarantees.${g.id}: invalid coverage, class or count`);
    if(!Number.isInteger(g.minDepth)||!Number.isInteger(g.maxDepth)||g.minDepth<1||g.maxDepth<g.minDepth||design.enabled&&g.maxDepth>depthCount)fail(`guarantees.${g.id}: depth range must fit the graph`);
    if(g.targetType==='pool'?!ids.has(g.targetId):g.targetType!=='node'||!VASSAL_NORMAL_NODE_FAMILY_IDS.includes(g.targetId)&&g.targetId!=='stockShop')fail(`guarantees.${g.id}: unknown target`);
  }
  if(design.enabled&&!errors.length)for(const classId of [null,'scholar','warrior'])for(const band of LIFEGRAPH_TIMINGS){
    if(!VASSAL_NORMAL_NODE_FAMILY_IDS.some(id=>lifeMapNodeEnabled(design,id,classId,band)))fail(`nodes: no random node available for ${classId??'unclassed'} / ${band}`);
  }
  return errors;
}

function weighted(rng, entries, weight) {
  if(!entries.length)return null;
  let roll=rng.nextFloat()*entries.reduce((sum,item)=>sum+weight(item),0);
  for(const item of entries){roll-=weight(item);if(roll<0)return item;}
  return entries.at(-1);
}

// Assign content after topology. Reserved opportunities are never overwritten by
// later class/supply passes. All random choices use the caller's topology stream.
export function populatePooledLifeMap(config, nodes, edges, rng, {classId=null,signatureNode=null,stockOutputs=[],unmetStockOutputs=[]}={}) {
  const design=config.design, byId=new Map(nodes.map(n=>[n.id,n]));
  const randomIds=[...VASSAL_NORMAL_NODE_FAMILY_IDS,'stockShop'];
  const parents=id=>edges.filter(e=>e.toNodeId===id).map(e=>byId.get(e.fromNodeId));
  const poolFor=n=>design.nodes[n.signatureNode?`signature:${n.signatureNode.variantId}`:n.family]?.poolId;
  const eligible=(node,ids=randomIds)=>ids.filter(id=>lifeMapNodeEnabled(design,id,classId,node.band)
    &&!(id==='stockShop'&&!stockOutputs.length)
    &&!edges.some(e=>(e.toNodeId===node.id&&byId.get(e.fromNodeId).family===id
      ||e.fromNodeId===node.id&&byId.get(e.toNodeId).family===id)&&config.nonRepeatFamilyIds.includes(id)));
  const choose=(node,ids)=>{
    const runs=new Map();
    const poolRun=(n,poolId)=>{
      if(!n||poolFor(n)!==poolId)return 0;
      const key=`${n.id}:${poolId}`;if(!runs.has(key))runs.set(key,1+Math.max(0,...parents(n.id).map(p=>poolRun(p,poolId))));
      return runs.get(key);
    };
    const candidates=eligible(node,ids);
    const pools=design.pools.filter(p=>candidates.some(id=>design.nodes[id].poolId===p.id));
    const spaced=pools.filter(p=>parents(node.id).every(n=>poolRun(n,p.id)<p.maxConsecutive));
    const pool=weighted(rng,spaced.length?spaced:pools,p=>design.occurrence[p.occurrence]);
    return pool?weighted(rng,candidates.filter(id=>design.nodes[id].poolId===pool.id),id=>design.occurrence[design.nodes[id].occurrence]):null;
  };
  const assign=(node,family)=>{
    node.family=family;
    if(family==='stockShop')node.stockOutput=stockOutputs[rng.nextInt(0,stockOutputs.length-1)];
    if(family==='relic')node.specialRelic=rng.nextFloat()<0.25;
  };
  const reserve=(node,family,ruleId)=>{assign(node,family);node.generationRuleId=ruleId;};
  if(signatureNode&&lifeMapNodeEnabled(design,`signature:${signatureNode.variantId}`,classId)){
    if(signatureNode.variantId==='legacyPlus')nodes.find(n=>n.family==='legacy').signatureNode=clone(signatureNode);
    else {const rule=design.nodes[`signature:${signatureNode.variantId}`];const candidates=nodes.filter(n=>n.family!=='legacy'&&rule.timings.includes(n.band));if(candidates.length){const preferred=candidates.filter(n=>n.band==='mid'),available=preferred.length?preferred:candidates;const n=available[rng.nextInt(0,available.length-1)];n.family='signature';n.signatureNode=clone(signatureNode);n.generationRuleId='signature';}}
  }
  const matches=(n,g)=>n.depth>=g.minDepth-1&&n.depth<=g.maxDepth-1&&(g.targetType==='node'?n.family===g.targetId:poolFor(n)===g.targetId);
  const minPath=g=>{
    const scores=new Map(),paths=new Map();
    for(const n of nodes){const ps=parents(n.id);const p=ps.sort((a,b)=>(scores.get(a.id)??0)-(scores.get(b.id)??0))[0];scores.set(n.id,(p?scores.get(p.id):0)+(matches(n,g)?1:0));paths.set(n.id,[...(p?paths.get(p.id):[]),n]);}
    const boss=nodes.find(n=>n.family==='legacy');return {count:scores.get(boss.id),path:paths.get(boss.id)};
  };
  // Place the tightest depth windows first so flexible route coverage cannot
  // consume an entire row requested by an exact-depth guarantee.
  const guarantees=design.guarantees.filter(g=>lifeMapScopeMatches(g.scope,classId))
    .sort((a,b)=>(a.maxDepth-a.minDepth)-(b.maxDepth-b.minDepth));
  for(const g of guarantees){
    for(let attempt=0;attempt<nodes.length;attempt++){
      const path=minPath(g),count=g.coverage==='map'?nodes.filter(n=>matches(n,g)).length:path.count;
      if(count>=g.count)break;
      const ids=g.targetType==='node'?[g.targetId]:VASSAL_NORMAL_NODE_FAMILY_IDS.filter(id=>design.nodes[id].poolId===g.targetId).concat(design.nodes.stockShop.poolId===g.targetId?['stockShop']:[]);
      const candidates=(g.coverage==='map'?nodes:path.path).filter(n=>!n.family&&n.depth>=g.minDepth-1&&n.depth<=g.maxDepth-1&&eligible(n,ids).length);
      if(!candidates.length)return {ok:false,reason:'guaranteeImpossible',errors:[`Guarantee “${g.id}” cannot fit this class, timing and graph. Change its range, coverage or enabled nodes.`]};
      const node=candidates[rng.nextInt(0,candidates.length-1)];reserve(node,choose(node,ids),g.id);
    }
  }
  const supply=design.stockSupply;
  if(supply.enabled&&lifeMapNodeEnabled(design,'stockShop',classId)){
    const pool=[...new Set(stockOutputs)].sort(),chosen=[];
    while(chosen.length<supply.randomCount&&pool.length)chosen.push(pool.splice(rng.nextInt(0,pool.length-1),1)[0]);
    const unmet=[...new Set(unmetStockOutputs)].filter(output=>stockOutputs.includes(output)&&!chosen.includes(output)).sort();
    let needed=Math.max(0,supply.unmetCount-chosen.filter(output=>unmetStockOutputs.includes(output)).length);
    while(needed-->0&&unmet.length)chosen.push(unmet.splice(rng.nextInt(0,unmet.length-1),1)[0]);
    for(const output of chosen){
      // Prefer different depths; never silently destroy another guarantee.
      const candidates=nodes.filter(n=>!n.family&&n.depth>=supply.minDepth-1&&n.depth<=supply.maxDepth-1&&eligible(n,['stockShop']).length);
      const spaced=candidates.filter(n=>!nodes.some(other=>other.family==='stockShop'&&Math.abs(other.depth-n.depth)<2));
      const usable=spaced.length?spaced:candidates;
      if(!usable.length)return {ok:false,reason:'supplyImpossible',errors:['Stock Supply cannot fit its depth range without replacing a reserved opportunity.']};
      const target=usable[rng.nextInt(0,usable.length-1)];reserve(target,'stockShop','stockSupply');target.stockOutput=output;
    }
  }
  for(const node of nodes.filter(n=>!n.family)){
    const family=choose(node,randomIds);
    if(!family)return {ok:false,reason:'nodePoolEmpty',errors:[`No enabled node fits ${node.band} depth ${node.depth+1} for ${classId??'unclassed'}.`]};
    assign(node,family);
  }
  return {ok:true};
}
