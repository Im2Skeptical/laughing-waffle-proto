import { createOpeningExperiment, OPENING_KINDS } from './experiment.js';

export const KIND_LABELS = { relic: 'Relic', world: 'Crossroads', founding: 'Founding', shop: 'Practice shop', structureShop: 'Structure shop', development: 'Development', martial: 'Martial', supply: 'Stock supply', patronage: 'Easy benefit', specialRelic: 'Special relic', customNote: 'Custom Note', legacy:'Legacy' };
export const OPENING_GRID = { x: 72, y: 62, columnWidth: 300, rowHeight: 150, maxIndex: 47 };
const unique = ids => [...new Set(ids)];
const node = (doc, id) => {
  const result = doc.nodes.find(n => n.id === id);
  if (!result) throw new Error('Select an existing node.');
  return result;
};

// Graph authoring only. These operations never inspect or mutate GameState.
export function newOpeningNode(doc, kind, copyId = null) {
  if (doc.nodes.length >= 24) throw new Error('This experiment supports up to 24 nodes.');
  if (!OPENING_KINDS.includes(kind) || kind === 'founding') throw new Error('Keep the existing founding node.');
  const template = copyId ? node(doc, copyId) : kind === 'customNote'
    ? { kind, title: 'Custom Note', description: '' } : kind === 'structureShop'
    ? { kind, title: 'Structure shop', description: '', monsterPressurePerPurchase: 10 } : kind === 'specialRelic'
    ? { kind, title: 'A dangerous discovery', description: 'A rare relic with a signalled direct death risk.', relics: [{ definitionId: 'hourglass', phaseCost: 6, immediateDeathChance: .35 }] }
    : createOpeningExperiment().nodes.find(n => n.kind === kind);
  let index = 1;
  while (doc.nodes.some(n => n.id === `${kind}-${index}`)) index++;
  const added = { ...structuredClone(template), id: `${kind}-${index}`, title: copyId ? `${template.title} (copy)` : template.title,
    ...(!copyId && kind === 'patronage' ? { description: 'A modest benefit is a valid step. Choose how much time to invest.' } : {}), next: [] };
  delete added.editorPosition; return added;
}

function detach(doc, id) {
  const selected = node(doc, id), successors = [...selected.next];
  for (const other of doc.nodes) if (other.id !== id) {
    other.next = unique(other.next.flatMap(next => next === id ? successors : [next])).filter(next => next !== other.id);
  }
  doc.entryIds = unique(doc.entryIds.flatMap(entry => entry === id ? successors : [entry]));
  selected.next = [];
}

export function moveOpeningNode(document, id, targetId, position = 'before') {
  if (id === targetId) throw new Error('Choose a different destination node.');
  const doc = structuredClone(document), selected = node(doc, id), target = node(doc, targetId);
  detach(doc, id);
  if (position === 'before') {
    for (const other of doc.nodes) if (other.id !== id) other.next = other.next.map(next => next === targetId ? id : next);
    doc.entryIds = doc.entryIds.map(entry => entry === targetId ? id : entry);
    selected.next = [targetId];
  } else {
    selected.next = [...target.next]; target.next = [id];
  }
  return doc;
}

export function insertOpeningNode(document, added, selection) {
  const doc = structuredClone(document); doc.nodes.push(structuredClone(added));
  if (selection?.from) {
    const source = node(doc, selection.from);
    source.next = source.next.map(id => id === selection.to ? added.id : id);
    node(doc, added.id).next = [selection.to];
  } else if (selection?.id) {
    const source = node(doc, selection.id);
    node(doc, added.id).next = [...source.next]; source.next = [added.id];
  } else doc.entryIds.push(added.id);
  if (document.nodes.some(n => n.editorPosition)) {
    const { cells } = layoutOpeningDraft(document), anchor = cells[selection?.from ?? selection?.id] ?? { column: 0, row: 0 };
    const column = Math.min(OPENING_GRID.maxIndex, anchor.column + 1);
    const occupied = new Set(Object.values(cells).filter(p => p.column === column).map(p => p.row));
    let row = anchor.row; while (occupied.has(row)) row = (row + 1) % (OPENING_GRID.maxIndex + 1);
    node(doc, added.id).editorPosition = { column, row };
  }
  return doc;
}

