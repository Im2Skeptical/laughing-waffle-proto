// Isolated assembly study. No GameState, runner, storage or RNG dependencies.
import { paintRelicPanel, RELIC } from '../../../src/views/chronicle-skin.js';

const ROOT = 'images/dark-fantasy/vassal-chrome-prototype/';
const textures = {};
export const GAME_SIZE = { width:2424, height:1080 };
export const CARD_SIZE = { width:500, height:352 };
export const FOUNDER_SIZE = { width:1560, height:958 };
const C = { bone:'#e0d4b4', gold:'#c3a469', ash:'#b1b4a6', dark:0x151c1a };

export async function loadVassalAssets() {
  const manifest = await (await fetch(`${ROOT}components.json`)).json();
  const [components, portraits, screen] = await Promise.all([
    PIXI.Assets.load(`${ROOT}${manifest.image}`), PIXI.Assets.load(`${ROOT}portraits.png`), PIXI.Assets.load(`${ROOT}game-screen.png`),
  ]);
  for (const [id,r] of Object.entries(manifest.frames)) textures[id] = new PIXI.Texture(components.baseTexture,new PIXI.Rectangle(r.x,r.y,r.w,r.h));
  const size = portraits.width / 2;
  for (const classId of ['warrior','scholar']) for (let identity=0;identity<2;identity++) {
    textures[`${classId}-${identity}`] = new PIXI.Texture(portraits.baseTexture,new PIXI.Rectangle(classId === 'warrior' ? 0 : size,identity * size,size,size));
  }
  textures.screen = screen;
}

function panel(parent,x,y,w,h,selected=false) {
  const g = new PIXI.Graphics();
  paintRelicPanel(g,x,y,w,h,C.dark,selected ? RELIC.gold : RELIC.brass,selected ? 3 : 2);
  parent.addChild(g); return g;
}

function sprite(parent,texture,x,y,w,h,contain=false) {
  const s = new PIXI.Sprite(texture);
  if (contain) {
    const scale = Math.min(w/texture.width,h/texture.height); s.width=texture.width*scale; s.height=texture.height*scale;
    s.position.set(x+(w-s.width)/2,y+(h-s.height)/2);
  } else { s.position.set(x,y); s.width=w; s.height=h; }
  parent.addChild(s); return s;
}

function label(parent,value,x,y,{size=22,color=C.bone,width,clipH,bold=false,align='left',warnings,field=value}={}) {
  const t = new PIXI.Text(String(value),{fontFamily:'Georgia, serif',fontSize:size,fill:color,fontWeight:bold ? 'bold' : 'normal',
    wordWrap:width != null,wordWrapWidth:width ?? 1000,breakWords:true,lineHeight:size*1.18,align});
  t.position.set(x,y); if (align==='center') t.anchor.x=.5;
  parent.addChild(t);
  if (clipH != null) {
    if (t.height > clipH+2) warnings?.push(`${field}: needs ${Math.ceil(t.height)}px, ${clipH}px available`);
    const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(align==='center' ? x-width/2 : x,y,width,clipH).endFill();
    parent.addChild(mask); t.mask=mask;
  }
  return t;
}

function rule(parent,x,y,width) { parent.addChild(new PIXI.Graphics().lineStyle(1,RELIC.brass,.85).moveTo(x,y).lineTo(x+width,y)); }

function action(parent,value,x,y,w,h,onClick,{disabled=false,bright=false,warnings}={}) {
  const root=new PIXI.Container(); root.position.set(x,y);
  const g=panel(root,0,0,w,h,bright); if (bright) g.tint=0xd3bc87;
  label(root,value,w/2,(h-31)/2,{size:26,color:disabled ? '#899086' : C.bone,bold:true,align:'center',width:w-24,clipH:31,warnings,field:'Confirmation button'});
  root.eventMode=disabled ? 'none' : 'static'; root.cursor=disabled ? 'default' : 'pointer'; root.hitArea=new PIXI.Rectangle(0,0,w,h);
  root.on('pointertap',()=>onClick?.()); parent.addChild(root); return root;
}

