import { describeMechanicEffect, describeMechanicTrigger } from './mechanic-readings.js';
// Read-only translation of the implemented recipe. Card numerals and these
// lines both describe base effects; evaluation still owns the actual result.
const title = value => value ? value[0].toUpperCase() + value.slice(1) : '';
const traits = values => values.join(' or ') + ' Stock';

// Authored Stock yield before workers, local bonuses and Output Multiplier.
// Presentation data only; the activation evaluator remains authoritative.
export function getPracticeBaseStockProduction(def) {
  const effects=(def.effects??[]).filter(effect=>effect.op==='generateStock');
  if(!effects.length)return [];
  const activation=def.activation??{};
  const times=def.mode==='charge'?[{type:activation.type,timing:''}]
    :[activation.type,...(activation.also??[])].flatMap(type=>type==='season'
      ?(activation.seasonKeys?.length?activation.seasonKeys:['spring','summer','autumn','winter']).map(season=>({type,season,timing:title(season)}))
      :[{type,timing:`${title(type)} phase`}]);
  return times.map(({type,season,timing})=>({timing,amount:effects.reduce((sum,effect)=>sum+
    (effect.activationAmounts?.[type]??(season?effect.seasonAmounts?.[season]:undefined)??effect.amount??0),0)}));
}



export function getPracticeReading(def, {workerGates=true}={}) {
  const charge = def.mode === 'charge';
  const activation = def.activation ?? {};
  const times = charge ? [''] : [activation.type, ...(activation.also ?? [])].flatMap(type =>
    type === 'season' ? (activation.seasonKeys?.length ? activation.seasonKeys : ['spring', 'summer', 'autumn', 'winter']).map(title)
      : [type === 'passive' ? 'While active' : type === 'crisis' ? 'During a Crisis' : `${title(type)} phase`]);
  const effects = times.flatMap(timing => (def.effects ?? []).filter(effect=>!['addChaos','addMonsterPressure'].includes(effect.op)).map(effect => ({
    timing, text: describeMechanicEffect(effect, effect.seasonAmounts?.[timing.toLowerCase()] ?? effect.amount ?? 0),
  })));
  // Some supplied martial Practices contribute continuously rather than via
  // an effect operation. Describe their implemented contribution explicitly.
  if (!effects.length && (def.supportMultiplier || def.defenseMultiplier)) effects.push({timing: 'While supplied', text: `Contribute extra ${def.defenseMultiplier?'defensive ':''}Martial Support from local Warriors${def.retinueForce ? `; gain ${def.retinueForce} Warrior Retinue Force` : ''}`});
  if (!effects.length && def.responseAction === 'rescue') effects.push({timing: 'During a Crisis', text: 'Rescue up to 5 people into available Housing in a connected friendly settlement'});
  if(!effects.length&&def.consume?.length)for(const timing of times)effects.push({timing,text:def.consume.map(c=>`Lose ${c.amount} ${traits(c.traits)}`).join('; ')});
  const requirements = ['consume', 'require'].flatMap(kind => (def[kind] ?? []).map(input =>
    `${kind === 'consume' ? 'Consume' : 'Require'} ${input.amount} ${traits(input.traits)}${kind === 'require' ? ' (kept)' : ''}.`));
  if (workerGates && def.scholarRequired) requirements.push('Requires a Scholar worker.');
  if (workerGates && def.specialistRequired) requirements.push(`Requires ${title(def.specialistRequired)} population here.`);
  if (def.minimumWarriors) requirements.push(`Requires at least ${def.minimumWarriors} Warriors here.`);
  if (def.connectedSupportRequired) requirements.push('Requires a connected Warrior settlement.');
  if (def.minimumSupportRequired) requirements.push(`Requires at least ${def.minimumSupportRequired} Martial Support.`);
  if (def.positiveSupportRequired) requirements.push('Requires Martial Support here.');
  const conditions={diverseStock:'Requires two stocked Practices with different Stock traits in the supply network.',
    ruins:'Requires an adjacent ruined or Monster-occupied region.',deaths:'Only Activates when someone dies in this settlement.',
    chaos:'Requires Chaos to have increased this moon.',externalConnection:'Requires a connection to a frontier or external settlement.'};
  if(conditions[def.condition])requirements.push(conditions[def.condition]);
  for(const p of def.populationConsume??[])requirements.push(`Sacrifice ${p.amount} local ${p.filter?.kind??''} ${p.filter?.specialty??''}; any allegiance. One real death, never multiplied.`);
  for(const p of def.populationRequire??[])requirements.push(`Keep ${p.amount} ${p.other?'other ':''}local ${p.filter?.kind??''} ${p.filter?.specialty??''}.`);
  if(def.requireBaseHeadroom)requirements.push('Complete base Stock output must fit before activation.');
  if(def.populationCondition==='housed')requirements.push('Housing must cover every local resident.');
  if(def.populationCondition==='relief')requirements.push('After local shortage: this allegiance must actually supply the civilian meal this Food phase.');
  return { type: charge ? 'Charge' : 'Cycle', passive: activation.type === 'passive', classLabel: def.pool === 'common' ? 'Neutral' : title(def.pool),
    effects, requirements, trigger: charge ? describeMechanicTrigger(def.charge?.trigger).replace(/^On /, 'Charge on ') : null,
    ...(def.flavour??def.flavor?{flavour:def.flavour??def.flavor}:{}) };
}
