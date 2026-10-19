import { VASSAL_PATRONAGE_OPTIONS, VASSAL_DEVELOPMENT_OPTIONS } from '../defs/gamepieces/vassal-life-map-defs.js';

export const LIFEGRAPH_COST_TIERS = Object.freeze(['cheap','fair','expensive']);
export const LIFEGRAPH_COST_CHOICES = Object.freeze(['free',...LIFEGRAPH_COST_TIERS]);
export const LIFEGRAPH_CARD_QUALITIES = Object.freeze(['bronze','silver','gold','diamond']);
export const LIFEGRAPH_SHOP_TYPES = Object.freeze(['practice','structure']);
const spec=(id,label,time='free',prestige='free',risk='free',monsterPressure='free')=>({id,label,defaults:{time,prestige,risk,monsterPressure}});
const campaign=[spec('attack','Attack','fair','expensive','calculated'),spec('duel','Honour duel','cheap','free','calculated'),
  spec('quest','Quest','fair','free','calculated'),{...spec('leave','Leave Campaign'),costKinds:['time','prestige','monsterPressure']}];
export const LIFEGRAPH_SHOP_NODE_IDS=Object.freeze(['practiceReform','publicWorks','neutralMarket','classMarket','foodShop','housingShop','stockShop','signature:foodShop','signature:housingShop','signature:knowledgeShop','signature:removePractice']);
export const LIFEGRAPH_SHOP_SERVICE_SPECS=Object.freeze([
  {...spec('delve','Scholar Delve',10),costKinds:['time'],description:'Scholar only. Spend time, then reopen the shop with improved quality and a new Commission.'},
  {...spec('emptyConfirm','Leave without a purchase',5),costKinds:['time'],description:'Time spent when confirming an empty purchase list.'},
]);
const settlement=[spec('found','Found a settlement','free','expensive'),spec('route','Open a settlement route','cheap','fair'),spec('settlement-favor','Seek Settlement Favor')];

// Stable gameplay action IDs, independent of rolled stats, target regions and
// card definitions. The same data drives validation, review rows and resolution.
export const LIFEGRAPH_OPTION_SPECS = Object.freeze({
  patronage:VASSAL_PATRONAGE_OPTIONS.map((o,i)=>spec(o.id,o.label,['cheap','expensive','fair'][i])),
  development:VASSAL_DEVELOPMENT_OPTIONS.map((o,i)=>spec(o.id,o.label,['expensive','fair','cheap'][i],'free','free',o.id==='deepStudy'?'calculated':'free')),
  crossroads:[spec('travel','Move to another settlement','cheap'),spec('route','Build a route','fair','fair'),spec('tour','Tour this region','cheap')],
  training:[spec('train-estate','Train specialists','cheap')],
  discovery:[spec('discovery-research','Develop technique','fair'),spec('discovery-frontier','Forbidden observation','expensive','free','cheap','expensive')],
  challenge:[spec('challenge-3','Challenge 3','cheap','free','cheap'),spec('challenge-6','Challenge 6','fair','free','fair'),spec('challenge-9','Challenge 9','expensive','free','expensive')],
  campaign,
  crisis:[spec('relief','Relief expedition','cheap','free','fair'),spec('buy-relief','Procure relief','cheap'),spec('delay','Divert a Monster','cheap','free','fair'),spec('rescue','Rescue population','cheap'),spec('observe-crisis','Leave the response to the civilization')],
  legacy:[spec('found-settlement','Found a settlement'),spec('highest-stat','Teach the highest stat'),spec('accumulated-prestige','Leave renown')],
  relic:[spec('search','Search for an ordinary Relic','fair','free','free','calculated'),spec('dangerousSearch','Search for a Special Relic','fair','free','expensive','calculated')],
  'signature:legacyPlus':[spec('foundDynasty','Found a Dynasty','fair','expensive'),spec('enduringOffice','Enduring Office','fair','fair'),spec('humbleRemembrance','Humble Remembrance')],
  'signature:settlement':settlement,
  'signature:monsterHunt':campaign,
  ...Object.fromEntries(LIFEGRAPH_SHOP_NODE_IDS.map(id=>[id,[]])),
  'signature:removePractice':[{...spec('remove','Remove an installed Practice','cheap','fair'),costKinds:['time','prestige']},spec('removalFallback','Reorganize Local Affairs')],
});

export const getLifeMapOptionSpecs=nodeId=>[...(LIFEGRAPH_OPTION_SPECS[nodeId]??[]),...(LIFEGRAPH_SHOP_NODE_IDS.includes(nodeId)?LIFEGRAPH_SHOP_SERVICE_SPECS:[])];

export function lifeMapDesignNodeId(node){return node?.signatureNode?`signature:${node.signatureNode.variantId}`:node?.family;}

export function lifeMapOptionKey(node,option){
  if(option.balanceKey)return option.balanceKey;
  const family=lifeMapDesignNodeId(node),id=option.id??'';
  if(family==='campaign'||family==='signature:monsterHunt')return option.mode??(id==='campaign-leave'?'leave':id);
  if(family==='crossroads')return id.startsWith('travel-')?'travel':id.startsWith('crossroads-route:')?'route':id;
  if(family==='signature:settlement')return id.startsWith('small-settlement:')||id==='settlement-unavailable'?'found':id.startsWith('settlement-edge:')?'route':id;
  if(family==='crisis')return ['buy-relief','relief','delay','rescue'].find(prefix=>id.startsWith(`${prefix}-`))??id;
  if(family==='relic')return option.immediateDeathChance>0?'dangerousSearch':'search';
  return id;
}

