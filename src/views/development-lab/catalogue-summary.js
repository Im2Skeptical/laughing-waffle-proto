import { summarizeLabCatalogue, compareLabStock } from '../../model/dev-lab/catalogue-summary.js';
import { el, disclosure, button, field, select, info } from './elements.js';
import { createStockCardPreview } from './stock-card-preview.js';

const number = value => String(Number(value.toFixed(2)));
const quantity = value => `${value.min===value.max ? number(value.min) : `${number(value.min)}–${number(value.max)}`}${value.variable ? '+' : ''}`;
const hasSources = value => value.sources.length || value.flexible.sources.length;
const MODES = [['flow','Stock flow'],['required','Required'],['construction','Build costs']];
const TIMING_ORDER = ['Birth phase','Food phase','Housing phase','Faith phase','Migration phase','Death phase','Spring season','Summer season','Autumn season','Winter season','Per Discharge'];

function amountCell(value, showCardCount = false) {
  const cell = el('td','','lab-stock-number');
  cell.append(el('strong',value.sources.length ? quantity(value) : '—'));
  if (value.flexible.sources.length) cell.append(el('small',`${quantity(value.flexible)} either/or`));
  if (showCardCount) cell.append(el('small',`${value.cardCount} card${value.cardCount===1?'':'s'}`,'lab-stock-card-count'));
  return cell;
}

function sourceList(label, value, produced = false, trait = '', browse = null) {
  const section = el('section','','lab-stock-card-list');
  section.append(el('h4',label));
  if (!hasSources(value)) { section.append(el('p','No matching cards.','lab-note')); return section; }
  const list = el('ul');
  for (const [sources,flexible] of [[value.sources,false],[value.flexible.sources,true]]) for (const source of sources) {
    const item = el('li');
    const heading = el('div','','lab-stock-source-head');
    const name=browse?button(source.label,event=>browse.open(source.key,event.currentTarget),'stock-source-card'):el('strong',source.label);
    if(browse){name.classList.add('lab-stock-source-link');name.setAttribute('aria-controls','stock-card-preview');name.setAttribute('aria-expanded','false');browse.links.push({key:source.key,button:name});}
    heading.append(name,el('span',quantity(source)));
    item.append(heading);
    item.append(el('p',source.timings.map(time=>`${time.label}: ${number(time.amount)}${time.variable?'+':''}`).join(' · '),'lab-note'));
    if (produced && source.traits.length>1) item.append(el('p',`Same Stock also has: ${source.traits.filter(other=>other!==trait).join(', ')}.`,'lab-note'));
    if (flexible) item.append(el('p',`Accepts ${source.traits.join(' or ')}. This is one shared amount.`,'lab-note'));
    for (const note of source.notes) item.append(el('p',note,'lab-note'));
    list.append(item);
  }
  section.append(list); return section;
}

