import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
export { getPracticeSymbols, addPracticeGlossary } from './inspection-symbols-pixi.js';

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
  node.inspectionLinkable = true;
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
  title.inspectionLinkable=false;
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
