import { createOpeningExperiment, OPENING_KINDS } from './experiment.js';

export const KIND_LABELS = { relic: 'Relic', world: 'World decision', founding: 'Founding', shop: 'Practice shop', development: 'Development', martial: 'Martial', supply: 'Stock supply', patronage: 'Easy benefit', specialRelic: 'Special relic' };
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
  const template = copyId ? node(doc, copyId) : kind === 'specialRelic'
    ? { kind, title: 'A dangerous discovery', description: 'A rare relic with a signalled direct death risk.', relics: [{ definitionId: 'hourglass', phaseCost: 6, immediateDeathChance: .35 }] }
    : createOpeningExperiment().nodes.find(n => n.kind === kind);
  let index = 1;
  while (doc.nodes.some(n => n.id === `${kind}-${index}`)) index++;
  return { ...structuredClone(template), id: `${kind}-${index}`, title: copyId ? `${template.title} (copy)` : template.title,
    ...(!copyId && kind === 'patronage' ? { description: 'A modest benefit is a valid step. Choose how much time to invest.' } : {}), next: [] };
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
  const lanes = new Map(), points = {};
  doc.nodes.forEach(n => {
    const depth = counts.get(n.id) > 0 ? 0 : depths.get(n.id), lane = lanes.get(depth) ?? 0;
    // Leave an exposed stretch of arrow between the two 44px connector targets.
    lanes.set(depth, lane + 1); points[n.id] = { x: 54 + depth * 300, y: 38 + lane * 136 };
  });
  return { points, width: Math.max(600, ...Object.values(points).map(p => p.x + 246)), height: Math.max(210, ...Object.values(points).map(p => p.y + 150)) };
}