export function catalogueSummary(entries, versionLabel, preferences = {}, previewOptions = null) {
  const preview=previewOptions?createStockCardPreview(previewOptions):null;
  const data = summarizeLabCatalogue(entries);
  const allRows = compareLabStock(data);
  const producerTraits = new Set(allRows.filter(row=>hasSources(row.produced)).map(row=>row.trait));
  const availableModes = MODES.filter(([id])=>id==='flow' ? data.produced.length||data.consumed.length : data[id].length);
  let mode = availableModes.some(([id])=>id===preferences.mode) ? preferences.mode : availableModes[0]?.[0] ?? 'flow';
  let timing = preferences.timing ?? '';
  const timings = [...new Set(['produced','consumed','required'].flatMap(kind=>data[kind].map(row=>row.timing)))];
  const rank = label => { const index=TIMING_ORDER.indexOf(label); return index<0 ? TIMING_ORDER.length : index; };
  timings.sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b));
  if (!timings.includes(timing)) timing='';
  const body = el('div','','lab-stock-summary-body');
  body.addEventListener('keydown',event=>{if(event.key==='Escape'){preview?.close();}});
  body.append(el('p',`${data.cardCount} matching cards across all pages · ${versionLabel}`,'lab-stock-scope'));
  const controls = el('div','','lab-stock-controls');
  const modes = el('div','','lab-stock-modes'); modes.setAttribute('role','group'); modes.setAttribute('aria-label','Stock summary view');
  for (const [id,label] of availableModes) modes.append(button(label,()=>{mode=id;preferences.mode=id;draw();},`stock-view-${id}`));
  modes.hidden=availableModes.length<2;
  const when = select('Stock summary timing',[['','All timings'],...timings.map(time=>[time,time])],timing);
  when.dataset.testid='stock-summary-timing';
  when.addEventListener('change',()=>{timing=when.value;preferences.timing=timing;draw();});
  const whenField = field('When',when);
  controls.append(modes,whenField); body.append(controls);
  const caption = el('p','','lab-note'); body.append(caption);
  const content = el('div'); body.append(content);
  body.append(info('stock-summary-reading',[
    'Produced and Consumed also show how many distinct filtered cards can produce or consume that Stock trait at the selected timing. Each card counts once, regardless of quantity, repeated effects or seasonal activations. Consumer counts include either/or inputs. All timings includes every matching card in the filtered set.',
    'Each quantity counts one activation of each matching card. All timings shows a range when a card has different seasonal yields. Choose a timing to compare specific phases or seasons. These are recipe quantities, not income rates.',
    'A + means the base quantity can gain variable bonuses. Expand a Stock row for exact card timings and conditions. Workers, institutions, capacity limits and additional action costs are outside this comparison.',
    'Stock with several traits appears in each trait row. Do not add different trait rows together. An either/or input can use any one of its listed traits; it is separate from costs that demand this trait.',
    'Required Stock is kept. Build costs are the total to complete one copy of each filtered Structure.',
  ],{label:'How to read these quantities'}));
  function draw() {
    preview?.close(false);
    for (const node of modes.children) node.setAttribute('aria-pressed',String(node.dataset.testid===`stock-view-${mode}`));
    whenField.hidden=mode==='construction';
    controls.hidden=modes.hidden && whenField.hidden;
    caption.textContent=mode==='construction' ? 'Stock to finish one copy of each Structure.' : mode==='required' ? 'Stock checked but kept. Tap a trait for its cards.' : timing ? 'Base Stock per activation. + can gain bonuses.' : 'One activation per card. Ranges vary by timing; + can gain bonuses.';
    const rows = (timing ? compareLabStock(data,timing) : allRows).filter(row=>mode==='flow' ? hasSources(row.produced)||hasSources(row.consumed) : hasSources(row[mode]));
    const kinds = mode==='flow' ? ['produced','consumed'] : [mode];
    content.replaceChildren();
    const table = el('table','','lab-stock-table'); table.dataset.testid='stock-comparison';
    table.setAttribute('aria-label',mode==='flow'?'Stock produced and consumed':mode==='required'?'Required Stock kept':'Construction Stock costs');
    const thead = el('thead'), header = el('tr');
    for (const label of ['Stock trait',...(mode==='flow'?['Produced','Consumed']:mode==='required'?['Kept']:['Total cost'])]) {
      const cell=el('th',label);cell.scope='col';header.append(cell);
    }
    thead.append(header);table.append(thead);
    const tbody = el('tbody'); table.append(tbody);
    for (const [index,row] of rows.entries()) {
      const tr = el('tr');tr.dataset.trait=row.trait;
      const labelCell = el('th');labelCell.scope='row';
      const details = el('tr','','lab-stock-detail-row');details.hidden=preferences.trait!==row.trait;
      const detailsCell=el('td');detailsCell.colSpan=kinds.length+1;
      const detailBody=el('div','','lab-stock-detail');detailBody.id=`stock-detail-${index}`;
      const toggle=button('',()=>{
        preview?.close(false);
        const open=details.hidden;
        for (const node of tbody.querySelectorAll('.lab-stock-detail-row')) node.hidden=true;
        for (const node of tbody.querySelectorAll('.lab-stock-trait-button')) { node.setAttribute('aria-expanded','false');node.lastChild.textContent='›'; }
        details.hidden=!open;toggle.setAttribute('aria-expanded',String(open));preferences.trait=open?row.trait:null;
        toggle.lastChild.textContent=details.hidden?'›':'⌄';
      },'stock-trait');
      toggle.classList.add('lab-stock-trait-button');toggle.setAttribute('aria-controls',detailBody.id);toggle.setAttribute('aria-expanded',String(!details.hidden));
      const expand=el('span',details.hidden?'›':'⌄','lab-stock-expand');expand.setAttribute('aria-hidden','true');
      toggle.append(el('span',row.trait),expand);
      labelCell.append(toggle);
      if (mode==='flow' && !hasSources(row.produced) && hasSources(row.consumed)) labelCell.append(el('small',producerTraits.has(row.trait)?'Produced at other timings':'No producer in filter','lab-stock-gap'));
      tr.append(labelCell,...kinds.map(kind=>amountCell(row[kind],kind==='produced'||kind==='consumed')));tbody.append(tr);
      const labels={produced:'Produced by',consumed:'Consumed by',required:'Required by (kept)',construction:'Construction costs'};
      const sources=el('div','','lab-stock-source-lists'),links=[];
      const browse=preview?{links,open:(key,source)=>preview.open(links,key,source,detailBody,{construction:mode==='construction'})}:null;
      for (const kind of kinds) sources.append(sourceList(labels[kind],row[kind],kind==='produced',row.trait,browse));
      detailBody.append(sources);
      detailsCell.append(detailBody);details.append(detailsCell);tbody.append(details);
    }
    if (!rows.length) content.append(el('p','No Stock recipes match this view.','lab-empty'));
    else content.append(table);
  }
  draw();
  const panel=disclosure('Stock summary',[body],{key:'zoo:stock-summary',count:data.cardCount,className:'lab-stock-summary'});
  panel.addEventListener('toggle',()=>{if(!panel.open)preview?.close(false);});
  panel.dataset.testid='zoo-stock-summary';return panel;
}
