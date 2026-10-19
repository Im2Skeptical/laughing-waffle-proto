import { VASSAL_HEIRLOOM_QUALITIES } from '../../defs/gamepieces/vassal-heirloom-defs.js';
import { el, input, field, badge, button } from './elements.js';

const title=value=>value[0].toUpperCase()+value.slice(1);
const percent=value=>`${Number((value*100).toFixed(2))}%`;

export function renderLifegraphRelicPool(parent,{controller,designId}){
  if(!['relic','specialRelic'].includes(designId))return;
  const review=controller.getChoiceReview(designId),rows=review.relicPool??[];
  const special=designId==='specialRelic',name=special?'Special Relic':'Relic';
  const section=el('section','','lab-lifegraph-relic-pool');section.dataset.testid='lifegraph-relic-pool';
  section.append(el('h3',special?'Individual Relic appearances':'Relic quality appearances'),
    el('p',special?'Choose which Relics this pool can offer and their relative appearance weights. This pool is independent of ordinary Relic quality weights.':'Set the relative chances of Bronze, Silver, Gold and Diamond. Relics within a quality are equally likely. These quality rules also apply to ordinary Tour and Quest rewards.','lab-note'),
    el('p','Percentages describe the first offer. Owned Relics are excluded, and each visit draws up to three different Relics without replacement. Disabled content never fills a gap.','lab-note'));
  const tools=el('div','','lab-controls');
  for(const enabled of [true,false])tools.append(button(`${enabled?'Enable':'Disable'} all ${special?'Relics':'qualities'}`,()=>controller.setRelicPoolEnabled(designId,enabled),'','quiet'));
  section.append(tools);
  const eligible=rows.filter(row=>row.available);
  if(eligible.length<3)section.append(badge(eligible.length?`Only ${eligible.length} eligible Relics; this visit offers all of them.`:'No eligible Relics; this node offers a free exit.','warn'));
  const table=el('table'),head=el('tr');
  for(const label of special?['Relic','Quality','Enabled','Appearance weight','First-offer chance']:['Quality','Enabled','Appearance weight','First-offer chance','Eligible Relics'])head.append(el('th',label));
  const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');
  const pool=controller.getSnapshot().draft.generatorConfig.design.relicPools[designId];
  const targets=special?rows:VASSAL_HEIRLOOM_QUALITIES.map(quality=>({id:quality,label:title(quality),...pool.qualities[quality],chance:rows.filter(row=>row.quality===quality).reduce((sum,row)=>sum+row.chance,0),count:eligible.filter(row=>row.quality===quality).length}));
  for(const item of targets){
    const key=special?'entries':'qualities',path=['generatorConfig','design','relicPools',designId,key,item.id],row=el('tr');
    const label=el('td');label.append(el('strong',item.label));if(special)label.append(el('p',item.description,'lab-note'));row.append(label);
    if(special)row.append(el('td',title(item.quality)));
    const enabled=input(`${name} ${item.label} enabled`,'','checkbox');enabled.checked=item.enabled;
    enabled.addEventListener('change',()=>controller.update([...path,'enabled'],enabled.checked));
    const toggleCell=el('td');toggleCell.append(field('Enabled',enabled));row.append(toggleCell);
    const weight=input(`${name} ${item.label} appearance weight`,item.weight);weight.min='.01';weight.max='100000';weight.step='.1';
    weight.addEventListener('change',()=>controller.update([...path,'weight'],Number(weight.value)));
    const weightCell=el('td');weightCell.append(weight);row.append(weightCell,el('td',item.owned?'Owned · excluded':percent(item.chance)));
    if(!special)row.append(el('td',String(item.count)));body.append(row);
  }
  table.append(body);const scroll=el('div','','lab-table');scroll.append(table);section.append(scroll);
  if(special)section.append(el('p',`Quality mix for the first offer: ${VASSAL_HEIRLOOM_QUALITIES.map(quality=>`${title(quality)} ${percent(rows.filter(row=>row.quality===quality).reduce((sum,row)=>sum+row.chance,0))}`).join(' · ')}`,'lab-note'));
  section.append(el('p',review.offers?.length?`This seed offers: ${review.offers.map(offer=>`${offer.label} (${title(offer.quality)})`).join(' · ')}`:'This seed has no eligible offers.','lab-summary'));
  parent.append(section);
}
