import { OPENING_KINDS } from './experiment.js';
import { KIND_LABELS, OPENING_GRID as GRID, layoutOpeningDraft, newOpeningNode, insertOpeningNode, moveOpeningNode, removeOpeningNode, setOpeningConnection, positionOpeningNodes, autoArrangeOpeningNodes } from './graph-edit.js';

const NS = 'http://www.w3.org/2000/svg', W = 200, H = 90;
const el = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; };
const svgEl = (tag, attrs = {}, text) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([key, value]) => n.setAttribute(key, value)); if (text != null) n.textContent = text; return n; };

export function createOpeningGraphEditor({ host, controller, onSelect, run }) {
  let snapshot, selectedId, edge = null, sourceId = null, gesture = null, zoom = 1, signature = '', layout, ignoreClickUntil = 0;
  let selectedIds = new Set(), mode = 'select', interactionIssue = '', preview = null;
  host.classList.add('graph-editor');
  host.append(el('h2', 'Edit the opening graph'), el('p', 'Drag cards into columns and rows. Drag empty space to box-select; Shift/Ctrl-click adds to the selection. Drag any selected card to move the group. Dots edit connections; Before/After changes the route.', 'note'));
  const actions = el('div', '', 'actions'), details = el('div', '', 'graph-tools');
  const scroll = el('div', '', 'graph-scroll stage-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Opening graph; scroll horizontally for later nodes');
  const svg = svgEl('svg', { 'aria-label': 'Editable opening graph', role: 'group', tabindex: 0 }); scroll.append(svg);
  const notice = el('p', '', 'graph-validation'); notice.setAttribute('role', 'status');
  host.append(actions, notice, scroll, details);
  function button(parent, label, action, id) {
    const b = el('button', label); b.type = 'button'; if (id) b.id = id;
    b.addEventListener('click', () => run(action)); parent.append(b); return b;
  }
  function select(parent, label, id) {
    const wrap = el('label', label), input = el('select'); input.id = id; wrap.append(input); parent.append(wrap); return input;
  }
  function options(input, nodes, value) {
    input.replaceChildren(...nodes.map(([id, title]) => { const opt = el('option', title); opt.value = id; return opt; }));
    if (nodes.some(([id]) => id === value)) input.value = value;
  }
  function edit(doc, selection = selectedId, ids = [selection]) {
    sourceId = null; edge = null; interactionIssue = ''; controller.editDraft(doc);
    selectedIds = new Set(ids.filter(id => doc.nodes.some(n => n.id === id))); selectedId = selection;
    signature = ''; if (selection) onSelect(selection); refresh(controller.getSnapshot(), selection);
  }
  const selectMode = button(actions, 'Select / move', () => { mode = 'select'; signature = ''; refresh(snapshot, selectedId); }, 'graph-select-mode');
  const panMode = button(actions, 'Pan canvas', () => { mode = 'pan'; signature = ''; refresh(snapshot, selectedId); }, 'graph-pan-mode');
  const undo = button(actions, 'Undo edit', () => { interactionIssue = ''; controller.undoDraft(); }, 'graph-undo');
  const redo = button(actions, 'Redo edit', () => { interactionIssue = ''; controller.redoDraft(); }, 'graph-redo');
  const cancelConnect = button(actions, 'Cancel connection', () => { sourceId = null; signature = ''; refresh(snapshot, selectedId); }, 'graph-cancel-connect');
  button(actions, 'Fit graph', () => { zoom = Math.max(.4, Math.min(1, (scroll.clientWidth - 12) / layout.width)); signature = ''; refresh(snapshot, selectedId); });
  button(actions, '100%', () => { zoom = 1; signature = ''; refresh(snapshot, selectedId); });
  button(actions, 'Auto-arrange', () => edit(autoArrangeOpeningNodes(snapshot.draft), selectedId, [...selectedIds]), 'graph-auto-arrange');
  button(actions, 'Play edited opening', () => { controller.restart(); document.getElementById('game-screen').scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 'graph-play');
  const selectionLabel = el('p', '', 'graph-selection'); details.append(selectionLabel);
  const positionTools = el('div', '', 'graph-tool-row'); details.append(positionTools);
  function numberField(label, id) {
    const wrap = el('label', label), input = el('input'); input.type = 'number'; input.min = 1; input.max = GRID.maxIndex + 1; input.step = 1; input.id = id; wrap.append(input); positionTools.append(wrap); return input;
  }
  const column = numberField('Column', 'graph-column'), row = numberField('Row', 'graph-row');
  button(positionTools, 'Move selection', () => {
    const cell = layout.cells[selectedId];
    if (![column, row].every(input => Number.isInteger(Number(input.value)) && Number(input.value) >= 1 && Number(input.value) <= GRID.maxIndex + 1)) throw new Error('Choose a column and row from 1 to 48.');
    edit(positionOpeningNodes(snapshot.draft, [...selectedIds], Number(column.value) - 1 - cell.column, Number(row.value) - 1 - cell.row), selectedId, [...selectedIds]);
  }, 'graph-position');
  const nodeTools = el('div', '', 'graph-node-tools'); details.append(nodeTools);
  const moveTools = el('div', '', 'graph-tool-row'); nodeTools.append(moveTools);
  button(moveTools, 'Edit node details', () => document.getElementById('editor').scrollIntoView({ block: 'start', behavior: 'smooth' }), 'graph-edit-details');
  const destination = select(moveTools, 'Route order: destination', 'graph-move-target');
  button(moveTools, 'Before', () => edit(moveOpeningNode(snapshot.draft, selectedId, destination.value)), 'graph-move-before');
  button(moveTools, 'After', () => edit(moveOpeningNode(snapshot.draft, selectedId, destination.value, 'after')), 'graph-move-after');
  const duplicate = button(moveTools, 'Duplicate node', () => {
    const spec = snapshot.draft.nodes.find(n => n.id === selectedId), added = newOpeningNode(snapshot.draft, spec.kind, selectedId);
    edit(insertOpeningNode(snapshot.draft, added, { id: selectedId }), added.id);
  }, 'graph-duplicate');
  const remove = button(moveTools, 'Remove node & join routes', () => {
    const doc = removeOpeningNode(snapshot.draft, selectedId); edit(doc, doc.nodes[0].id);
  }, 'graph-remove-node');
  const entry = button(moveTools, 'Make an entry', () => {
    const doc = structuredClone(snapshot.draft);
    doc.entryIds = doc.entryIds.includes(selectedId) ? doc.entryIds.filter(id => id !== selectedId) : [...doc.entryIds, selectedId]; edit(doc);
  }, 'graph-entry');
  const edgeTools = el('div', '', 'graph-tool-row'); details.append(edgeTools);
  button(edgeTools, 'Remove connection', () => edit(setOpeningConnection(snapshot.draft, edge.from, edge.to, false)), 'graph-remove-edge');
  const addTools = el('div', '', 'graph-tool-row'); details.append(addTools);
  const kind = select(addTools, 'New node type', 'graph-new-kind'); options(kind, OPENING_KINDS.filter(k => k !== 'founding').map(k => [k, KIND_LABELS[k]]), 'development');
  const add = button(addTools, 'Add node after selection', () => {
    const added = newOpeningNode(snapshot.draft, kind.value); edit(insertOpeningNode(snapshot.draft, added, edge ?? { id: selectedId }), added.id);
  }, 'graph-add');
  button(addTools, 'Add Custom Note', () => {
    const added = newOpeningNode(snapshot.draft, 'customNote'); edit(insertOpeningNode(snapshot.draft, added, edge ?? (selectedIds.size ? { id: selectedId } : null)), added.id);
    document.getElementById('editor').scrollIntoView({ block: 'start' }); document.getElementById('note-title')?.focus({ preventScroll: true });
  }, 'graph-add-note');
  const routes = el('details', '', 'graph-routes'); routes.append(el('summary', 'Connect nodes without dragging')); details.append(routes);
  const routeTools = el('div', '', 'graph-tool-row'); routes.append(routeTools);
  const from = select(routeTools, 'From', 'graph-from'), to = select(routeTools, 'To', 'graph-to');
  button(routeTools, 'Connect', () => edit(setOpeningConnection(snapshot.draft, from.value, to.value, true)), 'graph-connect');
  button(routeTools, 'Disconnect', () => edit(setOpeningConnection(snapshot.draft, from.value, to.value, false)), 'graph-disconnect');
  const drawing = svgEl('path', { class: 'graph-drawing', 'pointer-events': 'none' });
  function path(a, b) { const dx = Math.max(36, Math.abs(b.x - a.x) * .4); return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`; }
  function choose(id, toggle = false) {
    if (toggle) { if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); }
    else selectedIds = new Set([id]);
    selectedId = selectedIds.has(id) ? id : [...selectedIds][0] ?? id;
    edge = null; interactionIssue = ''; signature = ''; onSelect(selectedId); refresh(snapshot, selectedId);
  }
  function draw() {
    // Cards are replaced for drag previews. Keep keyboard focus on the persistent
    // SVG before removing a focused card, so Escape and arrow keys still work.
    if (svg.contains(document.activeElement)) svg.focus({ preventScroll: true });
    const doc = preview ?? snapshot.draft;
    layout = layoutOpeningDraft(doc); svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.style.width = `${layout.width * zoom}px`; svg.style.height = `${layout.height * zoom}px`;
    const defs = svgEl('defs'), marker = svgEl('marker', { id: 'opening-route-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#8ea9a1' })); defs.append(marker); svg.replaceChildren(defs);
    const pattern = svgEl('pattern', { id: 'opening-grid', width: GRID.columnWidth, height: GRID.rowHeight, x: 22, y: 32, patternUnits: 'userSpaceOnUse' });
    pattern.append(svgEl('path', { d: `M ${GRID.columnWidth} 0 H 0 V ${GRID.rowHeight}`, class: 'graph-grid-line' })); defs.append(pattern);
    svg.append(svgEl('rect', { width: layout.width, height: layout.height, fill: 'url(#opening-grid)', 'data-background': 'true' }));
    for (let c = 0; c * GRID.columnWidth < layout.width - GRID.x; c++) svg.append(svgEl('text', { x: GRID.x + c * GRID.columnWidth + W / 2, y: 21, class: 'graph-grid-label', 'text-anchor': 'middle', 'pointer-events': 'none' }, `Column ${c + 1}`));
    for (let r = 0; r * GRID.rowHeight < layout.height - GRID.y; r++) svg.append(svgEl('text', { x: 3, y: GRID.y + r * GRID.rowHeight + H / 2, class: 'graph-grid-label', 'pointer-events': 'none' }, `R${r + 1}`));
    for (const spec of doc.nodes) for (const target of spec.next) {
      const a = layout.points[spec.id], b = layout.points[target]; if (!b) continue;
      const d = path({ x: a.x + W + 15, y: a.y + H / 2 }, { x: b.x - 20, y: b.y + H / 2 });
      const g = svgEl('g', { 'data-from': spec.id, 'data-to': target, class: `graph-edge${edge?.from === spec.id && edge.to === target ? ' selected' : ''}`, tabindex: 0, role: 'button', 'aria-label': `Connection from ${KIND_LABELS[spec.kind]} to ${KIND_LABELS[doc.nodes.find(n => n.id === target).kind]}` });
      // A straight SVG path has zero-height bounds. Give it a real central hit
      // rectangle as well as the wider stroke, for touch and accessible locators.
      const mid = { x: (a.x + W + 15 + b.x - 20) / 2, y: (a.y + b.y + H) / 2 };
      g.append(svgEl('rect', { x: mid.x - 16, y: mid.y - 16, width: 32, height: 32, fill: 'transparent' }),
        svgEl('path', { d, class: 'graph-edge-hit' }), svgEl('path', { d, class: 'graph-edge-line', 'marker-end': 'url(#opening-route-arrow)' })); svg.append(g);
    }
    for (const spec of doc.nodes) {
      const p = layout.points[spec.id], current = doc.entryIds.includes(spec.id);
      const g = svgEl('g', { transform: `translate(${p.x} ${p.y})`, 'data-node': spec.id, class: `graph-card${selectedIds.has(spec.id) && !edge ? ' selected' : ''}${current ? ' entry' : ''}${spec.kind === 'customNote' ? ' custom-note' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${KIND_LABELS[spec.kind]}: ${spec.title}${current ? ', entry' : ''}`, 'aria-pressed': selectedIds.has(spec.id) });
      g.append(svgEl('rect', { width: W, height: H, rx: 10 }), svgEl('text', { x: 14, y: 25, class: 'graph-kind' }, KIND_LABELS[spec.kind]));
      g.append(svgEl('title', {}, `${spec.title}\n${spec.description}`));
      const words = spec.title.split(/\s+/), lines = [''];
      for (const word of words) { const last = lines.length - 1; if ((lines[last] + word).length > 24 && lines[last]) lines.push(word + ' '); else lines[last] += word + ' '; }
      lines.slice(0, spec.kind === 'customNote' ? 1 : 2).forEach((line, i) => g.append(svgEl('text', { x: 14, y: 49 + i * 20, class: 'graph-title' }, line.trim() + (lines.length > (spec.kind === 'customNote' ? 1 : 2) ? '…' : ''))));
      if (spec.kind === 'customNote') g.append(svgEl('text', { x: 14, y: 73, class: 'graph-note-preview' }, spec.description.replace(/\s+/g, ' ').slice(0, 25) + (spec.description.length > 25 ? '…' : '')));
      if (current) g.append(svgEl('text', { x: 0, y: -10, class: 'graph-entry-label' }, 'ENTRY'));
      for (const [port, x] of [['in', -13], ['out', W + 13]]) {
        const dot = svgEl('g', { transform: `translate(${x} ${H / 2})`, 'data-port': port, 'data-node': spec.id, class: 'graph-port', role: 'button', tabindex: 0, 'aria-label': `${port === 'out' ? 'Connect from' : 'Connect to'} ${KIND_LABELS[spec.kind]}` });
        dot.append(svgEl('circle', { r: 22, class: 'graph-port-hit' }), svgEl('circle', { r: 7, class: 'graph-port-dot' })); g.append(dot);
      }
      svg.append(g);
    }
    drawing.setAttribute('d', ''); svg.append(drawing);
    if (gesture?.type === 'box' && gesture.moved) {
      const a = gesture.start, b = gesture.end ?? a;
      svg.append(svgEl('rect', { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y), class: 'graph-selection-box', 'pointer-events': 'none' }));
    }
  }
  function localPoint(event) {
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function edgeAt(element) { const g = element?.closest?.('[data-from]'); return g ? { from: g.dataset.from, to: g.dataset.to } : null; }
  svg.addEventListener('pointerdown', event => {
    ignoreClickUntil = 0;
    if (snapshot.busy || event.button !== 0) return;
    svg.focus({ preventScroll: true });
    const port = event.target.closest('[data-port]'), card = event.target.closest('[data-node]');
    interactionIssue = '';
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (mode !== 'pan' && (port?.dataset.port === 'in' || edgeAt(event.target))) return;
    const id = card?.dataset.node, type = mode === 'pan' ? 'pan' : port ? 'connect' : card ? 'move' : 'box';
    const ids = id && selectedIds.has(id) ? [...selectedIds] : additive && id ? [...selectedIds, id] : id ? [id] : [];
    gesture = { id, ids, target: event.target, type, additive, baseIds: [...selectedIds], start: localPoint(event), x: event.clientX, y: event.clientY,
      scrollLeft: scroll.scrollLeft, scrollTop: scroll.scrollTop, moved: false, doc: snapshot.draft };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    if (!gesture) return;
    gesture.moved ||= Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8;
    if (!gesture.moved) return;
    if (gesture.type === 'pan') { scroll.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.x); scroll.scrollTop = gesture.scrollTop - (event.clientY - gesture.y); return; }
    const box = scroll.getBoundingClientRect();
    if (event.clientX > box.right - 35) scroll.scrollLeft += 18; else if (event.clientX < box.left + 35) scroll.scrollLeft -= 18;
    if (event.clientY > box.bottom - 25) scroll.scrollTop += 12; else if (event.clientY < box.top + 25) scroll.scrollTop -= 12;
    const end = localPoint(event); gesture.end = end;
    if (gesture.type === 'connect') {
      const start = layout.points[gesture.id]; drawing.setAttribute('d', path({ x: start.x + W + 13, y: start.y + H / 2 }, end)); return;
    }
    if (gesture.type === 'box') {
      const x1 = Math.min(gesture.start.x, end.x), x2 = Math.max(gesture.start.x, end.x), y1 = Math.min(gesture.start.y, end.y), y2 = Math.max(gesture.start.y, end.y);
      const baseLayout = layoutOpeningDraft(gesture.doc);
      const hits = Object.entries(baseLayout.points).filter(([, p]) => p.x < x2 && p.x + W > x1 && p.y < y2 && p.y + H > y1).map(([id]) => id);
      selectedIds = new Set([...(gesture.additive ? gesture.baseIds : []), ...hits]); draw(); return;
    }
    selectedIds = new Set(gesture.ids);
    gesture.columnDelta = Math.round((end.x - gesture.start.x) / GRID.columnWidth);
    gesture.rowDelta = Math.round((end.y - gesture.start.y) / GRID.rowHeight);
    preview = positionOpeningNodes(gesture.doc, gesture.ids, gesture.columnDelta, gesture.rowDelta, { allowOverlap: true });
    try { positionOpeningNodes(gesture.doc, gesture.ids, gesture.columnDelta, gesture.rowDelta); gesture.issue = ''; }
    catch (error) { gesture.issue = error.message; }
    draw(); notice.textContent = gesture.issue || `Move ${gesture.ids.length} node${gesture.ids.length > 1 ? 's' : ''} · release to place on the grid.`; notice.classList.toggle('warning', !!gesture.issue);
  });
  svg.addEventListener('pointerup', event => {
    if (!gesture) return;
    const finished = gesture; gesture = null; preview = null; drawing.setAttribute('d', ''); svg.releasePointerCapture(event.pointerId);
    ignoreClickUntil = performance.now() + 100;
    if (!finished.moved) {
      if (finished.type === 'box') { selectedIds.clear(); edge = null; signature = ''; refresh(snapshot, selectedId); }
      else if (finished.type === 'move') choose(finished.id, finished.additive);
      else activate(finished.target); return;
    }
    if (finished.type === 'box') {
      const id = [...selectedIds][0]; signature = ''; if (id) { selectedId = id; onSelect(id); } refresh(snapshot, id ?? selectedId); return;
    }
    if (finished.type === 'pan') return;
    const target = document.elementFromPoint(event.clientX, event.clientY), id = target?.closest?.('[data-node]')?.dataset.node;
    run(() => {
      if (finished.type === 'connect' && id && id !== finished.id) edit(setOpeningConnection(snapshot.draft, finished.id, id, true), finished.id);
      if (finished.type === 'move') {
        try { edit(positionOpeningNodes(finished.doc, finished.ids, finished.columnDelta ?? 0, finished.rowDelta ?? 0), finished.id, finished.ids); }
        catch (error) { interactionIssue = error.message; signature = ''; refresh(snapshot, selectedId); throw error; }
      }
    });
    signature = ''; refresh(snapshot, selectedId);
  });
  svg.addEventListener('pointercancel', () => { gesture = null; preview = null; signature = ''; refresh(snapshot, selectedId); });
  function activate(target) {
    if (snapshot.busy) return;
    const port = target.closest('[data-port]'), card = target.closest('[data-node]');
    if (port?.dataset.port === 'out') { sourceId = card.dataset.node; signature = ''; refresh(snapshot, selectedId); return; }
    if (sourceId && card) { const fromId = sourceId; sourceId = null; run(() => edit(setOpeningConnection(snapshot.draft, fromId, card.dataset.node, true), fromId)); return; }
    if (card) { choose(card.dataset.node); return; }
    const route = edgeAt(target); if (route) { edge = route; sourceId = null; signature = ''; refresh(snapshot, selectedId); }
  }
  svg.addEventListener('click', event => { if (!event.defaultPrevented && performance.now() >= ignoreClickUntil) activate(event.target); });
  svg.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (gesture) { selectedIds = new Set(gesture.baseIds); gesture = null; preview = null; }
      sourceId = null; interactionIssue = ''; signature = ''; refresh(snapshot, selectedId);
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event.target); }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (edge) run(() => edit(setOpeningConnection(snapshot.draft, edge.from, edge.to, false))); }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (nudge && selectedIds.size) { event.preventDefault(); run(() => edit(positionOpeningNodes(snapshot.draft, [...selectedIds], ...nudge), selectedId, [...selectedIds])); }
  });
  function refresh(next, selection) {
    snapshot = next;
    const focus = next.draft.nodes.some(n => n.id === selection) ? selection : next.draft.nodes[0].id;
    selectedIds = new Set([...selectedIds].filter(id => next.draft.nodes.some(n => n.id === id)));
    if (selectedId == null || focus !== selectedId && !selectedIds.has(focus)) selectedIds = new Set([focus]);
    selectedId = focus;
    if (sourceId && !next.draft.nodes.some(n => n.id === sourceId)) sourceId = null;
    if (edge && !next.draft.nodes.find(n => n.id === edge.from)?.next.includes(edge.to)) edge = null;
    const key = JSON.stringify([next.draft, selectedId, [...selectedIds], edge, sourceId, mode, interactionIssue, next.busy, next.draftIssue, next.draftChanged, next.canUndoDraft, next.canRedoDraft]); if (signature === key) return; signature = key;
    const spec = next.draft.nodes.find(n => n.id === selectedId), entries = next.draft.nodes.map(n => [n.id, `${KIND_LABELS[n.kind]} · ${n.title}`]);
    const targetValue = destination.value, fromValue = from.value, toValue = to.value;
    options(destination, entries.filter(([id]) => id !== selectedId), targetValue || 'founding');
    options(from, entries, fromValue || selectedId); options(to, entries, toValue || spec.next[0]);
    selectionLabel.textContent = edge ? `Selected connection: ${KIND_LABELS[next.draft.nodes.find(n => n.id === edge.from).kind]} → ${KIND_LABELS[next.draft.nodes.find(n => n.id === edge.to).kind]}` : selectedIds.size > 1 ? `${selectedIds.size} nodes selected. Drag any selected card to move the group.` : selectedIds.size ? `Selected: ${KIND_LABELS[spec.kind]} · ${spec.title}` : 'No nodes selected. Drag a box or click a card.';
    nodeTools.hidden = !!edge || selectedIds.size !== 1; positionTools.hidden = !!edge || !selectedIds.size;
    edgeTools.hidden = !edge; add.textContent = edge ? 'Add node on this connection' : 'Add node after selection';
    const cell = layoutOpeningDraft(next.draft).cells[selectedId]; column.value = cell.column + 1; row.value = cell.row + 1;
    entry.textContent = next.draft.entryIds.includes(selectedId) ? 'Remove entry status' : 'Make an entry';
    cancelConnect.hidden = !sourceId;
    notice.textContent = interactionIssue || (sourceId ? `Connect from ${KIND_LABELS[next.draft.nodes.find(n => n.id === sourceId).kind]}: click the destination node, or Cancel connection.` : next.draftIssue ? `Cannot play yet: ${next.draftIssue}` : next.draftChanged ? 'Draft ready. Restart or Play edited opening to try it.' : 'This graph matches the current playthrough.');
    notice.classList.toggle('warning', !!next.draftIssue || !!interactionIssue);
    host.querySelectorAll('button,select,input').forEach(n => { n.disabled = next.busy; });
    selectMode.setAttribute('aria-pressed', String(mode === 'select')); panMode.setAttribute('aria-pressed', String(mode === 'pan')); svg.dataset.mode = mode;
    undo.disabled ||= !next.canUndoDraft; redo.disabled ||= !next.canRedoDraft; remove.disabled ||= spec.kind === 'founding'; duplicate.disabled ||= spec.kind === 'founding'; add.disabled ||= next.draft.nodes.length >= 24;
    document.getElementById('graph-play').disabled ||= !!next.draftIssue;
    draw();
  }
  return { refresh, getSnapshot: () => ({ selectedIds: [...selectedIds], mode, cells: layout?.cells }), getCellClientPoint: (column, row) => {
    const p = svg.createSVGPoint(); p.x = GRID.x + column * GRID.columnWidth + W / 2; p.y = GRID.y + row * GRID.rowHeight + H / 2;
    const point = p.matrixTransform(svg.getScreenCTM()); return { x: point.x, y: point.y };
  } };
}