export function moveOpeningNodeOnConnection(document, id, from, to) {
  if (id === from || id === to) return structuredClone(document);
  const doc = structuredClone(document); detach(doc, id);
  const source = node(doc, from);
  if (!source.next.includes(to)) throw new Error('Choose an existing connection.');
  source.next = source.next.map(next => next === to ? id : next); node(doc, id).next = [to];
  return doc;
}

export function removeOpeningNode(document, id) {
  const doc = structuredClone(document);
  if (node(doc, id).kind === 'founding') throw new Error('The opening needs its founding node. Move it instead.');
  detach(doc, id); doc.nodes = doc.nodes.filter(n => n.id !== id);
  return doc;
}

export function setOpeningConnection(document, from, to, connected) {
  const doc = structuredClone(document), source = node(doc, from); node(doc, to);
  if (from === to) throw new Error('A node cannot connect to itself.');
  source.next = connected ? unique([...source.next, to]) : source.next.filter(id => id !== to);
  return doc;
}

export function layoutOpeningDraft(doc) {
  const counts = new Map(doc.nodes.map(n => [n.id, 0])), depths = new Map(doc.nodes.map(n => [n.id, 0]));
  doc.nodes.forEach(n => n.next.forEach(id => { if (counts.has(id)) counts.set(id, counts.get(id) + 1); }));
  const queue = doc.nodes.filter(n => counts.get(n.id) === 0).map(n => n.id);
  for (let i = 0; i < queue.length; i++) {
    const source = node(doc, queue[i]);
    source.next.forEach(id => {
      if (!counts.has(id)) return;
      depths.set(id, Math.max(depths.get(id), depths.get(source.id) + 1));
      counts.set(id, counts.get(id) - 1); if (!counts.get(id)) queue.push(id);
    });
  }
  const lanes = new Map(), points = {}, cells = {};
  doc.nodes.forEach(n => {
    const depth = counts.get(n.id) > 0 ? 0 : depths.get(n.id), lane = lanes.get(depth) ?? 0;
    lanes.set(depth, lane + 1);
    cells[n.id] = n.editorPosition ?? { column: depth, row: lane };
    const { column, row } = cells[n.id];
    points[n.id] = { x: OPENING_GRID.x + column * OPENING_GRID.columnWidth, y: OPENING_GRID.y + row * OPENING_GRID.rowHeight };
  });
  return { points, cells, width: Math.max(900, ...Object.values(points).map(p => p.x + 600)), height: Math.max(362, ...Object.values(points).map(p => p.y + 300)) };
}

export function positionOpeningNodes(document, ids, columnDelta, rowDelta, { allowOverlap = false } = {}) {
  if (!ids.length || !Number.isInteger(columnDelta) || !Number.isInteger(rowDelta)) throw new Error('Select nodes and a whole column/row.');
  ids.forEach(id => node(document, id));
  const doc = structuredClone(document), { cells } = layoutOpeningDraft(doc), selected = new Set(ids);
  const columns = ids.map(id => cells[id].column), rows = ids.map(id => cells[id].row);
  columnDelta = Math.max(-Math.min(...columns), Math.min(OPENING_GRID.maxIndex - Math.max(...columns), columnDelta));
  rowDelta = Math.max(-Math.min(...rows), Math.min(OPENING_GRID.maxIndex - Math.max(...rows), rowDelta));
  if (!columnDelta && !rowDelta) return doc;
  // Freeze the remaining automatic positions too, so later route edits cannot
  // move unselected cards around a manually arranged diagram.
  doc.nodes.forEach(n => { n.editorPosition = { column: cells[n.id].column + (selected.has(n.id) ? columnDelta : 0), row: cells[n.id].row + (selected.has(n.id) ? rowDelta : 0) }; });
  if (!allowOverlap) {
    for (const id of ids) {
      const moved = node(doc, id), { column, row } = moved.editorPosition;
      const occupant = doc.nodes.find(n => !selected.has(n.id) && n.editorPosition.column === column && n.editorPosition.row === row);
      if (occupant) throw new Error(`Column ${column + 1}, Row ${row + 1} already contains "${occupant.title}". Choose an empty cell.`);
    }
  }
  return doc;
}

export function autoArrangeOpeningNodes(document) {
  const doc = structuredClone(document); doc.nodes.forEach(n => { delete n.editorPosition; }); return doc;
}
