import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { getStockTraitTexture } from './chronicle-art.js';

const FLAVOUR = {
  anatomicalStudy: 'The dead keep no secrets from a patient scholar.',
  logging: 'Every winter hearth begins beneath a summer canopy.',
  smelting: 'The mountain yields its blood only to fire.',
  charcoalBurning: 'What the forest gives, the furnace remembers.',
  scholarship: 'Ink outlives the hand that spills it.',
};
function flavour(face) {
  return face.reading.flavour ?? FLAVOUR[face.definitionId] ?? (face.tags?.includes('Ancestral') ? 'What we inherit, we must learn to carry.'
    : face.tags?.includes('Knowledge') ? 'A candle spent in study may spare a city from the dark.'
      : face.reading.classLabel === 'Warrior' ? 'Peace is kept by hands that remember war.'
        : face.tags?.includes('Food') ? 'Even beneath a darkened sky, the table must be laid.'
          : 'The realm endures through the work of ordinary hands.');
}
function copy(parent, text, x, y, width, size, style = {}) {
  const node = createText(text, {...TEXT_STYLES.body, fontSize:size, lineHeight:size*1.35,
    fill:RELIC.bone, wordWrap:true, wordWrapWidth:width, ...style}, x, y);
  parent.addChild(node); return node;
}

// One rules surface for hover and deliberate inspection, with no card-face
// dictionary mixed into the quick read.
export function addPracticeReading(parent, width, face, {fontSize = 28, onInspect} = {}) {
  const root = new PIXI.Container(), reading = face.reading, pad = 24;
  const frame = new PIXI.Graphics(); root.addChild(frame);
  let y = 0, x = pad, rowHeight = 0;
  for (const tag of [...new Set([reading.classLabel, reading.type, ...(face.tags ?? [])])]) {
    const label = copy(root, tag.toUpperCase(), x+12, y+7, width-pad*2, fontSize*.62, {fontWeight:'bold',fill:tag==='Knowledge'?0xc9c2eb:RELIC.bone});
    const w = label.width+24, h = label.height+14;
    if (x+w > width-pad && x > pad) { x=pad; y+=rowHeight+6; rowHeight=0; label.position.set(x+12,y+7); }
    const bg = new PIXI.Graphics(); paintRelicPanel(bg,x,y,w,h,tag==='Knowledge'?0x302c43:0x3b3020,RELIC.brass,1);
    root.addChildAt(bg,1); x+=w+8; rowHeight=Math.max(rowHeight,h);
  }
  y+=rowHeight;
  const titleY=y;
  const title=copy(root,face.label,pad,y+18,width-pad*2-(onInspect?44:0),fontSize*1.42,{...TEXT_STYLES.header,fontSize:fontSize*1.42});
  y+=Math.max(onInspect?132:0,title.height+36);
  paintRelicPanel(frame,0,titleY,width,y-titleY,0x302414,RELIC.brass,2);
  const titleHeight=y-titleY;
  const blockY=y;
  y+=22;
  const activation=new PIXI.Graphics();root.addChildAt(activation,1);
  for (const effect of reading.effects) {
    const timing=effect.timing && !reading.passive ? copy(root,effect.timing,pad,y,width-pad*2,fontSize,{fill:RELIC.gold,fontWeight:'bold'}) : null;
    const offset=timing ? timing.width+14 : 0;
    // Long phase names get their own line; seasons remain inline with yields.
    const inline=offset<width*.4;
    if(timing&&!inline)y+=timing.height+3;
    const arrowX=pad+(inline?offset:0);
    if(!reading.passive)copy(root,'›',arrowX,y,20,fontSize,{fill:RELIC.gold,fontWeight:'bold'});
    const textX=arrowX+(reading.passive?0:28);
    const line=copy(root,effect.text,textX,y,width-pad-textX,fontSize);
    y+=Math.max(line.height,inline?(timing?.height??0):0)+10;
  }
  if (!reading.effects.length) y+=copy(root,reading.passive?'No ongoing effect.':'No Activation effect.',pad,y,width-pad*2,fontSize).height+10;
  y+=8;
  paintRelicPanel(activation,0,blockY,width,y-blockY,reading.type==='Charge'?0x152321:0x1b2017,RELIC.brass,1);
  if (reading.trigger || reading.requirements.length || face.blocked) {
    y+=18;
    if(reading.trigger)y+=copy(root,reading.trigger,pad,y,width-pad*2,fontSize).height+16;
    if(reading.requirements.length)y+=copy(root,reading.requirements.join(' '),pad,y,width-pad*2,fontSize*.82,{fill:RELIC.gold}).height+12;
    if(face.kind==='structure' && reading.requirements.length && reading.active!==null)y+=copy(root,reading.active?'Requirement met. Bonuses active.':'Inactive: requirements not met. Bonuses do not apply.',pad,y,width-pad*2,fontSize*.82,{fill:reading.active?RELIC.bone:0xe2ad8c}).height+12;
    if(face.blocked)y+=copy(root,`Cannot Activate: ${face.blockedReason}`,pad,y,width-pad*2,fontSize*.82,{fill:0xe2ad8c}).height+12;
  }
  const flavourY=y+8;
  const flavourBg=new PIXI.Graphics(); root.addChildAt(flavourBg,1);
  y=flavourY+16;
  y+=copy(root,flavour(face),pad,y,width-pad*2,fontSize*.8,{fontStyle:'italic',fill:0xbeb195}).height+18;
  paintRelicPanel(flavourBg,0,flavourY,width,y-flavourY,0x28251c,RELIC.brass,1);
  const background=new PIXI.Graphics();
  paintRelicPanel(background,0,titleY,width,y-titleY,RELIC.night,RELIC.brass,1);
  root.addChildAt(background,0);
  if(onInspect) {
    const control=new PIXI.Container();control.position.set(0,titleY);
    control.eventMode='static';control.cursor='pointer';
    control.hitArea=new PIXI.Rectangle(0,0,width,titleHeight);
    control.accessibleTitle=`Inspect ${face.label}`;
    copy(control,'›',width-pad-20,(titleHeight-fontSize*1.35)/2,24,fontSize,{fill:RELIC.gold});
    control.on('pointerdown',event=>event.stopPropagation());
    control.on('pointertap',event=>{event.stopPropagation();onInspect();});
    root.addChild(control);root.titleControl=control;
  }
  root.readingHeight=y;root.reading=reading;
  parent.addChild(root);return root;
}

