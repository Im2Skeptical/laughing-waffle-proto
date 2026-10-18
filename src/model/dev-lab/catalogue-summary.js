// A definition inventory, never a simulated economy. Quantities with different
// activation timings stay separate; multi-trait Stock is counted only once.
const SEASONS = ['spring','summer','autumn','winter'];
const title = value => value ? value[0].toUpperCase() + value.slice(1) : '';

function timings(def) {
  if (def.mode === 'charge') return [{type:'charge',label:'Per Discharge'}];
  const activation = def.activation ?? {};
  return [...new Set([activation.type,...(activation.also ?? [])])].filter(Boolean).flatMap(type => {
    if (type === 'season') return (activation.seasonKeys?.length ? activation.seasonKeys : SEASONS)
      .map(season=>({type,season,label:`${title(season)} season`}));
    const label = type === 'passive' ? 'While supplied' : type === 'crisis' ? 'Crisis response' : `${title(type)} phase`;
    return [{type,label:label + (def.cadenceMoons > 1 ? ` / every ${def.cadenceMoons} moons` : '')}];
  });
}

function variableNotes(effect, timing) {
  return [
    effect.populationBand && `Scales with population (per ${effect.populationBand})`,
    effect.historyScale && (effect.historyScale !== 'deathsSinceSpring' || timing.type === 'season') && `Scales with ${effect.historyScale === 'losses' ? 'lost settlements' : 'local deaths'}`,
    effect.localDeathScale && 'Scales with deaths this moon',
    effect.externalConnectionScale && 'Scales with external connections',
  ].filter(Boolean);
}

function cardNotes(def, timing) {
  return [
    def.mode === 'charge' && `${def.charge?.threshold ?? '?'} Charge to Discharge. ${def.charge?.triggerText ?? ''}`,
    (def.condition || def.activation?.conditions?.[timing.type]) && 'Conditional activation; see card rules.',
    def.externalAction && 'External action must succeed; spoils can add to base output.',
    def.specialistRequired && `Requires ${title(def.specialistRequired)} population.`,
    def.scholarRequired && 'Requires a Scholar worker.',
    def.minimumWarriors && `Requires at least ${def.minimumWarriors} Warriors.`,
    timing.type === 'passive' && 'Availability requirement; not a recurring spend.',
  ].filter(Boolean);
}

export function summarizeLabCatalogue(entries) {
  const cards = entries.filter(entry=>['practice','structure'].includes(entry.category));
  const groups = {produced:new Map(),consumed:new Map(),required:new Map(),construction:new Map()};
  const add = (kind, entry, traits, timing, amount, notes = [], variable = false) => {
    if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && !variable)) return;
    const sortedTraits = [...new Set(traits)].sort();
    const key = JSON.stringify([sortedTraits,timing.label]);
    const bucket = groups[kind].get(key) ?? {traits:sortedTraits,timing:timing.label,amount:0,variable:false,sources:[]};
    const cardKey = `${entry.category}:${entry.id}`;
    let source = bucket.sources.find(item=>item.key===cardKey);
    if (!source) { source = {key:cardKey,label:entry.label,amount:0,notes:[],variable:false}; bucket.sources.push(source); }
    source.amount += amount;
    source.notes = [...new Set([...source.notes,...notes])];
    source.variable ||= variable;
    bucket.amount += amount;
    bucket.variable ||= variable;
    groups[kind].set(key,bucket);
  };
  for (const entry of cards) {
    const def = entry.def;
    if (entry.category === 'structure') {
      for (const input of def.construction?.consume ?? []) {
        const cycles = def.construction.cycles;
        add('construction',entry,input.traits,{label:'Per completed structure'},input.amount * cycles,
          [`${input.amount} per successful ${title(def.construction.activation?.type ?? 'housing')} cycle, ${cycles} cycles.`]);
      }
      continue;
    }
    for (const timing of timings(def)) {
      const notes = cardNotes(def,timing);
      for (const effect of def.effects ?? []) {
        if (effect.op !== 'generateStock') continue;
        const amount = effect.activationAmounts?.[timing.type] ?? (timing.type === 'season' ? effect.seasonAmounts?.[timing.season] : undefined) ?? effect.amount ?? 0;
        const scaling = variableNotes(effect,timing);
        add('produced',entry,def.stockTraits ?? [],timing,amount,[...notes,...scaling],scaling.length > 0 || !!def.externalAction);
      }
      // Passive military cards check supply continuously, then spend their
      // Consume recipe when used as a supplied defense response.
      for (const input of def.consume ?? []) add('consumed',entry,input.traits,
        timing.type === 'passive' ? {label:'Per supplied defense response'} : timing,input.amount,
        timing.type === 'passive' ? ['Supply must be available; consumed when defending.'] : notes);
      for (const input of def.require ?? []) add('required',entry,input.traits,timing,input.amount,notes);
    }
  }
  const result = {cardCount:cards.length,practiceCount:cards.filter(entry=>entry.category==='practice').length,structureCount:cards.filter(entry=>entry.category==='structure').length};
  for (const [kind,buckets] of Object.entries(groups)) result[kind] = [...buckets.values()]
    .sort((a,b)=>a.traits.join(' ').localeCompare(b.traits.join(' ')) || a.timing.localeCompare(b.timing))
    .map(bucket=>({...bucket,sources:bucket.sources.sort((a,b)=>a.label.localeCompare(b.label))}));
  return result;
}

// In the all-timings view each card contributes once: seasonal variants form
// a range. Alternative inputs remain separate from costs demanding this trait.
export function compareLabStock(summary, timing = '') {
  const kinds = ['produced','consumed','required','construction'];
  const traits = [...new Set(kinds.flatMap(kind=>summary[kind].flatMap(group=>group.traits.length ? group.traits : ['Untyped Stock'])))].sort();
  const countCards = sources => new Set(sources.map(source=>source.key)).size;
  const total = sources => ({min:sources.reduce((n,source)=>n+source.min,0),max:sources.reduce((n,source)=>n+source.max,0),variable:sources.some(source=>source.variable),cardCount:countCards(sources),sources});
  return traits.map(trait=>{
    const row = {trait};
    for (const kind of kinds) {
      const sources = new Map();
      for (const group of summary[kind]) {
        if (timing && kind !== 'construction' && group.timing !== timing) continue;
        if (!(group.traits.length ? group.traits : ['Untyped Stock']).includes(trait)) continue;
        for (const source of group.sources) {
          const key = JSON.stringify([source.key,group.traits]);
          const item = sources.get(key) ?? {...source,traits:[...group.traits],timings:[],notes:[]};
          item.timings.push({label:group.timing,amount:source.amount,variable:source.variable});
          item.notes = [...new Set([...item.notes,...source.notes])];
          sources.set(key,item);
        }
      }
      const items = [...sources.values()].map(source=>({...source,
        min:Math.min(...source.timings.map(time=>time.amount)),max:Math.max(...source.timings.map(time=>time.amount)),
        variable:source.timings.some(time=>time.variable),
      })).sort((a,b)=>a.label.localeCompare(b.label));
      const flexible = kind === 'produced' ? [] : items.filter(source=>source.traits.length>1);
      row[kind] = {...total(items.filter(source=>!flexible.includes(source))),cardCount:countCards(items),flexible:total(flexible)};
    }
    return row;
  });
}
