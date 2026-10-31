// Question: which player, neutral and decaying-enemy institutions are worth keeping?
// Uses the real Zoo faces/readers. No candidate registry reaches a simulator.
import { getGamepieceFace } from '../../model/gamepiece-presentation.js';
import { registerPresentationIllustrations } from '../chronicle-art.js';
import { createLabCards } from './cards.js';
import { el, button, select, field, input, badge, disclosure } from './elements.js';
import { FULL_MAP_CONTENT, CONTENT_REVIEW_RULES } from './full-map-content-prototype-data.js';
import { ENEMY_CONTENT, ENEMY_POOLS, ENEMY_SETUP_PROPOSALS } from './full-map-enemy-prototype-data.js';
import { PATRONS, PATRON_CONTENT, PATRON_REVIEW_RULES } from './full-map-patron-prototype-data.js';

const CONTENT=[...FULL_MAP_CONTENT,...ENEMY_CONTENT];
const POOL = {warrior:'Warlord',scholar:'Philosopher',neutral:'Neutral starting cards',...Object.fromEntries(Object.entries(ENEMY_POOLS).map(([id,pool])=>[id,pool.classLabel]))};
const patronAppearance=appearance=>appearance==='patrons'||appearance==='chaos';
const CHAOS_CONTENT=[...ENEMY_CONTENT,...PATRON_CONTENT];
const CHAOS_POOLS=['dictator','oligarch','papacy','sect'];
const CHAOS_PALETTES={dictator:'Red / oxidized teal',oligarch:'Green / copper-orange',papacy:'Reference yellow / pink',sect:'Cobalt / honey gold'};
const contentForAppearance=appearance=>patronAppearance(appearance)?[...CONTENT,...PATRON_CONTENT]:CONTENT;
const countsForContent=content=>Object.fromEntries(Object.keys(POOL).map(pool=>[pool,content.filter(card=>card.pool===pool).length]));
const inherited=card=>card.pool==='neutral'||card.enemy;
const DIRECTION_IDS=['fe_conspicuousFeasts','fe_privateReservoir','fe_grandJubilee','fe_gildedBasilica'];
const APPEARANCE={original:'Original art + brass frame',paintings:'First repaint + brass frame',frame:'Original art + enemy frame',decay:'First repaint + enemy frame',palettes:'Palette alternatives + enemy frame',patrons:'Patron capital trials',chaos:'Full chaos-god art pass'};
const MERCHANT_PALETTES={g1:'Forest / antique gold',g2:'Emerald / wine',g3:'Olive / ink',m1:'Emerald / ivory',m2:'Ochre / aubergine',m3:'Burnt orange / indigo'};
const PRIEST_PALETTES={y1:'Saffron / charcoal',y2:'Lemon / plum',y3:'Pale yellow / oxblood',p1:'Violet / bone',p2:'Ivory / oxblood',p3:'Wine / mint'};
const PRIEST_TONES={purple:'Reference yellow / purple',pink:'Reference yellow / pink',pale:'Previous pale yellow / aubergine',ochre:'Previous ochre / aubergine'};
const PRIEST_ART_PREFIX={purple:'priestWarmPurple',pink:'priestWarmPink',pale:'priestPale'};
const MERCHANT_TONES={copper:'Green / copper-orange',pewter:'Green / pale pewter',lilac:'Green / bruised lilac',ink:'Previous olive / ink'};
const MERCHANT_ART_PREFIX={copper:'merchantCopper',pewter:'merchantPewter',lilac:'merchantLilac'};
const PATRON_SEALS={
  oligarch:{grasp2:{label:'Debt grasp — refined',id:'patron-creditor-grasp-refined',shape:'An asymmetric enclosing hook holds one solid coin; broad negative space separates possession from the hollow Sun.'},grasp:{label:'Debt grasp — previous',id:'patron-creditor-grasp',shape:'Barbed talons close around one coin: ownership becomes captivity.'},maw:{label:'Coin maw',id:'patron-creditor-maw',shape:'A coin caught between two enclosing jaws: wealth becomes appetite.'},original:{label:'Previous hanging weights',id:'patron-creditor',shape:PATRONS.oligarch.silhouette}},
  sect:{tome2:{label:'Bound tome — refined',id:'patron-index-tome-refined',shape:'A broad angular open book with one hooked binding spine; no three-ray tail or round enclosure.'},tome:{label:'Bound tome — previous',id:'patron-index-tome',shape:'An open book held by a barbed spine: knowledge becomes a consuming organism.'},quill:{label:'Erasing quill',id:'patron-index-quill',shape:'A great barbed quill pierces a record tablet: recording becomes erasure.'},original:{label:'Previous offset frames',id:'patron-index',shape:PATRONS.sect.silhouette}},
};
const SEAL_ART_IDS=Object.values(PATRON_SEALS).flatMap(options=>Object.values(options).map(option=>option.id));
const PALE_PRIEST_IDS=['cp_offeringOfNames','cp_templeOfHollowSun'];
const MERCHANT_TONE_IDS=['cp_finalLiquidation','cp_vaultOfLastCreditor'];
const validOption=(options,value,fallback)=>Object.hasOwn(options,value)?value:fallback;
const sealFor=(pool,merchantSeal,scholarSeal)=>pool==='oligarch'?PATRON_SEALS.oligarch[validOption(PATRON_SEALS.oligarch,merchantSeal,'grasp2')]:pool==='sect'?PATRON_SEALS.sect[validOption(PATRON_SEALS.sect,scholarSeal,'tome2')]:null;
const PALETTE_ART_IDS=DIRECTION_IDS.flatMap(id=>(id.includes('conspicuousFeasts')||id.includes('privateReservoir')?Object.keys(MERCHANT_PALETTES):Object.keys(PRIEST_PALETTES)).map(scheme=>`palette_${scheme}_${id}`));
const title = value => value[0].toUpperCase()+value.slice(1);
const recipe = entries => entries.map(row=>`${row.amount} ${row.traits.join(' / ')}`).join(' + ');
const reviewLabels = {unreviewed:'Unreviewed',keep:'Keep',silver:'Reconsider tier',cut:'Cut'};

