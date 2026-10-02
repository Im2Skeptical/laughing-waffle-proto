// Workshop only: Bazaar header, local zoom, and focused inspection. No game mutations.
import { getGamepieceFace } from '../../../src/model/gamepiece-presentation.js';
import { getDetailedPracticeDef } from '../../../src/model/game-config.js';
import { assembleCard, CARD_SIZE, loadCardAssets } from '../card-chrome-prototype/renderer.js';

const CARD_CANVAS = { width: CARD_SIZE.width + 40, height: CARD_SIZE.height + CARD_SIZE.overhang.top + CARD_SIZE.overhang.bottom + 18,
  x: 15, y: CARD_SIZE.overhang.top + 8 };

const $ = id => document.getElementById(id);
const tiers = ['bronze', 'silver', 'gold', 'diamond'];
const ids = ['charcoalBurning', 'forage', 'logging', 'smelting', 'alchemy', 'anatomicalStudy', 'warCouncil'];
const copy = {
  charcoalBurning: { primary: 'Another Practice here produces [Timber]: gain {gain} [Progress].\nAt {threshold} [Progress], produce {yield} [Fuel] [Stock].', extra: '' },
  forage: { primary: 'At each [Food phase], produce {yield} [Stock] ([Edible], [Wild]).', extra: '' },
  logging: { primary: 'In [Spring] and [Summer], produce 2 [Stock]. In [Autumn], produce 3.\nThis Stock has [Timber], [Construction] and [Fuel].', extra: '' },
  smelting: { primary: 'When another local Practice produces [Ore] or [Fuel] [Stock], gain {gain} [Progress].\nAt {threshold} [Progress], produce {yield} [Metal] [Stock].', extra: '' },
  alchemy: { primary: 'When another local [Knowledge] Practice consumes [Medicine], [Metal] or [Glass] [Stock], gain {gain} [Progress].\nAt {threshold} [Progress], require a [Scholar] worker and produce {yield} [Stock] ([Medicine], [Metal], [Trade]).', extra: '' },
  anatomicalStudy: { primary: 'When someone in this settlement dies, or another local Practice produces [Bone] [Stock], gain {gain} [Progress].\nAt {threshold} [Progress], require a [Scholar] worker, produce {yield} [Stock] ([Medicine], [Record]) and gain 2 [Research].', extra: '' },
  warCouncil: { primary: 'When this or a connected settlement contributes [Support] to a [Campaign] or [Defense], gain {gain} [Progress].\nAt {threshold} [Progress], the next Campaign or Defense may draw Support from one additional adjacent friendly settlement.', extra: 'That source contributes 25% of its Support, up to 10.' },
};
const termDefinitions = {
  Stock: 'Resources stored on a Practice. The count is how much is stored; the crate limit is its capacity. One Stock may carry several traits at once.',
  Progress: 'The private meter fills when the depicted events occur. At its threshold, this Practice completes its effect and resets to zero when its requirements allow it. If blocked, the full meter is retained. This is not [Stock].',
  Workers: 'Each occupied socket is one assigned worker. The multiplier applies to Stock output for scheduled Practices, or incoming [Progress] for event-driven Practices. It does not multiply their completion output.',
  'Food phase': 'A recurring phase of the moon cycle. This Practice acts at that phase when its requirements allow it.',
  Spring: 'This Practice acts when the calendar enters Spring.', Summer: 'This Practice acts when the calendar enters Summer.', Autumn: 'This Practice acts when the calendar enters Autumn.',
  Timber: 'A trait of [Stock], used by timber recipes and events. A Timber production event adds [Progress] here; Charcoal Burning does not consume that Timber.',
  Fuel: 'A trait of [Stock]. It can satisfy a recipe that needs Fuel.',
  Edible: 'A trait of [Stock] that can satisfy the settlement’s food needs.', Wild: 'A trait of [Stock] identifying wild resources. Foraging Stock is both [Edible] and Wild.',
  Construction: 'A trait of [Stock] used by construction recipes and events.', Ore: 'A trait of [Stock] used by smelting-related recipes and events.',
  Metal: 'A trait of [Stock] used by metal recipes and events.', Medicine: 'A trait of [Stock] used by medicine recipes and events.', Glass: 'A trait of [Stock] used by glass recipes and events.',
  Trade: 'A category for trade Practices and a trait that some [Stock] carries.', Record: 'A trait of [Stock] used by knowledge-related recipes and events.', Bone: 'A trait of [Stock] used by bone-related recipes and events.',
  Knowledge: 'A Practice tag. Some events specifically look for another Knowledge Practice.', Scholar: 'A specialist class. A Scholar worker must be assigned where the rule requires one.',
  Research: 'Research progress for the realm. It is distinct from [Stock].',
  Support: 'Martial aid contributed to a [Campaign] or [Defense]. War Council can bank access to an additional friendly source.',
  Campaign: 'A martial action against a target. Participating friendly settlements can contribute [Support].', Defense: 'A martial action protecting the realm. Friendly settlements can contribute [Support].',
  Common: 'This Practice belongs to the common pool, rather than a specialist class pool.', Warrior: 'This Practice belongs to the Warrior pool.',
};
const symbolAliases = { Progress: 'progress-meter', Workers: 'workerBustFull', Stock: 'stockCrateSquare', 'Food phase': 'food', Scholar: 'stock-knowledge', Warrior: 'stock-arms', Common: 'birth', Knowledge: 'stock-knowledge', Research: 'stock-knowledge', Support: 'stock-arms', Campaign: 'stock-arms', Defense: 'stock-arms', Spring: 'springLeaf', Summer: 'sun', Autumn: 'autumnLeaf', death: 'death' };
const url = new URL(location.href);
let state = { card: ids.includes(url.searchParams.get('card')) ? url.searchParams.get('card') : ids[0], variant: url.searchParams.get('variant') === 'inspection' ? 'inspection' : 'local',
  tier: 'bronze', ownedTier: 'bronze', context: url.searchParams.get('context') === 'settlement' ? 'settlement' : 'shop', viewport: ['phone','small-phone','portrait'].includes(url.searchParams.get('viewport')) ? url.searchParams.get('viewport') : 'fit',
  position: Math.max(0,Math.min(4,Number(url.searchParams.get('position'))||0)),meter: 'Progress', workers: 0, fill: 0, body: 21, cardSize: 240, tooltipWidth: 380, dim: 55, fullscreen: false, name: '', tags: '', primary: '', extra: '' };