export function getLifeMapBalanceValue(design,kind,assignment){
  return typeof assignment==='number'?assignment:assignment==='free'?0:design.costBands[kind][assignment];
}

export function lifeMapPhasesPerYear(state){
  const settings=state.gameConfig.settings.values;
  return (state.seasons?.length||4)*settings.seasonDurationSec/settings.phaseDurationSec;
}
const yearPhases=(state,years)=>Math.max(years>0?1:0,Math.round(years*lifeMapPhasesPerYear(state)));

export function resolveLifeMapOptionCosts(state,node,option){
  const design=state.gameConfig.lifeMapGenerator.design;
  const key=lifeMapOptionKey(node,option),shared=LIFEGRAPH_SHOP_NODE_IDS.includes(lifeMapDesignNodeId(node))?design.shopServices[key]:null;
  if(!design.enabled&&!shared)return option;
  const rule=shared??design.optionCosts[lifeMapDesignNodeId(node)]?.[key];
  if(!rule)return option;
  const next={...option,balanceKey:key};
  next.phaseCost=yearPhases(state,getLifeMapBalanceValue(design,'time',rule.time));
  next.prestigeCost=getLifeMapBalanceValue(design,'prestige',rule.prestige??'free');
  if(rule.risk!=='calculated'){
    const risk=getLifeMapBalanceValue(design,'risk',rule.risk??'free');
    if(option.mode)next.risk=Math.round(risk*100);
    else {next.immediateDeathChance=risk;if('baseDanger' in option)next.baseDanger=risk;}
  }
  if(!shared&&rule.monsterPressure!=='calculated'){
    const amount=getLifeMapBalanceValue(design,'monsterPressure',rule.monsterPressure);
    next.effects=(option.effects??[]).filter(effect=>effect.op!=='addMonsterPressure');
    if(amount>0)next.effects.push({op:'addMonsterPressure',amount});
  }
  return next;
}

export function resolveLifeMapShopPrice(state,offer){
  const design=state.gameConfig.lifeMapGenerator.design,action=offer.intervention;
  if(!design.enabled||!design.shopPricing.enabled||!LIFEGRAPH_SHOP_TYPES.includes(action?.kind)||action.mode==='remove')return offer;
  const quality=action.kind==='practice'?action.resultingTier:LIFEGRAPH_CARD_QUALITIES[Math.min(3,LIFEGRAPH_CARD_QUALITIES.indexOf(action.tier)+(action.qualityBonus??0))];
  const price=design.shopPricing.prices[action.kind][quality];
  return {...offer,basePrestigeCost:price.prestige,basePhaseCost:yearPhases(state,price.time),baseCurrencyCost:price.currency,priceQuality:quality};
}

export function validateLifeMapBalance(design){
  const errors=[],limit={time:1000,prestige:100000,risk:1,monsterPressure:100000};
  const valid=(kind,value)=>Number.isFinite(value)&&value>=0&&value<=limit[kind];
  for(const kind of Object.keys(limit))for(const tier of LIFEGRAPH_COST_TIERS)if(!valid(kind,design.costBands?.[kind]?.[tier]))errors.push(`design.costBands.${kind}.${tier}: expected an absolute value from 0 to ${limit[kind]}`);
  for(const [nodeId,specs]of Object.entries(LIFEGRAPH_OPTION_SPECS))for(const option of specs)for(const kind of Object.keys(limit)){
    const assignment=design.optionCosts?.[nodeId]?.[option.id]?.[kind];
    if(!(LIFEGRAPH_COST_CHOICES.includes(assignment)||valid(kind,assignment)||assignment==='calculated'&&option.defaults[kind]==='calculated'))errors.push(`design.optionCosts.${nodeId}.${option.id}.${kind}: choose a band or a valid base value`);
    else if(option.costKinds&&!option.costKinds.includes(kind)&&assignment!=='free')errors.push(`design.optionCosts.${nodeId}.${option.id}.${kind}: this service has no ${kind} charge`);
  }
  for(const [nodeId,options]of Object.entries(design.optionCosts??{}))for(const id of Object.keys(options??{}))if(!LIFEGRAPH_OPTION_SPECS[nodeId]?.some(o=>o.id===id))errors.push(`design.optionCosts.${nodeId}.${id}: unknown action`);
  for(const {id}of LIFEGRAPH_SHOP_SERVICE_SPECS){const time=design.shopServices?.[id]?.time;if(!(LIFEGRAPH_COST_CHOICES.includes(time)||valid('time',time)))errors.push(`design.shopServices.${id}.time: choose a band or a valid base value`);}
  for(const [id,rule]of Object.entries(design.shopServices??{}))if(!LIFEGRAPH_SHOP_SERVICE_SPECS.some(s=>s.id===id)||!rule||Object.keys(rule).some(kind=>kind!=='time'))errors.push(`design.shopServices.${id}: unknown service or cost`);
  if(typeof design.shopPricing?.enabled!=='boolean')errors.push('design.shopPricing.enabled: expected a boolean');
  for(const kind of LIFEGRAPH_SHOP_TYPES)for(const quality of LIFEGRAPH_CARD_QUALITIES)for(const cost of ['time','prestige'])if(!valid(cost,design.shopPricing?.prices?.[kind]?.[quality]?.[cost]))errors.push(`design.shopPricing.${kind}.${quality}.${cost}: invalid shared price`);
  for(const kind of LIFEGRAPH_SHOP_TYPES)for(const quality of LIFEGRAPH_CARD_QUALITIES){const n=design.shopPricing?.prices?.[kind]?.[quality]?.currency;if(!Number.isInteger(n)||n<0||n>100000)errors.push(`design.shopPricing.${kind}.${quality}.currency: expected a nonnegative whole amount`);}
  return errors;
}
