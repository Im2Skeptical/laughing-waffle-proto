// THROWAWAY: compare exclusive disciplines, shared lenses and inherited teachings.
// Captured run config is the only switch. These selectors also run in replay/workers.
export const KEYWORD_PROTOTYPE_MODES = ['disciplines', 'lenses', 'teachings'];
export const KEYWORD_PROTOTYPE_CLASSES = ['scholar', 'warrior', 'priest', 'merchant'];
export const KEYWORD_PROTOTYPE_NAMES = {economicRegions:'Economic Regions', monsterTrophies:'Monster Trophies'};
const affinity = {scholar:'economicRegions', merchant:'economicRegions', warrior:'monsterTrophies', priest:'monsterTrophies'};
// The bold option treats knowledge as transmission, not a job monopoly:
// Scholars study trophies; Priests carry economic knowledge along pilgrim roads.
const teaching = {scholar:'monsterTrophies', warrior:'monsterTrophies', priest:'economicRegions', merchant:'economicRegions'};
const title = id => id[0].toUpperCase() + id.slice(1);

export function canonicalKeywordPrototype(value) {
  if (!KEYWORD_PROTOTYPE_MODES.includes(value?.mode)) return null;
  return {mode:value.mode, classId:KEYWORD_PROTOTYPE_CLASSES.includes(value.classId)?value.classId:'scholar',
    taught:[...new Set((value.taught??[]).filter(id=>Object.hasOwn(KEYWORD_PROTOTYPE_NAMES,id)))]};
}

// Actual selected classes take over from the launch role. Priest/Merchant are
// explicitly experimental lenses: their full classes are outside this spike.
export function keywordPrototypeClass(state) {
  const config=state.gameConfig?.keywordPrototype;
  if (!config) return null;
  if (['priest','merchant'].includes(config.classId)) return config.classId;
  const lineage=state.civilization?.vassalLineage;
  if (lineage?.selectedVassalIds?.length) return lineage.vassalsById?.[lineage.currentVassalId]?.classId ?? null;
  return config.classId;
}

export function keywordPrototypeAccess(state, id) {
  const config=state.gameConfig?.keywordPrototype;
  if (!config) return {active:false, emphasised:false, reason:''};
  const classId=keywordPrototypeClass(state), emphasised=(config.mode==='teachings'?teaching:affinity)[classId]===id;
  if (config.mode==='lenses') return {active:true,emphasised,reason:emphasised?`${title(classId)} adds a second use for this count.`:'Shared by every class.'};
  if (config.mode==='disciplines') return {active:emphasised,emphasised,reason:emphasised?`${title(classId)} discipline.`:`Dormant outside ${id==='economicRegions'?'Scholar / Merchant':'Warrior / Priest'}.`};
  const teachers=(state.civilization?.vassalLineage?.selectedVassalIds??[]).map(vassalId=>state.civilization.vassalLineage.vassalsById[vassalId]?.classId);
  const inherited=config.taught.includes(id)||teachers.some(teacher=>teaching[teacher]===id);
  return {active:emphasised||inherited,emphasised,reason:inherited?'Taught to this civilisation; survives the teacher.':emphasised?`${title(classId)} teaches this discipline.`:'Untaught: select a teacher of this discipline.'};
}

export function keywordPrototypeScore(state, regionId, id) {
  if (id==='monsterTrophies') return state.civilization?.history?.monsterTrophies??0;
  if (id!=='economicRegions') return 0;
  // A contiguous trade zone: roads through occupied settlements, including
  // neutral towns. Frontier and ruined settlements break the component.
  const eligible=new Set((state.world?.sites??[]).filter(site=>site.detailedState||site.neutral).map(site=>site.regionId)
    .filter(id=>['player','external-a'].includes(state.world.regions.find(region=>region.id===id)?.controller)));
  if (!eligible.has(regionId)) return 0;
  const seen=new Set([regionId]), queue=[regionId];
  for (const current of queue) for (const edge of state.world.connections) {
    const next=edge.regionAId===current?edge.regionBId:edge.regionBId===current?edge.regionAId:null;
    if (eligible.has(next)&&!seen.has(next)) {seen.add(next);queue.push(next);}
  }
  return seen.size;
}

