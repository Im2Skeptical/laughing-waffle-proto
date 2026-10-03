// Throwaway workbench: all edits are local presentation fixtures.
import { VASSAL_FOUNDING_OPTIONS, VASSAL_SIGNATURE_NODE_VARIANTS } from '../../../src/defs/gamepieces/vassal-life-map-defs.js';
import { loadVassalAssets, assemblePortrait, assembleRegular, assembleFounder, assembleGame, GAME_SIZE, CARD_SIZE, FOUNDER_SIZE } from './renderer.js';
import { attachDevPreviewDisplay } from '../../../src/views/dev-preview-display.js';

const $=id=>document.getElementById(id);
const studies=['founder','regular','frame'];
const layouts=['identity','signature','stats'];
const layoutNames={identity:'Identity & signature',signature:'Signature first',stats:'Full stat comparison'};
const apps=[];
let state,hero,ready=false,galleryKey='',galleryApps=[];
let displayMode={active:false};

function defaults(study='founder') {
  const signature=VASSAL_SIGNATURE_NODE_VARIANTS.legacyPlus;
  return {study,surface:study==='frame' ? 'assembly' : 'game',slots:4,index:0,guided:true,classId:'warrior',identity:0,crest:false,frameOnly:false,
    layout:'identity',name:'Aren',region:'R03',age:20,prestige:24,keyStat:2,otherStat:1,wisdom:1,effectiveness:2,
    signature:'legacyPlus',signatureTitle:signature.label,description:signature.description,signatureColor:'#a29ee8',font:22,size:440,lastAction:null};
}

function founders() {
  return [
    {name:'Warlord',classId:'warrior',play:'Train Warriors. Build Support. Lead campaigns.',outcome:'Train up to 10 existing adults as Warriors.',phaseCost:VASSAL_FOUNDING_OPTIONS.warlordFounding.phaseCost},
    {name:'Philosopher',classId:'scholar',play:'Develop Knowledge, Ingenuity and Discovery.',outcome:'Train up to 2 existing adults as Scholars.',phaseCost:VASSAL_FOUNDING_OPTIONS.philosopherFounding.phaseCost},
    ...Array.from({length:state.slots-2},(_,i)=>({name:'Unknown founder',classId:null,mystery:true,slot:i+3})),
  ];
}

function face(classId=state.classId) { return {...state,classId}; }
function sceneState() { return {...state,face:face(),founders:founders()}; }
function makeApp(host) {
  const app=new PIXI.Application({width:10,height:10,backgroundAlpha:0,antialias:true,autoStart:false,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preserveDrawingBuffer:true});
  app.renderer.plugins.accessibility.div.classList.add('prototype-accessibility');
  host.appendChild(app.view); apps.push(app); return app;
}
function draw(app,object,width,logical,x=0,y=0) {
  for (const child of app.stage.removeChildren()) child.destroy({children:true});
  const scale=width/logical.width;
  app.renderer.resize(Math.ceil(width),Math.ceil(logical.height*scale));
  object.scale.set(scale);object.position.set(x*scale,y*scale);app.stage.addChild(object);app.render();
  return object.previewWarnings ?? [];
}

function choose(index) {state.index=((index%state.slots)+state.slots)%state.slots;sync();render(`Focused founder ${state.index+1} of ${state.slots}.`);}
function navigate(direction) {choose(state.index+direction);}
function confirm() {
  const f=founders()[state.index];
  if (state.study==='founder' && (f.mystery || (state.guided && f.classId==='scholar'))) return;
  state.lastAction=state.study==='founder' ? `Preview: ${f.name} would enter the founding node.` : `Preview: ${state.name} would start in ${state.region}.`;
  $('event-status').textContent=`${state.lastAction} No game or save changed.`;publishState();
}
const callbacks={onNavigate:navigate,onSelect:choose,onConfirm:confirm};

