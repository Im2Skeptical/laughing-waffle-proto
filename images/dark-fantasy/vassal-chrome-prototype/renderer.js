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

function action(parent,value,x,y,w,h,onClick,{disabled=false,bright=false}={}) {
  const root=new PIXI.Container(); root.position.set(x,y);
  const g=panel(root,0,0,w,h,bright); if (bright) g.tint=0xd3bc87;
  label(root,value,w/2,(h-26)/2,{size:26,color:disabled ? '#899086' : C.bone,bold:true,align:'center'});
  root.eventMode=disabled ? 'none' : 'static'; root.cursor=disabled ? 'default' : 'pointer'; root.hitArea=new PIXI.Rectangle(0,0,w,h);
  root.on('pointertap',()=>onClick?.()); parent.addChild(root); return root;
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

export function assembleFounder({founders,index=0,identity=0,guided=true,onNavigate,onSelect,onConfirm}={}) {
  const root=new PIXI.Container(), face=founders[index], warnings=[];
  panel(root,0,0,FOUNDER_SIZE.width,FOUNDER_SIZE.height);
  label(root,'CHOOSE YOUR FOUNDER',780,24,{size:46,align:'center',bold:true});
  label(root,'Begin a tradition your successors will inherit.',780,82,{size:27,align:'center',color:C.ash});
  panel(root,452,126,656,746,true);
  const p=assemblePortrait({classId:face.classId,identity,size:300,founder:!face.mystery,mystery:face.mystery});
  p.position.set(630,156); root.addChild(p);
  label(root,face.name.toUpperCase(),780,478,{size:48,align:'center'});
  label(root,face.mystery ? 'A tradition yet to be discovered' : `Founder of ${face.classId==='warrior' ? 'Warriors' : 'Scholars'}`,780,540,{size:29,align:'center',color:C.gold});
  label(root,face.mystery ? 'Its story has yet to be revealed.' : face.play,780,592,{size:26,align:'center',color:C.ash,width:600,clipH:68,warnings,field:'Class meaning'});
  label(root,face.mystery ? 'UNDISCOVERED' : 'FOUNDING ACTION',780,676,{size:17,align:'center',color:C.gold,bold:true});
  label(root,face.mystery ? '???' : face.outcome,780,707,{size:26,align:'center',width:610,clipH:64,warnings,field:'Founding outcome'});
  if (!face.mystery) label(root,`${face.phaseCost} phases · ${face.classId==='warrior' ? 'No conquest required' : 'Lyceum if space permits'}`,780,775,{size:25,align:'center',color:C.ash});
  const locked=face.mystery || (face.classId==='scholar' && guided);
  action(root,face.mystery ? 'NOT YET REVEALED' : locked ? 'LOCKED · PREVIEW ONLY' : `BEGIN WITH ${face.name.toUpperCase()}`,515,814,530,50,onConfirm,{disabled:locked,bright:!locked});
  for (const direction of [-1,1]) {
    const neighbour=founders[(index+direction+founders.length)%founders.length];
    const preview=assemblePortrait({classId:neighbour.classId,identity,size:205,mystery:neighbour.mystery});
    preview.position.set(direction<0 ? 105 : 1248,292); preview.alpha=.46; root.addChild(preview);
    label(root,neighbour.name,direction<0 ? 207 : 1350,523,{size:25,align:'center',color:C.ash});
    action(root,direction<0 ? '‹' : '›',direction<0 ? 175 : 1325,579,66,54,()=>onNavigate?.(direction));
  }
  // A fixed-width rail scales to eight founders without changing the screen layout.
  const pitch=88, railWidth=founders.length*pitch, start=(1560-railWidth)/2;
  founders.forEach((candidate,i)=>{
    const thumb=new PIXI.Container(); thumb.position.set(start+i*pitch,884);
    panel(thumb,0,0,76,62,i===index);
    const art=assemblePortrait({classId:candidate.classId,identity,size:54,mystery:candidate.mystery}); art.position.set(11,4); thumb.addChild(art);
    thumb.eventMode='static'; thumb.cursor='pointer'; thumb.hitArea=new PIXI.Rectangle(0,0,76,62); thumb.on('pointertap',()=>onSelect?.(i)); root.addChild(thumb);
  });
  root.previewWarnings=warnings; root.previewLocked=locked; return root;
}

export function assembleGame(state,callbacks={}) {
  const root=new PIXI.Container(), warnings=[];
  sprite(root,textures.screen,0,0,GAME_SIZE.width,GAME_SIZE.height);
  if (state.study==='founder') {
    const modal=assembleFounder({...state, ...callbacks}); modal.position.set(432,116); root.addChild(modal); warnings.push(...modal.previewWarnings);
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
    action(root,`CHOOSE ${state.face.name.toUpperCase()}`,1580,1020,396,40,callbacks.onConfirm,{bright:true});
  } else {
    panel(root,432,116,1560,958);
    const art=assemblePortrait({classId:state.face.classId,identity:state.identity,size:540,founder:state.crest,frameOnly:state.frameOnly}); art.position.set(942,296); root.addChild(art);
    label(root,`${state.face.classId.toUpperCase()} FRAME`,1212,176,{size:46,align:'center'});
  }
  root.previewWarnings=[...new Set(warnings)]; return root;
}
