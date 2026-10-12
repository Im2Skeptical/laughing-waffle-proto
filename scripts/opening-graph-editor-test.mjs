import assert from 'node:assert/strict';
import { createOpeningExperiment, validateOpeningExperiment } from '../images/dark-fantasy/life-map-opening-prototype/experiment.js';
import { newOpeningNode, insertOpeningNode, moveOpeningNode, moveOpeningNodeOnConnection, removeOpeningNode, setOpeningConnection, layoutOpeningDraft } from '../images/dark-fantasy/life-map-opening-prototype/graph-edit.js';
import { createOpeningController } from '../images/dark-fantasy/life-map-opening-prototype/controller.js';
import { serializeGameState } from '../src/model/state.js';

const original = createOpeningExperiment(), next = (doc, id) => doc.nodes.find(n => n.id === id).next;
let doc = moveOpeningNode(original, 'development', 'founding');
validateOpeningExperiment(doc);
assert.deepEqual(next(doc, 'relic'), ['development']); assert.deepEqual(next(doc, 'explore'), ['development']);
assert.deepEqual(next(doc, 'development'), ['founding']); assert.deepEqual(next(doc, 'shop'), ['martial']);
doc = moveOpeningNode(doc, 'shop', 'founding'); validateOpeningExperiment(doc);
assert.deepEqual(next(doc, 'development'), ['shop']); assert.deepEqual(next(doc, 'shop'), ['founding']); assert.deepEqual(next(doc, 'founding'), ['martial']);
assert.deepEqual(original, createOpeningExperiment(), 'moves do not mutate their input');

const added = newOpeningNode(doc, 'patronage');
let branched = insertOpeningNode(doc, added, { from: 'relic', to: 'development' }); validateOpeningExperiment(branched);
assert.deepEqual(next(branched, 'relic'), [added.id]); assert.deepEqual(next(branched, 'explore'), ['development']);
assert.deepEqual(removeOpeningNode(branched, added.id), doc, 'removing inserted nodes restores that route');
const copy = newOpeningNode(doc, 'development', 'development');
branched = insertOpeningNode(doc, copy, { id: 'development' }); validateOpeningExperiment(branched);
assert.deepEqual(branched.nodes.find(n => n.id === copy.id).options, doc.nodes.find(n => n.id === 'development').options);
assert.deepEqual(next(branched, copy.id), ['shop']);
const entryMove = moveOpeningNode(original, 'relic', 'favor', 'after'); validateOpeningExperiment(entryMove);
assert.ok(!entryMove.entryIds.includes('relic')); assert.deepEqual(next(entryMove, 'favor'), ['relic']);
const routeMove = moveOpeningNodeOnConnection(original, 'development', 'relic', 'founding'); validateOpeningExperiment(routeMove);
assert.deepEqual(next(routeMove, 'relic'), ['development']); assert.deepEqual(next(routeMove, 'explore'), ['founding']);
assert.throws(() => removeOpeningNode(doc, 'founding'), /founding node/);
assert.throws(() => moveOpeningNode(doc, 'development', 'development'), /different destination/);
const cycle = setOpeningConnection(doc, 'founding', 'development', true);
assert.throws(() => validateOpeningExperiment(cycle), /cycle/);
assert.ok(Object.values(layoutOpeningDraft(cycle).points).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'invalid cyclic drafts can still be drawn');

const memory = new Map(), controller = createOpeningController({ getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) });
const before = JSON.stringify(serializeGameState(controller.getSnapshot().session.state));
const broken = setOpeningConnection(original, 'shop', 'development', false);
controller.editDraft(broken); assert.match(controller.getSnapshot().draftIssue, /reachable/);
assert.throws(() => controller.restart(), /reachable/); assert.throws(() => controller.save(), /reachable/);
assert.equal(memory.size, 0); assert.equal(JSON.stringify(serializeGameState(controller.getSnapshot().session.state)), before);
controller.undoDraft(); assert.deepEqual(controller.getSnapshot().draft, original);
controller.redoDraft(); assert.deepEqual(controller.getSnapshot().draft, broken);
controller.editDraft(doc); controller.save(); controller.restart();
assert.deepEqual(controller.getSnapshot().session.experiment, doc);
assert.deepEqual(createOpeningController({ getItem: key => memory.get(key) }).getSnapshot().draft, doc);

// Both requested pre-founding encounters run through real rules, not just graph layout.
controller.enter('explore'); await controller.commit('guides');
controller.enter('development'); await controller.commit('drill');
assert.equal(controller.getSnapshot().session.founded, false);
controller.enter('shop');
const offer = controller.getSnapshot().decision.offers.find(o => o.canStage);
assert.ok(offer, 'a common Practice can be purchased before founding'); controller.stage(offer.offerId); await controller.commit();
const snap = controller.getSnapshot(); if (snap.development) controller.develop(snap.development.offeredStatIds[0]);
controller.enter('founding'); await controller.commit(controller.getSnapshot().decision.options[0].id);
assert.equal(controller.getSnapshot().session.founded, true);
console.log('[opening-graph-editor] OK: branch-preserving moves, insertion/removal, duplication, cycle rendering, draft undo/save isolation and pre-founding Development/shop play');
