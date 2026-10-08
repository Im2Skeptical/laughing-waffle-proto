import { el, button, input, field, badge, disclosure } from './elements.js';

// One editing pattern for a card's lists (Consume, Require, Production
// outputs): each row shows its icons, an amount and Remove; Add opens the same
// icon tray as Stock tags to pick a type, then an amount and Add.
// Handlers return an error message, or nothing once saved (the view re-renders).
export function reviewListEditor({title, testid, rows, choices, addLabel, emptyNote, full, fullNote, onAdd, cards, whole = true}) {
  const box = el('div','','review-list'); box.dataset.testid = testid;
  const feedback = el('p','','review-field-error'); feedback.setAttribute('role','status');
  const report = message => { feedback.textContent = message ?? ''; };
  const amountInput = (label, value) => {
    const node = input(label, value, 'number');
    if (whole) { node.min = '0'; node.step = '1'; node.inputMode = 'numeric'; }
    else { node.removeAttribute('min'); node.step = 'any'; node.inputMode = 'decimal'; }
    return node;
  };
  const read = node => node.value.trim() && Number.isFinite(node.valueAsNumber) ? node.valueAsNumber : null;
  box.append(el('h4',title,'review-list-title'));
  if (rows.length) {
    const list = el('ul','','review-list-rows');
    for (const row of rows) {
      const item = el('li','','review-list-row');
      const icons = el('span','','review-list-icons'); icons.setAttribute('aria-hidden','true');
      for (const spec of row.icons.slice(0,3)) icons.append(cards.icon(spec));
      const name = el('span','','review-list-name'); name.append(el('span',row.label));
      if (row.badge) name.append(' ',badge(row.badge,'accent'));
      const amount = amountInput(`${row.label} amount`, row.amount); amount.dataset.testid = `${testid}-amount`;
      amount.addEventListener('change',()=>{ const value = read(amount); report(value === null ? 'Enter a number.' : row.onAmount(value)); });
      const remove = button('Remove',()=>report(row.onRemove()),`${testid}-remove`,'quiet'); remove.setAttribute('aria-label',`Remove ${row.label}`);
      item.append(icons, name, amount, remove);
      if (row.extra) item.append(row.extra);
      list.append(item);
    }
    box.append(list);
  } else box.append(el('p',emptyNote,'lab-note review-list-empty'));
  let picked = choices[0]?.key ?? null;
  const tray = el('div','','review-icon-tray');
  for (const choice of choices) {
    const pick = button('',()=>{ picked = choice.key; for (const node of tray.children) node.setAttribute('aria-pressed',String(node.dataset.pick === picked)); });
    pick.dataset.pick = choice.key; pick.setAttribute('aria-label',`${addLabel}: ${choice.label}`); pick.setAttribute('aria-pressed',String(choice.key === picked));
    pick.append(cards.icon(choice.icon), el('span',choice.label)); tray.append(pick);
  }
  const amount = amountInput(`${addLabel} amount`, 1); amount.dataset.testid = `${testid}-add-amount`;
  const add = button(addLabel,()=>{ const value = read(amount); report(value === null ? 'Enter a number.' : picked ? onAdd(picked, value) : 'Choose a type.'); },`${testid}-add`,'primary');
  const addRow = el('div','','review-list-add'); addRow.append(field('Amount',amount), add);
  const body = full ? [el('p',fullNote,'lab-note')] : choices.length ? [tray, addRow] : [el('p','Every type is already on this card.','lab-note')];
  // Not remembered: each save re-renders the list with the adder closed.
  const adder = disclosure(addLabel, body, {className:'review-list-adder'});
  box.append(adder, feedback);
  return box;
}
