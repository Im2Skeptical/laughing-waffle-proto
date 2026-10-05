import { getGamepieceFace } from '../../model/gamepiece-presentation.js';
import { stockCapacity } from '../../model/detailed-settlements/stock.js';
import { reviewFields, reviewKey, readReviewValue, REVIEW_STOCK_TRAITS, REVIEW_PHASES, REVIEW_SEASONS, reviewScheduleTriggers } from '../../model/dev-lab/card-review.js';
import { el, button, field, input, select, section } from './elements.js';

const groups = {
  stock:{label:'Stock capacity & traits', match:path => ['stockCapacity','stockTraits'].includes(path[0])},
  schedule:{label:'Schedule triggers', match:path=>path[0]==='activation'},
  workers:{label:'Workers', match:path => String(path[0]).startsWith('worker')},
  yields:{label:'Production', match:path => path[0]==='effects' || path[0]==='outputs'},
  inputs:{label:'Consume & require', match:path => ['consume','require'].includes(path[0])},
  charge:{label:'Charge', match:path => path[0]==='charge' && typeof path.at(-1)==='string' && ['gain','threshold'].includes(path.at(-1))},
  capacity:{label:'Structure bonuses', match:path => ['housing','modifiers','candidateBonus','capacityPerCountSquared'].includes(path[0])},
};
const labelFor = (def, path) => {
  const names={stockCapacity:'Stock capacity',workerCapacity:'Worker sockets',workerBonus:'Bonus per worker',workerCapacityPerQuality:'Extra sockets per quality',vassalPrestigeCost:'Prestige cost',vassalPhaseCost:'Phase cost',footprint:'Footprint',housing:'Housing',candidateBonus:'Candidate bonus',specialistGate:'Specialists required',label:'Name',rule:'Rules copy',threshold:'Discharge threshold',gain:'Charge per event',triggerText:'Charge trigger copy',dischargeText:'Discharge copy',minimumQuality:'Minimum quality'};
  const effects={generateStock:'Stock produced',research:'Research gained',train:'Specialists trained',addHousingForPhase:'Housing gained',addFaithChaosResistance:'Chaos resistance',reduceLocalFoodRequirement:'Edible saved',bankCandidateDevelopment:'Candidate development',bankShopQuality:'Shop quality bonus',bankSupport:'Support banked',bankPreview:'Preview bonus'};
  if(path[0]==='effects')return `${effects[def.effects?.[path[1]]?.op]??def.effects?.[path[1]]?.op??`Effect ${Number(path[1])+1}`}${path[2]==='amount'?'':path[2]==='seasonAmounts'?` · ${path[3]?path[3][0].toUpperCase()+path[3].slice(1):'seasonal amounts'}`:` · ${path.slice(2).join(' · ')}`}`;
  if(path[0]==='tags')return `Card tag ${Number(path[1])+1}`;
  if(path[0]==='stockTraits')return path.length===1?'Stock tags':`Stock trait ${Number(path[1])+1}`;
  if(path[0]==='activation')return 'Schedule triggers';
  if(['consume','require'].includes(path[0]))return `${path[0]} ${(def[path[0]]?.[path[1]]?.traits??[]).join(' / ')} · ${path.slice(2).join(' · ')}`;
  return names[path.at(-1)]??path.join(' · ');
};

