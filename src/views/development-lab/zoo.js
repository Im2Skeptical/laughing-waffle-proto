import { getLabCatalogue, filterLabCatalogue } from '../../model/dev-lab/catalogue.js';
import { getGamepieceFace } from '../../model/gamepiece-presentation.js';
import { stockCapacity } from '../../model/detailed-settlements/stock.js';
import { practiceSlot } from '../../model/dev-lab/fixtures.js';
import { el, select, field, input, section, details, button, table } from './elements.js';

export function createZooView({controller,cards,run,onReview,review}) {
  const filters = {category:'practice'}, pageSize = 12;
  let page = 0, selected = null, versionsMode='live', hideLocked=false, moreOpen = null, scrollToSelected = false;
  // Flag in place: the reviewer keeps the queue, so browsing continues here.
  const liveDefinition = face => controller.getSnapshot().state.gameConfig.gamepieces[face.kind==='practice'?'practices':'structures'][face.definitionId];
  const flag = face => run(()=>review.flag(face.kind,face.definitionId,liveDefinition(face),face.tier));
  const openReview = face => { location.hash = `/dev/reviewer?card=${encodeURIComponent(`${face.kind}:${face.definitionId}`)}`; };
  function render(parent) {
    let {state} = controller.getSnapshot();
    const locks=new Map((review?.list()??[]).map(entry=> {
      const live=state.gameConfig.gamepieces[entry.kind==='practice'?'practices':'structures'][entry.id];
      return [`${entry.kind}:${entry.id}`,review.preview(entry,live).definition.locked===true];
    }));
    let edited=new Set(),issues=[];
    if(versionsMode!=='live'&&review) {
      const result=review.applyTo(state.gameConfig.gamepieces);edited=new Set(result.applied);issues=result.issues;
      state={...state,gameConfig:{...state.gameConfig,gamepieces:result.gamepieces}};
    }
    // Lock visibility survives unrelated value conflicts and applies to live faces.
    const catalogue=getLabCatalogue(state).map(entry=>({...entry,locked:locks.get(`${entry.category}:${entry.id}`)??entry.locked}));
    const controls = el('div','','lab-controls lab-zoo-filters');
    // Only offer filters that can match something in the chosen category, and
    // drop hidden ones so an invisible filter never empties the catalogue.
    const inCategory = catalogue.filter(e => !filters.category || e.category === filters.category);
    const values = property => [...new Set(inCategory.flatMap(e => e[property] ?? []))].filter(v => v !== '' && v != null).map(String).sort();
    const options = {
      pool:values('pool'), maturity:['bronze','silver','gold','diamond'].filter(v=>values('maturity').includes(v)),
      mode:values('mode'), tag:values('tags'), trait:values('traits'), size:values('size').length > 1 ? values('size') : [],
    };
    const labels = {category:'Category',pool:'Class',maturity:'Maturity',mode:'Practice mode',tag:'Card Tag',trait:'Stock Trait',size:'Slot size'};
    for (const key of Object.keys(options)) if (filters[key] && !options[key].includes(filters[key])) filters[key] = '';
    const changed = () => { page=0; selected=null; run(()=>{}); };
    const category = select(labels.category,[['','All'],['practice','Practices'],['structure','Structures'],['candidate','Candidates'],['life-map','Life Map nodes'],['neutral','Neutral templates'],['monster','Monsters']],filters.category ?? '');
    category.addEventListener('change',()=>{filters.category=category.value;changed();});
    controls.append(field(labels.category,category));
    const search = input('Search runtime content',filters.search ?? '','search'); search.placeholder = 'Name, rule, id…'; search.enterKeyHint = 'search';
    let searchTimer;
    search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filters.search=search.value;changed();},250);});
    controls.append(field('Search',search));
    if(review) {
      const versions=select('Card versions',[['live','Live cards'],['edited','Show edited cards'],['edited-only','Edited cards only']],versionsMode);
      versions.addEventListener('change',()=>{versionsMode=versions.value;changed();});controls.append(field('Card versions',versions));
    }
    const hide=input('Hide locked cards','','checkbox');hide.checked=hideLocked;
    hide.addEventListener('change',()=>{hideLocked=hide.checked;changed();});
    controls.append(field('Hide locked cards',hide));
    const secondary = Object.entries(options).filter(([,list]) => list.length);
    const activeSecondary = secondary.filter(([key]) => filters[key]).length;
    const more = el('details','','lab-filter-more');
    more.open = moreOpen ?? (activeSecondary > 0 || !globalThis.matchMedia?.('(max-width:850px)').matches);
    // Setting open fires toggle too; only a user's change is remembered.
    const initialOpen = more.open;
    more.addEventListener('toggle',()=>{if(more.open!==initialOpen)moreOpen=more.open;});
    more.append(el('summary',`More filters${activeSecondary?` · ${activeSecondary} active`:''}`));
    const moreControls = el('div','','lab-controls');
    for (const [key,list] of secondary) {
      const control = select(labels[key],[['','All'],...list],filters[key] ?? '');
      control.addEventListener('change',()=>{filters[key]=control.value;changed();}); moreControls.append(field(labels[key],control));
    }
    if (secondary.length) { more.append(moreControls); controls.append(more); }
    const anyFilter = hideLocked || versionsMode !== 'live' || !!filters.search || secondary.some(([key]) => filters[key]) || filters.category !== 'practice';
    if (anyFilter) controls.append(button('Clear filters',()=>{for(const key of Object.keys(filters))delete filters[key];filters.category='practice';hideLocked=false;versionsMode='live';changed();},'zoo-clear-filters'));
    const flagged = review?.list().length ?? 0;
    if (review) { const link = el('a',`Review flagged (${flagged}) ›`,'lab-review-link'); link.href = '#/dev/reviewer'; controls.append(link); }
    parent.append(controls);
    if(versionsMode!=='live')parent.append(el('p',`${edited.size} edited cards shown. Other cards use live values.${issues.length?` Some drafts could not be shown: ${issues.join('; ')}.`:''}`));
    const matches = filterLabCatalogue(catalogue,{...filters,hideLocked}).filter(entry=>versionsMode!=='edited-only'||edited.has(`${entry.category}:${entry.id}`));
    parent.append(el('p','Tap or hover a card for its quick read; Rules opens the full rules, symbol key and linked definitions. Compare shows all four qualities. Flag adds a card to the reviewer without leaving the Zoo.','lab-hint'));
    const coverage = [], missing = [];
    for (const [pool,expectedPractices,expectedStructures] of [['common',13,14],['scholar',48,32],['warrior',48,32]]) {
      const practices=catalogue.filter(e=>e.category==='practice'&&e.pool===pool),structures=catalogue.filter(e=>e.category==='structure'&&e.pool===pool);
      const charge=practices.filter(e=>e.def.mode==='charge').length;
      const short=practices.length!==expectedPractices||structures.length!==expectedStructures;
      if(short)missing.push(pool);
      coverage.push(el('p',`${pool}: ${practices.length}/${expectedPractices} Practices (${charge} Charge), ${structures.length}/${expectedStructures} Structures${short?' — MISSING RUNTIME CONTENT':''}.`));
    }
    const coveragePanel = el('details','','lab-coverage'); coveragePanel.open = missing.length > 0;
    coveragePanel.append(el('summary',missing.length?`Content coverage — MISSING RUNTIME CONTENT (${missing.join(', ')})`:'Content coverage · complete'),...coverage);
    parent.append(coveragePanel);
    page = Math.min(page,Math.max(0,Math.ceil(matches.length/pageSize)-1));
    parent.append(el('p',`${matches.length} matching runtime entries · ${Object.keys(state.gameConfig.gamepieces.practices).length} Practices · ${Object.keys(state.gameConfig.gamepieces.structures).length} Structures. Definitions come from this fixture’s serialized game config.`));
    const pager = () => {
      const node = el('div','','lab-controls lab-pager'), prev=button('Previous',()=>run(()=>page--)), next=button('Next',()=>run(()=>page++));
      prev.disabled=page===0;next.disabled=(page+1)*pageSize>=matches.length;
      node.append(prev,el('span',`Page ${page+1} / ${Math.max(1,Math.ceil(matches.length/pageSize))}`),next);return node;
    };
    if (matches.length > pageSize) parent.append(pager());
    if (selected) {
      const e = catalogue.find(e=>`${e.category}:${e.id}` === selected);
      if (e) {
        const panel = section(e.label);
        if(e.locked)panel.append(el('p','Locked · excluded from shop offers when reviewed cards are applied.'));
        panel.append(button('Close comparison',()=>run(()=>{selected=null;})));
        const variants = el('div','','lab-card-grid');
        if (['practice','structure'].includes(e.category)) {
          for (const [quality,tier] of ['bronze','silver','gold','diamond'].entries()) {
            const slot = e.category === 'practice' ? practiceSlot(e.id,0,tier) : {qualityBonus:quality};
            const face = getGamepieceFace(state,e.category,e.id,tier,{slot});
            if (e.category === 'practice') face.stockCapacity = stockCapacity(state,{structureSlots:[]},slot);
            variants.append(cards.card(face,e.category === 'practice' ? tier : `Quality uplift +${quality * 25}%`,null,{readable:true}));
          }
          panel.append(variants,table(['Property','Runtime value'],[
            ['Maturity',e.maturity],['Card Tags',e.tags.join(', ')],['Stock Traits',e.traits.join(', ')],
            ['Timing',JSON.stringify(e.def.activation ?? 'passive')],['Generate / effects',JSON.stringify(e.def.effects)],
            ['Mode',e.def.mode??'Passive Structure'],['Charge trigger / gain / threshold',e.def.charge?`${e.def.charge.triggerText} +${e.def.charge.gain}; threshold ${e.def.charge.threshold}`:'—'],
            ['Discharge',e.def.charge?.dischargeText??'—'],['Provisional deviations',(e.def.provisionalNotes??[]).join(' ')||'None'],
            ['Consume',JSON.stringify(e.def.consume ?? [])],['Require',JSON.stringify(e.def.require ?? [])],
            ['Capacity / cells',e.def.stockCapacity ?? e.def.footprint],['Gates',`Specialists: ${e.def.specialistGate ?? 0}; ${e.def.condition ?? 'none'}`],
            ['Passive modifiers',JSON.stringify(e.def.modifiers ?? [])],['Stacking',e.category === 'structure' ? 'Duplicate placements; numeric bonuses add through runtime queries' : 'One instance per Practice'],
          ]));
        }
        panel.append(details('Complete runtime definition',e.def)); parent.append(panel);
        // The panel renders above the grid; bring it into view after the
        // shell restores the previous scroll position.
        if (scrollToSelected) { scrollToSelected = false; requestAnimationFrame(()=>panel.scrollIntoView({block:'start'})); }
      }
    }
    const grid = el('div','','lab-card-grid lab-catalogue-grid');
    for (const e of matches.slice(page*pageSize,(page+1)*pageSize)) {
      const inspect = ()=>run(()=>{selected=`${e.category}:${e.id}`;scrollToSelected=true;});
      if (['practice','structure'].includes(e.category)) {
        const slot = e.category === 'practice' ? practiceSlot(e.id,0,e.maturity) : {};
        const face = getGamepieceFace(state,e.category,e.id,e.maturity,{slot});
        if (e.category === 'practice') face.stockCapacity = stockCapacity(state,{structureSlots:[]},slot);
        const isEdited=edited.has(`${e.category}:${e.id}`);
        const isFlagged=!!review?.get(e.category,e.id);
        const actions=review?[isFlagged?button('Open review',()=>openReview(face)):button('Flag for review',()=>flag(face))]:[];
        const card=cards.card(face,`${e.label} · ${e.pool} · ${e.maturity}${e.locked?' · locked':''}${isEdited?' · edited':''}${isFlagged?' · flagged':''}`,inspect,{readable:true,actions});
        if(e.locked)card.dataset.locked='true';
        if(isEdited)card.dataset.edited='true';
        if(isFlagged)card.dataset.flagged='true';
        grid.append(card);
      }
      else {
        const item = section(e.label,el('p',e.def.description ?? e.def.rule ?? e.pool ?? 'Runtime template'));
        if (e.category === 'neutral') item.append(el('p',`Installed (5 max): ${e.def.installedPractices.join(', ')}. Omitted by runtime: ${e.def.omittedPractices.join(', ') || 'none'}.`));
        item.classList.add('lab-specimen'); item.append(details('Runtime data',e.def)); grid.append(item);
      }
    }
    parent.append(grid, pager());
  }
  return {render};
}