function sync() {
  for (const id of ['surface','slots','classId','identity','layout','name','region','age','prestige','keyStat','otherStat','wisdom','effectiveness','signature','signatureTitle','description','font','size']) $(id).value=String(state[id]);
  for (const id of ['guided','crest','frameOnly']) $(id).checked=state[id];
  $('founder').replaceChildren(...founders().map((f,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${i+1}. ${f.mystery ? `Unknown founder ${i-1}` : f.name}`;return option;}));
  $('founder').value=String(state.index);
  $('key-stat-label').firstChild.textContent=state.classId==='scholar' ? 'Ingenuity' : 'Prowess';
  $('other-stat-label').firstChild.textContent=state.classId==='scholar' ? 'Intelligence' : 'Cunning';
  document.querySelectorAll('[data-for]').forEach(node=>{node.hidden=!node.dataset.for.split(' ').includes(state.study);});
  $('previous').hidden=$('next').hidden=state.study!=='founder';
  for (const node of document.querySelectorAll('[data-study]')) node.setAttribute('aria-pressed',String(node.dataset.study===state.study));
  const url=new URL(location.href);
  for (const [key,value] of Object.entries({study:state.study,layout:state.layout,class:state.classId,founder:state.index,slots:state.slots,guided:state.guided})) url.searchParams.set(key,value);
  history.replaceState(null,'',url);
}

function publishState() {
  $('preview-state').textContent=JSON.stringify({...state,focusedFounder:founders()[state.index],warnings:window.vassalWorkbench?.warnings ?? []},null,2);
}

function buildGallery() {
  const key=`${state.study}:${state.slots}`;
  if (key===galleryKey) return;
  galleryKey=key;
  for (const app of galleryApps) {app.destroy(true,{children:true});apps.splice(apps.indexOf(app),1);}
  galleryApps=[];$('gallery').replaceChildren();
  const samples=state.study==='founder' ? founders().map((f,index)=>({index,title:f.mystery ? `Unknown ${index-1}` : f.name}))
    : state.study==='frame' ? ['warrior','scholar'].flatMap(classId=>[false,true].map(crest=>({classId,crest,title:`${classId==='warrior' ? 'Warrior' : 'Scholar'} · ${crest ? 'founder' : 'regular'}`})))
      : ['warrior','scholar'].flatMap(classId=>layouts.map(layout=>({classId,layout,title:`${classId==='warrior' ? 'Warrior' : 'Scholar'} · ${layoutNames[layout]}`})));
  for (const sample of samples) {
    const button=document.createElement('button');button.type='button';button.className='sample';button.setAttribute('aria-label',`Inspect ${sample.title}`);
    const slot=document.createElement('div');slot.className='sample-slot';button.appendChild(slot);$('gallery').appendChild(button);
    const app=makeApp(slot);galleryApps.push(app);app.previewSample=sample;
    const title=document.createElement('strong');title.textContent=sample.title;button.appendChild(title);
    const note=document.createElement('span');note.textContent=state.study==='regular' ? 'Same person & signature · different hierarchy' : state.study==='frame' ? 'Same painting · independent frame and crest' : 'Select to focus this founder';button.appendChild(note);
    button.addEventListener('click',()=>{
      if (state.study==='founder') choose(sample.index);
      else {Object.assign(state,sample);delete state.title;sync();render('Comparison loaded. Edits remain local to this study.');}
    });
  }
}

function renderGallery() {
  buildGallery();
  $('comparison-title').textContent=state.study==='founder' ? 'One focused choice · room for more traditions' : state.study==='frame' ? 'Warrior & Scholar · regular and founder' : 'Warrior & Scholar · three text layouts';
  for (const app of galleryApps) {
    const s=app.previewSample;
    if (state.study==='regular') draw(app,assembleRegular(face(s.classId),{layout:s.layout,font:state.font}),264,CARD_SIZE);
    else {
      const f=state.study==='founder' ? founders()[s.index] : s;
      const portrait=assemblePortrait({classId:f.classId,identity:state.identity,size:240,founder:state.study==='founder' ? !f.mystery : s.crest,mystery:f.mystery});
      draw(app,portrait,state.study==='founder' ? 140 : 120,{width:280,height:300},20,35);
    }
    const selected=state.study==='founder' ? s.index===state.index : state.study==='frame' ? s.classId===state.classId && s.crest===state.crest : s.classId===state.classId && s.layout===state.layout;
    app.view.closest('button').classList.toggle('selected',selected);app.view.closest('button').setAttribute('aria-pressed',String(selected));
  }
}

function previewScene() {
  let object,logical,x=0,y=0;
  if (state.surface==='game') {object=assembleGame(sceneState(),callbacks);logical=GAME_SIZE;}
  else if (state.study==='founder') {object=assembleFounder({...sceneState(),...callbacks});logical=FOUNDER_SIZE;}
  else if (state.study==='regular') {object=assembleRegular(face(),{layout:state.layout,font:state.font,selected:true});logical=CARD_SIZE;}
  else {object=assemblePortrait({classId:state.classId,identity:state.identity,size:300,founder:state.crest,frameOnly:state.frameOnly});logical={width:340,height:380};x=20;y=48;}
  return {object,logical,x,y};
}

function exportPng() {
  const {object,logical,x,y}=previewScene();
  const width=logical.width*(state.surface==='assembly' && state.study!=='founder' ? 2 : 1);
  const app=new PIXI.Application({width:1,height:1,backgroundAlpha:0,antialias:true,autoStart:false,resolution:1,preserveDrawingBuffer:true});
  try {draw(app,object,width,logical,x,y);return app.view.toDataURL('image/png');}
  finally {app.destroy(true,{children:true});}
}

function render(message='') {
  if (!ready) return;
  const width=Math.max(180,$('hero').clientWidth-2);
  const {object,logical,x,y}=previewScene();
  const requested=Math.min(state.surface==='assembly' && state.study!=='founder' ? Math.min(width,state.size) : width,
    displayMode.active ? $('hero').clientHeight*logical.width/logical.height : Infinity);
  const warnings=draw(hero,object,requested,logical,x,y);
  window.vassalWorkbench.warnings=warnings;
  $('bounds-status').classList.toggle('warning',warnings.length>0);
  $('bounds-status').textContent=warnings.length ? `Text needs revision: ${warnings.join(' · ')}` : 'Text fits its reserved regions. Frames and paintings remain separate layers.';
  $('hero').classList.toggle('checker',$('checker').checked);
  $('mode').textContent=`${state.study} · ${state.surface==='game' ? 'fixed 2424 × 1080 game canvas' : 'assembly study'}`;
  $('preview-title').textContent=state.study==='founder' ? `${founders()[state.index].name} · ${state.index+1} / ${state.slots}` : state.study==='regular' ? `${state.classId==='scholar' ? 'Scholar' : 'Warrior'} · ${layoutNames[state.layout]}` : `${state.classId==='scholar' ? 'Scholar' : 'Warrior'} frame`;
  $('hero').setAttribute('aria-label',`${$('preview-title').textContent}. ${state.surface==='game' ? 'Fixed game screen.' : 'Enlarged assembly.'} ${state.study==='founder' && founders()[state.index].mystery ? 'Black silhouette with question mark; unavailable.' : ''}`);
  $('font-label').textContent=`${state.font} logical px`;$('size-label').textContent=`${state.size} px (assembly only)`;
  $('rules').textContent=state.study==='founder' ? 'One founder is centred. Use arrows, swipe, thumbnails or Shift-scroll to browse. Known locked founders retain their explanation; unknown slots show silhouettes. The optional first-run lock is a proposed gate.'
    : state.study==='regular' ? 'Identity, starting settlement, Age, Prestige and a signature opportunity belong on the candidate. Compare a key-stat summary with all four named stats. Long copy raises a fit warning instead of silently shrinking the font.'
      : 'The regular Warrior ring uses swords; the Scholar arch uses scrolls and a book. Toggle the separate crest to make either one a founder. Empty-frame exports keep a transparent aperture.';
  if (message) $('event-status').textContent=message;
  renderGallery();publishState();
}

function selectStudy(study) {
  if (!studies.includes(study)) return;
  state.study=study;if (study==='frame') state.surface='assembly';
  sync();render('Study changed. No production menu or save was modified.');
}

async function main() {
  const params=new URL(location.href).searchParams;
  state=defaults(studies.includes(params.get('study')) ? params.get('study') : 'founder');
  if (layouts.includes(params.get('layout'))) state.layout=params.get('layout');
  if (params.get('class')==='scholar') state.classId='scholar';
  if ([4,6,8].includes(Number(params.get('slots')))) state.slots=Number(params.get('slots'));
  state.index=Math.max(0,Math.min(state.slots-1,Number(params.get('founder'))||0));state.guided=params.get('guided')!=='false';
  for (const [id,s] of Object.entries(VASSAL_SIGNATURE_NODE_VARIANTS)) {const option=document.createElement('option');option.value=id;option.textContent=s.label;$('signature').appendChild(option);}
  await loadVassalAssets();hero=makeApp($('hero'));ready=true;
  displayMode=attachDevPreviewDisplay($('hero'),{onChange:()=>{if(window.vassalWorkbench)render();}});
  window.vassalWorkbench={get state(){return {...state};},get face(){return face();},get founders(){return founders();},warnings:[],selectStudy,navigate,selectFounder:choose,exportPng,get canvasCount(){return apps.length;}};
  sync();render('Ready to review. Changes affect this workbench only.');
  document.querySelectorAll('[data-study]').forEach(button=>button.addEventListener('click',()=>selectStudy(button.dataset.study)));
  $('controls').addEventListener('submit',e=>e.preventDefault());
  for (const id of ['surface','classId','identity','layout','guided','crest','frameOnly']) $(id).addEventListener('change',()=>{
    state[id]=$(id).type==='checkbox' ? $(id).checked : id==='identity' ? Number($(id).value) : $(id).value;sync();render('Preview properties updated.');
  });
  $('slots').addEventListener('change',()=>{state.slots=Number($('slots').value);state.index=Math.min(state.index,state.slots-1);sync();render('Founder rail resized; the fixed game layout is unchanged.');});
  $('founder').addEventListener('change',()=>choose(Number($('founder').value)));
  for (const id of ['name','region','signatureTitle','description']) $(id).addEventListener('input',()=>{state[id]=$(id).value;render('Preview text updated.');});
  for (const id of ['age','prestige','keyStat','otherStat','wisdom','effectiveness','font','size']) $(id).addEventListener('input',()=>{
    state[id]=Math.max(Number($(id).min),Math.min(Number($(id).max),Math.floor(Number($(id).value)||0)));render();
  });
  $('signature').addEventListener('change',()=>{const s=VASSAL_SIGNATURE_NODE_VARIANTS[$('signature').value];state.signature=s.id;state.signatureTitle=s.label;state.description=s.description;state.signatureColor=`#${s.color.toString(16).padStart(6,'0')}`;sync();render('Loaded the signature definition. Edit the title and explanation to explore the copy.');});
  $('previous').addEventListener('click',()=>navigate(-1));$('next').addEventListener('click',()=>navigate(1));
  $('checker').addEventListener('change',()=>render());
  $('reset').addEventListener('click',()=>{state=defaults(state.study);sync();render('Restored this study’s example properties.');});
  $('export').addEventListener('click',()=>{const link=document.createElement('a');link.download=`vassal-${state.study}-${state.study==='founder' ? state.index+1 : state.classId}-${state.surface}.png`;link.href=exportPng();link.click();$('event-status').textContent='Saved the full-resolution preview as PNG.';});
  document.addEventListener('keydown',event=>{if (state.study!=='founder' || event.target.closest('input,textarea,select,[contenteditable]')) return;if (event.key==='ArrowLeft' || event.key==='ArrowRight') {event.preventDefault();navigate(event.key==='ArrowLeft' ? -1 : 1);}});
  let start=null,lastWheel=0;
  hero.view.addEventListener('pointerdown',event=>{start={x:event.clientX,y:event.clientY};});
  hero.view.addEventListener('pointerup',event=>{if (start && state.study==='founder' && Math.abs(event.clientX-start.x)>42 && Math.abs(event.clientX-start.x)>Math.abs(event.clientY-start.y)) navigate(event.clientX<start.x ? 1 : -1);start=null;});
  hero.view.addEventListener('pointercancel',()=>{start=null;});
  hero.view.addEventListener('wheel',event=>{if (state.study!=='founder' || (!event.shiftKey && Math.abs(event.deltaX)<=Math.abs(event.deltaY))) return;event.preventDefault();if (performance.now()-lastWheel<250) return;lastWheel=performance.now();navigate((event.deltaX || event.deltaY)>0 ? 1 : -1);},{passive:false});
  let previousWidth=0;new ResizeObserver(()=>{const width=$('hero').clientWidth;if (Math.abs(previousWidth-width)>1) {previousWidth=width;render();}}).observe($('hero'));
  document.body.dataset.ready='true';
}

main().catch(error=>{$('error').hidden=false;$('error').textContent=`The workbench could not load: ${error.message}. Serve the project root with npm run preview:vassals.`;console.error(error);});