let ready = false, queued = false, sourceApp, zoomApp, inspectionApp, resourceSheet;
const symbolFrames = {}, keywordHistory = [];
let keyword = null, pinned = false, previousFocus = null, keywordReturnTerm = null;

function faceFor(tier = state.tier, edited = true) {
  const face = getGamepieceFace({ tSec: 0 }, 'practice', state.card, tier);
  // Base storage capacity follows the existing Stock helper; no live settlement modifiers.
  if (face.stockCapacity) face.stockCapacity += tiers.indexOf(tier);
  face.stock = Math.min(1, face.stockCapacity);
  face.workers = edited ? Math.max(0,Math.min(state.workers, face.workerCapacity)) : 0;
  face.workerMultiplier = 1 + face.workers * face.workerBonus;
  if (face.mode === 'charge') {
    face.chargeGain = Math.floor(face.chargeGain * face.workerMultiplier);
    face.charge = edited ? Math.max(0,Math.min(state.fill, face.chargeThreshold)) : 0;
  }
  return face;
}

function symbol(term, size = 28) {
  const id = symbolAliases[term] ?? `stock-${term.toLowerCase()}`;
  const data = symbolFrames[id] ?? symbolFrames.stock;
  const el = document.createElement('span'); el.className = 'symbol'; el.setAttribute('aria-hidden', 'true');
  if (!data) return el;
  const {frame:r, image, sheet} = data;
  const scale = size / Math.max(r.w, r.h);
  el.style.width = `${size}px`; el.style.height = `${size}px`;
  el.style.backgroundImage = `url('${image}')`;
  el.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
  el.style.backgroundPosition = `${-r.x * scale + (size - r.w * scale) / 2}px ${-r.y * scale + (size - r.h * scale) / 2}px`;
  return el;
}

