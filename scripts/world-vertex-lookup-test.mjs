// The cached vertex lookup must be indistinguishable from the original linear
// scan: same objects, same order, same results for unknown or odd ids, and it
// must stay correct for cloned, frozen and in-place edited definitions.
import assert from 'node:assert/strict';
import { getRegionalMap, regionalMapId } from '../src/model/regional-map/definition.js';
import { worldMapDefs } from '../src/defs/world/world-map-defs.js';
import { getRegionPolygon, getWorldVertex } from '../src/model/world-state.js';

const linearVertex = (definition, vertexId) => definition?.geometry?.vertices?.find(entry => entry?.id === vertexId) ?? null;
const linearPolygon = (definition, regionOrId) => {
  const region = typeof regionOrId === 'string' ? definition?.regions?.find(entry => entry?.id === regionOrId) : regionOrId;
  if (!region) return [];
  return region.polygonVertexIds.map(id => linearVertex(definition, id)).filter(Boolean);
};

function assertSame(definition, label) {
  const vertices = definition.geometry.vertices;
  for (const vertex of vertices) assert.equal(getWorldVertex(definition, vertex.id), linearVertex(definition, vertex.id), `${label} vertex ${vertex.id}`);
  for (const id of ['', 'missing', 'regional-v1:1', '0,0', undefined, null, 7, NaN, {}, []]) {
    assert.equal(getWorldVertex(definition, id), linearVertex(definition, id), `${label} odd id ${String(id)}`);
  }
  for (const region of definition.regions) {
    const expected = linearPolygon(definition, region);
    for (const actual of [getRegionPolygon(definition, region), getRegionPolygon(definition, region.id)]) {
      assert.equal(actual.length, expected.length, `${label} ${region.id} length`);
      actual.forEach((point, i) => assert.equal(point, expected[i], `${label} ${region.id} point ${i}`));
    }
  }
  assert.deepEqual(getRegionPolygon(definition, 'no-such-region'), []);
  assert.deepEqual(getRegionPolygon(definition, null), []);
}

let checked = 0;
for (const seed of [1, 7, 1867, 20260101, 4294967295]) {
  const { definition } = getRegionalMap(regionalMapId(seed));
  const before = JSON.stringify(definition);
  assertSame(definition, `seed ${seed}`);
  assert.equal(JSON.stringify(definition), before, 'lookups must not add anything to the serialisable definition');
  assert.deepEqual(Object.keys(definition), Object.keys(JSON.parse(before)));
  assert.deepEqual(Object.keys(definition.geometry), ['vertices']);
  checked += definition.geometry.vertices.length;

  // A clone is a different definition; it must index its own vertices.
  const clone = structuredClone(definition);
  assertSame(clone, `clone ${seed}`);
  assert.notEqual(getWorldVertex(clone, clone.geometry.vertices[0].id), definition.geometry.vertices[0]);

  // Deep-frozen definitions (caches cannot be stored on them) behave the same.
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
  assertSame(freeze(structuredClone(definition)), `frozen ${seed}`);
}

for (const [id, definition] of Object.entries(worldMapDefs)) assertSame(definition, `authored ${id}`);

// Edits in place: appended, replaced, renamed and re-created vertex lists.
{
  const definition = structuredClone(getRegionalMap(regionalMapId(1867)).definition);
  const vertices = definition.geometry.vertices;
  assertSame(definition, 'before edit');
  vertices.push({ id: 'late', x: 1, y: 2 });
  assert.equal(getWorldVertex(definition, 'late'), vertices.at(-1));
  assertSame(definition, 'after push');
  const replacement = { id: vertices[3].id, x: -1, y: -1 };
  vertices[3] = replacement;
  assert.equal(getWorldVertex(definition, replacement.id), replacement);
  assertSame(definition, 'after same-length replacement');
  const oldId = vertices[5].id;
  vertices[5].id = 'renamed';
  assert.equal(getWorldVertex(definition, oldId), null);
  assert.equal(getWorldVertex(definition, 'renamed'), vertices[5]);
  assertSame(definition, 'after rename');
  vertices[6].x += 10;
  assert.equal(getWorldVertex(definition, vertices[6].id).x, vertices[6].x);
  vertices.length = 4;
  assertSame(definition, 'after truncate');
  definition.geometry.vertices = [{ id: 'only', x: 0, y: 0 }];
  assert.equal(getWorldVertex(definition, vertices[0].id), null);
  assert.equal(getWorldVertex(definition, 'only'), definition.geometry.vertices[0]);
  definition.geometry = undefined;
  assert.equal(getWorldVertex(definition, 'only'), null);
}

// First occurrence wins for duplicate ids, and holes or null entries are ignored.
{
  const first = { id: 'a', x: 1, y: 1 };
  const definition = { geometry: { vertices: [null, first, { id: 'a', x: 2, y: 2 }, undefined, { id: 'b', x: 3, y: 3 }] }, regions: [{ id: 'r', polygonVertexIds: ['a', 'b', 'zz'] }] };
  assert.equal(getWorldVertex(definition, 'a'), first);
  assert.deepEqual(getRegionPolygon(definition, 'r'), [first, definition.geometry.vertices[4]]);
  for (const bad of [null, undefined, {}, { geometry: {} }, { geometry: { vertices: null } }, { geometry: { vertices: 'abc' } }]) assert.equal(getWorldVertex(bad, 'a'), null);
}

console.log(`world vertex lookup ok (${checked} regional vertices compared across 5 seeds, plus clones, frozen and edited definitions)`);