// Two Pixi picker studies in the actual game canvas: A dossier / B comparison.
// These are presentation fixtures, not a second implementation of class rules.
const CLASSES = {
  scholar: {
    from:'Cunning', to:'Ingenuity',
    statDetails:['+5% chance of higher-quality\nshop offers at the same price.','+1 Research from Discovery.'],
    removedEffect:'Only the base 3 Prestige per node remains.',
    loss:'Lose extra Prestige income from Cunning.',
    gain:'+5% shop-quality chance per point; extra Discovery Research.',
    abilities:[['Commission','Complete a new Practice or Structure for +20 Prestige.','commission'],['Free reroll','Once per shop: 0 Prestige. Still costs time.','reroll']],
    flavour:'A patient mind leaves its mark.',
  },
  warrior: {
    from:'Intelligence', to:'Prowess',
    statDetails:['+1 personal Martial Force\nto Campaigns.','Challenges: \u22125 points of danger\nand \u22121 base phase.'],
    removedEffect:'The Prestige-cost discount is removed.',
    loss:'Lose Intelligence\u2019s Prestige-cost discount.',
    gain:'+1 personal Martial Force per point; safer, faster Challenges.',
    abilities:[['Personal Retinue','1 Force per 10 held Prestige, up to your Warrior cap.','retinue'],['Risk reward','Survive 25% base danger: +13 Prestige. Scales with danger.','risk']],
    flavour:'Their courage outlives their name.',
  },
};
const EXPLANATIONS = {
  cunning:['Cunning','Each point adds 1 Prestige per completed node, on top of 3 base Prestige. Scholars replace this stat with Ingenuity and keep only the 3 base Prestige.'],
  wisdom:['Wisdom','Each completed node grants 2 base EXP plus Wisdom. This stat is retained by both Warriors and Scholars.'],
  effectiveness:['Effectiveness','Each point discounts phase costs by 8%, capped at 60%. Costs round up. This stat is retained by both Warriors and Scholars.'],
  intelligence:['Intelligence','Each point discounts Prestige costs by 8%, capped at 60%. Costs round up. Warriors replace this stat with Prowess and lose this discount.'],
  ingenuity:['Ingenuity','Each point adds a 5% chance to raise offered shop quality by one tier, capped at 75%. The price stays the same. Each point also adds 1 Research to Discovery rewards.'],
  prowess:['Prowess','Each point adds 1 personal Martial Force to Campaigns. In Challenges it removes 5 percentage points of danger and 1 base phase. Personal Prowess does not supply automatic settlement defense.'],
  commission:['Commission','Choose a new Practice or a completed Structure as your objective. Completing it earns 20 Prestige, checked when a Life Map node completes. Accepting the objective costs 0 phases.'],
  reroll:['Free reroll','One reroll per shop, before staging purchases. Scholar cost: 0 Prestige. It still adds 216 base phases, reduced by Effectiveness and applicable Heirlooms.'],
  retinue:['Personal Retinue','Gain 1 Force per 10 Prestige held. Base cap: 1 per 10 Warriors, rounded up, across player settlements. Institutions and Practices can raise the cap. With no Warriors, Retinue is zero. It contributes to Campaigns, not automatic defense.'],
  risk:['Risk reward','Surviving a risky choice grants Prestige equal to its base danger \u00d7 50, rounded up. Example: 25% base danger gives +13 Prestige. Campaigns and Challenges use their base danger before Prowess or Force reductions. Other risky choices use their stated danger. This is added to the choice\u2019s own reward.'],
};

function inspectTarget(root,id,x,y,w,h,onInspect) {
  const hit=new PIXI.Container(); hit.position.set(x,y); hit.eventMode='static';hit.cursor='pointer';hit.hitArea=new PIXI.Rectangle(0,0,w,h);
  hit.on('pointertap',()=>onInspect?.(id));root.addChild(hit);
  (root.previewTargets??={})[id]={x,y,width:w,height:h};
}