function sealComparison(merchantSeal,scholarSeal){
  const table=el('table','','lab-patron-comparison');table.setAttribute('aria-label','Four enemy cult seals at matching pixel sizes');
  const header=el('tr'),thead=el('thead'),body=el('tbody');header.append(el('th','Size'));
  const labels={dictator:'Warlord',oligarch:'Merchant',papacy:'Priest',sect:'Scholar'};
  for(const label of Object.values(labels))header.append(el('th',label));thead.append(header);table.append(thead,body);
  for(const size of [64,24,16]){
    const row=el('tr'),heading=el('th',`${size}px`);heading.scope='row';row.append(heading);
    for(const [pool,patron] of Object.entries(PATRONS)){
      const emblem=sealFor(pool,merchantSeal,scholarSeal)?.id??patron.emblem,cell=el('td'),icon=el('img');
      icon.src=`images/dark-fantasy/full-map-patron-prototype/art/${emblem}.png`;icon.alt=`${labels[pool]} cult seal, ${size} pixels`;icon.width=icon.height=size;
      icon.dataset.sealSize=String(size);icon.dataset.sealPool=pool;cell.append(icon);row.append(cell);
    }
    body.append(row);
  }
  return table;
}

function definition(card) {
  const seasonal = ['summer','autumn'].includes(card.timing);
  const basePool=ENEMY_POOLS[card.pool]?.basePool??(card.pool==='neutral'?'common':card.pool);
  const def = {id:card.id,label:card.label,pool:basePool,
    minimumQuality:card.tier??'bronze',tags:basePool==='scholar'?['Civic','Knowledge']:['Civic'],
    effects:[],consume:card.consume??[],require:card.require??[],modifiers:card.modifiers??[],
    vassalPrestigeCost:10,vassalPhaseCost:12,ui:{rule:card.rules.join(' ')},
    footprint:card.footprint??1,housing:card.housing??0,
    construction:{cycles:card.cycles??3,activation:{type:'housing'},consume:card.build??[{traits:['Construction'],amount:1}]},
  };
  if (card.kind==='practice') {
    const charge=card.timing==='charge';
    Object.assign(def,{mode:charge?'charge':'scheduled',lane:charge?'charge':'scheduled',
      activation:charge?{type:'charge'}:seasonal?{type:'season',seasonKeys:[card.timing]}:{type:card.timing},
      source:{icon:charge?'charge':seasonal?'season':card.timing,cadence:charge?'charge':seasonal?'season':card.timing},
      stockTraits:card.traits,stockCapacity:card.capacity,workerCapacity:2,workerBonus:1,
      charge:charge?{...card.charge,dischargeText:card.rules.join(' ')}:undefined,
    });
    if(card.output)def.effects.push({op:'generateStock',amount:card.output});
    if(card.research)def.effects.push({op:'research',amount:card.research});
  }
  return def;
}

