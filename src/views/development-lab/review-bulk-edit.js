import { REVIEW_QUALITIES } from '../../model/dev-lab/card-review.js';
import { el, button, field, input, select, badge, disclosure } from './elements.js';

// Bulk editing for the card reviewer: a selection mode on the queue, a sheet
// that sets one whole-card number or choice across the selection, an
// old → new preview with skipped cards, and a one-shot undo.
const humanize = key => String(key).replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().replace(/^./,letter=>letter.toUpperCase());
const shown = value => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
// Common balance levers first; the rest follow alphabetically.
const PRIORITY = ['workerCapacity','workerBonus','workerCapacityPerQuality','stockCapacity','vassalPrestigeCost','vassalPhaseCost','minimumQuality','footprint','housing','candidateBonus','specialistGate','localCurrencyCost'];
const rank = path => { const index = PRIORITY.indexOf(path[0]); return index < 0 ? PRIORITY.length : index; };

export function createReviewBulkEdit({review, run, labelFor}) {
  const selection = new Set();
  let selecting = false, view = 'all', undo = null, sheet = null;
  const nameOf = path => { const name = labelFor({}, path); return name === path.join(' · ') ? humanize(path[0]) : name; };
  const reasonText = (row, label) => ({
    missing:`No ${label} on this card`, absent:'Absent from this build',
    locked:'Locked · tick Include locked cards to change it', same:`Already ${shown(row.from)}`,
  })[row.reason] ?? row.message;

  // Zoo "Add N shown to review" hands its group over through the URL.
  function sync(keys) {
    const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const requested = params.get('select');
    if (requested !== null) {
      const wanted = requested.split(',').filter(key => keys.includes(key));
      if (wanted.length) { selection.clear(); wanted.forEach(key => selection.add(key)); selecting = true; view = 'selected'; }
      // Consume the hand-off so Back/refresh does not reselect.
      const url = new URL(location.href); url.hash = '/dev/reviewer'; history.replaceState(history.state,'',url);
    }
    for (const key of [...selection]) if (!keys.includes(key)) selection.delete(key);
  }

  // Undo banner after a bulk save; it stays until dismissed or used.
  function banner() {
    if (!undo) return null;
    const node = el('div','','review-bulk-banner'); node.setAttribute('role','status'); node.dataset.testid = 'review-bulk-banner';
    const text = el('p');
    if (undo.done) text.textContent = `Bulk edit undone · ${plural(undo.done,'card')} restored.`;
    else {
      text.append(el('strong',`${undo.label} → ${shown(undo.value)}`),` on ${plural(undo.changed,'card')}`);
      if (undo.skipped) text.append(el('span',` · ${undo.skipped} skipped`,'review-bulk-faint'));
    }
    node.append(text);
    const actions = el('div','','review-bulk-banner-actions');
    if (!undo.done) actions.append(button('Undo bulk edit',()=>run(()=>{undo.done = review.undoBulk(undo.snapshot);}),'review-bulk-undo'));
    const dismiss = button('×',()=>run(()=>{undo = null;}),'review-bulk-dismiss','quiet');
    dismiss.setAttribute('aria-label','Dismiss'); actions.append(dismiss);
    node.append(actions);
    return node;
  }

  // Queue controls: Select toggle, then (while selecting) the All/Selected view,
  // Select all shown and Clear. `refresh` re-syncs chip visibility in place.
  function controls(refresh, visible) {
    const toggle = button(selecting ? 'Done selecting' : 'Select',()=>run(()=>{selecting = !selecting; view = 'all';}),'review-select');
    toggle.setAttribute('aria-pressed',String(selecting));
    if (!selecting) return {toggle, tools:null};
    const tools = el('div','','review-select-tools');
    const views = el('div','','lab-segmented'); views.setAttribute('role','group'); views.setAttribute('aria-label','Show cards'); views.dataset.testid = 'review-select-view';
    const allButton = button('',()=>setView('all')), selectedButton = button('',()=>setView('selected'));
    allButton.dataset.value = 'all'; selectedButton.dataset.value = 'selected';
    views.append(allButton, selectedButton);
    const selectAll = button('Select all shown',()=>{visible().forEach(key=>selection.add(key)); refresh();},'review-select-all');
    tools.append(views, selectAll);
    function setView(next) { view = next; refresh(); }
    function update(total) {
      allButton.replaceChildren(el('span','All'),badge(String(total)));
      selectedButton.replaceChildren(el('span','Selected'),badge(String(selection.size),selection.size?'accent':''));
      allButton.setAttribute('aria-pressed',String(view === 'all')); selectedButton.setAttribute('aria-pressed',String(view === 'selected'));
      selectedButton.disabled = !selection.size && view !== 'selected';
      selectAll.disabled = visible().every(key => selection.has(key));
    }
    return {toggle, tools, update};
  }

  function decorate(pick, key) {
    pick.querySelector('.review-check')?.remove();
    if (!selecting) return;
    const on = selection.has(key);
    const check = el('span',on ? '✓' : '','review-check'); check.setAttribute('aria-hidden','true');
    pick.prepend(check); pick.setAttribute('aria-pressed',String(on)); pick.dataset.selected = String(on);
  }
  const hidden = key => selecting && view === 'selected' && !selection.has(key);
  const toggleKey = key => { if (selection.has(key)) selection.delete(key); else selection.add(key); };

  // Sticky bottom bar: "N selected · Edit together", with Clear beside the count.
  function bar(refresh) {
    if (!selecting) return null;
    const node = el('div','','review-bulk-bar'); node.dataset.testid = 'review-bulk-bar';
    const count = el('span','','review-bulk-count'); count.setAttribute('aria-live','polite');
    const clear = button('Clear',()=>{selection.clear(); if (view === 'selected') view = 'all'; refresh();},'review-select-clear','quiet');
    const edit = button('Edit together',()=>openSheet(),'review-bulk-edit','primary');
    node.append(count, clear, edit);
    const update = () => {
      count.textContent = selection.size ? `${selection.size} selected` : 'Tap cards to select';
      edit.disabled = !selection.size; clear.hidden = !selection.size;
    };
    update();
    return {node, update};
  }

  function openSheet() {
    sheet?.remove();
    const keys = [...selection];
    const dialog = el('dialog','','review-bulk-sheet'); dialog.dataset.testid = 'review-bulk-sheet';
    const head = el('div','','review-bulk-sheet-head'), body = el('div','','review-bulk-sheet-body'), foot = el('div','','review-bulk-sheet-foot');
    dialog.append(head, body, foot);
    dialog.addEventListener('close',()=>{ dialog.remove(); if (sheet === dialog) sheet = null; document.querySelector('[data-testid=review-bulk-edit]')?.focus({preventScroll:true}); });
    dialog.addEventListener('click',event=>{
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
    const close = button('Cancel',()=>dialog.close(),'review-bulk-cancel','quiet');
    function fields() {
      dialog.dataset.step = 'fields';
      const options = review.bulkFields(keys).sort((a,b)=>b.count-a.count||rank(a.path)-rank(b.path)||nameOf(a.path).localeCompare(nameOf(b.path)));
      const title = el('strong',`Edit ${plural(keys.length,'card')} together`);
      head.replaceChildren(title, close); dialog.setAttribute('aria-label',title.textContent);
      body.replaceChildren(el('p','Pick a value to set on every selected card. Whole-card numbers and choices only; effect rows stay per card.','lab-note'));
      const list = el('div','','review-bulk-fields'); list.setAttribute('role','list');
      for (const option of options) {
        const name = nameOf(option.path);
        const pick = button('',()=>value(option),'review-bulk-field'); pick.dataset.path = option.path[0]; pick.setAttribute('role','listitem');
        const now = option.values.length === 1 ? `Now ${shown(option.values[0])}` : option.type === 'number' ? `Now ${option.values[0]}–${option.values.at(-1)}` : `Now ${option.values.map(shown).join(', ')}`;
        pick.append(el('span',name,'review-bulk-field-name'),el('span',now,'review-bulk-faint'),badge(`${option.count} of ${keys.length} have it`,option.count===keys.length?'accent':''));
        pick.setAttribute('aria-label',`${name} (${option.count} of ${keys.length} have it, ${now.toLowerCase()})`);
        list.append(pick);
      }
      if (!options.length) list.append(el('p','These cards share no values that can be edited together.','lab-empty'));
      body.append(list); foot.replaceChildren();
      body.scrollTop = 0;
    }
    function value(option) {
      dialog.dataset.step = 'preview';
      const name = nameOf(option.path), back = button('‹ Values',fields,'review-bulk-back','quiet');
      back.setAttribute('aria-label','Back to values');
      const title = el('strong',name);
      head.replaceChildren(back, title, close); dialog.setAttribute('aria-label',`Set ${name}`);
      // Start from the most common current value; cards with the field have a `from`.
      const baseline = review.planBulk(keys,option.path,option.values[0]).filter(row=>row.from !== undefined), counts = new Map();
      for (const row of baseline) counts.set(String(row.from),(counts.get(String(row.from))??0)+1);
      const common = option.values.reduce((best,item)=>(counts.get(String(item))??0)>(counts.get(String(best))??0)?item:best,option.values[0]);
      const lockedCount = baseline.filter(row=>row.locked).length;
      let control;
      if (option.type === 'choice') control = select(`New ${name}`,REVIEW_QUALITIES,common);
      else if (option.type === 'boolean') control = select(`New ${name}`,[['true','Yes'],['false','No']],String(common));
      else {
        control = input(`New ${name}`,common,'number');
        const whole = option.values.every(Number.isInteger);
        control.removeAttribute('min'); control.step = whole ? '1' : 'any'; control.inputMode = whole ? 'numeric' : 'decimal';
      }
      control.dataset.testid = 'review-bulk-value';
      const include = input('Include locked cards','','checkbox'); include.dataset.testid = 'review-bulk-include-locked';
      const summary = el('p','','review-bulk-summary'); summary.setAttribute('role','status');
      const preview = el('div','','review-bulk-preview'); preview.dataset.testid = 'review-bulk-preview';
      const valueRow = el('div','','review-bulk-value');
      valueRow.append(field(`New value`,control));
      if (lockedCount) valueRow.append(field(`Include ${plural(lockedCount,'locked card')}`,include));
      body.replaceChildren(valueRow, summary, preview);
      const apply = button('Apply',()=>save(),'review-bulk-apply','primary');
      foot.replaceChildren(apply);
      const current = () => option.type === 'number' ? (control.value.trim() && Number.isFinite(control.valueAsNumber) ? control.valueAsNumber : null) : option.type === 'boolean' ? control.value === 'true' : control.value;
      function update() {
        const next = current(); preview.replaceChildren();
        if (next === null) { summary.textContent = 'Enter a number.'; apply.disabled = true; apply.textContent = 'Apply'; return; }
        const rows = review.planBulk(keys,option.path,next,{includeLocked:include.checked});
        const changes = rows.filter(row=>row.status==='change'), skipped = rows.filter(row=>row.status==='skipped');
        summary.textContent = `${plural(changes.length,'card')} will change${skipped.length?` · ${skipped.length} skipped`:''}`;
        apply.disabled = !changes.length; apply.textContent = changes.length ? `Apply to ${plural(changes.length,'card')}` : 'Nothing to change';
        if (changes.length) {
          const list = el('ul','','review-bulk-rows');
          for (const row of changes) {
            const item = el('li','','review-bulk-row'); item.dataset.status = 'change';
            const values = el('span','','review-bulk-diff'); values.append(el('span',shown(row.from),'review-old'),' → ',el('span',shown(row.to),'review-new'));
            item.append(el('span',row.label,'review-bulk-name'));
            if (row.locked) item.append(badge('Locked','warn'));
            item.append(values); list.append(item);
          }
          preview.append(list);
        }
        if (skipped.length) {
          const list = el('ul','','review-bulk-rows');
          for (const row of skipped) {
            const item = el('li','','review-bulk-row'); item.dataset.status = 'skipped'; item.dataset.reason = row.reason;
            item.append(el('span',row.label,'review-bulk-name'));
            if (row.locked) item.append(badge('Locked','warn'));
            item.append(el('span',reasonText(row,name),'review-bulk-reason')); list.append(item);
          }
          // Skips lead so their reasons are seen; long lists fold under a count.
          const box = disclosure('Skipped',[list],{open:skipped.length<=8||!changes.length,count:skipped.length,className:'review-bulk-skipped'});
          box.dataset.testid = 'review-bulk-skipped'; preview.prepend(box);
        }
      }
      function save() {
        const next = current(); if (next === null) return;
        try {
          const result = review.bulkEdit(keys,option.path,next,{includeLocked:include.checked});
          undo = {label:name, value:next, changed:result.changed.length, skipped:result.skipped.length, snapshot:result.undo, done:0};
          dialog.close(); run(()=>{});
        } catch (error) { summary.textContent = `Not saved: ${error.message}`; }
      }
      control.addEventListener(option.type === 'number' ? 'input' : 'change',update);
      include.addEventListener('change',update);
      update(); body.scrollTop = 0;
      control.focus({preventScroll:true});
    }
    fields();
    // The sheet lives outside the view so re-renders cannot detach it mid-edit.
    sheet = dialog; document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('[data-testid=review-bulk-field]')?.focus({preventScroll:true});
  }

  return {sync, banner, controls, decorate, hidden, toggleKey, bar, openSheet, clearUndo:()=>{undo=null;},
    isSelecting:() => selecting, selected:() => [...selection]};
}