// Five visible stat names: three retained, one removed, one class replacement.
function statPanel(root,classId,x,y,width,{warnings,onInspect}={}) {
  const data=CLASSES[classId], removed='#80867d', detailX=x+332, detailWidth=width-360;
  panel(root,x,y,width,360);
  label(root,'DEFAULT STATS',x+24,y+18,{size:24,color:C.ash});
  ['Cunning','Intelligence','Wisdom','Effectiveness'].forEach((name,i)=>{
    const top=y+58+i*70, lost=name===data.from;
    const text=label(root,name,x+24,top,{size:34,color:lost?removed:C.bone,width:266,clipH:43,warnings,field:name});
    if(lost) {
      root.addChild(new PIXI.Graphics().lineStyle(2,0x80867d).moveTo(text.x,text.y+22).lineTo(text.x+text.width,text.y+22));
      label(root,'REMOVED',x+24,top+39,{size:20,color:removed});
    }
    inspectTarget(root,name.toLowerCase(),x+18,top-4,278,70,onInspect);
  });
  panel(root,x+308,y+10,width-318,340,true);
  label(root,'CLASS STAT \u00b7 PER POINT',detailX,y+26,{size:24,color:C.gold});
  label(root,`${data.to}  \u203a`,detailX,y+62,{size:44,bold:true,color:C.gold});
  data.statDetails.forEach((copy,i)=>label(root,copy,detailX,y+120+i*78,{size:32,width:detailWidth,clipH:77,warnings,field:`${data.to} effect ${i+1}`}));
  rule(root,detailX,y+280,detailWidth);
  label(root,`Replaces ${data.from}.\n${data.removedEffect}`,detailX,y+292,{size:26,color:C.ash,width:detailWidth,clipH:64,warnings,field:'Removed stat effect'});
  inspectTarget(root,data.to.toLowerCase(),x+314,y+14,width-332,332,onInspect);
}

function classAbilities(root,classId,x,y,width,{size=32,warnings,onInspect}={}) {
  label(root,'CLASS ABILITIES \u00b7 TAP FOR RULES',x,y,{size:24,color:C.gold});
  CLASSES[classId].abilities.forEach(([name,copy,id],i)=>{
    const top=y+42+i*112;
    label(root,`${name}  \u203a`,x,top,{size:36,bold:true});
    label(root,copy,x,top+46,{size,color:C.ash,width,clipH:74,warnings,field:name});
    inspectTarget(root,id,x-8,top-4,width+16,110,onInspect);
  });
}

function explanation(root,id,onClose) {
  const data=EXPLANATIONS[id];if(!data) return;
  const overlay=new PIXI.Container();
  const shade=new PIXI.Graphics().beginFill(0x050908,.88).drawRect(0,0,FOUNDER_SIZE.width,FOUNDER_SIZE.height).endFill();
  shade.eventMode='static';shade.on('pointertap',()=>onClose?.());overlay.addChild(shade);
  panel(overlay,242,150,1076,630,true);
  label(overlay,data[0],286,190,{size:48,bold:true});
  label(overlay,data[1],286,276,{size:36,width:982,clipH:420,warnings:root.previewWarnings,field:'Rule explanation'});
  action(overlay,'CLOSE',1092,184,182,78,onClose);
  root.addChild(overlay);root.previewTargets={close:{x:1092,y:184,width:182,height:78}};
}

export function assemblePortrait({classId='warrior',identity=0,size=240,founder=false,mystery=false,frameOnly=false}={}) {
  const root=new PIXI.Container();
  if (mystery) {
    panel(root,0,0,size,size*1.02);
    sprite(root,textures.mystery,size*.08,size*.08,size*.84,size*.9,true).tint=0x202020;
    label(root,'?',size/2,size*.24,{size:size*.42,align:'center',color:C.bone});
    return root;
  }
  if (classId==='common') {
    panel(root,0,0,size,size*1.04);
    if (!frameOnly) sprite(root,textures[`scholar-${identity}`],6,6,size-12,size*1.04-12);
    return root;
  }
  const h=size * textures[classId].height/textures[classId].width;
  if (!frameOnly) {
    const mask=new PIXI.Graphics(); mask.beginFill(0xffffff);
    if (classId==='warrior') mask.drawCircle(size*.5,h*.505,size*.357);
    else mask.moveTo(size*.212,h*.835).lineTo(size*.212,h*.425)
      .quadraticCurveTo(size*.212,h*.195,size*.5,h*.195)
      .quadraticCurveTo(size*.788,h*.195,size*.788,h*.425).lineTo(size*.788,h*.835).closePath();
    mask.endFill();
    // Paintings remain independent of the hollow class frames.
    const portrait=sprite(root,textures[`${classId}-${identity}`],size*.13,h*.14,size*.74,h*.74);
    root.addChild(mask); portrait.mask=mask;
  }
  sprite(root,textures[classId],0,0,size,h);
  if (founder) sprite(root,textures.crest,size*.34,-size*.105,size*.32,size*.32,true);
  return root;
}

