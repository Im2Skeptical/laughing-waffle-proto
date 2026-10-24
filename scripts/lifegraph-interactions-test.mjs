// Pairwise Lifegraph contracts beyond the single-rule columns and workbench seeds.
// Pause/phase policy: no ticks and no pause. Generation uses the captured config
// and the authored seed on the vassalLifeMap stream. Expected pause policy: not applicable.
import assert from 'node:assert/strict';
import { createLifegraphDraft } from '../src/model/dev-lab/lifegraph.js';
import { createRng } from '../src/model/rng.js';
import { generateVassalLifeMap, validateVassalLifeMapGraph } from '../src/model/vassal-life-map-generator.js';

const CLASS_ONLY = { training: 'specialist', discovery: 'scholar', campaign: 'warrior', challenge: 'warrior', classMarket: 'specialist' };
const column = (id, depth, targetId, scope = 'common', lifeStage = 'any', targetType = 'node') =>
  ({ id, label: id, enabled: true, depth, targetType, targetId, scope, lifeStage });

function config() {
  const value = structuredClone(createLifegraphDraft().generatorConfig);
  Object.assign(value, { laneCount: 3, normalDepthCount: 8, routeCount: 2, earlyDepthCount: 2, midDepthCount: 3 });
  value.design.guarantees = [];
  value.design.stockSupply.enabled = false;
  value.design.bookends = { founding: { enabled: false, depth: 0, priority: 1 }, legacy: { enabled: true, depth: 'end' } };
  value.design.columns = [];
  return value;
}

function walk(graph, ctx) {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const out = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    assert.ok(byId.has(edge.fromNodeId) && byId.has(edge.toNodeId), `dangling ${edge.fromNodeId}`);
    assert.equal(byId.get(edge.toNodeId).depth, byId.get(edge.fromNodeId).depth + 1);
    out.get(edge.fromNodeId).push(edge.toNodeId);
  }
  const seen = new Set();
  const visit = (id, stack) => {
    assert.ok(!stack.has(id), `cycle ${id}`);
    if (seen.has(id)) return;
    stack.add(id); seen.add(id);
    for (const next of out.get(id) ?? []) visit(next, stack);
    stack.delete(id);
  };
  for (const id of graph.entryNodeIds) visit(id, new Set());
  assert.equal(seen.size, graph.nodes.length, 'entry reaches every node');
  const max = Math.max(...graph.nodes.map(node => node.depth));
  for (const node of graph.nodes) if (node.depth < max) assert.ok(out.get(node.id).length, `dead ${node.id}`);
  const founding = graph.nodes.find(node => node.bookend === 'founding') ?? null;
  for (const node of graph.nodes) {
    const scope = CLASS_ONLY[node.family];
    if (!scope) continue;
    const effective = ctx.founderClassId != null && (!founding || node.depth < founding.depth) ? null : ctx.classId;
    const legal = effective != null && (scope === 'scholar' ? effective === 'scholar' : scope === 'warrior' ? effective === 'warrior' : effective === 'scholar' || effective === 'warrior');
    assert.ok(legal, `${node.family} at depth ${node.depth}`);
  }
  return out;
}

function draw(value, ctx, seed = 11) {
  const options = { ...ctx, generationSeed: seed, graphId: `lg-${seed}`, stockOutputs: ['Edible', 'Timber', 'Stone'], unmetStockOutputs: [] };
  const first = generateVassalLifeMap(value, createRng(seed), options);
  const second = generateVassalLifeMap(value, createRng(seed), options);
  assert.equal(first.ok, true, first.errors?.join('; '));
  assert.equal(JSON.stringify(first), JSON.stringify(second), 'same seed and config');
  const captured = generateVassalLifeMap(JSON.parse(JSON.stringify(first.graph.generatorConfig)), createRng(seed), options);
  assert.equal(JSON.stringify(first), JSON.stringify(captured), 'JSON capture roundtrip');
  assert.equal(JSON.stringify(first.graph.generationContext), JSON.stringify({ classId: ctx.classId ?? null, founderClassId: ctx.founderClassId ?? null }));
  assert.deepEqual(validateVassalLifeMapGraph(first.graph), { ok: true, errors: [] });
  return { graph: first.graph, out: walk(first.graph, ctx) };
}

