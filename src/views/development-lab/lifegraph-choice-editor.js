import { LIFEGRAPH_COST_CHOICES, LIFEGRAPH_SHOP_TYPES, LIFEGRAPH_CARD_QUALITIES, getLifeMapOptionSpecs } from '../../model/life-map-balance.js';
import { el, input, select, field, badge } from './elements.js';

const title=value=>value[0].toUpperCase()+value.slice(1);
const format=value=>Number(value.toFixed(2)).toString();
const display=(kind,value)=>kind==='risk'?`${format(value*100)}%`:kind==='time'?`${format(value)} years`:`${format(value)} Prestige`;

export function renderLifegraphChoices(parent,{controller,designId,servicesOnly=false}){
  const review=controller.getChoiceReview(designId),design=controller.getSnapshot().draft.generatorConfig.design;
  const section=el('section','','lab-lifegraph-choice-section');section.append(el('h3',servicesOnly?'Shared shop actions':'Choices & base costs'));
  section.append(el('p','These are the actual base costs. Choose a shared band or enter a custom value for this choice. Stat and Heirloom discounts apply afterwards.','lab-note'));
  if(review.error)section.append(el('p',review.error,'lab-note'));
  const grid=el('div','','lab-lifegraph-choice-grid');
  for(const option of review.choices){
    if(servicesOnly&&!option.shared)continue;
    const card=el('article','','lab-lifegraph-choice-card');card.dataset.optionId=option.id;
    card.append(el('h4',option.label));
    if(option.shared)card.append(badge('Shared across every shop','ok'));
    if(option.sampleLabel&&option.sampleLabel!==option.label)card.append(el('p',option.sampleLabel,'lab-note'));
    for(const effect of option.effects)card.append(el('p',effect,'lab-lifegraph-choice-effect'));
    if(!option.available&&!option.shared&&option.id!=='remove')card.append(el('p','Not offered in this preview context; its base costs can still be authored.','lab-note'));
    const controls=el('div','','lab-lifegraph-choice-costs');
    for(const kind of option.costKinds){
      const assignment=option.rule[kind],label=`${option.label} · ${title(kind)}`;
      const entries=LIFEGRAPH_COST_CHOICES.map(tier=>[tier,tier==='free'?'Free · 0':`${title(tier)} · ${display(kind,design.costBands[kind][tier])}`]);
      if(getLifeMapOptionSpecs(designId).find(o=>o.id===option.id).defaults[kind]==='calculated')entries.push(['calculated','Encounter risk · Force / Defence']);
      entries.push(['custom','Custom base value']);
      const band=select(`${label} band`,entries,typeof assignment==='number'?'custom':assignment);
      band.addEventListener('change',()=>controller.setOptionCost(designId,option.id,kind,band.value==='custom'?option.base[kind]:band.value));
      const row=el('div','','lab-lifegraph-choice-cost');row.append(field(`${title(kind)} preset`,band));
      const value=input(`${label} base value`,kind==='risk'?option.base[kind]*100:option.base[kind]);value.min='0';value.max=kind==='risk'?'100':kind==='time'?'1000':'100000';value.step=kind==='prestige'?'1':'.1';
      value.addEventListener('change',()=>controller.setOptionCost(designId,option.id,kind,Number(value.value)/(kind==='risk'?100:1)));
      row.append(field(kind==='risk'?'Base risk (%)':kind==='time'?'Base years':'Base Prestige',value));controls.append(row);
    }
    card.append(controls);
    if(option.preview)card.append(el('p',`This preview after discounts: ${display('time',option.preview.years)} · ${display('prestige',option.preview.prestige)} · ${display('risk',option.preview.risk)} risk`,'lab-lifegraph-choice-preview'));
    grid.append(card);
  }
  section.append(grid);parent.append(section);
}

export function renderLifegraphShopPricing(parent,{controller,types=LIFEGRAPH_SHOP_TYPES}){
  const pricing=controller.getSnapshot().draft.generatorConfig.design.shopPricing;
  const section=el('section','','lab-lifegraph-shop-pricing');section.append(el('h3','Shared card prices'));
  section.append(el('p','One price per card type and Bronze/Silver/Gold/Diamond quality, across every shop. Upgrades use the quality being bought; Structure bonuses are included. These are base prices before normal discounts.','lab-note'));
  if(!pricing.enabled)section.append(badge('Shared prices disabled; editing a value enables them','warn'));
  const table=el('table'),thead=el('thead'),head=el('tr');for(const label of ['Card type','Quality','Time · years','Prestige','Currency Stock'])head.append(el('th',label));thead.append(head);table.append(thead);
  const tbody=el('tbody');
  for(const kind of types)for(const quality of LIFEGRAPH_CARD_QUALITIES){const row=el('tr');row.append(el('th',title(kind)),el('td',title(quality)));
    for(const cost of ['time','prestige','currency']){const cell=el('td'),value=input(`${title(kind)} ${title(quality)} ${cost==='time'?'time in years':title(cost)} price`,pricing.prices[kind][quality][cost]);value.min='0';value.max=cost==='time'?'1000':'100000';value.step=cost==='time'?'.1':'1';value.addEventListener('change',()=>controller.setShopPrice(kind,quality,cost,Number(value.value)));cell.append(value);row.append(cell);}tbody.append(row);}
  table.append(tbody);const scroll=el('div','','lab-table');scroll.append(table);section.append(scroll);parent.append(section);
}
