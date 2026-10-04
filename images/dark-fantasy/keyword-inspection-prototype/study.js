// Three keyword-navigation variants in an isolated Dev Lab workbench. The
// inspection uses current read-only presentation data; state is memory-only.
import { getGamepieceFace } from '../../../src/model/gamepiece-presentation.js';
import { getPracticeSymbols } from '../../../src/views/practice-reading-pixi.js';
import { addSettlementPiece } from '../../../src/views/settlement-piece-pixi.js';
import { preloadChronicleArt } from '../../../src/views/chronicle-art.js';
import { terms, aliases } from './terms.js';

const $ = id => document.getElementById(id);
const variants = { A:'Beside the word', B:'Reference rail', C:'Reading trail' };
const flavour = { anatomicalStudy:'The dead keep no secrets from a patient scholar.',
  logging:'Every winter hearth begins beneath a summer canopy.', smelting:'The mountain yields its blood only to fire.',
  forage:'Even beneath a darkened sky, the table must be laid.' };
let variant = new URL(location.href).searchParams.get('variant') ?? 'A';
if (!variants[variant]) variant = 'A';
let face, app, path = [], pinned = false, origin = null, anchor = null;

for (const option of $('card').options) {
  const example = getGamepieceFace({tSec:0}, 'practice', option.value);
  for (const trait of example.stockTraits ?? []) terms[trait] ??= `A Stock trait. Stock with ${trait} can satisfy matching inputs or Charge triggers. One unit can carry several Stock traits.`;
}
const names = [...Object.keys(terms), ...Object.keys(aliases)].sort((a,b)=>b.length-a.length);
const canonical = Object.fromEntries(names.map(name=>[name.toLowerCase(), aliases[name] ?? name]));
const matcher = new RegExp(`\\b(${names.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})\\b`, 'gi');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action, label) {
  const node = element('button',text); node.type='button';
  if(label)node.setAttribute('aria-label',label);
  node.addEventListener('click',action); return node;
}
function linkedText(host, text, exclude) {
  let end=0;
  for(const match of text.matchAll(matcher)) {
    host.append(document.createTextNode(text.slice(end,match.index)));
    const term=canonical[match[0].toLowerCase()];
    if(term===exclude)host.append(document.createTextNode(match[0]));
    else {
      const link=button(match[0],()=>openTerm(term,link),`Explain ${term}`);
      link.className='term';link.dataset.term=term;
      link.setAttribute('aria-controls','references');
      link.setAttribute('aria-expanded',String(path.at(-1)===term));
      host.append(link);
    }
    end=match.index+match[0].length;
  }
  host.append(document.createTextNode(text.slice(end))); return host;
}
function stateLabel() {
  $('state').textContent=`${variant} · ${variants[variant]} · ${path.length ? path.join(' › ') : 'No reference open'}${pinned ? ' · Pinned' : ''}`;
  document.querySelectorAll('.term').forEach(node=>node.setAttribute('aria-expanded',String(path.at(-1)===node.dataset.term)));
}
function renderInspection() {
  face=getGamepieceFace({tSec:0},'practice',$('card').value,$('tier').value);
  const rules=$('rules');rules.replaceChildren();
  const tags=element('div',null,'tags');
  for(const tag of [...new Set([face.reading.classLabel,face.reading.type,...face.tags])]) {
    tags.append(linkedText(element('span',null,`tag ${tag==='Knowledge'?'knowledge':''}`),tag));
  }
  rules.append(tags,element('h2',face.label));
  const activation=element('div',null,`activation ${face.reading.type.toLowerCase()}`);
  for(const effect of face.reading.effects) {
    const row=element('div',null,'effect');
    if(effect.timing)row.append(linkedText(element('span',null,'timing'),effect.timing));
    row.append(element('span','›','arrow'),linkedText(element('span'),effect.text));activation.append(row);
  }
  rules.append(activation);
  if(face.reading.trigger || face.reading.requirements.length) {
    const conditions=element('div',null,'conditions');
    for(const text of [face.reading.trigger,...face.reading.requirements].filter(Boolean))conditions.append(linkedText(element('p'),text));
    rules.append(conditions);
  }
  rules.append(element('p',flavour[face.definitionId],'flavour'));
  const glossary=$('glossary');glossary.replaceChildren(element('h3','THE SYMBOLS ON THIS CARD'));
  for(const entry of getPracticeSymbols(face)) {
    glossary.append(linkedText(element('h4'),entry.name),linkedText(element('p'),entry.description));
  }
  $('card-caption').textContent=`${$('tier').selectedOptions[0].textContent} · Practice`;
  $('card-picture').setAttribute('aria-label',`${face.label} symbolic card, ${$('tier').value} quality`);
  for(const child of app.stage.removeChildren())child.destroy({children:true});
  addSettlementPiece(app.stage,{x:15,y:112,width:300,height:420},{face,time:0,reducedMotion:true});
  app.render();stateLabel();
}
function closeReference({restore=true}={}) {
  path=[];pinned=false;$('references').hidden=true;$('references').replaceChildren();stateLabel();
  if(restore)(origin?.isConnected ? origin : $('card')).focus();
  origin=null;anchor=null;
}
function openTerm(term, source) {
  if(!path.length) { origin=source;anchor=source.getBoundingClientRect(); }
  const parent=source.closest('#references .reference');
  if(parent&&variant==='C')path=path.slice(0,Number(parent.dataset.index)+1);
  if(path.at(-1)!==term)path.push(term);
  renderReference();
}
function back() {
  path.pop();
  if(path.length)renderReference();else closeReference();
}
function referencePanel(term,index) {
  const active=index===path.length-1;
  const panel=element('section',null,`reference ${active?'active':'history'}`);
  panel.dataset.index=String(index);
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label',`${term} reference`);
  const toolbar=element('div',null,'reference-toolbar');
  if(active) {
    const goBack=button('← Back',back,'Back through keywords');goBack.dataset.action='back';
    const pin=button(pinned?'Pinned':'Pin',()=>{pinned=!pinned;renderReference('pin');},'Pin keyword reference');
    pin.dataset.action='pin';pin.setAttribute('aria-pressed',String(pinned));
    const close=button('×',()=>closeReference(),'Close keyword reference');close.className='close';
    toolbar.append(goBack,pin,close);
  } else toolbar.append(button('Return here',()=>{path=path.slice(0,index+1);renderReference();}));
  panel.append(toolbar);
  if(variant!=='C') {
    const crumbs=element('nav',null,'breadcrumbs');crumbs.setAttribute('aria-label','Reading history');
    path.forEach((name,i)=>{
      if(i)crumbs.append(element('span','›'));
      crumbs.append(i===path.length-1 ? element('span',name) : button(name,()=>{path=path.slice(0,i+1);renderReference();}));
    });panel.append(crumbs);
  }
  const heading=element('h3',term);heading.tabIndex=-1;heading.dataset.action='heading';
  panel.append(heading,linkedText(element('p'),terms[term],term));
  return panel;
}
function placeReference() {
  if(!path.length||variant!=='A')return;
  const host=$('references'), r=anchor ?? {left:innerWidth/2,top:innerHeight/2,bottom:innerHeight/2};
  const box=host.getBoundingClientRect();
  host.style.left=`${Math.max(12,Math.min(r.left,innerWidth-box.width-12))}px`;
  const below=r.bottom+8;
  host.style.top=`${Math.max(12,Math.min(below+box.height < innerHeight-82 ? below : r.top-box.height-8,innerHeight-box.height-82))}px`;
}
function renderReference(focus='heading') {
  const host=$('references');host.hidden=false;host.dataset.variant=variant;host.removeAttribute('style');host.replaceChildren();
  if(variant==='C')path.forEach((term,index)=>host.append(referencePanel(term,index)));
  else host.append(referencePanel(path.at(-1),path.length-1));
  placeReference();stateLabel();
  const active=host.querySelector('.active');active.scrollIntoView({block:'nearest',inline:'end'});
  active.querySelector(`[data-action="${focus}"]`).focus({preventScroll:true});
}
function selectVariant(next,updateUrl=true) {
  variant=next;document.body.dataset.variant=variant;
  $('variant-label').textContent=`${variant} · ${variants[variant]}`;
  if(updateUrl) { const url=new URL(location.href);url.searchParams.set('variant',variant);history.replaceState(null,'',url); }
  if(path.length)renderReference();stateLabel();
}
function cycleVariant(direction) {
  const keys=Object.keys(variants);selectVariant(keys[(keys.indexOf(variant)+direction+keys.length)%keys.length]);
}
$('previous').addEventListener('click',()=>cycleVariant(-1));
$('next').addEventListener('click',()=>cycleVariant(1));
for(const id of ['card','tier'])$(id).addEventListener('change',()=>{if(!pinned)closeReference({restore:false});renderInspection();});
$('references').addEventListener('click',event=>event.stopPropagation());
document.addEventListener('click',event=>{
  if(path.length&&!pinned&&!event.target.closest('#references,.term,.variant-switcher'))closeReference({restore:false});
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&path.length) { event.preventDefault();back(); }
  if(['ArrowLeft','ArrowRight'].includes(event.key)&&!event.target.closest('input,textarea,select,[contenteditable],#references')) {
    event.preventDefault();cycleVariant(event.key==='ArrowRight'?1:-1);
  }
});
window.addEventListener('resize',placeReference);
window.addEventListener('scroll',()=>{if(origin?.isConnected)anchor=origin.getBoundingClientRect();placeReference();},{passive:true});
window.addEventListener('popstate',()=>selectVariant(variants[new URL(location.href).searchParams.get('variant')] ? new URL(location.href).searchParams.get('variant') : 'A',false));

async function boot() {
  await preloadChronicleArt({includeSettlementPieces:true});
  app=new PIXI.Application({width:340,height:578,backgroundAlpha:0,antialias:true,autoStart:false,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true});
  app.renderer.plugins.accessibility.div.style.pointerEvents='none';
  $('card-picture').append(app.view);renderInspection();selectVariant(variant,false);
  $('card').disabled=false;$('tier').disabled=false;
  window.keywordWorkbench={get state(){return {variant,card:face.definitionId,tier:face.tier,path:[...path],pinned};}};
  document.body.dataset.ready='true';
}
boot().catch(error=>{$('state').textContent=`Unable to load the keyword study: ${error.message}`;});