export function assembleRegular(face,{layout='identity',font=22,selected=false}={}) {
  const root=new PIXI.Container(), warnings=[];
  panel(root,0,0,CARD_SIZE.width,CARD_SIZE.height,selected);
  const portrait=assemblePortrait({classId:face.classId,identity:face.identity,size:128});
  const keyLabel=face.classId==='scholar' ? 'Ingenuity' : face.classId==='common' ? 'Effectiveness' : 'Prowess';
  const classLabel=face.classId==='common' ? 'UNCLASSED' : face.classId.toUpperCase();
  const colour=face.classId==='scholar' ? '#b4a6cf' : face.classId==='common' ? '#b6b49b' : '#ceb48a';
  const identityBlock=(top,compact=false)=>{
    portrait.position.set(14,top); root.addChild(portrait);
    label(root,classLabel,160,top+1,{size:24,color:colour,bold:true});
    label(root,face.name,160,top+(compact ? 28 : 32),{size:compact ? 30 : 32,width:320,clipH:39,warnings,field:'Name'});
    label(root,`${face.region} · Age ${face.age}`,160,top+(compact ? 72 : 78),{size:font,width:320,clipH:30,warnings,field:'Region / age'});
    if (!compact) label(root,`Prestige ${face.prestige} · ${keyLabel} ${face.keyStat}`,160,top+113,{size:font,width:320,clipH:32,warnings,field:'Prestige / class stat'});
  };
  const signatureBlock=(top,height)=>{
    label(root,'SIGNATURE OPPORTUNITY',18,top,{size:16,color:C.gold,bold:true});
    label(root,face.signatureTitle,18,top+26,{size:28,color:face.signatureColor ?? '#a29ee8',width:464,clipH:36,warnings,field:'Signature title'});
    label(root,face.description,18,top+71,{size:font,color:C.ash,width:464,clipH:height,warnings,field:'Signature explanation'});
  };
  if (layout==='signature') {
    signatureBlock(16,70); rule(root,18,160,464); identityBlock(180);
  } else if (layout==='stats') {
    identityBlock(16,true);
    const items=face.classId==='scholar'
      ? [['Ingenuity',face.keyStat],['Wisdom',face.wisdom],['Effectiveness',face.effectiveness],['Intelligence',face.otherStat]]
      : [['Cunning',face.otherStat],['Wisdom',face.wisdom],['Effectiveness',face.effectiveness],[face.classId==='common' ? 'Intelligence' : 'Prowess',face.keyStat]];
    label(root,`Prestige ${face.prestige}`,160,128,{size:font,width:320,clipH:29,warnings,field:'Prestige'});
    for (let i=0;i<items.length;i++) label(root,`${items[i][0]} ${items[i][1]}`,18+(i%2)*244,160+Math.floor(i/2)*28,{size:font,color:C.ash,width:232,clipH:28,warnings,field:items[i][0]});
    rule(root,18,219,464); signatureBlock(226,54);
  } else {
    identityBlock(16); rule(root,18,180,464); signatureBlock(197,65);
  }
  const clip=new PIXI.Graphics().beginFill(0xffffff).drawRect(0,0,CARD_SIZE.width,CARD_SIZE.height).endFill(); root.addChild(clip); root.mask=clip;
  root.previewWarnings=warnings; return root;
}

