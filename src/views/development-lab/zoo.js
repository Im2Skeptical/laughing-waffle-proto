import { getLabCatalogue, filterLabCatalogue } from '../../model/dev-lab/catalogue.js';
import { getGamepieceFace } from '../../model/gamepiece-presentation.js';
import { stockCapacity } from '../../model/detailed-settlements/stock.js';
import { practiceSlot } from '../../model/dev-lab/fixtures.js';
import { el, select, field, input, section, details, button, table } from './elements.js';

export function createZooView({controller,cards,run}) {
  const filters = {category:'practice'}, pageSize = 12;
  let page = 0, selected = null;
  function render(parent) {
    const {state} = controller.getSnapshot(), catalogue = getLabCatalogue(state);
    const controls = el('div','','lab-controls');
    const choices = (key,property) => [...new Set(catalogue.flatMap(e => e[property] ?? []))].sort().map(s => [s,s]);
    const options = {
      category:[['practice','Practices'],['structure','Structures'],['candidate','Candidates'],['life-map','Life Map nodes'],['neutral','Neutral templates'],['monster','Monsters']],
      pool:['common','scholar','warrior'], maturity:['bronze','silver','gold','diamond'],
      tag:choices('tag','tags'), trait:choices('trait','traits'), size:['1','2','3'],
    };
    const labels = {category:'Category',pool:'Class',maturity:'Maturity',tag:'Card Tag',trait:'Stock Trait',size:'Slot size'};
    for (const [key,values] of Object.entries(options)) {
      const control = select(labels[key],[['','All'],...values],filters[key] ?? '');
      control.addEventListener('change',()=>{filters[key]=control.value;page=0;selected=null;run(()=>{});}); controls.append(field(labels[key],control));
    }
    const search = input('Search runtime content',filters.search ?? '','search'); search.placeholder = 'Name, rule, id…';
    let searchTimer;
    search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filters.search=search.value;page=0;selected=null;run(()=>{});},250);});
    controls.append(field('Search',search)); parent.append(controls);
    const matches = filterLabCatalogue(catalogue,filters);
    page = Math.min(page,Math.max(0,Math.ceil(matches.length/pageSize)-1));
    parent.append(el('p',`${matches.length} matching runtime entries · ${Object.keys(state.gameConfig.gamepieces.practices).length} Practices · ${Object.keys(state.gameConfig.gamepieces.structures).length} Structures. Definitions come from this fixture’s serialized game config.`));
    if (selected) {
      const e = catalogue.find(e=>`${e.category}:${e.id}` === selected);
      if (e) {
        const panel = section(e.label);
        panel.append(button('Close comparison',()=>run(()=>{selected=null;})));
        const variants = el('div','','lab-card-grid');
        if (['practice','structure'].includes(e.category)) {
          for (const [quality,tier] of ['bronze','silver','gold','diamond'].entries()) {
            const slot = e.category === 'practice' ? practiceSlot(e.id,0,tier) : {qualityBonus:quality};
            const face = getGamepieceFace(state,e.category,e.id,tier,{slot});
            if (e.category === 'practice') face.stockCapacity = stockCapacity(state,{structureSlots:[]},slot);
            variants.append(cards.card(face,e.category === 'practice' ? tier : `Quality uplift +${quality * 25}%`));
          }
          panel.append(variants,table(['Property','Runtime value'],[
            ['Maturity',e.maturity],['Card Tags',e.tags.join(', ')],['Stock Traits',e.traits.join(', ')],
            ['Timing',JSON.stringify(e.def.activation ?? 'passive')],['Generate / effects',JSON.stringify(e.def.effects)],
            ['Consume',JSON.stringify(e.def.consume ?? [])],['Require',JSON.stringify(e.def.require ?? [])],
            ['Capacity / cells',e.def.stockCapacity ?? e.def.footprint],['Gates',`Specialists: ${e.def.specialistGate ?? 0}; ${e.def.condition ?? 'none'}`],
            ['Passive modifiers',JSON.stringify(e.def.modifiers ?? [])],['Stacking',e.category === 'structure' ? 'Duplicate placements; numeric bonuses add through runtime queries' : 'One instance per Practice'],
          ]));
        }
        panel.append(details('Complete runtime definition',e.def)); parent.append(panel);
      }
    }
    const grid = el('div','','lab-card-grid');
    for (const e of matches.slice(page*pageSize,(page+1)*pageSize)) {
      const inspect = ()=>run(()=>{selected=`${e.category}:${e.id}`;});
      if (['practice','structure'].includes(e.category)) {
        const slot = e.category === 'practice' ? practiceSlot(e.id,0,e.maturity) : {};
        const face = getGamepieceFace(state,e.category,e.id,e.maturity,{slot});
        if (e.category === 'practice') face.stockCapacity = stockCapacity(state,{structureSlots:[]},slot);
        grid.append(cards.card(face,`${e.label} · ${e.pool} · ${e.maturity}`,inspect));
      }
      else {
        const item = section(e.label,el('p',e.def.description ?? e.def.rule ?? e.pool ?? 'Runtime template'));
        if (e.category === 'neutral') item.append(el('p',`Installed (5 max): ${e.def.installedPractices.join(', ')}. Omitted by runtime: ${e.def.omittedPractices.join(', ') || 'none'}.`));
        item.append(details('Runtime data',e.def)); grid.append(item);
      }
    }
    parent.append(grid);
    const pager = el('div','','lab-controls'), prev=button('Previous',()=>run(()=>page--)), next=button('Next',()=>run(()=>page++));
    prev.disabled=page===0;next.disabled=(page+1)*pageSize>=matches.length;
    pager.append(prev,el('span',`Page ${page+1} / ${Math.max(1,Math.ceil(matches.length/pageSize))}`),next);parent.append(pager);
  }
  return {render};
}
