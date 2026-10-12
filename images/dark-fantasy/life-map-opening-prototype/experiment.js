// Experimental encounter data. Never read by player New Game or saved runs.
export const OPENING_KINDS = ['relic', 'world', 'founding', 'shop', 'development', 'martial', 'supply', 'patronage', 'specialRelic'];

export function createOpeningExperiment() {
  return {
    schemaVersion: 1, name: 'Warrior opening · first draft', seed: 42,
    entryIds: ['relic', 'explore'],
    nodes: [
      { id: 'relic', title: 'An heirloom on the road', kind: 'relic',
        description: 'A small discovery shapes the person who will found the Warriors. Ordinary relics have no direct death roll.', next: ['founding'],
        relics: [
          { definitionId: 'minorSeal', phaseCost: 6, prestigeCost: 0, chaos: 0 },
          { definitionId: 'tutorsNotebook', phaseCost: 8, prestigeCost: 0, chaos: 0 },
          { definitionId: 'hourglass', phaseCost: 6, prestigeCost: 0, chaos: 10 },
        ] },
      { id: 'explore', title: 'Choose your foothold', kind: 'world',
        description: 'Travel to another player settlement or open a connection. Meet local guides if you prefer to remain here.', phaseCost: 6, next: ['founding'],
        options: [{ id: 'guides', label: 'Meet local guides', phaseCost: 4, prestigeDelta: 3 }] },
      { id: 'founding', title: 'Establish the Warriors', kind: 'founding',
        description: 'Both routes converge here. Train ten existing adults; Prestige now sustains your Retinue.', phaseCost: 6, next: ['shop'] },
      { id: 'shop', title: 'Make your first investment', kind: 'shop',
        description: 'Buy a useful Practice or keep Prestige for your Retinue. Purchases still use the real five-slot settlement board.', next: ['development'],
        cards: [
          { kind: 'practice', definitionId: 'herdingTrain', prestigeCost: 10, phaseCost: 12 },
          { kind: 'practice', definitionId: 'logging', prestigeCost: 10, phaseCost: 12 },
          { kind: 'practice', definitionId: 'barter', prestigeCost: 10, phaseCost: 12 },
        ], pass: { id: 'save', label: 'Keep Prestige for the Retinue', phaseCost: 2, prestigeDelta: 1 } },
      { id: 'development', title: 'Prepare for what comes next', kind: 'development',
        description: 'Compare personal Force with the nearby targets. Development should change an upcoming decision.', next: ['martial'],
        options: [
          { id: 'drill', label: 'Quick martial drilling', statId: 'intelligence', statDelta: 1, phaseCost: 6 },
          { id: 'train', label: 'Dedicated martial training', statId: 'intelligence', statDelta: 2, phaseCost: 18 },
          { id: 'organize', label: 'Learn to organize work', statId: 'effectiveness', statDelta: 1, phaseCost: 6 },
        ] },
      { id: 'martial', title: 'Test the new host', kind: 'martial',
        description: 'Legal Campaigns and real crisis responses appear here. Drilling is a useful alternative when no target is ready.', next: ['supply'],
        options: [{ id: 'readiness', label: 'Drill for the next encounter', statId: 'intelligence', statDelta: 1, phaseCost: 8 }] },
      { id: 'supply', title: 'Support the emerging economy', kind: 'supply', stockOutput: 'auto',
        description: 'Prefer an unmet recipe input; otherwise offer a seeded output. Producing a trait does not guarantee the recipe can run.', next: ['favor'],
        pass: { id: 'supply-favor', label: 'Seek support instead', prestigeDelta: 3, phaseCost: 4 } },
      { id: 'favor', title: 'An easy opportunity', kind: 'patronage',
        description: 'A modest benefit is a valid step. This completes the authored opening experiment.', next: [],
        options: [
          { id: 'favor', label: 'Accept local goodwill', prestigeDelta: 5, phaseCost: 2 },
          { id: 'office', label: 'Take a longer appointment', prestigeDelta: 12, phaseCost: 12 },
        ] },
    ],
  };
}