export function getPracticeSymbols(face) {
  if(face.kind==='structure')return getStructureSymbols(face);
  const entries=[];
  if(face.stockCapacity>0) entries.push({name:'Stock / capacity',icon:'stock',description:`The upper tray holds this Practice's Stock: ${face.stock} stored, up to ${face.stockCapacity}. Production stops at capacity.`});
  if(face.workerCapacity>0)entries.push({name:'Worker sockets / multiplier',icon:'population',description:`${face.workers} of ${face.workerCapacity} sockets are occupied. The ×${face.workerMultiplier} plate shows effective staffing. ${face.reading.type==='Charge'?'Workers increase incoming Charge, while Activation output stays separate.':'Workers increase Stock production; specialist workers can meet staffing requirements.'}`});
  if(face.reading.type==='Charge') {
    entries.push({name:'Charge meter',description:`${face.charge} of ${face.chargeThreshold} Charge. Qualifying events advance the meter; it Activates automatically when filled and legal. Worker and local bonuses can add steps.`});
    if(face.chargeTriggers?.length) {
      const names={death:'Skull = a death',chaos:'Burst = increasing Chaos',monster:'Monster = a Monster event',
        defense:'Shield = successful defense',support:'Crossed shield = contributed Support',danger:'Warning triangle = survived Danger',
        campaign:'Crossed swords = a Campaign',trade:'Trade = external Trade',challenge:'Crossed shield = a Challenge',
        development:'Star = candidate Development',knowledge:'Book = a Knowledge or Scholar-staffed Practice',stock:'Stock = a Stock event'};
      const icons=[...new Set(face.chargeTriggers.map(symbol=>names[symbol.icon]).filter(Boolean))].join('. ');
      entries.push({name:'Charge trigger symbols',description:`${icons?icons+'. ':''}${face.reading.trigger}${face.chargeTriggers.some(s=>s.event==='stockGenerated')?' An upward arrow means Stock produced.':''}${face.chargeTriggers.some(s=>s.event==='stockConsumed')?' A downward arrow means Stock consumed.':''}`});
    }
  } else if(face.source?.icon==='passive') entries.push({name:'Ongoing Activation mark',icon:'activation',description:'The central Activation mark identifies an ongoing contribution. Its supply requirements and staffing keep it active.'});
  else entries.push({name:face.source?.icon==='season'?'Cycle wheel / seasons':'Cycle wheel / moon phase',icon:face.source?.icon==='season'?'year':face.source?.icon,description:face.source?.icon==='season'?'The sun wheel tracks the next season. Green leaf = Spring, sun = Summer, amber leaf = Autumn, snowflake = Winter. The seasonal numerals show base Activation output.':`The wheel identifies its Cycle. Activation timing: ${[...new Set(face.reading.effects.map(effect=>effect.timing))].join(', ')}. Requirements must be met each time.`});
  for(const trait of [...new Set([...(face.stockCapacity>0?face.stockTraits:[]),...(face.inputs??[]).flatMap(i=>i.traits),...(face.chargeTriggers??[]).map(s=>s.trait).filter(Boolean)])]) {
    entries.push({name:`${trait} Stock`,trait,description:`Stock with this trait can satisfy ${trait} inputs or triggers. ${face.stockTraits?.includes(trait)?'Every Stock held here has this trait.':'This symbol asks for matching Stock on another Practice.'}`});
  }
  if(face.inputs?.length)entries.push({name:'Stock inputs',description:'A minus sign marks Stock consumed on Activation. A hollow diamond marks Stock required and kept. Alternatives share a socket. Supply comes from local hosts first, then adjacent connected player settlements.'});
  for(const icon of [...new Set((face.production??[]).filter(r=>!r.season).map(r=>r.icon))])entries.push({name:({stock:'Stock output',research:'Research',population:'Specialist training',prestige:'Candidate Development',activation:'Shop quality',support:'Martial Support',hourglass:'Preview',housingCapacity:'Housing',faith:'Chaos resistance',food:'Meal saving'})[icon]??icon,icon,description:'The symbol beside its numeral identifies one Activation effect. Numerals are base amounts; applicable local bonuses are resolved when the Practice Activates.'});
  entries.push({name:`${face.tier[0].toUpperCase()+face.tier.slice(1)} quality`,description:'The small jewel and frame colour show quality. Higher quality can improve capacity and worker sockets.'});
  // Lead with the progression mechanic, then the counters and supporting glyphs.
  return entries.sort((a,b)=>Number(/^(Charge meter|Cycle wheel|Ongoing Activation)/.test(b.name))-Number(/^(Charge meter|Cycle wheel|Ongoing Activation)/.test(a.name)));
}