function richText(text, face, interactive) {
  const fragment = document.createDocumentFragment();
  const expanded = text.replaceAll('{gain}', String(face.chargeGain ?? 0)).replaceAll('{threshold}', String(face.chargeThreshold ?? 0)).replaceAll('{yield}', String(face.production[0]?.value ?? 0));
  for (const part of expanded.split(/(\[[^\]]+\]|\b\d+(?:\.\d+)?%?\b)/g)) {
    if (part.startsWith('[') && part.endsWith(']')) {
      const key = part.slice(1, -1), label = key === 'Progress' ? state.meter : key;
      const el = document.createElement(interactive ? 'button' : 'span');
      el.className = interactive ? 'keyword-link' : 'term-text'; el.textContent = label;
      if (interactive) { el.type = 'button'; el.dataset.term = key; el.setAttribute('aria-label', `Explain ${label}`); }
      fragment.appendChild(el);
    } else if (/^\d/.test(part)) {
      const el = document.createElement('strong'); el.className = 'rule-number'; el.textContent = part; fragment.appendChild(el);
    } else fragment.appendChild(document.createTextNode(part));
  }
  return fragment;
}

function identity(face, interactive) {
  const header = document.createElement('div'); header.className = 'identity';
  const pills = document.createElement('div'); pills.className = 'tag-pills';
  state.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(tag => {
    const pill = document.createElement('span'); pill.className = `tag-pill ${tag.toLowerCase().replace(/[^a-z]/g, '')}`; pill.textContent = tag; pills.appendChild(pill);
  });
  const plaque = document.createElement('div'); plaque.className = 'name-plaque';
  const name = document.createElement('h2'); name.textContent = state.name; plaque.appendChild(name);
  const pool = getDetailedPracticeDef({tSec:0},state.card).pool;
  const className = pool === 'scholar' ? 'Scholar' : pool === 'warrior' ? 'Warrior' : 'Common';
  const emblem = document.createElement(interactive ? 'button' : 'span'); emblem.className = 'class-emblem'; emblem.title = `${className} Practice`;
  emblem.setAttribute('aria-label', `${className} Practice`);
  if (interactive) { emblem.type = 'button'; emblem.dataset.term = className; }
  emblem.appendChild(symbol(className,30)); plaque.appendChild(emblem); header.append(pills, plaque); return header;
}

function renderRules(host, face, interactive) {
  host.replaceChildren(identity(face, interactive));
  const rules = document.createElement('div'); rules.className = 'rules-surface';
  const primary = document.createElement('p'); primary.appendChild(richText(state.primary, face, interactive)); rules.appendChild(primary);
  if (state.extra.trim()) { const extra = document.createElement('p'); extra.className = 'extra'; extra.appendChild(richText(state.extra, face, interactive)); rules.appendChild(extra); }
  host.appendChild(rules);
  if (!interactive) { const inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'inspect-action'; inspect.textContent = 'Inspect ›'; inspect.addEventListener('click', () => setMode('inspection')); host.appendChild(inspect); }
}

function reminderRow(terms, description, face) {
  const row = document.createElement('div'); row.className = 'reminder-row';
  const icons = document.createElement('div'); terms.forEach(term => icons.appendChild(symbol(term)));
  const content = document.createElement('div');
  terms.forEach((term,i) => { if (i) content.appendChild(document.createTextNode(' · ')); content.appendChild(richText(`[${term}]`,face,true)); });
  const p = document.createElement('p'); p.appendChild(richText(description,face,true)); content.appendChild(p); row.append(icons,content); return row;
}