export function assembleFounder({founders,index=0,identity=0,guided=true,variant='A',inspect=null,onNavigate,onSelect,onConfirm,onInspect,onCloseInspect,onVariant,onExitPhone}={}) {
  const root=new PIXI.Container(), face=founders[index], warnings=[];
  root.previewWarnings=warnings;
  panel(root,0,0,FOUNDER_SIZE.width,FOUNDER_SIZE.height);
  label(root,`${index+1} / ${founders.length}`,1212,52,{size:28,align:'center',color:C.ash});
  action(root,'\u2039',1280,22,92,84,()=>onNavigate?.(-1));
  action(root,'\u203a',1400,22,92,84,()=>onNavigate?.(1));
  root.previewTargets={previous:{x:1280,y:22,width:92,height:84},next:{x:1400,y:22,width:92,height:84}};
  if(face.mystery) {
    const portrait=assemblePortrait({size:300,mystery:true});portrait.position.set(630,190);root.addChild(portrait);
    label(root,'UNKNOWN FOUNDER',780,548,{size:48,align:'center'});
    label(root,'No class or mechanics have been authored for this slot.',780,630,{size:34,width:1080,align:'center'});
  } else if(variant==='B') {
    for(const [i,candidate] of founders.slice(0,2).entries()) {
      const x=28+i*760, selected=index===i;
      panel(root,x,138,744,642,selected);
      const portrait=assemblePortrait({classId:candidate.classId,identity,size:132,founder:true});portrait.position.set(x+20,173);root.addChild(portrait);
      label(root,candidate.name.toUpperCase(),x+174,163,{size:42,bold:true});
      label(root,`Founds ${candidate.classId==='warrior'?'Warriors':'Scholars'}`,x+174,222,{size:30,color:C.gold});
      label(root,candidate.outcome,x+24,316,{size:32,width:696,clipH:80,warnings,field:'Comparison founding'});
      label(root,`${candidate.phaseCost} base phases \u00b7 0 Prestige${candidate.classId==='scholar'?' \u00b7 Lyceum if space':''}`,x+24,397,{size:27,width:696,clipH:34,warnings,field:'Founding cost'});
      const data=CLASSES[candidate.classId];
      label(root,`${data.from} \u2192 ${data.to}  \u203a`,x+24,451,{size:37,bold:true,width:696,clipH:46,warnings,field:'Comparison exchange'});
      label(root,data.loss,x+24,504,{size:30,color:'#c0aaa0',width:696,clipH:40,warnings,field:'Comparison loss'});
      label(root,data.gain,x+24,550,{size:30,width:696,clipH:80,warnings,field:'Comparison gain'});
      inspectTarget(root,`${candidate.classId}:exchange`,x+16,443,712,181,()=>onInspect?.(data.to.toLowerCase()));
      const summaries=candidate.classId==='scholar'?['Commission \u00b7 +20 Prestige','Reroll \u00b7 0 Prestige; costs time']:['Retinue \u00b7 1 Force / 10 Prestige','Risk \u00b7 25% base danger: +13 Prestige'];
      data.abilities.forEach(([name,copy,id],j)=>{
        label(root,`${summaries[j]} \u203a`,x+24,645+j*56,{size:32,color:C.gold,width:696,clipH:42,warnings,field:name});
        inspectTarget(root,`${candidate.classId}:${id}`,x+16,635+j*56,712,56,()=>onInspect?.(id));
      });
      action(root,selected?'SELECTED':`INSPECT ${candidate.name.toUpperCase()}`,x+24,790,696,68,()=>onSelect?.(i),{bright:selected,warnings});
      root.previewTargets[`select:${i}`]={x:x+24,y:790,width:696,height:68};
    }
  } else {
    label(root,face.name.toUpperCase(),40,86,{size:54,bold:true});
    label(root,face.classId.toUpperCase(),40,160,{size:30,color:C.gold});
    const portrait=assemblePortrait({classId:face.classId,identity,size:440,founder:true});portrait.position.set(46,278);root.addChild(portrait);
    statPanel(root,face.classId,540,130,978,{warnings,onInspect});
    classAbilities(root,face.classId,564,518,930,{warnings,onInspect});
    const flavour=label(root,CLASSES[face.classId].flavour,40,774,{size:26,color:'#929789',width:440,clipH:64,warnings,field:'Flavour'});flavour.style.fontStyle='italic';
  }
  const locked=face.mystery || (face.classId==='scholar' && guided);
  if(variant!=='B'||face.mystery) {
    action(root,face.mystery?'UNAVAILABLE':locked?'LOCKED \u00b7 PREVIEW':`BEGIN WITH ${face.name.toUpperCase()}`,1024,802,494,76,onConfirm,{disabled:locked,bright:!locked,warnings});
    root.previewTargets.confirm={x:1024,y:802,width:494,height:76};
  } else {
    action(root,locked?'LOCKED \u00b7 PREVIEW':`BEGIN WITH ${face.name.toUpperCase()}`,1004,868,514,76,onConfirm,{disabled:locked,bright:!locked,warnings});
    root.previewTargets.confirm={x:1004,y:868,width:514,height:76};
  }
  const pitch=variant==='B'?70:88, railWidth=founders.length*pitch, start=variant==='B'?390:(1560-railWidth)/2;
  founders.forEach((candidate,i)=>{
    const thumb=new PIXI.Container(); thumb.position.set(start+i*pitch,890);
    const w=variant==='B'?62:76;
    panel(thumb,0,0,w,62,i===index);
    const art=assemblePortrait({classId:candidate.classId,identity,size:54,mystery:candidate.mystery}); art.position.set((w-54)/2,4); thumb.addChild(art);
    thumb.eventMode='static'; thumb.cursor='pointer'; thumb.hitArea=new PIXI.Rectangle(0,0,w,62); thumb.on('pointertap',()=>onSelect?.(i)); root.addChild(thumb);
    root.previewTargets[`founder:${i}`]={x:start+i*pitch,y:890,width:w,height:62};
  });
  // Floating workshop controls are Pixi too; all selector content stays in-game.
  action(root,variant==='A'?'A \u00b7 DOSSIER \u203a':'B \u00b7 COMPARE \u203a',28,890,340,62,()=>onVariant?.(variant==='A'?'B':'A'));
  root.previewTargets.variant={x:28,y:890,width:340,height:62};
  if(variant!=='B') {
    action(root,'WORKBENCH',1190,890,328,62,onExitPhone);
    root.previewTargets.workbench={x:1190,y:890,width:328,height:62};
  } else {
    action(root,'WORKBENCH',680,28,316,76,onExitPhone);
    root.previewTargets.workbench={x:680,y:28,width:316,height:76};
  }
  if(inspect) explanation(root,inspect,onCloseInspect);
  root.previewLocked=locked;return root;
}

