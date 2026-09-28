import { getLabCatalogue, filterLabCatalogue } from '../../model/dev-lab/catalogue.js';
import { getGamepieceFace } from '../../model/gamepiece-presentation.js';
import { practiceSlot } from '../../model/dev-lab/fixtures.js';
import { el, button, input, select, field } from './elements.js';

export function openLabPicker({state,category,cards,onChoose,installed=[]}) {
  const dialog=el('dialog','','lab-picker'), heading=el('h2',category==='practice'?'Choose a Practice':'Choose a Structure');
  const close=button('Close picker',()=>dialog.close());
  const filters={category}, catalogue=getLabCatalogue(state), pageSize=12;
  let page=0;
  const controls=el('div','','lab-controls'), results=el('div'), search=input('Search picker','','search');
  search.placeholder='Name, rule, ID…';
  controls.append(field('Search',search));
  search.addEventListener('input',()=>{filters.search=search.value;page=0;render();});
  for(const [key,label,values] of [
    ['pool','Class',['common','scholar','warrior']],
    ['tag','Card Tag',[...new Set(catalogue.filter(e=>e.category===category).flatMap(e=>e.tags))].sort()],
    ['trait','Stock Trait',[...new Set(catalogue.filter(e=>e.category===category).flatMap(e=>e.traits))].sort()],
    ...(category==='structure'?[['size','Cells',['1','2','3']]]:[])]) {
    const control=select(`Picker ${label}`,[['','All'],...values]);
    control.addEventListener('change',()=>{filters[key]=control.value;page=0;render();});controls.append(field(label,control));
  }
  const error=el('p','','lab-warning');error.setAttribute('role','alert');
  const choose=id=>{if(onChoose(id)!==false)dialog.close();else error.textContent='Could not add this piece. Check available construction cells and the Lab status message.';};
  dialog.append(heading,close,controls);
  if(category==='practice')dialog.append(button('Clear this slot',()=>choose('')));
  dialog.append(error,results);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.addEventListener('keydown',event=>{
    // The embedded game's keyboard handlers must not consume modal input.
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();dialog.close();}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  function render() {
    const entries=filterLabCatalogue(catalogue,filters), grid=el('div','','lab-card-grid lab-catalogue-grid');
    results.replaceChildren(el('p',`${entries.length} matches · choose a card to apply immediately`));
    for(const entry of entries.slice(page*pageSize,(page+1)*pageSize)) {
      const slot=category==='practice'?practiceSlot(entry.id,0,'bronze'):{};
      const face=getGamepieceFace(state,category,entry.id,'bronze',{slot});
      const card=cards.card(face,entry.label), pick=button(installed.includes(entry.id)?`${entry.label} · already installed`:`Choose ${entry.label}`,()=>choose(entry.id));
      pick.disabled=installed.includes(entry.id);card.prepend(pick);grid.append(card);
    }
    const pager=el('div','','lab-controls'), previous=button('Previous results',()=>{page--;render();}),next=button('Next results',()=>{page++;render();});
    previous.disabled=page===0;next.disabled=(page+1)*pageSize>=entries.length;
    pager.append(previous,el('span',`Page ${page+1} / ${Math.max(1,Math.ceil(entries.length/pageSize))}`),next);
    results.append(grid,pager);
  }
  render();dialog.showModal();search.focus();
}