function renderReminders(face) {
  const host = $('reminders'); host.replaceChildren();
  const heading = document.createElement('p'); heading.className = 'reminder-heading'; heading.textContent = 'The symbols on this card'; host.appendChild(heading);
  if (face.stockCapacity) host.appendChild(reminderRow(['Stock'], `${face.stock} stored / ${face.stockCapacity} capacity.`,face));
  if (face.stockTraits.length) host.appendChild(reminderRow(face.stockTraits, 'Every Stock this Practice produces carries all of these traits.',face));
  if (face.mode === 'charge') {
    const triggers = [...new Set(face.chargeTriggers.map(t=>t.trait ?? ({death:'Death',support:'Support'}[t.icon] ?? 'Knowledge')))];
    const consume = face.chargeTriggers.some(t=>t.event==='stockConsumed');
    host.appendChild(reminderRow(triggers, consume ? 'Trigger symbols: another eligible Practice consumes Stock with any of these traits.' : state.card==='anatomicalStudy' ? 'Trigger symbols: a local death or another Practice producing Bone Stock.' : state.card==='warCouncil' ? 'Trigger symbol: Support contributed to Campaign or Defense.' : 'Trigger symbols: another local Practice produces Stock with any of these traits.',face));
    host.appendChild(reminderRow(['Progress'], `${face.charge} / ${face.chargeThreshold}. Gain ${face.chargeGain} when the trigger occurs; complete when full.`,face));
  } else {
    const triggers = face.production.filter(r=>r.season).map(r=>r.season[0].toUpperCase()+r.season.slice(1));
    host.appendChild(reminderRow(triggers.length ? triggers : ['Food phase'], triggers.length ? 'The calendar medallion marks the next relevant season.' : 'The calendar medallion marks the phase when this Practice acts.',face));
  }
  const outputs = face.production.filter(r=>r.icon!=='stock').map(r=>({research:'Research',support:'Support'}[r.icon])).filter(Boolean);
  if (outputs.length) host.appendChild(reminderRow(outputs,'The numbers beside these symbols are the base effects.',face));
  host.appendChild(reminderRow(['Workers'], `${face.workers} / ${face.workerCapacity} occupied. ×${face.workerMultiplier} ${face.mode==='charge' ? '[Progress] gained; completion output stays unchanged.' : '[Stock] output.'}`,face));
}

function makeApp(host) {
  const app = new PIXI.Application({width:CARD_CANVAS.width,height:CARD_CANVAS.height,backgroundAlpha:0,antialias:true,autoStart:false,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preserveDrawingBuffer:true});
  app.renderer.plugins.accessibility.div.classList.add('prototype-accessibility');
  host.appendChild(app.view); return app;
}
function draw(app, face, width) {
  for (const child of app.stage.removeChildren()) child.destroy({children:true});
  const scale = width/CARD_CANVAS.width;
  app.renderer.resize(Math.ceil(width),Math.ceil(width*CARD_CANVAS.height/CARD_CANVAS.width));
  const card=assembleCard(face); card.scale.set(scale); card.position.set(CARD_CANVAS.x*scale,CARD_CANVAS.y*scale); app.stage.addChild(card); app.render();
}

function saveUrl() {
  const next = new URL(location.href);
  for (const key of ['card','variant','viewport','context','position']) next.searchParams.set(key,state[key]);
  history.replaceState(null,'',next);
}

function resetCopy() {
  const face=faceFor('bronze',false); state.name=face.label; state.tags=face.tags.join(', '); state.primary=copy[state.card].primary; state.extra=copy[state.card].extra;
  state.tier='bronze'; state.workers=0; state.fill=0; keyword=null; keywordHistory.length=0; pinned=false;
  ['card','context','viewport'].forEach(key=>$(key).value=state[key]);
  $('piece-name').value=state.name; $('tags').value=state.tags; $('primary').value=state.primary; $('extra').value=state.extra;
  $('workers').value=state.workers; $('fill').value=state.fill; $('tier').value=state.tier;
}

function queueRender() { if (!ready||queued) return; queued=true; requestAnimationFrame(()=>{queued=false; render();}); }

