export function el(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(label, action, testid) {
  const node = el('button',label); node.type = 'button';
  if (testid) node.dataset.testid = testid;
  node.addEventListener('click',action); return node;
}
export function select(label, entries, value = '') {
  const node = el('select'); node.setAttribute('aria-label',label);
  for (const entry of entries) {
    const [id,text] = Array.isArray(entry) ? entry : [entry,entry];
    const option = el('option',text); option.value = id; node.append(option);
  }
  node.value = value; return node;
}
export function input(label, value = '', type = 'number') {
  const node = el('input'); node.type = type; node.value = value; node.setAttribute('aria-label',label);
  if (type === 'number') { node.min = '0'; node.step = '1'; }
  return node;
}
export function field(label,node) { const wrapper = el('label',label); wrapper.append(node); return wrapper; }
export function section(title, ...children) { const node = el('section','','lab-panel'); node.append(el('h2',title),...children); return node; }
export function details(label, value) { const node = el('details'); node.append(el('summary',label),el('pre',typeof value === 'string' ? value : JSON.stringify(value,null,2))); return node; }
export function table(headers, rows) {
  const node = el('table'), head = el('tr'); headers.forEach(h => head.append(el('th',h))); node.append(head);
  for (const row of rows) { const tr = el('tr'); row.forEach(c => tr.append(el('td',String(c ?? '—')))); node.append(tr); }
  const wrap = el('div','','lab-table'); wrap.append(node); return wrap;
}