function getStructureSymbols(face) {
  const entries=[];
  for(const bonus of face.structureBonuses??[]) {
    if(bonus.kind==='stock') {
      for(const trait of bonus.traits)if(!entries.some(entry=>entry.trait===trait))entries.push({name:`${trait} Stock`,trait,
        description:`This tag identifies the Stock whose capacity increases. The outlined Stock box behind the plus and numeral marks added capacity on each matching Practice. This Structure does not hold or produce Stock.`});
      entries.push({name:'Stock capacity bonus',icon:'stock',description:`+${bonus.amount} capacity on ${bonus.scope}. Contributions add before each Practice's final capacity rounds down.`});
    } else entries.push({name:bonus.label,icon:bonus.kind,description:bonus.kind==='housingCapacity'
      ? 'The roof and plus numeral mark added room for population, not people arriving.'
      : 'The population symbol and percentage mark an ongoing increase to local Martial Support.'});
  }
  entries.push({name:'Construction footprint',description:`${face.footprint} horizontal cell${face.footprint===1?'':'s'} in the regional construction strip, separate from the five Practice slots.`},
    {name:`${face.tier[0].toUpperCase()+face.tier.slice(1)} quality`,description:`The jewel and frame colour show quality.${face.structureQualityBonus?` This Structure has +${face.structureQualityBonus*25}% numeric bonuses.`:''} Housing rounds down per Structure; Stock capacity rounds down after summing host bonuses. Candidate base bonuses and history caps are unchanged.`},
    {name:'Ongoing bonuses',description:'Bonuses apply while specialist and modifier requirements are met. Capacity bonuses add; other bonuses follow their stated caps and non-stacking scopes. Structures have no Cycle wheel or Charge meter.'});
  return entries;
}

export function addPracticeGlossary(parent, width, face, fontSize = 25) {
  const root=new PIXI.Container(), frame=new PIXI.Graphics();root.addChild(frame);
  let y=24;
  y+=copy(root,'THE SYMBOLS ON THIS CARD',22,y,width-44,fontSize*.72,{fill:RELIC.gold,fontWeight:'bold'}).height+24;
  root.entries=getPracticeSymbols(face);
  for(const entry of root.entries) {
    const hasIcon=entry.icon||entry.trait, x=hasIcon?76:22;
    if(entry.trait) {
      const sprite=new PIXI.Sprite(getStockTraitTexture(entry.trait));sprite.width=40;sprite.height=40;sprite.position.set(22,y);root.addChild(sprite);
    } else if(entry.icon)addResourceIcon(root,entry.icon,42,y+20,40);
    const name=copy(root,entry.name,x,y,width-x-22,fontSize,{fill:RELIC.gold,fontWeight:'bold'});
    y+=name.height+8;
    y+=copy(root,entry.description,22,y,width-44,fontSize*.9).height+24;
  }
  paintRelicPanel(frame,0,0,width,y,0x1e211c,RELIC.brass,1);
  root.readingHeight=y;parent.addChild(root);return root;
}
