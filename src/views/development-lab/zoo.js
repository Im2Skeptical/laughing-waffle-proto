import { getLabCatalogue, filterLabCatalogue } from '../../model/dev-lab/catalogue.js';
import { getGamepieceFace } from '../../model/gamepiece-presentation.js';
import { stockCapacity } from '../../model/detailed-settlements/stock.js';
import { practiceSlot } from '../../model/dev-lab/fixtures.js';
import { el, select, field, input, section, details, button, table, disclosure, info, badge, segmented, group } from './elements.js';

const CATEGORIES = [['practice','Practices'],['structure','Structures'],['candidate','Candidates'],['life-map','Life Map'],['neutral','Neutrals'],['monster','Monsters'],['','All']];
const POOLS = ['common','scholar','warrior'];
const title = value => value ? value[0].toUpperCase() + value.slice(1) : value;
const VERSION_LABELS = {edited:'With edits','edited-only':'Edited only'};
const HIDE_AFTER = 160;

export function createZooView({controller,cards,run,review}) {
  const filters = {category:'practice'}, pageSize = 12;
  let page = 0, selected = null, versionsMode='live', hideLocked=false, scrollToSelected = false;
  // Flag in place: the reviewer keeps the queue, so browsing continues here.
  const liveDefinition = face => controller.getSnapshot().state.gameConfig.gamepieces[face.kind==='practice'?'practices':'structures'][face.definitionId];
  const flag = face => run(()=>review.flag(face.kind,face.definitionId,liveDefinition(face),face.tier));
  const openReview = face => { location.hash = `/dev/reviewer?card=${encodeURIComponent(`${face.kind}:${face.definitionId}`)}`; };
  let filtersOpen = false, barHidden = false, lastY = 0, barObserver = null;
  const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Sticky offsets below the bar follow its real height (0 while hidden).
  function syncBar() {
    const bar = document.querySelector('.lab-zoo-bar');
    if (!bar) { document.documentElement.style.setProperty('--lab-zoo-bar-h','0px'); return; }
    bar.classList.toggle('is-hidden',barHidden);
    bar.classList.toggle('is-instant',reducedMotion());
    document.documentElement.style.setProperty('--lab-zoo-bar-h',barHidden?'0px':`${bar.offsetHeight}px`);
  }
  function observeBar(bar) {
    barObserver?.disconnect();
    if (typeof ResizeObserver === 'function') { barObserver = new ResizeObserver(syncBar); barObserver.observe(bar); }
  }
  function setFiltersOpen(open) {
    filtersOpen = open;
    // Only a fresh open animates; re-renders while open stay still.
    for (const node of document.querySelectorAll('.lab-zoo-filters,.lab-zoo-scrim')) { node.dataset.open = String(open); node.classList.toggle('is-entering',open); }
    const toggle = document.querySelector('[data-testid=zoo-filters-button]');
    toggle?.setAttribute('aria-expanded',String(open));
    if (open) { barHidden = false; syncBar(); document.querySelector('.lab-zoo-filters-close')?.focus({preventScroll:true}); }
    else if (document.querySelector('.lab-zoo-filters')?.contains(document.activeElement) || document.activeElement === document.body) toggle?.focus({preventScroll:true});
  }
  globalThis.addEventListener?.('hashchange',()=>{ filtersOpen = false; barHidden = false; barObserver?.disconnect(); });
  globalThis.addEventListener?.('scroll',()=>{
    const bar = document.querySelector('.lab-zoo-bar');
    const y = globalThis.scrollY;
    if (!bar) { lastY = y; return; }
    const delta = y - lastY;
    if (Math.abs(delta) < 8) return;
    lastY = y;
    // Stay put while typing a search so the field never slides away mid-word.
    const hide = delta > 0 && y > HIDE_AFTER && !filtersOpen && !bar.querySelector('input:focus');
    if (hide !== barHidden) { barHidden = hide; syncBar(); }
  },{passive:true});
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
    const changed = () => { page=0; selected=null; run(()=>{}); };

    const head = el('div','','lab-page-head lab-zoo-head');
    const heading = el('div'); heading.append(el('h2','Zoo'),el('p','Every runtime card and template in this build.','lab-subtitle'));
    head.append(heading, info('zoo',[
      'Tap or hover a card for its quick read. Rules opens the full rules, symbol key and linked definitions; Compare shows all four qualities and the runtime properties.',
      'Flag adds a card to the reviewer without leaving the Zoo. Card versions can show reviewer drafts instead of live values; the fixture itself never changes.',
      `Definitions come from this fixture’s serialized game config: ${Object.keys(state.gameConfig.gamepieces.practices).length} Practices and ${Object.keys(state.gameConfig.gamepieces.structures).length} Structures.`,
    ],{label:'How it works'}));
    if (review) {
      const flagged = review.list().length;
      const link = el('a','','lab-review-link'); link.href = '#/dev/reviewer';
      link.append(el('span','Review flagged'),badge(String(flagged),flagged?'accent':''));
      link.setAttribute('aria-label',`Review flagged (${flagged})`);
      head.append(link);
    }
    parent.append(head);

    // Only offer filters that can match something in the chosen category, and
    // drop hidden ones so an invisible filter never empties the catalogue.
    const inCategory = catalogue.filter(e => !filters.category || e.category === filters.category);
    const values = property => [...new Set(inCategory.flatMap(e => e[property] ?? []))].filter(v => v !== '' && v != null).map(String).sort();
    const options = {
      pool:POOLS.filter(v=>values('pool').includes(v)), maturity:['bronze','silver','gold','diamond'].filter(v=>values('maturity').includes(v)),
      mode:values('mode'), tag:values('tags'), trait:values('traits'), size:values('size').length > 1 ? values('size') : [],
    };
    const labels = {pool:'Class',maturity:'Maturity',mode:'Practice mode',tag:'Card Tag',trait:'Stock Trait',size:'Slot size'};
    for (const key of Object.keys(options)) if (filters[key] && !options[key].includes(filters[key])) filters[key] = '';

    // One compact bar: category tabs, search and the Filters button. It slides
    // away while scrolling down and returns on the way back up.
    const bar = el('div','','lab-zoo-bar'); bar.dataset.testid = 'zoo-bar';
    bar.classList.toggle('is-hidden',barHidden);
    const counts = Object.fromEntries(CATEGORIES.map(([id])=>[id,id?catalogue.filter(e=>e.category===id).length:catalogue.length]));
    const tabs = segmented('Category',CATEGORIES.map(([id,label])=>[id,label,counts[id]]),filters.category ?? '',value=>{filters.category=value;changed();},{testid:'zoo-category'});
    const search = input('Search runtime content',filters.search ?? '','search'); search.placeholder = 'Search names, rules, ids…'; search.enterKeyHint = 'search';
    let searchTimer;
    search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filters.search=search.value;changed();},250);});
    const active = [hideLocked, versionsMode !== 'live', ...Object.keys(options).map(key=>!!filters[key])].filter(Boolean).length;
    const filtersButton = button('',()=>setFiltersOpen(!filtersOpen),'zoo-filters-button');
    filtersButton.classList.add('lab-filters-button');
    filtersButton.append(el('span','Filters'),badge(String(active),active?'accent':''));
    filtersButton.querySelector('.lab-badge').hidden = !active;
    filtersButton.setAttribute('aria-controls','zoo-filters'); filtersButton.setAttribute('aria-expanded',String(filtersOpen));
    const tools = el('div','','lab-zoo-bar-tools'); tools.append(search, filtersButton);
    bar.append(tabs, tools);
    bar.addEventListener('focusin',event=>{ if (barHidden && event.target.matches(':focus-visible')) { barHidden=false; syncBar(); } });
    parent.append(bar);

    // Full filters: a sidebar on wide screens, a side drawer in landscape and
    // a bottom sheet in portrait. The open state survives re-renders.
    const viewGroup = [];
    if (review) viewGroup.push(segmented('Card versions',[['live','Live'],['edited','With edits'],['edited-only','Edited only']],versionsMode,value=>{versionsMode=value;changed();}));
    const hide=input('Hide locked cards','','checkbox');hide.checked=hideLocked;
    hide.addEventListener('change',()=>{hideLocked=hide.checked;changed();});
    viewGroup.push(field('Hide locked',hide));
    if (review) viewGroup.push(info('zoo-versions','Live shows this build. With edits swaps in reviewer drafts where they exist; Edited only lists just the drafted cards. Locked cards are excluded from shop offers once reviewed cards are applied.',{label:'About card versions'}));
    const cardGroup = [];
    if (options.pool.length) cardGroup.push(segmented('Class',[['','All'],...options.pool.map(pool=>[pool,title(pool)])],filters.pool ?? '',value=>{filters.pool=value;changed();}));
    const selects = el('div','','lab-filter-selects');
    for (const key of ['maturity','mode','tag','trait','size']) {
      if (!options[key].length) continue;
      const control = select(labels[key],[['','Any'],...options[key].map(v=>[v,title(v)])],filters[key] ?? '');
      control.addEventListener('change',()=>{filters[key]=control.value;changed();}); selects.append(field(labels[key],control));
    }
    if (selects.children.length) cardGroup.push(selects);
    const clearAll = () => { for (const key of Object.keys(filters)) if (key !== 'category') delete filters[key]; hideLocked=false; versionsMode='live'; changed(); };
    const drawer = el('aside','','lab-zoo-filters'); drawer.id = 'zoo-filters'; drawer.dataset.testid = 'zoo-filters';
    drawer.setAttribute('aria-label','Zoo filters'); drawer.dataset.open = String(filtersOpen);
    const drawerHead = el('div','','lab-zoo-filters-head');
    const drawerTitle = el('strong','Filters'); if (active) drawerTitle.append(' ',badge(String(active),'accent'));
    const done = button('Done',()=>setFiltersOpen(false),'zoo-filters-close','primary'); done.classList.add('lab-zoo-filters-close');
    drawerHead.append(drawerTitle);
    if (active) drawerHead.append(button('Clear',clearAll,'','quiet'));
    drawerHead.append(done);
    drawer.append(drawerHead, group('Show',...viewGroup), ...(cardGroup.length?[group('Card details',...cardGroup)]:[]));
    drawer.addEventListener('keydown',event=>{ if (event.key === 'Escape' && filtersOpen) { event.stopPropagation(); setFiltersOpen(false); } });
    const scrim = el('div','','lab-zoo-scrim'); scrim.dataset.open = String(filtersOpen); scrim.addEventListener('click',()=>setFiltersOpen(false));

    let matches = filterLabCatalogue(catalogue,{...filters,hideLocked}).filter(entry=>versionsMode!=='edited-only'||edited.has(`${entry.category}:${entry.id}`));
    // Cards are grouped by class; sorting keeps each group contiguous across pages.
    const grouped = ['practice','structure'].includes(filters.category) && !filters.pool;
    if (grouped) matches = POOLS.flatMap(pool=>matches.filter(e=>e.pool===pool)).concat(matches.filter(e=>!POOLS.includes(e.pool)));

    const coverage = [], missing = [];
    for (const [pool,expectedPractices,expectedStructures] of [['common',13,14],['scholar',48,32],['warrior',48,32]]) {
      const practices=catalogue.filter(e=>e.category==='practice'&&e.pool===pool),structures=catalogue.filter(e=>e.category==='structure'&&e.pool===pool);
      const charge=practices.filter(e=>e.def.mode==='charge').length;
      const short=practices.length!==expectedPractices||structures.length!==expectedStructures;
      if(short)missing.push(pool);
      coverage.push([title(pool),`${practices.length}/${expectedPractices} (${charge} Charge)`,`${structures.length}/${expectedStructures}`,short?'Missing runtime content':'Complete']);
    }
    page = Math.min(page,Math.max(0,Math.ceil(matches.length/pageSize)-1));
    const pages = Math.max(1,Math.ceil(matches.length/pageSize));
    const pager = () => {
      const node = el('div','','lab-pager'), prev=button('Previous',()=>run(()=>page--),'','quiet'), next=button('Next',()=>run(()=>page++),'','quiet');
      prev.disabled=page===0;next.disabled=(page+1)*pageSize>=matches.length;
      node.append(prev,el('span',`${page+1} / ${pages}`),next);return node;
    };
    // Active filters read as small removable chips beside the result count.
    const chips = el('div','','lab-filter-chips'); chips.setAttribute('role','group'); chips.setAttribute('aria-label','Active filters');
    const chip = (text, remove, testid) => {
      const node = button('',()=>{remove();changed();},testid); node.classList.add('lab-chip');
      node.append(el('span',text),el('span','×','lab-chip-x')); node.setAttribute('aria-label',`Remove filter: ${text}`); chips.append(node);
    };
    if (filters.search) chip(`“${filters.search}”`,()=>{filters.search='';});
    if (versionsMode !== 'live') chip(VERSION_LABELS[versionsMode],()=>{versionsMode='live';});
    if (hideLocked) chip('Hide locked',()=>{hideLocked=false;});
    for (const key of Object.keys(options)) if (filters[key]) chip(`${labels[key]}: ${title(filters[key])}`,()=>{filters[key]='';});
    if (chips.children.length > 1) {
      const clear = button('Clear all',clearAll,'zoo-clear-filters','quiet'); clear.classList.add('lab-chip-clear'); chips.append(clear);
    }
    const results = el('div','','lab-results-bar');
    results.append(el('p',`${matches.length} matching runtime entries`,'lab-count'));
    if (chips.children.length) results.append(chips);
    const coveragePanel = disclosure(missing.length?`Coverage: missing ${missing.join(', ')}`:'Coverage',[table(['Class','Practices','Structures','Status'],coverage)],
      {open:missing.length>0,className:`lab-coverage${missing.length?' lab-coverage-missing':''}`,badges:[badge(missing.length?'!':'✓',missing.length?'warn':'ok')]});
    results.append(coveragePanel);
    if (matches.length > pageSize) results.append(pager());

    const layout = el('div','','lab-zoo-layout'), main = el('div','','lab-zoo-main');
    layout.append(drawer, main); parent.append(layout, scrim);
    if(versionsMode!=='live')main.append(el('p',`${edited.size} edited cards shown; other cards use live values.${issues.length?` Some drafts could not be shown: ${issues.join('; ')}.`:''}`,'lab-note'));
    main.append(results);
    parent = main;
    requestAnimationFrame(()=>{ syncBar(); observeBar(bar); });

    if (selected) {
      const e = catalogue.find(e=>`${e.category}:${e.id}` === selected);
      if (e) {
        const panel = section(e.label); panel.classList.add('lab-compare-panel');
        const top = el('div','','lab-panel-head'); top.append(panel.firstChild, button('Close comparison',()=>run(()=>{selected=null;}),'','quiet')); panel.prepend(top);
        if(e.locked)panel.append(el('p','Locked · excluded from shop offers when reviewed cards are applied.','lab-note'));
        const variants = el('div','','lab-card-grid lab-compare-grid');
        if (['practice','structure'].includes(e.category)) {
          for (const [quality,tier] of ['bronze','silver','gold','diamond'].entries()) {
            const slot = e.category === 'practice' ? practiceSlot(e.id,0,tier) : {qualityBonus:quality};
            const face = getGamepieceFace(state,e.category,e.id,tier,{slot});
            if (e.category === 'practice') face.stockCapacity = stockCapacity(state,{structureSlots:[]},slot);
            variants.append(cards.card(face,e.category === 'practice' ? title(tier) : `Quality +${quality * 25}%`,null,{readable:true}));
          }
          panel.append(variants,disclosure('Runtime properties',[table(['Property','Runtime value'],[
            ['Maturity',e.maturity],['Card Tags',e.tags.join(', ')],['Stock Traits',e.traits.join(', ')],
            ['Timing',JSON.stringify(e.def.activation ?? 'passive')],['Generate / effects',JSON.stringify(e.def.effects)],
            ['Mode',e.def.mode??'Passive Structure'],['Charge trigger / gain / threshold',e.def.charge?`${e.def.charge.triggerText} +${e.def.charge.gain}; threshold ${e.def.charge.threshold}`:'—'],
            ['Discharge',e.def.charge?.dischargeText??'—'],['Provisional deviations',(e.def.provisionalNotes??[]).join(' ')||'None'],
            ['Consume',JSON.stringify(e.def.consume ?? [])],['Require',JSON.stringify(e.def.require ?? [])],
            ['Capacity / cells',e.def.stockCapacity ?? e.def.footprint],['Gates',`Specialists: ${e.def.specialistGate ?? 0}; ${e.def.condition ?? 'none'}`],
            ['Passive modifiers',JSON.stringify(e.def.modifiers ?? [])],['Stacking',e.category === 'structure' ? 'Duplicate placements; numeric bonuses add through runtime queries' : 'One instance per Practice'],
          ])],{key:'zoo:properties',open:true}));
        }
        panel.append(details('Complete runtime definition',e.def)); parent.append(panel);
        // The panel renders above the grid; bring it into view after the
        // shell restores the previous scroll position.
        if (scrollToSelected) { scrollToSelected = false; requestAnimationFrame(()=>panel.scrollIntoView({block:'start'})); }
      }
    }
    const grid = el('div','','lab-card-grid lab-catalogue-grid');
    let lastGroup = null;
    for (const e of matches.slice(page*pageSize,(page+1)*pageSize)) {
      if (grouped && e.pool !== lastGroup) {
        lastGroup = e.pool;
        const header = el('h3','','lab-grid-group'); header.append(el('span',title(e.pool) ?? 'Other'),badge(String(matches.filter(m=>m.pool===e.pool).length)));
        grid.append(header);
      }
      const inspect = ()=>run(()=>{selected=`${e.category}:${e.id}`;scrollToSelected=true;});
      if (['practice','structure'].includes(e.category)) {
        const slot = e.category === 'practice' ? practiceSlot(e.id,0,e.maturity) : {};
        const face = getGamepieceFace(state,e.category,e.id,e.maturity,{slot});
        if (e.category === 'practice') face.stockCapacity = stockCapacity(state,{structureSlots:[]},slot);
        const isEdited=edited.has(`${e.category}:${e.id}`);
        const isFlagged=!!review?.get(e.category,e.id);
        const actions=review?[isFlagged?button('Open review',()=>openReview(face),'','primary'):button('Flag for review',()=>flag(face))]:[];
        const meta=[badge(title(e.pool)),badge(title(e.maturity)),e.locked&&badge('Locked','warn'),isEdited&&badge('Edited','accent'),isFlagged&&badge('Flagged','accent')].filter(Boolean);
        const card=cards.card(face,e.label,inspect,{readable:true,actions,meta});
        if(e.locked)card.dataset.locked='true';
        if(isEdited)card.dataset.edited='true';
        if(isFlagged)card.dataset.flagged='true';
        grid.append(card);
      }
      else {
        const item = section(e.label,el('p',e.def.description ?? e.def.rule ?? e.pool ?? 'Runtime template','lab-clamp'));
        if (e.category === 'neutral') item.append(el('p',`Installed: ${e.def.installedPractices.join(', ')}${e.def.omittedPractices.length?` · omitted: ${e.def.omittedPractices.join(', ')}`:''}`,'lab-note'));
        item.classList.add('lab-specimen'); item.append(details('Runtime data',e.def)); grid.append(item);
      }
    }
    if (!matches.length) grid.append(el('p','Nothing matches. Clear the filters or try another search.','lab-empty'));
    parent.append(grid);
    if (matches.length > pageSize) parent.append(pager());
  }
  return {render};
}