export function createCardReviewerView({review, cards, getState, run}) {
  let selected=null, comparison=false;
  const previewTiers={};
  const resolve = (state, entry) => state.gameConfig.gamepieces[entry.kind==='practice'?'practices':'structures'][entry.id];
  function render(parent) {
    const state=getState(), entries=review.list();
    const requested=new URLSearchParams(location.hash.split('?')[1]??'').get('card');
    if(requested&&entries.some(entry=>reviewKey(entry.kind,entry.id)===requested))selected=requested;
    if(!entries.some(entry=>reviewKey(entry.kind,entry.id)===selected))selected=entries[0]?reviewKey(entries[0].kind,entries[0].id):null;
    const header=section('Card reviewer');
    header.append(el('p','Tap a highlighted value area on your card to edit it. Changes and notes save automatically on this device.'));
    const exportAll=button(`Export all reviews (${entries.length})`,()=>{
      try {
        const url=URL.createObjectURL(new Blob([review.export()],{type:'application/json'}));
        const link=el('a');link.href=url;link.download='card-reviews.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      } catch(error) {run(()=>{throw error;});}
    },'review-export');exportAll.disabled=!entries.length;
    header.append(exportAll);
    if(!entries.length){header.append(el('p','Flag a Practice or Structure using Review card in the Zoo, or Dev at the top right of its inspection.'));parent.append(header);return;}
    const queue=el('div','','review-queue');queue.setAttribute('aria-label','Flagged cards');
    for(const entry of entries) {
      const key=reviewKey(entry.kind,entry.id), live=resolve(state,entry);
      const pick=button(`${live?.label??entry.baseline.label}${entry.edits.length?' · edited':''}${entry.notes?' · notes':''}`,()=>{selected=key;location.hash=`/dev/reviewer?card=${encodeURIComponent(key)}`;});
      pick.dataset.reviewKey=key;
      pick.setAttribute('aria-pressed',String(selected===key));queue.append(pick);
    }
    header.append(queue);parent.append(header);
    const entry=entries.find(entry=>reviewKey(entry.kind,entry.id)===selected),live=resolve(state,entry);
    const projected=review.preview(entry,live);
    let definition=projected.definition;
    const panel=section(live?.label??entry.baseline.label);panel.classList.add('review-workspace');
    if(!live)panel.append(el('p','This card is absent from the current build. Its original definition, changes and notes are retained in your export.','lab-warning'));
    if(projected.conflicts.length)panel.append(el('p',`Some saved fields changed shape in this build: ${projected.conflicts.join(', ')}. These edits remain in your export.`,'lab-warning'));
    const drift=entry.edits.filter(edit=>JSON.stringify(readReviewValue(entry.baseline,edit.path))!==JSON.stringify(readReviewValue(live,edit.path)));
    if(live&&drift.length)panel.append(el('p','The live build has changed some edited values since this card was flagged. Compare and check the changes below.','lab-warning'));
    const controls=el('div','','lab-controls');
    const compare=button(comparison?'Hide live comparison':'Compare with live',()=>{comparison=!comparison;run(()=>{});},'review-compare');compare.disabled=!live;
    const quality=select('Preview quality',['bronze','silver','gold','diamond'],previewTiers[selected]??entry.tier);
    const remove=button('Delete review',()=>{
      if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='Delete review and notes?';return;}
      review.remove(entry.kind,entry.id);selected=null;location.hash='/dev/reviewer';run(()=>{});
    });
    controls.append(compare,field('Preview quality',quality),button('Reset edits',()=>{review.reset(entry.kind,entry.id);run(()=>{});}),remove);panel.append(controls);
    const preview=el('div','','review-preview'), draftColumn=el('div','','review-column'), liveColumn=el('div','','review-column');
    const draftTitle=el('h3',`Your draft · ${definition.label}`),draftReading=el('div','','review-reading'),liveReading=el('div','','review-reading');
    draftColumn.append(draftTitle);preview.append(draftColumn);panel.append(preview);
    const surface=el('div','','review-face'), targets=el('div','','review-targets');
    const editor=el('dialog','','review-inline-editor');editor.hidden=true;
    const editorTitle=el('strong'),editorFields=el('div','','review-editor-body');editor.append(editorTitle,editorFields,button('Done',()=>editor.close()));
    let activeGroup=null, editorOpener=null, tier=quality.value, draftImage, liveImage;
    editor.addEventListener('close',()=>{
      editor.hidden=true;
      (editorOpener?.isConnected?editorOpener:surface.querySelector(`[data-section="${activeGroup}"]`))?.focus({preventScroll:true});
    });
    editor.addEventListener('click',event=>{
      const bounds=editor.getBoundingClientRect();
      if(event.target===editor&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))editor.close();
    });
    const makeFace=def=>{
      const registry=entry.kind==='practice'?'practices':'structures';
      const previewState={...state,gameConfig:{...state.gameConfig,gamepieces:{...state.gameConfig.gamepieces,[registry]:{...state.gameConfig.gamepieces[registry],[entry.id]:def}}}};
      const tiers=['bronze','silver','gold','diamond'];
      if(entry.kind==='structure') {
        tier=tiers[Math.max(tiers.indexOf(tier),tiers.indexOf(definition.minimumQuality??'bronze'),tiers.indexOf(live?.minimumQuality??'bronze'))];
        quality.value=tier;previewTiers[selected]=tier;
      }
      const qualityBonus=entry.kind==='structure'?Math.max(0,tiers.indexOf(tier)-tiers.indexOf(def.minimumQuality??'bronze')):0;
      const slot={practiceId:entry.id,tier,qualityBonus,stock:0,charge:0,work:0};
      const face=getGamepieceFace(previewState,entry.kind,entry.id,tier,{slot});
      if(def.mode==='scheduled')face.reviewSchedule=reviewScheduleTriggers(def);
      if(entry.kind==='practice')face.stockCapacity=stockCapacity(previewState,{structureSlots:[]},slot);
      return face;
    };
    const changes=el('div','','review-changes'), saveStatus=el('p','Saved on this device','review-save-status');saveStatus.setAttribute('role','status');
    function changedRows() {
      const current=review.get(entry.kind,entry.id);changes.replaceChildren();
      const pick=[...queue.children].find(node=>node.dataset.reviewKey===reviewKey(entry.kind,entry.id));
      if(pick)pick.textContent=`${live?.label??entry.baseline.label}${current.edits.length?' · edited':''}${current.notes?' · notes':''}`;
      for(const edit of current.edits)changes.append(el('p',`${labelFor(definition,edit.path)}: live ${JSON.stringify(readReviewValue(live,edit.path))??'unavailable'} → draft ${JSON.stringify(edit.value)}`));
      if(!current.edits.length)changes.append(el('p','No value changes yet.'));
    }
    function refresh() {
      definition=review.preview(review.get(entry.kind,entry.id),live).definition;
      const face=makeFace(definition);draftImage?.update(face);draftTitle.textContent=`Your draft · ${face.label}`;readingCopy(draftReading,face);
      if(liveImage){const liveFace=makeFace(live);liveImage.update(liveFace);readingCopy(liveReading,liveFace);}changedRows();
    }
    function readingCopy(node,face) {
      node.replaceChildren();
      for(const effect of face.reading.effects)node.append(el('p',[effect.timing,effect.text].filter(Boolean).join(' · ')));
      for(const requirement of face.reading.requirements)node.append(el('p',requirement));
      if(face.reading.trigger)node.append(el('p',face.reading.trigger));
    }
    function controlsFor(fields, destination) {
      destination.replaceChildren();
      for(const item of fields) {
        const label=labelFor(definition,item.path), value=readReviewValue(definition,item.path);
        const choices=item.path[0]==='minimumQuality'?['bronze','silver','gold','diamond']:item.path.some(part=>['stockTraits','traits','traitsAny'].includes(part))?REVIEW_STOCK_TRAITS:item.path.includes('seasonKeys')?REVIEW_SEASONS:null;
        const control=typeof value==='boolean'?select(label,[['true','Yes'],['false','No']],String(value)):choices?select(label,choices,value):input(label,value,typeof value==='number'?'number':'text');
        if(typeof value==='number'){control.removeAttribute('min');control.step='any';control.inputMode='decimal';}
        control.dataset.reviewPath=JSON.stringify(item.path);
        const feedback=el('span','','review-field-error'), wrapper=field(label,control);feedback.setAttribute('role','status');wrapper.append(feedback);
        control.addEventListener(typeof value==='boolean'||choices?'change':'input',()=>{
          try {
            if(typeof value==='number'&&!control.value.trim())throw new Error('Enter a number.');
            review.edit(entry.kind,entry.id,item.path,typeof value==='number'?control.valueAsNumber:typeof value==='boolean'?control.value==='true':control.value);
            refresh();feedback.textContent='';control.removeAttribute('aria-invalid');saveStatus.textContent='Saved on this device';
            for(const sibling of panel.querySelectorAll('[data-review-path]'))if(sibling!==control&&sibling.dataset.reviewPath===control.dataset.reviewPath)sibling.value=control.value;
          } catch(error){feedback.textContent=error.message;control.setAttribute('aria-invalid','true');saveStatus.textContent='This value has not been saved.';}
        });destination.append(wrapper);
      }
    }
    const title=value=>value[0].toUpperCase()+value.slice(1);
    function iconTray(id,destination) {
      const current=id==='stock'?definition.stockTraits:reviewScheduleTriggers(definition);
      const wrap=el('div','','review-picker');
      wrap.append(el('p',id==='stock'?`${current.length} Stock tags · tap to add or remove`:'Tap to add or remove triggers. Keep at least one.','review-picker-summary'));
      const sets=id==='stock'?[['All Stock tags',REVIEW_STOCK_TRAITS]]:[['Moon phases',REVIEW_PHASES],['Seasons',REVIEW_SEASONS],['Other triggers',['passive','crisis']]];
      const feedback=el('p','','review-field-error');feedback.setAttribute('role','status');
      for(const [heading,choices] of sets) {
        wrap.append(el('strong',heading));const tray=el('div','','review-icon-tray');
        for(const choice of choices) {
          const label=id==='stock'?choice:REVIEW_PHASES.includes(choice)?`${title(choice)} phase`:choice==='passive'?'While active':choice==='crisis'?'During a Crisis':title(choice);
          const pick=button('',()=>{
            try {
              const values=id==='stock'?definition.stockTraits:reviewScheduleTriggers(definition);
              const next=values.includes(choice)?values.filter(value=>value!==choice):[...values,choice];
              if(id==='stock')review.edit(entry.kind,entry.id,['stockTraits'],next);else review.schedule(entry.kind,entry.id,next);
              refresh();saveStatus.textContent='Saved on this device';renderValues();
              const scroll=editorFields.scrollTop;fillEditor(id==='stock'?'stock':'schedule');editorFields.scrollTop=scroll;
              editorFields.querySelector(`[data-pick="${choice}"]`)?.focus({preventScroll:true});
            }catch(error){feedback.textContent=error.message;}
          });
          pick.dataset.pick=choice;pick.setAttribute('aria-label',`${id==='stock'?'Stock tag':'Schedule'}: ${label}`);pick.setAttribute('aria-pressed',String(current.includes(choice)));
          pick.append(cards.icon(id==='stock'?{trait:choice}:REVIEW_SEASONS.includes(choice)?{season:choice}:{event:choice==='passive'?'activation':choice==='crisis'?'danger':choice}),el('span',label));tray.append(pick);
        }
        wrap.append(tray);
      }
      wrap.append(feedback);destination.append(wrap);
    }
    function fillEditor(id) {
      editorFields.replaceChildren();
      const values=el('div','','review-fields');
      controlsFor(reviewFields(definition).filter(item=>groups[id].match(item.path)&&!['stockTraits','activation'].includes(item.path[0])),values);
      if(values.children.length)editorFields.append(values);
      if(id==='stock')iconTray('stock',editorFields);
      if(id==='schedule')iconTray('schedule',editorFields);
      if(id==='yields'&&definition.mode==='scheduled')editorFields.append(button('Choose schedule triggers',()=>editGroup('schedule')));
    }
    function editGroup(id) {
      if(!editor.open)editorOpener=document.activeElement;
      activeGroup=id;fillEditor(id);
      editorTitle.textContent=groups[id].label;
      editor.hidden=false;editor.setAttribute('aria-label',`Edit ${groups[id].label}`);
      editorFields.scrollTop=0;
      const focus=id==='stock'||id==='schedule'?(editor.querySelector('[data-pick][aria-pressed=true]')??editor.querySelector('[data-pick]')):editor.querySelector('input,select');
      if(!editor.open){focus?.setAttribute('autofocus','');editor.showModal();}
      focus?.focus({preventScroll:true});
    }
    function sections(regions) {
      targets.replaceChildren();
      for(const [id,rect] of Object.entries(regions)) {
        if(!groups[id]||(id!=='schedule'&&!reviewFields(definition).some(item=>groups[id].match(item.path))))continue;
        const tap=button('',()=>editGroup(id));tap.dataset.section=id;tap.setAttribute('aria-label',`Edit ${groups[id].label}`);tap.title=groups[id].label;
        Object.assign(tap.style,{left:`${rect.x}%`,top:`${rect.y}%`,width:`${rect.width}%`,height:`${rect.height}%`});targets.append(tap);
      }
    }
    draftImage=cards.image(makeFace(definition),sections);surface.append(draftImage.node,targets,editor);draftColumn.append(surface,draftReading);readingCopy(draftReading,makeFace(definition));
    if(comparison&&live){liveColumn.append(el('h3',`Live · ${live.label}`));liveImage=cards.image(makeFace(live));const liveSurface=el('div','','review-face');liveSurface.append(liveImage.node);liveColumn.append(liveSurface,liveReading);readingCopy(liveReading,makeFace(live));preview.append(liveColumn);}
    quality.addEventListener('change',()=>{tier=quality.value;previewTiers[selected]=tier;refresh();});
    const notes=el('textarea');notes.value=entry.notes;notes.rows=3;notes.placeholder='What should change, and why?';notes.setAttribute('aria-label','Review notes');
    notes.addEventListener('input',()=>{try{review.notes(entry.kind,entry.id,notes.value);saveStatus.textContent='Saved on this device';changedRows();}catch(error){saveStatus.textContent=`Notes not saved: ${error.message}`;}});
    panel.append(saveStatus,el('h3','Notes'),notes);
    const shortcuts=el('div','','lab-controls');
    if(Array.isArray(definition.stockTraits))shortcuts.append(button('Choose Stock tags',()=>editGroup('stock')));
    if(definition.mode==='scheduled')shortcuts.append(button('Choose schedule triggers',()=>editGroup('schedule')));
    const form=el('div','','review-fields'),more=el('details'),moreFields=el('div','','review-fields');more.append(el('summary','More definition values'),moreFields);
    function renderValues() {
      const fields=reviewFields(definition).filter(item=>!['stockTraits','activation'].includes(item.path[0]));
      const primary=fields.filter(item=>typeof item.value==='number'||['label','tags','ui','minimumQuality'].includes(item.path[0])||['triggerText','dischargeText'].includes(item.path.at(-1)));
      controlsFor(primary,form);const extra=fields.filter(item=>!primary.includes(item));controlsFor(extra,moreFields);more.hidden=!extra.length;
    }
    renderValues();panel.append(el('h3','Card values'),shortcuts,form,more);
    panel.append(el('h3','Changes against live'),changes);changedRows();parent.append(panel);
  }
  return {render};
}