// Generalized named-score scaling, interpreted alongside existing DSL amounts.
export function keywordScaledAmount(state, regionId, scale) {
  if (!scale) return 0;
  const access=keywordPrototypeAccess(state,scale.keyword);
  if (!access.active) return 0;
  const score=keywordPrototypeScore(state,regionId,scale.keyword);
  return Math.min(scale.cap??Infinity,Math.floor(score/(scale.per??1)))*(scale.amount??1);
}

export function keywordPrototypePractice(state, def) {
  if (!state?.gameConfig?.keywordPrototype||!def) return def;
  const multiplierMode=state.gameConfig.keywordPrototype.mode==='disciplines';
  const keyword=(multiplierMode?{barter:'economicRegions',monsterHunting:'monsterTrophies'}:{barter:'economicRegions',observation:'monsterTrophies'})[def.id];
  if (!keyword) return def;
  const name=KEYWORD_PROTOTYPE_NAMES[keyword];
  const scale={keyword,per:1,amount:1,cap:6};
  if(multiplierMode)return {...def,
    ...(def.id==='barter'?{condition:null,externalAction:null}:{}),
    tags:[...def.tags,name],keywordOutputScale:scale,prototypeKeyword:keyword};
  const classId=keywordPrototypeClass(state);
  const lens=state.gameConfig.keywordPrototype.mode==='lenses'&&affinity[classId]===keyword
    ? {scholar:{op:'research'},merchant:{op:'generateStock'},warrior:{op:'bankSupport',bank:'formation'},priest:{op:'addFaithChaosResistance'}}[classId] : null;
  return {...def, condition:null, externalAction:null, pool:'common',
    tags:[...def.tags,name],
    effects:[...def.effects.map(effect=>({...effect,keywordScale:scale})),...(lens?[{...lens,amount:0,keywordScale:scale}]:[])],
    ui:{rule:`Birth: ${def.id==='barter'?'produce 1 Stock':'gain 1 Research'} + ${name} (up to 6).`},
    prototypeKeyword:keyword};
}

export function keywordPrototypeReading(state, regionId, def) {
  const id=def?.prototypeKeyword;
  if (!id) return null;
  const name=KEYWORD_PROTOTYPE_NAMES[id],score=keywordPrototypeScore(state,regionId,id),access=keywordPrototypeAccess(state,id);
  const inMultiplierPool=!!def.keywordOutputScale;
  const bonus=keywordScaledAmount(state,regionId,def.keywordOutputScale??def.effects[0].keywordScale);
  const definition=id==='economicRegions'
    ? 'Count occupied settlements in this road-connected trade zone, including this one and neutral towns. Frontier and ruins break the zone. Each counts once; connecting two zones joins them.'
    : 'Count monsters actually destroyed by this civilisation, by Hunt or Campaign. Neutral conquests and successful defenses do not count. Trophies survive Vassal death; they are a count, not spendable Stock.';
  const lens=state.gameConfig.keywordPrototype.mode==='lenses'&&access.emphasised
    ? {scholar:`Also gain ${bonus} Research.`,merchant:`Also produce ${bonus} Stock before workers.`,warrior:`Also bank ${bonus} formation Support (bank cap 10).`,priest:`Also gain ${bonus} Chaos resistance until next Birth.`}[keywordPrototypeClass(state)] : '';
  if(inMultiplierPool)return {id,name,score,bonus,inMultiplierPool,active:access.active,emphasised:access.emphasised,
    text:`${name} contributes to Output Multiplier.`,
    definition:`${definition} ${access.reason} ${score} counted; +${bonus} to this Practice's Output Multiplier, capped at +6. This contribution adds to the base 1 and other multiplier sources. Base Stock yields, recipes, Research, Charge gain and capacity are unchanged.`,lens:''};
  return {id,name,score,bonus,active:access.active,emphasised:access.emphasised,
    text:`${name} ${score} → +${bonus}. ${access.reason}`,
    definition:`${definition} ${access.reason} This card adds 1 per count, capped at 6. Base 1 + bonus ${bonus} = ${1+bonus}${def.id==='barter'?' Stock before workers and Output Multiplier, then limited by capacity.':' Research per Birth.'} ${lens}`,lens};
}

export function keywordPrototypeOutputSource(state, regionId, def) {
  const scale=def?.keywordOutputScale;
  if(!scale)return null;
  const amount=keywordScaledAmount(state,regionId,scale);
  return amount?{id:`keyword:${scale.keyword}`,label:KEYWORD_PROTOTYPE_NAMES[scale.keyword],amount,query:{}}:null;
}