function syncPositions() {
  const count=state.context==='shop'?3:5;state.position=Math.min(state.position,count-1);$('position').replaceChildren();
  for(let i=0;i<count;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`${state.context==='shop'?'Offer':'Practice slot'} ${i+1}`;$('position').appendChild(option);}
  $('position').value=String(state.position);
}

function render() {
  const active=document.activeElement;
  const focusSelector=active?.closest('#inspection')
    ? active.id ? `#${CSS.escape(active.id)}`
      : active.dataset.keywordAction ? `[data-keyword-action="${CSS.escape(active.dataset.keywordAction)}"]`
        : active.dataset.term ? `[data-term="${CSS.escape(active.dataset.term)}"]` : null
    : null;
  const stage=$('stage'); stage.dataset.variant=state.variant; stage.dataset.context=state.context; stage.dataset.viewport=state.viewport;
  stage.dataset.keywordOpen=String(!!keyword); stage.style.setProperty('--body-size',`${state.body}px`); stage.style.setProperty('--dim',state.dim/100);
  $('inspection').hidden=state.variant!=='inspection'; $('tier').value=state.tier;
  const face=faceFor(), owned=faceFor(state.ownedTier,false), W=stage.clientWidth, H=stage.clientHeight;
  const sourceW=W*(state.context==='shop'?.057:.105);
  const sourceX=W*(state.context==='shop'?.117+state.position*.149:.405+state.position*.117), sourceY=H*(state.context==='shop'?.282:.20);
  const source=$('source-card'); Object.assign(source.style,{left:`${sourceX}px`,top:`${sourceY}px`,width:`${sourceW}px`,height:`${sourceW*CARD_CANVAS.height/CARD_CANVAS.width}px`});
  const caption=$('source-caption');caption.hidden=state.context!=='shop';caption.textContent=`Learn Bronze ${state.name}`;
  Object.assign(caption.style,{left:`${W*(.076+state.position*.149)}px`,top:`${H*.214}px`,width:`${W*.138}px`,height:`${H*.073}px`});
  draw(sourceApp,owned,sourceW);
  const zoomW=Math.min(state.cardSize,H*.59*CARD_CANVAS.width/CARD_CANVAS.height,Math.max(85,W*.32));
  const zoomH=zoomW*CARD_CANVAS.height/CARD_CANVAS.width, zoomY=Math.max(H*.14,Math.min(H*.73-zoomH,sourceY));
  let zoomX=Math.max(10,Math.min(W-zoomW-10,sourceX+(sourceW-zoomW)/2));
  Object.assign($('local-zoom').style,{left:`${zoomX}px`,top:`${zoomY}px`,width:`${zoomW}px`});
  draw(zoomApp,owned,zoomW);
  const availableRight=W-zoomX-zoomW-22, availableLeft=zoomX-22;
  const right=availableRight>=Math.min(state.tooltipWidth,290)||availableRight>=availableLeft;
  const tooltipW=Math.min(state.tooltipWidth,Math.max(200,W-zoomW-30));
  // Clamp the lifted card and rules as a pair; never shrink readable text at an edge.
  if(W>520){zoomX=right?Math.min(zoomX,W-zoomW-tooltipW-22):Math.max(zoomX,tooltipW+22);$('local-zoom').style.left=`${zoomX}px`;}
  let tooltipX=right?zoomX+zoomW+10:zoomX-tooltipW-10;
  tooltipX=Math.max(8,Math.min(W-tooltipW-8,tooltipX));
  const local=$('local-tooltip'); renderRules(local,owned,false);
  Object.assign(local.style,{width:`${tooltipW}px`,left:`${tooltipX}px`,top:`${Math.max(12,zoomY)}px`,maxHeight:`${Math.max(150,H*.76-Math.max(12,zoomY))}px`});
  if (W<520) { const top=Math.min(H*.58,zoomY+zoomH+12);Object.assign(local.style,{width:`${W-24}px`,left:'12px',top:`${top}px`,maxHeight:`${H-top-14}px`}); }
  const inspectW=Math.max(90,Math.min(360,W*.32,(H-(state.fullscreen?110:88))*CARD_CANVAS.width/CARD_CANVAS.height));
  stage.style.setProperty('--inspection-card-width',`${inspectW}px`); draw(inspectionApp,face,inspectW);
  $('inspection-card').setAttribute('aria-label',`${state.name}, ${state.tier} preview, ${face.stockCapacity} Stock capacity. Owned card stays Bronze.`);
  $('source-card').setAttribute('aria-label',`Inspect ${state.name}`); $('zoom-card').setAttribute('aria-label',`Inspect ${state.name}, enlarged source card`);
  renderRules($('inspection-rules'),face,true); renderReminders(face);
  $('tier-note').textContent=state.tier===state.ownedTier?'Owned Bronze · preview only':`${state.tier[0].toUpperCase()+state.tier.slice(1)} preview · owned Bronze`;
  $('workers').max=face.workerCapacity; $('fill').max=face.chargeThreshold??0; $('fill-label').hidden=face.mode!=='charge';
  $('body-label').value=`${state.body} px`; $('zoom-label').value=`${Math.round(zoomW)} px in this viewport (up to ${state.cardSize})`; $('width-label').value=`${Math.round(tooltipW)} px`; $('dim-label').value=`${state.dim}%`;
  const sizeLabels={fit:'Desktop · fit',phone:'Landscape phone · 844 × 390', 'small-phone':'Small landscape phone · 667 × 375',portrait:'Portrait study · 390 × 844'};
  $('viewport-label').textContent=state.fullscreen?`Actual viewport · ${W} × ${H}`:sizeLabels[state.viewport];
  $('preview-status').textContent=`${state.variant==='local'?'Local preview':'Full inspection'} · ${state.name} · ${state.body}px rules`;
  document.querySelectorAll('[data-mode]').forEach(button=>{const selected=button.dataset.mode===state.variant;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  renderKeyword();
  if(focusSelector) $('inspection').querySelector(focusSelector)?.focus({preventScroll:true});
  $('state-summary').textContent=JSON.stringify({mode:state.variant,card:state.card,context:state.context,position:state.position+1,viewport:{width:W,height:H},ownedTier:state.ownedTier,previewTier:state.tier,meterWording:state.meter,bodyPx:state.body,cardZoomPx:Math.round(zoomW),tooltipWidthPx:Math.round(tooltipW),previewValues:{stock:face.stock,capacity:face.stockCapacity,workers:face.workers,multiplier:face.workerMultiplier,meter:face.charge,threshold:face.chargeThreshold,gain:face.chargeGain},openKeyword:keyword,pinned},null,2);
}

function setMode(mode) {
  if (mode==='inspection'&&state.variant!=='inspection') previousFocus=document.activeElement;
  state.variant=mode; keyword=null; pinned=false; keywordHistory.length=0; saveUrl(); queueRender();
  if (mode==='inspection') requestAnimationFrame(()=>$('tier').focus({preventScroll:true}));
  else requestAnimationFrame(()=>(previousFocus?.isConnected?previousFocus:$('source-card')).focus({preventScroll:true}));
}

function openKeyword(term) {
  if(!keyword) keywordReturnTerm=term;
  if (keyword&&keyword!==term) keywordHistory.push(keyword);
  keyword=term; queueRender(); requestAnimationFrame(()=>$('keyword-panel').querySelector('button')?.focus({preventScroll:true}));
}
function closeKeyword() {
  keyword=null; pinned=false; keywordHistory.length=0; queueRender();
  requestAnimationFrame(()=>($('inspection').querySelector(`[data-term="${CSS.escape(keywordReturnTerm??'')}"]`)??$('tier')).focus({preventScroll:true}));
}
function renderKeyword() {
  const host=$('keyword-panel'); host.hidden=!keyword; if (!keyword) return; host.replaceChildren();
  const toolbar=document.createElement('div'); toolbar.className='keyword-toolbar';
  const back=document.createElement('button'); back.type='button'; back.textContent=keywordHistory.length?'‹ Back':'‹ Rules'; back.addEventListener('click',()=>{if(keywordHistory.length){keyword=keywordHistory.pop();queueRender();}else closeKeyword();});
  const pin=document.createElement('button'); pin.type='button'; pin.className='pin'; pin.textContent=pinned?'Pinned':'Pin'; pin.setAttribute('aria-pressed',String(pinned)); pin.addEventListener('click',()=>{pinned=!pinned;queueRender();});
  const close=document.createElement('button'); close.type='button'; close.textContent='×'; close.setAttribute('aria-label','Close keyword explanation'); close.addEventListener('click',closeKeyword); toolbar.append(back,pin,close); host.appendChild(toolbar);
  back.dataset.keywordAction='back';pin.dataset.keywordAction='pin';close.dataset.keywordAction='close';
  if(keywordHistory.length){const trail=document.createElement('span');trail.className='breadcrumb';trail.textContent=keywordHistory.map(t=>t==='Progress'?state.meter:t).join(' › ');host.appendChild(trail);}
  const title=document.createElement('h3'); title.textContent=keyword==='Progress'?state.meter:keyword; host.appendChild(title);
  const p=document.createElement('p');
  let description=termDefinitions[keyword]??`A card category or symbol. Add its explanation while workshopping this copy.`;
  if(keyword==='Timber'&&state.card!=='charcoalBurning') description='A trait of [Stock], used by timber recipes and events.';
  if(keyword==='Workers') description=faceFor().mode==='charge'?'Each occupied socket is one assigned worker. The displayed multiplier boosts incoming [Progress]. The completion output stays at its base amount.':'Each occupied socket is one assigned worker. The displayed multiplier boosts [Stock] output when this Practice acts.';
  p.appendChild(richText(description,faceFor(),true));host.appendChild(p);
  const stage=$('stage').getBoundingClientRect(), column=$('inspection-copy').getBoundingClientRect();
  if(stage.width>520)Object.assign(host.style,{left:`${column.left-stage.left}px`,right:'auto',top:`${column.top-stage.top}px`,width:`${column.width}px`,maxHeight:`${stage.bottom-column.top-15}px`});
  else{const top=Math.max(280,stage.height*.44);Object.assign(host.style,{left:'12px',right:'auto',top:`${top}px`,width:`${stage.width-24}px`,maxHeight:`${stage.height-top-18}px`,bottom:'auto'});}
}

function fullscreen(on) { state.fullscreen=on;document.body.classList.toggle('fullscreen-preview',on);$('exit-fullscreen').hidden=!on;queueRender(); }

async function main() {
  const manifests=await loadCardAssets(ids);
  for (const manifest of manifests) for (const [id,frame] of Object.entries(manifest.frames)) symbolFrames[id]={frame,image:`images/dark-fantasy/card-chrome-prototype/${manifest.image}`,sheet:{w:manifest.size[0],h:manifest.size[1]}};
  // TexturePacker dimensions for the original atlas are separate from the frame manifests.
  resourceSheet=await (await fetch('images/sprite-sheets/resource-language.json')).json();
  for (const [name,value] of Object.entries(resourceSheet.frames)) symbolFrames[name.replace(/\.png$/,'')]={frame:value.frame,image:`images/sprite-sheets/${resourceSheet.meta.image}`,sheet:resourceSheet.meta.size};
  symbolFrames['progress-meter']=symbolFrames.chargeReservoir;
  symbolAliases.Death='death';termDefinitions.Death='A local population death can trigger this Practice’s [Progress] gain.';
  for (const id of ids) {const option=document.createElement('option');option.value=id;option.textContent=getGamepieceFace({tSec:0},'practice',id).label;$('card').appendChild(option);}
  sourceApp=makeApp($('source-card'));zoomApp=makeApp($('zoom-card'));inspectionApp=makeApp($('inspection-card'));
  // Cover the former inspector with the existing five-slot settlement context.
  const slots=$('board-slots');
  const title=document.createElement('div');title.className='slot-title';title.textContent='PRACTICES · STOCK / CAPACITY';slots.appendChild(title);
  const caption=document.createElement('div');caption.id='source-caption';caption.className='source-title';$('stage').appendChild(caption);
  for(let i=0;i<5;i++){const slot=document.createElement('div');slot.className='empty-slot';slot.style.left=`${55+i*7.8}%`;slots.appendChild(slot);}
  resetCopy();syncPositions();ready=true;
  $('controls').addEventListener('submit',e=>e.preventDefault());
  $('card').addEventListener('change',()=>{state.card=$('card').value;resetCopy();saveUrl();queueRender();});
  ['context','viewport'].forEach(key=>$(key).addEventListener('change',()=>{state[key]=$(key).value;if(key==='context')syncPositions();saveUrl();queueRender();}));
  $('position').addEventListener('change',()=>{state.position=Number($('position').value);saveUrl();queueRender();});
  for(const [id,key] of [['body-size','body'],['card-size','cardSize'],['tooltip-width','tooltipWidth'],['dim','dim'],['workers','workers'],['fill','fill']]) $(id).addEventListener('input',()=>{state[key]=Number($(id).value);queueRender();});
  for(const [id,key] of [['piece-name','name'],['tags','tags'],['primary','primary'],['extra','extra']]) $(id).addEventListener('input',()=>{state[key]=$(id).value;queueRender();});
  $('wording').addEventListener('change',()=>{const custom=$('wording').value==='custom';$('custom-wording-label').hidden=!custom;state.meter=custom?$('custom-wording').value:$('wording').value;queueRender();});
  $('custom-wording').addEventListener('input',()=>{state.meter=$('custom-wording').value||'Progress';queueRender();});
  $('tier').addEventListener('change',()=>{state.tier=$('tier').value;if(!pinned){keyword=null;keywordHistory.length=0;}queueRender();});
  $('reset').addEventListener('click',()=>{resetCopy();queueRender();});
  ['source-card','zoom-card'].forEach(id=>$(id).addEventListener('click',()=>setMode('inspection')));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  ['previous-mode','next-mode'].forEach(id=>$(id).addEventListener('click',()=>setMode(state.variant==='local'?'inspection':'local')));
  $('close-inspection').addEventListener('click',()=>setMode('local'));
  $('fullscreen').addEventListener('click',()=>fullscreen(true));$('exit-fullscreen').addEventListener('click',()=>fullscreen(false));
  $('stage').addEventListener('click',event=>{const target=event.target.closest('[data-term]');if(target)openKeyword(target.dataset.term);else if(keyword&&!pinned&&!event.target.closest('.keyword-panel'))closeKeyword();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(keyword){if(keywordHistory.length){keyword=keywordHistory.pop();queueRender();}else closeKeyword();}else if(state.variant==='inspection')setMode('local');else if(state.fullscreen)fullscreen(false);event.preventDefault();}
    if(['ArrowLeft','ArrowRight'].includes(event.key)&&!event.target.closest('input,textarea,select,[contenteditable],#inspection')){setMode(state.variant==='local'?'inspection':'local');event.preventDefault();}
    if(event.key==='Tab'&&state.variant==='inspection'){
      const root=keyword?$('keyword-panel'):$('inspection');const focusable=[...root.querySelectorAll('button,select,[tabindex="0"]')].filter(el=>!el.closest('[hidden]')&&!el.disabled);
      const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){last?.focus();event.preventDefault();}else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){first?.focus();event.preventDefault();}
    }
  });
  new ResizeObserver(queueRender).observe($('stage'));
  window.tooltipWorkbench={get state(){return structuredClone({...state,keyword,pinned});},get previewFace(){return faceFor();},get ownedFace(){return faceFor('bronze',false);},setMode,setCard(id){if(ids.includes(id)){state.card=id;resetCopy();saveUrl();queueRender();}},openKeyword};
  render();document.body.dataset.ready='true';
}
main().catch(error=>{$('error').hidden=false;$('error').textContent=`The workbench could not load: ${error.message}. Run npm run preview:tooltips from the repository root.`;console.error(error);});