function expectColumn(graph, out, depth, family, milestoneId) {
  const nodes = graph.nodes.filter(node => node.depth === depth);
  assert.equal(nodes.length, 1, `depth ${depth}`);
  assert.equal(nodes[0].family, family);
  assert.equal(nodes[0].milestoneId ?? null, milestoneId);
  for (const parent of graph.nodes.filter(node => node.depth === depth - 1)) assert.ok(out.get(parent.id).includes(nodes[0].id));
  for (const child of graph.nodes.filter(node => node.depth === depth + 1)) assert.ok(out.get(nodes[0].id).includes(child.id));
}

function refused(value, ctx, reason, fragment) {
  const result = generateVassalLifeMap(value, createRng(3), { ...ctx, generationSeed: 3, stockOutputs: ['Edible'], unmetStockOutputs: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, reason);
  assert.ok(result.errors.some(error => error.includes(fragment)), result.errors?.join('; '));
}

const ordered = config();
ordered.design.columns = [column('pref', 4, 'development', 'scholar', 'firstLife'), column('fall', 4, 'crossroads'), column('steady', 2, 'patronage')];
const firstLife = draw(ordered, { classId: 'scholar', founderClassId: 'scholar' });
expectColumn(firstLife.graph, firstLife.out, 3, 'development', 'pref');
assert.equal(firstLife.graph.foundingNodeId ?? null, null);
const successor = draw(ordered, { classId: 'scholar', founderClassId: null });
expectColumn(successor.graph, successor.out, 3, 'crossroads', 'fall');
const warriorRules = structuredClone(ordered);
warriorRules.design.columns[0] = column('pref', 4, 'discovery', 'scholar', 'any');
const warrior = draw(warriorRules, { classId: 'warrior', founderClassId: null });
expectColumn(warrior.graph, warrior.out, 3, 'crossroads', 'fall');

const contest = config();
contest.design.bookends.founding = { enabled: true, depth: 4, priority: 0 };
contest.design.columns = [column('pref', 4, 'development', 'scholar', 'firstLife'), column('fall', 4, 'crossroads')];
const foundingFirst = draw(contest, { classId: 'scholar', founderClassId: 'scholar' }, 29);
expectColumn(foundingFirst.graph, foundingFirst.out, 3, 'philosopherFounding', null);
contest.design.bookends.founding.priority = 1;
const warriorFounding = draw(contest, { classId: 'warrior', founderClassId: 'warrior' }, 29);
expectColumn(warriorFounding.graph, warriorFounding.out, 3, 'warlordFounding', null);
const ruleBeatsFounding = draw(contest, { classId: 'scholar', founderClassId: 'scholar' }, 29);
expectColumn(ruleBeatsFounding.graph, ruleBeatsFounding.out, 3, 'development', 'pref');
assert.ok(!ruleBeatsFounding.graph.nodes.some(node => CLASS_ONLY[node.family]), 'a rule that beats Founding never establishes a class');

const interior = config();
interior.design.bookends.legacy = { enabled: true, depth: 6 };
interior.design.columns = [column('steady', 2, 'patronage'), column('late', 7, 'relic')];
for (const classId of ['scholar', 'warrior']) {
  const graph = draw(interior, { classId, founderClassId: classId }, 29);
  assert.equal(graph.graph.foundingNodeId ?? null, null);
  assert.ok(!graph.graph.nodes.some(node => CLASS_ONLY[node.family]), 'disabled Founding does not establish a class');
  expectColumn(graph.graph, graph.out, 5, 'legacy', null);
  assert.ok(graph.out.get(graph.graph.bossNodeId).length > 0, 'interior Legacy continues');
}

const shops = config();
for (const id of ['practiceReform', 'neutralMarket', 'classMarket', 'foodShop', 'housingShop', 'stockShop']) shops.design.nodes[id].enabled = false;
shops.design.columns = [column('thin', 3, 'shops', 'common', 'any', 'pool')];
const thin = draw(shops, { classId: null, founderClassId: null });
expectColumn(thin.graph, thin.out, 2, 'publicWorks', 'thin');

const pooled = config();
pooled.design.bookends.founding = { enabled: true, depth: 4, priority: 0 };
for (const id of ['training', 'campaign', 'challenge']) pooled.design.nodes[id].enabled = false;
pooled.design.columns = [column('classcol', 6, 'class', 'common', 'any', 'pool')];
const after = draw(pooled, { classId: 'scholar', founderClassId: null });
expectColumn(after.graph, after.out, 5, 'discovery', 'classcol');
const before = structuredClone(pooled);
before.design.columns = [column('classcol', 2, 'class', 'common', 'any', 'pool')];
refused(before, { classId: 'scholar', founderClassId: 'scholar' }, 'milestoneImpossible', 'Milestone “classcol”');
refused(pooled, { classId: 'warrior', founderClassId: null }, 'milestoneImpossible', 'Milestone “classcol”');

const only = config();
only.design.nodes.crossroads.milestonesOnly = true;
only.design.columns = [column('only', 4, 'crossroads'), column('steady', 2, 'patronage')];
const milestoneOnly = draw(only, { classId: 'scholar', founderClassId: null }, 17);
assert.deepEqual(milestoneOnly.graph.nodes.filter(node => node.family === 'crossroads').map(node => node.milestoneId), ['only']);

const tight = config();
tight.design.bookends.founding = { enabled: true, depth: 4, priority: 1 };
tight.design.guarantees = [{ id: 'tight', lifeStage: 'firstLife', targetType: 'node', targetId: 'development', scope: 'common', count: 3, minDepth: 1, maxDepth: 2, coverage: 'eachRoute' }];
refused(tight, { classId: 'scholar', founderClassId: 'scholar' }, 'guaranteeImpossible', 'Guarantee “tight”');
draw(tight, { classId: 'scholar', founderClassId: null }, 29);
const earlyClass = config();
earlyClass.design.bookends.founding = { enabled: true, depth: 5, priority: 0 };
earlyClass.design.columns = [column('early-class', 2, 'discovery', 'scholar', 'firstLife')];
refused(earlyClass, { classId: 'scholar', founderClassId: 'scholar' }, 'milestoneImpossible', 'Milestone “early-class”');

const collision = config();
collision.design.bookends = { founding: { enabled: true, depth: 4, priority: 0 }, legacy: { enabled: true, depth: 4 } };
refused(collision, { classId: 'scholar', founderClassId: 'scholar' }, 'invalidConfiguration', 'Founding and Legacy cannot share a depth');
const reserved = config();
reserved.design.bookends.legacy = { enabled: true, depth: 6 };
reserved.design.columns = [column('on-legacy', 6, 'development')];
refused(reserved, { classId: 'scholar', founderClassId: null }, 'invalidConfiguration', 'Legacy reserves depth 6');
const duplicate = config();
duplicate.design.columns = [column('pref', 4, 'development'), column('pref', 6, 'relic')];
refused(duplicate, { classId: 'scholar', founderClassId: null }, 'invalidConfiguration', 'unique column ids required');
const closed = config();
closed.design.nodes.practiceReform.enabled = false;
closed.design.columns = [column('closed', 3, 'practiceReform')];
refused(closed, { classId: 'scholar', founderClassId: null }, 'milestoneImpossible', 'Milestone “closed”');
const emptyPool = config();
emptyPool.design.nodes.crisis.enabled = false;
emptyPool.design.columns = [column('empty-danger', 4, 'danger', 'common', 'any', 'pool')];
refused(emptyPool, { classId: 'warrior', founderClassId: null }, 'milestoneImpossible', 'Milestone “empty-danger”');
const earlyCrisis = config();
earlyCrisis.design.columns = [column('early-crisis', 1, 'crisis')];
refused(earlyCrisis, { classId: 'scholar', founderClassId: null }, 'milestoneImpossible', 'Milestone “early-crisis”');

console.log('[lifegraph-interactions] pairwise rule order, class/life-stage, interior Legacy, thin pools, milestone-only and exact refusals OK');
