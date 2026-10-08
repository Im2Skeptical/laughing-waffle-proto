export function el(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
// Button hierarchy: secondary is the default; primary marks the one main
// action in a group, quiet is low-emphasis, danger is destructive.
export function button(label, action, testid, variant = '') {
  const node = el('button',label); node.type = 'button';
  if (testid) node.dataset.testid = testid;
  if (variant) node.classList.add(`lab-${variant}`);
  node.addEventListener('click',action); return node;
}
// Two-step confirmation for destructive actions: the first tap relabels the
// button, the second commits. Leaving the button (blur) disarms it.
export function confirmButton(label, confirmLabel, action, testid) {
  const node = button(label, event => {
    if (node.dataset.confirm !== 'yes') { node.dataset.confirm = 'yes'; node.textContent = confirmLabel; node.classList.add('lab-confirming'); return; }
    disarm(); action(event);
  }, testid, 'danger');
  const disarm = () => { delete node.dataset.confirm; node.textContent = label; node.classList.remove('lab-confirming'); };
  node.addEventListener('blur', disarm);
  return node;
}
export function select(label, entries, value = '') {
  const node = el('select'); node.setAttribute('aria-label',label);
  const add = (parent, entry) => {
    const [id,text] = Array.isArray(entry) ? entry : [entry,entry];
    const option = el('option',text); option.value = id; parent.append(option);
  };
  for (const entry of entries) {
    // {group, entries} renders an <optgroup>, which phones show as sections.
    if (entry && !Array.isArray(entry) && typeof entry === 'object') {
      if (!entry.entries.length) continue;
      const group = el('optgroup'); group.label = entry.group; entry.entries.forEach(item => add(group,item)); node.append(group);
    } else add(node,entry);
  }
  node.value = value; return node;
}
export function input(label, value = '', type = 'number') {
  const node = el('input'); node.type = type; node.value = value; node.setAttribute('aria-label',label);
  if (type === 'number') { node.min = '0'; node.step = '1'; node.inputMode = 'numeric'; }
  return node;
}
// Field-level help is a tappable (i) beside the label; the text stays hidden
// until asked for, so labels remain one line.
export function field(label, node, {help} = {}) {
  const wrapper = el('label',label);
  if (node.type === 'checkbox') wrapper.classList.add('lab-check');
  wrapper.append(node);
  if (help) {
    const text = el('span',help,'lab-field-help'); text.hidden = true;
    const toggle = infoButton(`About ${label}`, text);
    const head = el('span','','lab-field-head'); head.append(wrapper.firstChild, toggle); wrapper.prepend(head);
    wrapper.append(text);
  }
  return wrapper;
}
function infoButton(name, target) {
  const toggle = el('button','i','lab-info-button'); toggle.type = 'button';
  // Help is never data: read-only editors keep it usable.
  toggle.dataset.labUi = 'help';
  toggle.setAttribute('aria-label',name); toggle.setAttribute('aria-expanded','false');
  toggle.addEventListener('click',event => {
    event.preventDefault(); event.stopPropagation();
    target.hidden = !target.hidden; toggle.setAttribute('aria-expanded',String(!target.hidden));
  });
  return toggle;
}
export function section(title, ...children) { const node = el('section','','lab-panel'); node.append(el('h2',title),...children); return node; }
export function details(label, value) { const node = el('details','','lab-raw'); node.append(el('summary',label),el('pre',typeof value === 'string' ? value : JSON.stringify(value,null,2))); return node; }
export function table(headers, rows) {
  const node = el('table'), head = el('tr'); headers.forEach(h => head.append(el('th',h))); node.append(head);
  for (const row of rows) { const tr = el('tr'); row.forEach(c => tr.append(el('td',String(c ?? '—')))); node.append(tr); }
  const wrap = el('div','','lab-table'); wrap.append(node); return wrap;
}

// Remembered disclosure state, shared by every Lab tool. Only a person's own
// toggles are stored; a default opening never writes to storage.
const UI_KEY = 'civsurvivor.development-lab.ui.v1';
let uiState = null;
function readUi() {
  if (uiState) return uiState;
  try { uiState = JSON.parse(globalThis.localStorage?.getItem(UI_KEY) ?? '{}') ?? {}; } catch { uiState = {}; }
  return uiState;
}
export function remembered(key, fallback) { const value = readUi()[key]; return value === undefined ? fallback : value; }
export function remember(key, value) {
  readUi()[key] = value;
  try { globalThis.localStorage?.setItem(UI_KEY, JSON.stringify(uiState)); } catch { /* storage is optional */ }
}
export const isNarrow = () => !!globalThis.matchMedia?.('(max-width:850px)').matches;
export const isWide = () => !!globalThis.matchMedia?.('(min-width:1100px)').matches;

// Collapsible group with an optional count badge. `key` remembers the
// person's choice; `open` is the default until they choose.
export function disclosure(summary, children = [], {key, open = false, count, badges = [], className = ''} = {}) {
  const node = el('details','',`lab-disclosure ${className}`.trim());
  const initial = key ? remembered(key, open) : open;
  node.open = !!initial;
  const head = el('summary'); head.append(el('span',summary,'lab-disclosure-title'));
  if (count !== undefined) head.append(badge(String(count)));
  for (const item of badges) if (item) head.append(item);
  node.append(head, ...children);
  if (key) node.addEventListener('toggle',() => {
    if (node.dataset.silent === String(node.open)) { delete node.dataset.silent; return; }
    if (node.open !== initial || remembered(key, undefined) !== undefined) remember(key, node.open);
  });
  return node;
}
// Open or close a disclosure for the person (search results, for example)
// without recording it as their own choice.
export function setDisclosureOpen(node, open) {
  if (node.open === !!open) return;
  node.dataset.silent = String(!!open); node.open = !!open;
}
// "How this works": explanation stays one tap away and out of the layout.
export function info(key, text, {label = 'How this works'} = {}) {
  const body = (Array.isArray(text) ? text : [text]).map(item => typeof item === 'string' ? el('p',item) : item);
  const node = disclosure(label, body, {key:key && `info:${key}`, className:'lab-info'});
  node.querySelector('summary').prepend(el('span','i','lab-info-icon'));
  return node;
}
export function badge(text, tone = '') {
  const node = el('span',text,`lab-badge${tone ? ` lab-badge-${tone}` : ''}`);
  return node;
}
// Segmented control for short, fixed choice sets. Each button carries its
// value so tests and keyboard users can pick directly.
export function segmented(label, entries, value, onChange, {testid} = {}) {
  const node = el('div','','lab-segmented'); node.setAttribute('role','group'); node.setAttribute('aria-label',label);
  if (testid) node.dataset.testid = testid;
  for (const [id, text, count] of entries) {
    const choice = button('',() => { if (id !== value) onChange(id); });
    choice.dataset.value = id; choice.setAttribute('aria-pressed',String(id === value));
    choice.append(el('span',text));
    if (count !== undefined) choice.append(badge(String(count)));
    node.append(choice);
  }
  return node;
}
// Labelled block inside a panel ("Launch", "Profile"…): small caps title,
// controls below. Replaces paragraphs that used to explain the grouping.
export function group(title, ...children) {
  const node = el('div','','lab-group'); node.setAttribute('role','group'); node.setAttribute('aria-label',title);
  node.append(el('span',title,'lab-group-title'), ...children);
  return node;
}
