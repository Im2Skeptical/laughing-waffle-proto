import { el, button, select, field } from './elements.js';

export function createReviewImport({review,run,onImported}) {
  let message='';
  function controls() {
    const status=el('p',message,'review-transfer-message lab-note');
    status.setAttribute('role','status');status.dataset.testid='review-import-status';status.hidden=!message;
    const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
    file.setAttribute('aria-label','Review export file');file.dataset.testid='review-import-file';
    const pick=button('Import reviews',()=>file.click(),'review-import','quiet');
    file.addEventListener('change',async()=>{
      const chosen=file.files?.[0];if(!chosen)return;
      pick.disabled=true;status.hidden=false;status.textContent='Reading review file…';
      try {
        const raw=await chosen.text(),plan=review.previewImport(raw);
        if(!plan.total)throw new Error('This export has no reviews to import.');
        const dialog=el('dialog','','review-bulk-sheet review-import-dialog');dialog.dataset.testid='review-import-dialog';
        dialog.setAttribute('aria-label','Import reviews');
        const head=el('div','','review-bulk-sheet-head'),body=el('div','','review-bulk-sheet-body'),foot=el('div','','review-bulk-sheet-foot');
        head.append(el('strong','Import reviews'),button('Cancel',()=>dialog.close(),undefined,'quiet'));
        body.append(el('p',`${plan.total} review${plan.total===1?'':'s'} in this file: ${plan.added} new, ${plan.existing} already on this device.`,'lab-note'));
        const policy=select('Existing reviews',[['keep','Keep this device’s drafts'],['replace','Use imported drafts']],'keep');
        if(plan.existing)body.append(field('For cards already reviewed',policy));
        const summary=el('p','','lab-note'),error=el('p','','review-field-error');error.setAttribute('role','alert');
        const update=()=>{summary.textContent=policy.value==='replace'
          ?'Imported drafts replace edits, notes and original definitions for matching cards. Other reviews stay.'
          :'Existing drafts keep their edits and notes. Only new reviews are added.';};
        policy.addEventListener('change',update);update();body.append(summary,error);
        foot.append(button('Import',()=>{
          try {
            const result=review.import(raw,{overwrite:policy.value==='replace'});
            message=`Imported reviews: ${result.added} added, ${result.replaced} replaced, ${result.skipped} kept on this device.`;
            if(result.added||result.replaced)onImported?.();dialog.close();run(()=>{});
          } catch(e) {error.textContent=`Reviews not imported: ${e.message}`;}
        },'review-import-confirm','primary'));
        dialog.append(head,body,foot);pick.parentElement.append(dialog);
        dialog.addEventListener('close',()=>{dialog.remove();pick.focus({preventScroll:true});});
        status.textContent=message;status.hidden=!message;dialog.showModal();
      } catch(error) {status.textContent=`Reviews not imported: ${error.message}`;}
      finally {pick.disabled=false;file.value='';}
    });
    return {pick,file,status};
  }
  return {controls};
}
