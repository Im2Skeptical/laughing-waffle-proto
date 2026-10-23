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

function effectText(effect, amount) {
  const names = { scholar: 'Scholar', warrior: 'Warrior' };
  const text = {
    generateStock: `Produce ${amount} Stock`,
    research: `Gain ${amount} Research`,
    train: `Train ${amount} ${names[effect.classId] ?? 'specialist'}${amount === 1 ? '' : 's'}`,
    addHousingForPhase: `Gain ${amount} Housing for this phase`,
    reduceLocalFoodRequirement: `Use ${amount} less Edible Stock at this settlement's next meal`,
    addFaithChaosResistance: `Gain ${amount} Chaos resistance until the next Birth phase`,
    bankCandidateDevelopment: `Next ${names[effect.classId] ?? 'Vassal'} candidate gains ${amount} Development`,
    bankShopQuality: `Gain ${amount} quality bonus for the next local shop (up to 3)`,
    bankPreview: `Gain ${amount} local preview bonus (up to 3)`,
    boostSeasonalFood: `One local seasonal Food Practice produces ${amount} extra Stock in its next two seasons this year`,
    bankSupport: `Bank ${amount} ${title(effect.bank)} Support for a future martial action (up to 10)`,
  }[effect.op];
  const history = { losses: 'lost settlements', deaths: 'local deaths', deathsSinceSpring: 'local deaths since Spring' };
  return text + (effect.historyScale ? `; increased by ${history[effect.historyScale] ?? effect.historyScale}` : '');
}

function readableTrigger(text) {
  return text.replace(/^When\s+/i, 'Charge when ')
    .replace(/local population dies/g, 'someone in this settlement dies')
    .replace(/generates Stock with \[([^\]]+)\](?: or \[([^\]]+)\])?/g,
      (_, a, b) => `produces ${a}${b ? ` or ${b}` : ''} Stock`)
    .replace(/generates Stock/g, 'produces Stock')
    .replace(/\[([^\]]+)\]/g, '$1 Stock')
    .replace(/Discharges?/g, 'Activates');
}

export function getPracticeReading(def) {
  const charge = def.mode === 'charge';
  const activation = def.activation ?? {};
  const times = charge ? [''] : [activation.type, ...(activation.also ?? [])].flatMap(type =>
    type === 'season' ? (activation.seasonKeys?.length ? activation.seasonKeys : ['spring', 'summer', 'autumn', 'winter']).map(title)
      : [type === 'passive' ? 'While active' : type === 'crisis' ? 'During a Crisis' : `${title(type)} phase`]);
  const effects = times.flatMap(timing => (def.effects ?? []).filter(effect=>!['addChaos','addMonsterPressure'].includes(effect.op)).map(effect => ({
    timing, text: effectText(effect, effect.seasonAmounts?.[timing.toLowerCase()] ?? effect.amount ?? 0),
  })));
  // Some supplied martial Practices contribute continuously rather than via
  // an effect operation. Describe their implemented contribution explicitly.
  if (!effects.length && (def.supportMultiplier || def.defenseMultiplier)) effects.push({timing: 'While supplied', text: `Contribute extra ${def.defenseMultiplier?'defensive ':''}Martial Support from local Warriors${def.retinueForce ? `; gain ${def.retinueForce} Warrior Retinue Force` : ''}`});
  if (!effects.length && def.responseAction === 'rescue') effects.push({timing: 'During a Crisis', text: 'Rescue up to 5 people into available Housing in a connected friendly settlement'});
  const requirements = ['consume', 'require'].flatMap(kind => (def[kind] ?? []).map(input =>
    `${kind === 'consume' ? 'Consume' : 'Require'} ${input.amount} ${traits(input.traits)}${kind === 'require' ? ' (kept)' : ''}.`));
  if (def.scholarRequired) requirements.push('Requires a Scholar worker.');
  if (def.specialistRequired) requirements.push(`Requires ${title(def.specialistRequired)} population here.`);
  if (def.minimumWarriors) requirements.push(`Requires at least ${def.minimumWarriors} Warriors here.`);
  if (def.connectedSupportRequired) requirements.push('Requires a connected Warrior settlement.');
  if (def.minimumSupportRequired) requirements.push(`Requires at least ${def.minimumSupportRequired} Martial Support.`);
  if (def.positiveSupportRequired) requirements.push('Requires Martial Support here.');
  const conditions={diverseStock:'Requires two stocked Practices with different Stock traits in the supply network.',
    ruins:'Requires an adjacent ruined or Monster-occupied region.',deaths:'Only Activates when someone dies in this settlement.',
    chaos:'Requires Chaos to have increased this moon.',externalConnection:'Requires a connection to a frontier or external settlement.'};
  if(conditions[def.condition])requirements.push(conditions[def.condition]);
  return { type: charge ? 'Charge' : 'Cycle', passive: activation.type === 'passive', classLabel: def.pool === 'common' ? 'Neutral' : title(def.pool),
    effects, requirements, trigger: charge ? readableTrigger(def.charge?.triggerText ?? '') : null };
}