export function assembleGame(state,callbacks={}) {
  const root=new PIXI.Container(), warnings=[];
  sprite(root,textures.screen,0,0,GAME_SIZE.width,GAME_SIZE.height);
  if (state.study==='founder') {
    const modal=assembleFounder({...state, ...callbacks}); modal.position.set(432,116); root.addChild(modal); warnings.push(...modal.previewWarnings);
    root.previewTargets=Object.fromEntries(Object.entries(modal.previewTargets??{}).map(([id,r])=>[id,{...r,x:r.x+432,y:r.y+116}]));
  } else if (state.study==='regular') {
    // Cover the original drawer; retain the original HUD, map, dock and lever.
    panel(root,432,590,1560,484);
    label(root,'CHOOSE A VASSAL',456,605,{size:30,bold:true});
    label(root,`${state.face.classId==='scholar' ? 'Scholar' : 'Warrior'} tradition established`,928,610,{size:23,color:C.ash});
    const faces=[state.face,{...state.face,name:'Tovan',region:'R04',identity:1,age:22,prestige:19},{...state.face,name:'Mira',region:'R04',classId:'common',identity:0,age:18,prestige:22,keyStat:2}];
    faces.forEach((face,i)=>{
      const card=assembleRegular(face,{layout:state.layout,font:state.font,selected:i===0}); card.position.set(448+i*514,652); root.addChild(card);
      warnings.push(...card.previewWarnings.map(message=>`${i===0 ? 'Selected card' : face.name}: ${message}`));
    });
    panel(root,448,1020,1528,40);
    label(root,`${state.face.name} · ${state.face.classId==='scholar' ? 'Scholar' : 'Warrior'} · Starts in ${state.face.region}`,468,1026,{size:24,width:1120,clipH:30,warnings,field:'Confirmation summary'});
    action(root,`CHOOSE ${state.face.name.toUpperCase()}`,1580,1020,396,40,callbacks.onConfirm,{bright:true,warnings});
  } else {
    panel(root,432,116,1560,958);
    const art=assemblePortrait({classId:state.face.classId,identity:state.identity,size:540,founder:state.crest,frameOnly:state.frameOnly}); art.position.set(942,296); root.addChild(art);
    label(root,`${state.face.classId.toUpperCase()} FRAME`,1212,176,{size:46,align:'center'});
  }
  root.previewWarnings=[...new Set(warnings)]; return root;
}
