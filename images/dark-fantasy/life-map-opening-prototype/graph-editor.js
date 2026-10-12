import { OPENING_KINDS } from './experiment.js';
import { KIND_LABELS, layoutOpeningDraft, newOpeningNode, insertOpeningNode, moveOpeningNode, moveOpeningNodeOnConnection, removeOpeningNode, setOpeningConnection } from './graph-edit.js';

const NS = 'http://www.w3.org/2000/svg', W = 200, H = 90;
const el = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; };
const svgEl = (tag, attrs = {}, text) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([key, value]) => n.setAttribute(key, value)); if (text != null) n.textContent = text; return n; };

export function createOpeningGraphEditor({ host, controller, onSelect, run }) {
  let snapshot, selectedId, edge = null, sourceId = null, gesture = null, zoom = 1, signature = '', layout, ignoreClickUntil = 0;
  host.classList.add('graph-editor');
  host.append(el('h2', 'Edit the opening graph'), el('p', 'Move a node onto another node to put it before that node, or onto an arrow to insert it on that route. Drag from a right-hand dot to another node to connect them. Select an arrow, then Remove connection.', 'note'));
  const actions = el('div', '', 'actions'), details = el('div', '', 'graph-tools');
  const scroll = el('div', '', 'graph-scroll stage-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Opening graph; scroll horizontally for later nodes');
  const svg = svgEl('svg', { 'aria-label': 'Editable opening graph', role: 'group' }); scroll.append(svg);
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
  function edit(doc, selection = selectedId) {
    sourceId = null; edge = null; selectedId = selection; controller.editDraft(doc); if (selection) onSelect(selection);
  }
  const undo = button(actions, 'Undo edit', () => controller.undoDraft(), 'graph-undo');
  const redo = button(actions, 'Redo edit', () => controller.redoDraft(), 'graph-redo');
  const cancelConnect = button(actions, 'Cancel connection', () => { sourceId = null; signature = ''; refresh(snapshot, selectedId); }, 'graph-cancel-connect');
  button(actions, 'Fit graph', () => { zoom = Math.max(.4, Math.min(1, (scroll.clientWidth - 12) / layout.width)); signature = ''; refresh(snapshot, selectedId); });
  button(actions, '100%', () => { zoom = 1; signature = ''; refresh(snapshot, selectedId); });
  button(actions, 'Play edited opening', () => { controller.restart(); document.getElementById('game-screen').scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 'graph-play');
  const selectionLabel = el('p', '', 'graph-selection'); details.append(selectionLabel);
  const nodeTools = el('div', '', 'graph-node-tools'); details.append(nodeTools);
  const moveTools = el('div', '', 'graph-tool-row'); nodeTools.append(moveTools);
  button(moveTools, 'Edit node details', () => document.getElementById('editor').scrollIntoView({ block: 'start', behavior: 'smooth' }), 'graph-edit-details');
  const destination = select(moveTools, 'Move selected node', 'graph-move-target');
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
  const routes = el('details', '', 'graph-routes'); routes.append(el('summary', 'Connect nodes without dragging')); details.append(routes);
  const routeTools = el('div', '', 'graph-tool-row'); routes.append(routeTools);
  const from = select(routeTools, 'From', 'graph-from'), to = select(routeTools, 'To', 'graph-to');
  button(routeTools, 'Connect', () => edit(setOpeningConnection(snapshot.draft, from.value, to.value, true)), 'graph-connect');
  button(routeTools, 'Disconnect', () => edit(setOpeningConnection(snapshot.draft, from.value, to.value, false)), 'graph-disconnect');
  const drawing = svgEl('path', { class: 'graph-drawing', 'pointer-events': 'none' });
  function path(a, b) { const dx = Math.max(36, Math.abs(b.x - a.x) * .4); return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`; }
  function choose(id) { selectedId = id; edge = null; signature = ''; onSelect(id); refresh(snapshot, id); }
  function draw() {
    layout = layoutOpeningDraft(snapshot.draft); svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.style.width = `${layout.width * zoom}px`; svg.style.height = `${layout.height * zoom}px`;
    const defs = svgEl('defs'), marker = svgEl('marker', { id: 'opening-route-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#8ea9a1' })); defs.append(marker); svg.replaceChildren(defs);
    for (const spec of snapshot.draft.nodes) for (const target of spec.next) {
      const a = layout.points[spec.id], b = layout.points[target]; if (!b) continue;
      const d = path({ x: a.x + W + 15, y: a.y + H / 2 }, { x: b.x - 20, y: b.y + H / 2 });
      const g = svgEl('g', { 'data-from': spec.id, 'data-to': target, class: `graph-edge${edge?.from === spec.id && edge.to === target ? ' selected' : ''}`, tabindex: 0, role: 'button', 'aria-label': `Connection from ${KIND_LABELS[spec.kind]} to ${KIND_LABELS[snapshot.draft.nodes.find(n => n.id === target).kind]}` });
      // A straight SVG path has zero-height bounds. Give it a real central hit
      // rectangle as well as the wider stroke, for touch and accessible locators.
      const mid = { x: (a.x + W + 15 + b.x - 20) / 2, y: (a.y + b.y + H) / 2 };
      g.append(svgEl('rect', { x: mid.x - 16, y: mid.y - 16, width: 32, height: 32, fill: 'transparent' }),
        svgEl('path', { d, class: 'graph-edge-hit' }), svgEl('path', { d, class: 'graph-edge-line', 'marker-end': 'url(#opening-route-arrow)' })); svg.append(g);
    }
    for (const spec of snapshot.draft.nodes) {
      const p = layout.points[spec.id], current = snapshot.draft.entryIds.includes(spec.id);
      const g = svgEl('g', { transform: `translate(${p.x} ${p.y})`, 'data-node': spec.id, class: `graph-card${selectedId === spec.id && !edge ? ' selected' : ''}${current ? ' entry' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${KIND_LABELS[spec.kind]}: ${spec.title}${current ? ', entry' : ''}` });
      g.append(svgEl('rect', { width: W, height: H, rx: 10 }), svgEl('text', { x: 14, y: 25, class: 'graph-kind' }, KIND_LABELS[spec.kind]));
      const words = spec.title.split(/\s+/), lines = [''];
      for (const word of words) { const last = lines.length - 1; if ((lines[last] + word).length > 24 && lines[last]) lines.push(word + ' '); else lines[last] += word + ' '; }
      lines.slice(0, 2).forEach((line, i) => g.append(svgEl('text', { x: 14, y: 49 + i * 20, class: 'graph-title' }, line.trim() + (i === 1 && lines.length > 2 ? '…' : ''))));
      if (current) g.append(svgEl('text', { x: 0, y: -10, class: 'graph-entry-label' }, 'ENTRY'));
      for (const [port, x] of [['in', -13], ['out', W + 13]]) {
        const dot = svgEl('g', { transform: `translate(${x} ${H / 2})`, 'data-port': port, 'data-node': spec.id, class: 'graph-port', role: 'button', tabindex: 0, 'aria-label': `${port === 'out' ? 'Connect from' : 'Connect to'} ${KIND_LABELS[spec.kind]}` });
        dot.append(svgEl('circle', { r: 22, class: 'graph-port-hit' }), svgEl('circle', { r: 7, class: 'graph-port-dot' })); g.append(dot);
      }
      svg.append(g);
    }
    drawing.setAttribute('d', ''); svg.append(drawing);
  }
  function localPoint(event) {
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function edgeAt(element) { const g = element?.closest?.('[data-from]'); return g ? { from: g.dataset.from, to: g.dataset.to } : null; }
  svg.addEventListener('pointerdown', event => {
    ignoreClickUntil = 0;
    if (snapshot.busy || event.button !== 0) return;
    const port = event.target.closest('[data-port]'), card = event.target.closest('[data-node]');
    if (!card || port?.dataset.port === 'in') return;
    gesture = { id: card.dataset.node, target: event.target, type: port ? 'connect' : 'move', x: event.clientX, y: event.clientY, moved: false };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    if (!gesture) return;
    gesture.moved ||= Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8;
    if (!gesture.moved) return;
    const box = scroll.getBoundingClientRect(); if (event.clientX > box.right - 35) scroll.scrollLeft += 18; else if (event.clientX < box.left + 35) scroll.scrollLeft -= 18;
    const start = layout.points[gesture.id]; drawing.setAttribute('d', path({ x: start.x + W + 13, y: start.y + H / 2 }, localPoint(event)));
  });
  svg.addEventListener('pointerup', event => {
    if (!gesture) return;
    const finished = gesture; gesture = null; drawing.setAttribute('d', ''); svg.releasePointerCapture(event.pointerId);
    ignoreClickUntil = performance.now() + 100;
    if (!finished.moved) { activate(finished.target); return; }
    const target = document.elementFromPoint(event.clientX, event.clientY), id = target?.closest?.('[data-node]')?.dataset.node;
    run(() => {
      if (finished.type === 'connect' && id && id !== finished.id) edit(setOpeningConnection(snapshot.draft, finished.id, id, true), finished.id);
      if (finished.type === 'move') {
        const route = edgeAt(target);
        if (route) edit(moveOpeningNodeOnConnection(snapshot.draft, finished.id, route.from, route.to), finished.id);
        else if (id && id !== finished.id) edit(moveOpeningNode(snapshot.draft, finished.id, id), finished.id);
      }
    });
  });
  svg.addEventListener('pointercancel', () => { gesture = null; drawing.setAttribute('d', ''); });
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
    if (event.key === 'Escape') { sourceId = null; signature = ''; refresh(snapshot, selectedId); }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event.target); }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (edge) run(() => edit(setOpeningConnection(snapshot.draft, edge.from, edge.to, false))); }
  });
  function refresh(next, selection) {
    snapshot = next; selectedId = next.draft.nodes.some(n => n.id === selection) ? selection : next.draft.nodes[0].id;
    if (sourceId && !next.draft.nodes.some(n => n.id === sourceId)) sourceId = null;
    if (edge && !next.draft.nodes.find(n => n.id === edge.from)?.next.includes(edge.to)) edge = null;
    const key = JSON.stringify([next.draft, selectedId, edge, sourceId, next.busy, next.draftIssue, next.draftChanged, next.canUndoDraft, next.canRedoDraft]); if (signature === key) return; signature = key;
    const spec = next.draft.nodes.find(n => n.id === selectedId), entries = next.draft.nodes.map(n => [n.id, `${KIND_LABELS[n.kind]} · ${n.title}`]);
    const targetValue = destination.value, fromValue = from.value, toValue = to.value;
    options(destination, entries.filter(([id]) => id !== selectedId), targetValue || 'founding');
    options(from, entries, fromValue || selectedId); options(to, entries, toValue || spec.next[0]);
    selectionLabel.textContent = edge ? `Selected connection: ${KIND_LABELS[next.draft.nodes.find(n => n.id === edge.from).kind]} → ${KIND_LABELS[next.draft.nodes.find(n => n.id === edge.to).kind]}` : `Selected: ${KIND_LABELS[spec.kind]} · ${spec.title}`;
    nodeTools.hidden = !!edge; edgeTools.hidden = !edge; add.textContent = edge ? 'Add node on this connection' : 'Add node after selection';
    entry.textContent = next.draft.entryIds.includes(selectedId) ? 'Remove entry status' : 'Make an entry';
    cancelConnect.hidden = !sourceId;
    notice.textContent = sourceId ? `Connect from ${KIND_LABELS[next.draft.nodes.find(n => n.id === sourceId).kind]}: click the destination node, or Cancel connection.` : next.draftIssue ? `Cannot play yet: ${next.draftIssue}` : next.draftChanged ? 'Draft ready. Restart or Play edited opening to try it.' : 'This graph matches the current playthrough.';
    notice.classList.toggle('warning', !!next.draftIssue);
    host.querySelectorAll('button,select').forEach(n => { n.disabled = next.busy; });
    undo.disabled ||= !next.canUndoDraft; redo.disabled ||= !next.canRedoDraft; remove.disabled ||= spec.kind === 'founding'; duplicate.disabled ||= spec.kind === 'founding'; add.disabled ||= next.draft.nodes.length >= 24;
    document.getElementById('graph-play').disabled ||= !!next.draftIssue;
    draw();
  }
  return { refresh };
}
