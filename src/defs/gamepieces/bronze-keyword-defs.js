// Bronze class Practices. Recipes and keyword coefficients are ordinary captured
// gamepiece data; they do not depend on a development experiment or launch URL.
const input=(trait,amount=1)=>({traits:[trait],amount});
function practice(id,label,pool,traits,amount,capacity,activation,extra={}) {
  const keyword=pool==='scholar'?'synthesis':'monsterTrophies';
  return {id,label,pool,minimumQuality:'bronze',tags:[pool==='scholar'?'Knowledge':'Civic',pool==='scholar'?'Synthesis':'Monster Trophies'],
    workerCapacity:1,workerBonus:1,workerCapacityPerQuality:0,vassalPrestigeCost:10,vassalPhaseCost:12,
    mode:'scheduled',lane:'scheduled',activation,source:{icon:activation.type,cadence:activation.type},
    costs:[],consume:[],require:[],stockTraits:traits,stockCapacity:capacity,
    effects:[{op:'generateStock',amount}],
    keywordOutputScale:{keyword,per:1,amount:1,cap:keyword==='synthesis'?4:6},...extra};
}
function charged(id,label,pool,traits,amount,capacity,threshold,clause,triggerText) {
  return practice(id,label,pool,traits,amount,capacity,{type:'charge'},{mode:'charge',lane:'charge',
    source:{icon:'charge',cadence:'charge'},charge:{gain:1,threshold,triggerText,
      dischargeText:`Generate ${amount} Stock.`,trigger:{any:[clause],anotherPractice:true}},
    ui:{rule:`${triggerText} Gain 1 base Charge. At ${threshold} Charge, Discharge: Generate ${amount} Stock.`}});
}
export const bronzeKeywordDefs=Object.freeze({
  floodAlmanacs:practice('floodAlmanacs','Flood Almanacs','scholar',['Record'],2,12,
    {type:'season',seasonKeys:['spring']},{require:[input('Water')],
      ui:{rule:'Spring: Require 1 [Water]. Generate 2 [Record] Stock.'}}),
  marginalia:charged('marginalia','Marginalia','scholar',['Record'],2,12,2,
    {kind:'stockConsumed',traitsAny:['Record'],tagsAny:['Knowledge']},
    'When another local Knowledge Practice consumes [Record].'),
  measuredRations:practice('measuredRations','Measured Rations','scholar',['Edible'],3,18,
    {type:'food',stage:'preRouting'},{consume:[input('Grain')],require:[input('Record')],
      ui:{rule:'Food, before feeding: Consume 1 [Grain]. Require 1 [Record]. Generate 3 [Edible] Stock.'}}),
  patternCarving:practice('patternCarving','Pattern Carving','scholar',['Tool'],1,10,
    {type:'housing'},{consume:[input('Timber'),input('Record')],
      ui:{rule:'Housing: Consume 1 [Timber] and 1 [Record]. Generate 1 [Tool] Stock.'}}),
  beastRendering:charged('beastRendering','Beast Rendering','warrior',['Animal','Bone'],2,16,1,
    {kind:'monsterDestroyed',scope:'civilization',faction:'beneficiary'},'When this civilisation destroys a Monster.'),
  scarredShields:practice('scarredShields','Scarred Shields','warrior',['Arms','Protection'],1,12,
    {type:'birth'},{consume:[input('Timber')],
      ui:{rule:'Birth: Consume 1 [Timber]. Generate 1 [Arms]/[Protection] Stock.'}}),
  trailProvisioning:practice('trailProvisioning','Trail Provisioning','warrior',['Edible','Mobility'],2,16,
    {type:'food',stage:'preRouting'},{consume:[input('Animal')],
      ui:{rule:'Food, before feeding: Consume 1 [Animal]. Generate 2 [Edible]/[Mobility] Stock.'}}),
  trophyRubbings:practice('trophyRubbings','Trophy Rubbings','warrior',['Record','Currency'],1,12,
    {type:'death'},{require:[input('Bone')],
      ui:{rule:'Death: Require 1 [Bone]. Generate 1 [Record]/[Currency] Stock.'}}),
});
