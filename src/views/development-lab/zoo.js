import { getLabCatalogue, filterLabCatalogue } from '../../model/dev-lab/catalogue.js';
import { getGamepieceFace } from '../../model/gamepiece-presentation.js';
import { stockCapacity } from '../../model/detailed-settlements/stock.js';
import { practiceSlot } from '../../model/dev-lab/fixtures.js';
import { el, select, field, input, section, details, button, table, disclosure, info, badge, segmented, group, isNarrow } from './elements.js';

const CATEGORIES = [['practice','Practices'],['structure','Structures'],['candidate','Candidates'],['life-map','Life Map'],['neutral','Neutrals'],['monster','Monsters'],['','All']];
const POOLS = ['common','scholar','warrior'];
const title = value => value ? value[0].toUpperCase() + value.slice(1) : value;

export function createZooView({controller,cards,run,review}) {
  const filters = {category:'practice'}, pageSize = 12;
  let page = 0, selected = null, versionsMode='live', hideLocked=false, scrollToSelected = false;
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
    const changed = () => { page=0; selected=null; run(()=>{}); };

    const head = el('div','','lab-page-head');
    const heading = el('div'); heading.append(el('h2','Zoo'),el('p','Every runtime card and template in this build.','lab-subtitle'));
    head.append(heading);
    if (review) {
      const flagged = review.list().length;
      const link = el('a','','lab-review-link'); link.href = '#/dev/reviewer';
      link.append(el('span','Review flagged'),badge(String(flagged),flagged?'accent':''));
      link.setAttribute('aria-label',`Review flagged (${flagged})`);
      head.append(link);
    }
    parent.append(head, info('zoo',[
      'Tap or hover a card for its quick read. Rules opens the full rules, symbol key and linked definitions; Compare shows all four qualities and the runtime properties.',
      'Flag adds a card to the reviewer without leaving the Zoo. Card versions can show reviewer drafts instead of live values; the fixture itself never changes.',
      `Definitions come from this fixture’s serialized game config: ${Object.keys(state.gameConfig.gamepieces.practices).length} Practices and ${Object.keys(state.gameConfig.gamepieces.structures).length} Structures.`,
    ],{label:'How the Zoo works'}));

    // Categories are the main way in, so they are always-visible tabs with counts.
    const counts = Object.fromEntries(CATEGORIES.map(([id])=>[id,id?catalogue.filter(e=>e.category===id).length:catalogue.length]));
    parent.append(segmented('Category',CATEGORIES.map(([id,label])=>[id,label,counts[id]]),filters.category ?? '',value=>{filters.category=value;changed();},{testid:'zoo-category'}));

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

    const searchRow = el('div','','lab-search-row');
    const search = input('Search runtime content',filters.search ?? '','search'); search.placeholder = 'Search names, rules, ids…'; search.enterKeyHint = 'search';
    let searchTimer;
    search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filters.search=search.value;changed();},250);});
    searchRow.append(search);

    const active = [hideLocked, versionsMode !== 'live', ...Object.keys(options).map(key=>!!filters[key])].filter(Boolean).length;
    const viewGroup = [];
    if (review) viewGroup.push(segmented('Card versions',[['live','Live'],['edited','With edits'],['edited-only','Edited only']],versionsMode,value=>{versionsMode=value;changed();}));
    const hide=input('Hide locked cards','','checkbox');hide.checked=hideLocked;
    hide.addEventListener('change',()=>{hideLocked=hide.checked;changed();});
    viewGroup.push(field('Hide locked',hide));
    const cardGroup = [];
    if (options.pool.length) cardGroup.push(segmented('Class',[['','All'],...options.pool.map(pool=>[pool,title(pool)])],filters.pool ?? '',value=>{filters.pool=value;changed();}));
    const selects = el('div','','lab-controls lab-filter-selects');
    for (const key of ['maturity','mode','tag','trait','size']) {
      if (!options[key].length) continue;
      const control = select(labels[key],[['','Any'],...options[key].map(v=>[v,title(v)])],filters[key] ?? '');
      control.addEventListener('change',()=>{filters[key]=control.value;changed();}); selects.append(field(labels[key],control));
    }
    if (selects.children.length) cardGroup.push(selects);
    const filterPanel = disclosure('Filters',[group('Show',...viewGroup),...(cardGroup.length?[group('Card details',...cardGroup)]:[])],
      {key:'zoo:filters',open:active>0||!isNarrow(),className:'lab-filter-more',badges:[active?badge(`${active} active`,'accent'):null]});
    const toolbar = el('div','','lab-toolbar');
    toolbar.append(filterPanel);
    const anyFilter = active > 0 || !!filters.search || filters.category !== 'practice';
    if (anyFilter) toolbar.append(button('Clear filters',()=>{for(const key of Object.keys(filters))delete filters[key];filters.category='practice';hideLocked=false;versionsMode='live';changed();},'zoo-clear-filters','quiet'));
    parent.append(searchRow,toolbar);
    if(versionsMode!=='live')parent.append(el('p',`${edited.size} edited cards shown; other cards use live values.${issues.length?` Some drafts could not be shown: ${issues.join('; ')}.`:''}`,'lab-note'));

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
    const results = el('div','','lab-results-bar');
    results.append(el('p',`${matches.length} matching runtime entries`,'lab-count'));
    const coveragePanel = disclosure(missing.length?`Coverage: missing ${missing.join(', ')}`:'Coverage',[table(['Class','Practices','Structures','Status'],coverage)],
      {open:missing.length>0,className:`lab-coverage${missing.length?' lab-coverage-missing':''}`,badges:[badge(missing.length?'!':'✓',missing.length?'warn':'ok')]});
    results.append(coveragePanel);
    if (matches.length > pageSize) results.append(pager());
    parent.append(results);

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