const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
export function validateOpeningExperiment(doc) {
  if (!doc || doc.schemaVersion !== 1 || typeof doc.name !== 'string' || !doc.name.trim()
      || !Number.isInteger(doc.seed) || !finite(doc.seed, 0, 4294967295)
      || !Array.isArray(doc.nodes) || doc.nodes.length < 2 || doc.nodes.length > 24
      || !Array.isArray(doc.entryIds) || !doc.entryIds.length) throw new Error('Choose a name, unsigned seed and 2–24 nodes in a version-1 experiment.');
  const ids = new Set();
  for (const node of doc.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(node.id) || ids.has(node.id)
        || !OPENING_KINDS.includes(node.kind) || typeof node.title !== 'string' || !node.title.trim()
        || typeof node.description !== 'string' || !Array.isArray(node.next) || new Set(node.next).size !== node.next.length) throw new Error('Each node needs a unique ID, title, description, kind and next-node list.');
    ids.add(node.id);
    if (node.displayLabel != null && typeof node.displayLabel !== 'string') throw new Error(`${node.title}: the game-screen label must be text.`);
    if (node.phaseCost != null && !finite(node.phaseCost, 0, 320)) throw new Error(`${node.title}: phases must be between 0 and 320.`);
    if (node.stockOutput != null && typeof node.stockOutput !== 'string') throw new Error(`${node.title}: choose a Stock output.`);
    for (const list of ['options', 'relics', 'cards']) {
      if (node[list] != null && (!Array.isArray(node[list]) || node[list].length > 12)) throw new Error(`${node.title}: ${list} must be a list of at most 12 offers.`);
      const keys = new Set();
      for (const item of node[list] ?? []) {
        const key = item?.id ?? item?.definitionId;
        if (typeof key !== 'string' || !key || keys.has(key)) throw new Error(`${node.title}: offers need unique IDs.`);
        keys.add(key); validateOffer(item, node.title);
      }
    }
    if (node.pass != null) validateOffer(node.pass, node.title);
    if (node.kind === 'founding' && node.relics?.length) throw new Error('Founding cannot contain relic offers.');
  }
  if (doc.nodes.filter(n => n.kind === 'founding').length !== 1) throw new Error('Keep exactly one founding convergence point.');
  if (new Set(doc.entryIds).size !== doc.entryIds.length || [...doc.entryIds, ...doc.nodes.flatMap(n => n.next)].some(id => !ids.has(id))) throw new Error('Entry and next-node links must reference existing nodes.');
  const reached = new Set(), visiting = new Set(), checked = new Set();
  const visit = (id, founded) => {
    const node = doc.nodes.find(n => n.id === id), key = `${id}:${founded}`;
    if (visiting.has(id)) throw new Error(`The opening graph cannot contain a cycle. A route loops back to "${node.title}".`);
    if (checked.has(key)) return;
    visiting.add(id); reached.add(id);
    const nextFounded = founded || node.kind === 'founding';
    if (!nextFounded && !node.next.length) throw new Error(`Every entry path must reach founding. "${node.title}" currently ends before founding.`);
    if (!nextFounded && (node.kind === 'specialRelic' || [...(node.options ?? []), ...(node.relics ?? [])].some(o => (o.immediateDeathChance ?? 0) > 0))) throw new Error('Pre-founding encounters must have no direct death risk.');
    for (const next of node.next) visit(next, nextFounded);
    visiting.delete(id); checked.add(key);
  };
  doc.entryIds.forEach(id => visit(id, false));
  if (reached.size !== ids.size) throw new Error(`Every authored node must be reachable from an entry. Connect or remove: ${doc.nodes.filter(n => !reached.has(n.id)).map(n => n.title).join(', ')}.`);
  return structuredClone(doc);
}

function validateOffer(item, title) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${title}: malformed offer.`);
  for (const [key, min, max] of [['phaseCost', 0, 320], ['prestigeCost', 0, 10000], ['prestigeDelta', -10000, 10000], ['chaos', 0, 1000], ['statDelta', -10, 10], ['immediateDeathChance', 0, 1]]) {
    if (item[key] != null && !finite(item[key], min, max)) throw new Error(`${title}: ${key} must be between ${min} and ${max}.`);
  }
  if (item.statId != null && !['cunning', 'wisdom', 'effectiveness', 'intelligence'].includes(item.statId)) throw new Error(`${title}: choose a recognized ability.`);
  if (item.kind != null && !['practice', 'structure'].includes(item.kind)) throw new Error(`${title}: cards must be Practices or Structures.`);
}