// Registry projection is a disposable read context; the controller state and its
// captured gameConfig are neither mutated nor stepped by this workbench.
export function contentReviewFaces(state, appearance='original', {merchant='m1',priest='p1',merchantSeal='grasp2',scholarSeal='tome2',priestTone='pink',merchantTone='copper'}={}) {
  const content=contentForAppearance(appearance);
  const gamepieces={...state.gameConfig.gamepieces,practices:{...state.gameConfig.gamepieces.practices},structures:{...state.gameConfig.gamepieces.structures}};
  for(const card of content)gamepieces[card.kind==='practice'?'practices':'structures'][card.id]=definition(card);
  const context={...state,gameConfig:{...state.gameConfig,gamepieces}};
  return content.map(card=>{
    const def=gamepieces[card.kind==='practice'?'practices':'structures'][card.id];
    const face=getGamepieceFace(context,card.kind,card.id,card.tier??'bronze');
    // View-only alternatives: definition IDs, rules and the input state stay intact.
    if(['paintings','decay'].includes(appearance)&&DIRECTION_IDS.includes(card.id))face.illustrationId=`direction_${card.id}`;
    if(appearance==='palettes'&&DIRECTION_IDS.includes(card.id)){
      const scheme=card.pool==='oligarch'?(MERCHANT_PALETTES[merchant]?merchant:'m1'):(PRIEST_PALETTES[priest]?priest:'p1');
      face.illustrationId=`palette_${scheme}_${card.id}`;
    }
    if(['frame','decay','palettes','patrons','chaos'].includes(appearance)&&card.enemy){face.rimTexture='full-map-enemy-direction-prototype/art/enemy-rim.png';face.rimCornerSize=20;}
    if(card.patronStudy||(appearance==='chaos'&&card.enemy)){
      const seal=sealFor(card.pool,appearance==='chaos'?'grasp2':merchantSeal,appearance==='chaos'?'tome2':scholarSeal);
      face.patronEmblem=`full-map-patron-prototype/art/${seal?.id??PATRONS[card.pool].emblem}.png`;face.patronName=PATRONS[card.pool].name;
      if(card.pool==='papacy'&&priestTone!=='ochre')face.illustrationId=`${PRIEST_ART_PREFIX[validOption(PRIEST_TONES,priestTone,'pink')]}_${card.id}`;
      if(card.pool==='oligarch'&&merchantTone!=='ink')face.illustrationId=`${MERCHANT_ART_PREFIX[validOption(MERCHANT_TONES,merchantTone,'copper')]}_${card.id}`;
      face.tags=[...face.tags,'Cult'];
      if(card.victim)face.inputs.unshift({kind:'consume',amount:1,traits:[],icon:'population',symbolLabel:'Population consumed'});
    }
    if(appearance==='chaos'&&card.enemy)face.illustrationId=`chaos_${card.id}`;
    const timing=card.kind==='structure'?'':card.timing==='charge'?'Discharge':`${title(card.timing)} phase`;
    const rules=card.rules.map(rule=>rule.replace(/^Discharge:\s*/i,''));
    if(card.kind==='practice'&&card.output)rules.unshift(`Produce ${card.output} ${card.traits.join(' / ')} Stock.`);
    if(card.kind==='practice'&&card.research&&!rules.some(rule=>/Research/.test(rule)))rules.push(`Gain ${card.research} Research.`);
    const requirements=[...(card.consume?.length?[`Consume ${recipe(card.consume)} Stock.`]:[]),...(card.require?.length?[`Require ${recipe(card.require)} Stock (kept).`]:[])];
    const conversion=rules.map(rule=>rule.match(/convert (?:up to )?(\d+)/i)??(/convert that person/i.test(rule)?rule.match(/train (\d+)/i):null)).find(Boolean);
    if(conversion&&card.kind==='practice')face.production.push({icon:'population',value:Number(conversion[1]),symbolLabel:'Allegiance conversion',label:`Up to ${conversion[1]} people change allegiance`});
    face.rule=[timing,...requirements,...rules].filter(Boolean).join(' ');
    face.detailLines=[face.rule,`Design role: ${card.role}`,'Allegiance beneficiary: the installed piece’s faction.',
      ...(card.patronStudy?[`Patron: ${PATRONS[card.pool].name}. Population-cost proposal only; not executed by simulation.`,PATRON_REVIEW_RULES[3],PATRON_REVIEW_RULES[4]]:[]),
      ...(inherited(card)?['Starting-board content; replacement is required to remove it.']:['Proposed acquisition: 10 Prestige and 2 years.']),
      ...(card.zone?[`Suggested placement: ${title(card.zone)}. ${ENEMY_POOLS[card.pool].identity}`]:[]),
      ...(card.kind==='structure'&&!inherited(card)?[`Build: ${def.construction.cycles} Housing cycles; Consume ${recipe(def.construction.consume)} per cycle.`]:[]),
    ];
    face.reading={...face.reading,classLabel:POOL[card.pool],type:card.kind==='structure'?'Structure':card.timing==='charge'?'Charge':'Cycle',
      passive:card.kind==='structure',effects:rules.map(text=>({timing,text})),requirements:[...requirements,
        ...(card.patronStudy?[`Patron: ${PATRONS[card.pool].name}. The seal identifies the cult, not allegiance.`,...(card.victim?['One consumed person is a real population death. No partial payment; no activation without an eligible victim, reserves, and room for the full base Stock yield.','Output multipliers never multiply victims, reserves, conversions or Research.']:[])]:[]),
        ...(rules.some(rule=>/convert/i.test(rule))?["Conversion benefits the installed piece's faction."]:[]),
        ...(inherited(card)?['Starting-board piece.']:['Proposed offer: 10 Prestige; 2 years.']),
        ...(card.zone?[`Suggested ${card.zone} institution; numbers and maturity are proposals.`]:[]),
        ...(card.kind==='structure'&&!inherited(card)?[`Build: ${def.construction.cycles} Housing cycles; Consume ${recipe(def.construction.consume)} per cycle.`]:[])],
      trigger:card.charge?`${card.charge.triggerText} Discharge at ${card.charge.threshold} Charge.`:null,active:null,
      flavour:card.patronStudy?PATRONS[card.pool].flavour:card.enemy?'The institution endures; its purpose has been forgotten.':card.pool==='neutral'?'An inheritance waiting for a different future.':'A kingdom is held by the people who choose to stand with it.'};
    return {card,face};
  });
}

export function createFullMapContentPrototype({getState,run}) {
  const params=new URLSearchParams(location.hash.split('?')[1]??'');
  const initialPool=params.get('pool');
  let appearance=APPEARANCE[params.get('look')]?params.get('look'):'original',directionOnly=params.get('samples')==='1';
  let merchant=MERCHANT_PALETTES[params.get('merchant')]?params.get('merchant'):'m1',priest=PRIEST_PALETTES[params.get('priest')]?params.get('priest'):'p1';
  let merchantSeal=validOption(PATRON_SEALS.oligarch,params.get('mSeal'),'grasp2'),scholarSeal=validOption(PATRON_SEALS.sect,params.get('sSeal'),'tome2'),priestTone=validOption(PRIEST_TONES,params.get('pTone'),'pink'),merchantTone=validOption(MERCHANT_TONES,params.get('mTone'),'copper');
  let routeHash=location.hash;
  let valueCheck=false;
  let cards=null, ready=false, loading=null,chaosReady=false,chaosLoading=null,loadError='',pool=POOL[initialPool]?initialPool:'',kind='',zone='',reviewFilter='',query='';
  const reviews=new Map(),notes=new Map();
  const artwork=()=>loading??=Promise.all([
    registerPresentationIllustrations({prefix:'full-map-content-prototype/art/',files:['full-map-content-prototype.json'],ids:FULL_MAP_CONTENT.map(card=>card.id)}),
    registerPresentationIllustrations({prefix:'full-map-enemy-prototype/art/',files:['full-map-enemy-prototype.json'],ids:ENEMY_CONTENT.map(card=>card.id)}),
    registerPresentationIllustrations({prefix:'full-map-enemy-direction-prototype/art/',files:['full-map-enemy-direction-prototype.json'],ids:[...DIRECTION_IDS.map(id=>`direction_${id}`),'enemy-rim']}),
    registerPresentationIllustrations({prefix:'full-map-enemy-palette-prototype/art/',files:['full-map-enemy-palette-prototype.json'],ids:PALETTE_ART_IDS}),
    registerPresentationIllustrations({prefix:'full-map-patron-prototype/art/',files:['full-map-patron-prototype.json'],ids:[...new Set([...PATRON_CONTENT.map(card=>card.id),...Object.values(PATRONS).map(p=>p.emblem),...SEAL_ART_IDS,...PALE_PRIEST_IDS.flatMap(id=>Object.values(PRIEST_ART_PREFIX).map(prefix=>`${prefix}_${id}`)),...MERCHANT_TONE_IDS.flatMap(id=>Object.values(MERCHANT_ART_PREFIX).map(prefix=>`${prefix}_${id}`))])]}),
  ])
    .then(()=>{ready=true;run(()=>{});}).catch(error=>{loadError=error.message;run(()=>{});});
  const chaosArtwork=()=>chaosLoading??=registerPresentationIllustrations({prefix:'full-map-chaos-prototype/art/',files:CHAOS_POOLS.map(pool=>`full-map-chaos-${pool}.json`),ids:CHAOS_CONTENT.map(card=>`chaos_${card.id}`)})
    .then(()=>{chaosReady=true;run(()=>{});}).catch(error=>{loadError=error.message;run(()=>{});});
  const exportNotes=()=>{
    const content=contentForAppearance(appearance);
    const rows=content.map(card=>({id:card.id,label:card.label,pool:POOL[card.pool],tier:card.tier??'bronze',placement:card.zone??null,decision:reviews.get(card.id)??'unreviewed',note:notes.get(card.id)??''}));
    const url=URL.createObjectURL(new Blob([JSON.stringify({type:'full-map-content-review',version:2,cards:rows},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='full-map-content-review.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  function render(host) {
    // The Lab retains this workbench between routes. Apply a newly opened study
    // link without resetting session notes or overriding local selector changes.
    if(routeHash!==location.hash){
      routeHash=location.hash;const next=new URLSearchParams(routeHash.split('?')[1]??'');
      appearance=APPEARANCE[next.get('look')]?next.get('look'):'original';directionOnly=next.get('samples')==='1';
      merchant=MERCHANT_PALETTES[next.get('merchant')]?next.get('merchant'):'m1';priest=PRIEST_PALETTES[next.get('priest')]?next.get('priest'):'p1';
      merchantSeal=validOption(PATRON_SEALS.oligarch,next.get('mSeal'),'grasp2');scholarSeal=validOption(PATRON_SEALS.sect,next.get('sSeal'),'tome2');priestTone=validOption(PRIEST_TONES,next.get('pTone'),'pink');merchantTone=validOption(MERCHANT_TONES,next.get('mTone'),'copper');
      pool=POOL[next.get('pool')]?next.get('pool'):'';
    }
    host.classList.toggle('lab-value-check',appearance==='chaos'&&valueCheck);
    const head=el('div','','lab-page-head'),text=el('div');
    const content=contentForAppearance(appearance);
    const counts=countsForContent(content);
    text.append(el('h2','Full-map content candidates'),el('p',appearance==='chaos'?'88 enemy paintings: 80 institutions and eight capital rites/supports. Rules and the 50 player/neutral paintings are unchanged.':appearance==='patrons'?'Eight proposed Gold capital rites and institutions, alongside the original 130 cards.':'20 player · 30 neutral · 80 enemy. Enemy maturity and placement are proposals.','lab-subtitle'));
    const back=el('a','All prototypes');back.href='#/dev/prototypes';head.append(text,back);host.append(head);
    host.append(el('p','Visual proposals only. Keep, reconsider tier or cut; notes stay in this session unless exported.','lab-note'));
    const controls=el('div','','lab-controls');
    const poolSelect=select('Candidate pool',[['',`All ${content.length} cards`],...Object.entries(POOL).map(([id,label])=>[id,`${label} · ${counts[id]}`])],pool);
    poolSelect.addEventListener('change',()=>run(()=>{pool=poolSelect.value;}));
    const kindSelect=select('Card type',[['','Practices and Structures'],['practice','Practices'],['structure','Structures']],kind);
    kindSelect.addEventListener('change',()=>run(()=>{kind=kindSelect.value;}));
    const zoneSelect=select('Suggested placement',[['','Any placement'],['frontier','Frontier'],['province','Province'],['capital','Capital']],zone);
    zoneSelect.addEventListener('change',()=>run(()=>{zone=zoneSelect.value;}));
    const statusSelect=select('Review decision',[['','Any decision'],...Object.entries(reviewLabels)],reviewFilter);
    statusSelect.addEventListener('change',()=>run(()=>{reviewFilter=statusSelect.value;}));
    const search=input('Find a candidate',query,'search');search.addEventListener('input',()=>run(()=>{query=search.value;}));
    controls.append(field('Pool',poolSelect),field('Type',kindSelect),field('Placement',zoneSelect),field('Decision',statusSelect),field('Search',search),button('Export review notes',exportNotes));host.append(controls);
    const visual=el('div','','lab-controls');
    const appearanceSelect=select('Enemy appearance',Object.entries(APPEARANCE),appearance);
    appearanceSelect.addEventListener('change',()=>run(()=>{appearance=appearanceSelect.value;}));
    const samplesLabel=appearance==='chaos'?'Only the 88 enemy cards':appearance==='patrons'?'Only eight patron studies':'Only four art direction studies';
    const samples=input(samplesLabel,'','checkbox');samples.checked=directionOnly;
    samples.addEventListener('change',()=>run(()=>{directionOnly=samples.checked;}));
    visual.append(field('Enemy appearance',appearanceSelect),field(samplesLabel,samples));host.append(visual);
    if(appearance==='chaos'){
      const values=input('Greyscale value check','','checkbox');values.checked=valueCheck;
      values.addEventListener('change',()=>{valueCheck=values.checked;host.classList.toggle('lab-value-check',valueCheck);});visual.append(field('Greyscale value check',values));
    }
    if(appearance==='palettes'){
      const palettes=el('div','','lab-controls');
      const merchantSelect=select('Merchant palette',Object.entries(MERCHANT_PALETTES),merchant),priestSelect=select('Priest palette',Object.entries(PRIEST_PALETTES),priest);
      merchantSelect.addEventListener('change',()=>run(()=>{merchant=merchantSelect.value;}));
      priestSelect.addEventListener('change',()=>run(()=>{priest=priestSelect.value;}));
      palettes.append(field('Merchant palette',merchantSelect),field('Priest palette',priestSelect));host.append(palettes);
      host.append(el('p','New: green Merchant G1–G3 and yellow Priest Y1–Y3, alongside the earlier schemes. Each pair uses the same Practice and Structure scene. Practice action stays in the upper 45%; the lower half is quiet. The enemy frame is held constant.','lab-note'));
    }else if(appearance==='patrons'){
      const trials=el('div','','lab-controls');
      const merchantSelect=select('Merchant cult seal',Object.entries(PATRON_SEALS.oligarch).map(([id,option])=>[id,option.label]),merchantSeal);
      const scholarSelect=select('Scholar cult seal',Object.entries(PATRON_SEALS.sect).map(([id,option])=>[id,option.label]),scholarSeal);
      const priestSelect=select('Priest patron palette',Object.entries(PRIEST_TONES),priestTone);
      const merchantToneSelect=select('Merchant patron palette',Object.entries(MERCHANT_TONES),merchantTone);
      merchantSelect.addEventListener('change',()=>run(()=>{merchantSeal=merchantSelect.value;}));
      scholarSelect.addEventListener('change',()=>run(()=>{scholarSeal=scholarSelect.value;}));
      priestSelect.addEventListener('change',()=>run(()=>{priestTone=priestSelect.value;}));
      merchantToneSelect.addEventListener('change',()=>run(()=>{merchantTone=merchantToneSelect.value;}));
      trials.append(field('Merchant seal',merchantSelect),field('Scholar seal',scholarSelect),field('Merchant palette',merchantToneSelect),field('Priest palette',priestSelect));host.append(trials);
      host.append(el('p',`Merchant accent trial: ${MERCHANT_TONES[merchantTone].replace('Previous ','').toLowerCase()}. Agreed Priest direction: reference yellow / pink; earlier Priest trials remain selectable. Cult seals are separate from allegiance. Population sinks and patron identities remain proposals; no simulation runs these cards.`,'lab-note'));
    }else if(appearance==='chaos')host.append(el('p','Settled colours: Warlord red/teal; Merchant green/copper-orange; Priest yellow/pink; Scholar blue/gold. Frontier hints become provincial institutions and capital god-bodies. Readability, anonymous figures and quiet overlay areas take priority over ornament. Earlier art remains selectable.','lab-note'));
    else if(appearance!=='original'||directionOnly)host.append(el('p','Earlier art study: Merchant green / copper-orange; Priest violet / pale pink. Cam preferred the subject matter but rejected these palettes. The enemy frame marks a decayed institution, not current allegiance.','lab-note'));
    host.append(disclosure('Rules used by this proposal set',(patronAppearance(appearance)?PATRON_REVIEW_RULES:CONTENT_REVIEW_RULES).map(rule=>el('p',rule)),{key:patronAppearance(appearance)?'content-prototype:patron-rules':'content-prototype:rules',open:false}));
    host.append(disclosure('Enemy identities and later map experiments',[
      ...Object.values(ENEMY_POOLS).map(enemy=>el('p',`${enemy.classLabel}: ${enemy.identity}`)),
      ...ENEMY_SETUP_PROPOSALS.map(rule=>el('p',rule)),
    ],{key:'content-prototype:enemies',open:false}));
    if(!ready){host.append(el('p',loadError?`Artwork could not load: ${loadError}`:'Preparing dedicated card paintings…','lab-note'));if(!loadError)void artwork();return;}
    if(appearance==='chaos'&&!chaosReady){host.append(el('p',loadError?`Artwork could not load: ${loadError}`:'Preparing the full chaos-god art pass…','lab-note'));if(!loadError)void chaosArtwork();return;}
    cards??=createLabCards();
    if(patronAppearance(appearance)){
      host.append(disclosure('Compare all four seals at 64, 24 and 16 pixels',[
        sealComparison(appearance==='chaos'?'grasp2':merchantSeal,appearance==='chaos'?'tome2':scholarSeal),el('p','Same ivory treatment and size across classes. Compare the outline and large gaps first. Cult affiliation is separate from faction allegiance.','lab-note'),
      ],{key:'content-prototype:seal-comparison',open:true}));
      const identities=el('div','','lab-card-grid lab-catalogue-grid lab-patron-identities');
      for(const [pool,patron] of Object.entries(PATRONS)){
        const seal=sealFor(pool,appearance==='chaos'?'grasp2':merchantSeal,appearance==='chaos'?'tome2':scholarSeal),emblem=seal?.id??patron.emblem;
        const item=el('article','','lab-card'),icon=el('img','','lab-patron-emblem');icon.src=`images/dark-fantasy/full-map-patron-prototype/art/${emblem}.png`;icon.alt=`${patron.name} seal`;icon.width=icon.height=64;icon.dataset.patronEmblem=emblem;
        item.append(icon,el('strong',`${POOL[pool]} · ${patron.name}`,'lab-card-title'),badge(appearance==='chaos'?CHAOS_PALETTES[pool]:pool==='papacy'?PRIEST_TONES[priestTone]:pool==='oligarch'?MERCHANT_TONES[merchantTone]:patron.palette),...(seal?[badge(seal.label)]:[]),el('p',patron.ideal,'lab-note'),el('p',seal?.shape??patron.silhouette,'lab-note'));identities.append(item);
      }
      host.append(disclosure('Four proposed patrons and their silhouettes',[identities],{key:'content-prototype:patron-identities',open:true}));
    }
    const projected=contentReviewFaces(getState(),appearance,{merchant,priest,merchantSeal,scholarSeal,priestTone,merchantTone});
    if(patronAppearance(appearance)){
      const references=el('div','','lab-card-grid lab-catalogue-grid');references.dataset.testid='patron-palette-references';
      for(const id of ['cp_ironCommunion','cp_finalLiquidation','cp_offeringOfNames','cp_finalRedaction']){
        const {card,face}=projected.find(row=>row.card.id===id);
        const label=appearance==='chaos'?CHAOS_PALETTES[card.pool]:card.pool==='oligarch'?MERCHANT_TONES[merchantTone]:card.pool==='papacy'?PRIEST_TONES[priestTone]:PATRONS[card.pool].palette;
        const reference=cards.card(face,card.label,null,{readable:true,meta:[badge(POOL[card.pool]),badge(label)]});
        reference.dataset.patronPaletteReference=id;references.append(reference);
      }
      host.append(disclosure('Compare the four class palettes',[references],{key:'content-prototype:patron-palette-references',open:true}));
    }
    if(appearance==='palettes'){
      const references=el('div','','lab-card-grid lab-catalogue-grid');references.dataset.testid='palette-class-references';
      for(const id of ['fe_officersFeast','fe_abstractDisputation']){
        const {card,face}=projected.find(row=>row.card.id===id);
        const reference=cards.card(face,card.label,null,{readable:true,meta:[badge(card.pool==='dictator'?'Warrior: red / teal':'Scholar: blue / gold'),badge('Existing colour reference')]});
        reference.dataset.paletteReference=id;references.append(reference);
      }
      host.append(disclosure('Established Warrior and Scholar palettes',[references],{key:'content-prototype:palette-references',open:true}));
    }
    const entries=projected.filter(({card})=>(!directionOnly||(appearance==='chaos'?card.enemy:appearance==='patrons'?card.patronStudy:DIRECTION_IDS.includes(card.id)))&&(!pool||card.pool===pool)&&(!kind||card.kind===kind)&&(!zone||card.zone===zone)&&(!reviewFilter||(reviews.get(card.id)??'unreviewed')===reviewFilter)&&(!query||[card.label,card.role,...card.rules].join(' ').toLowerCase().includes(query.toLowerCase())));
    const count=el('p',`${entries.length} shown · ${reviews.size} reviewed`,'lab-note');count.setAttribute('role','status');host.append(count);
    const grid=el('div','','lab-card-grid lab-catalogue-grid lab-content-prototype-grid');grid.dataset.testid='full-map-content-grid';
    let previousPool='';
    for(const {card,face} of entries){
      if(card.pool!==previousPool){previousPool=card.pool;grid.append(el('h3',POOL[card.pool],'lab-grid-group'));}
      const decision=reviews.get(card.id)??'unreviewed';
      const chooser=select(`Decision for ${card.label}`,Object.entries(card.enemy?reviewLabels:{...reviewLabels,keep:'Keep at Bronze',silver:'Try Silver'}),decision);
      chooser.addEventListener('change',()=>{if(chooser.value==='unreviewed')reviews.delete(card.id);else reviews.set(card.id,chooser.value);specimen.dataset.decision=chooser.value;count.textContent=`${entries.length} shown · ${reviews.size} reviewed`;if(reviewFilter)run(()=>{});});
      const paletteLabel=appearance==='palettes'&&DIRECTION_IDS.includes(card.id)?(card.pool==='oligarch'?`${merchant.toUpperCase()} · ${MERCHANT_PALETTES[merchant]}`:`${priest.toUpperCase()} · ${PRIEST_PALETTES[priest]}`):null;
      const specimen=cards.card(face,card.label,null,{readable:true,meta:[badge(POOL[card.pool]),...(paletteLabel?[badge(paletteLabel)]:[]),...(card.patronStudy?[badge(PATRONS[card.pool].name),...(card.victim?[badge('Consumes population')]:[])]:[]),badge(title(card.tier??'bronze')),...(card.zone?[badge(title(card.zone))]:[]),...(card.condition?[badge(card.condition)]:[])]});
      specimen.dataset.candidateId=card.id;specimen.dataset.pool=card.pool;specimen.dataset.decision=decision;
      specimen.append(el('p',face.rule,'lab-card-rule'));
      const review=el('details','','lab-disclosure');review.append(el('summary','Review this candidate'),field('Decision',chooser));
      const note=el('textarea');note.setAttribute('aria-label',`Notes for ${card.label}`);note.rows=2;note.value=notes.get(card.id)??'';
      note.addEventListener('input',()=>notes.set(card.id,note.value));review.append(field('Notes',note),el('p',card.role,'lab-note'));specimen.append(review);grid.append(specimen);
    }
    if(!entries.length)grid.append(el('p','No candidates match these filters.','lab-empty'));
    host.append(grid);
  }
  return {render,hide(){cards?.dismissReading();},destroy(){cards?.destroy();},getSnapshot:()=>({ready:ready&&(appearance!=='chaos'||chaosReady),error:loadError,total:contentForAppearance(appearance).length,pools:countsForContent(contentForAppearance(appearance)),appearance,merchant,priest,merchantSeal,scholarSeal,priestTone,merchantTone,valueCheck,directionOnly,reviewed:reviews.size,reading:cards?.getReadingSnapshot()??null})};
}
