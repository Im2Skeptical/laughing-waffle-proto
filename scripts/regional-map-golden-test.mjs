// Pins the geometry of generator revision 1. A saved world is only its id, and the
// id re-derives polygons, biomes and connections on load, so a generator edit that
// changes any of this silently rewrites existing saves. If this test fails, do not
// update the hashes: add a new revision to GENERATORS in
// src/model/regional-map/definition.js (keeping revision 1's code for old saves),
// make new games use it, and pin it here.
//
// The hashes were taken from the generator as it was before revisions existed
// (main at 244399f), so they also prove that adding the revision changed nothing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getRegionalMap, regionalMapId, regionalMapSeed, CURRENT_GENERATOR_REVISION } from '../src/model/regional-map/definition.js';
import { getWorldDefinitionById } from '../src/model/world-definitions.js';

// Coordinates are rounded to 1e-7 before hashing so a last-bit difference in an
// engine's Math.sin/cos/atan2 cannot flake this test; real geometry changes are far larger.
const round = value => typeof value === 'number' ? Math.round(value * 1e7) / 1e7 : value;
const sha = value => createHash('sha256').update(JSON.stringify(value, (key, entry) => round(entry))).digest('hex');

function fingerprint(id) {
  const { map, definition } = getRegionalMap(id);
  return {
    regions: definition.regions.length, vertices: definition.geometry.vertices.length,
    definition: sha(definition),
    map: sha({
      regions: map.regions.map(region => ({ id: region.id, biome: region.biome, terrainBiome: region.terrainBiome,
        outline: region.outline, centre: region.centre, neighbours: region.neighbours })),
      edges: map.edges,
    }),
  };
}

const REVISION_1 = {
    1: { regions: 20, vertices: 2934,
      definition: '08c1b67122e560194bcc70214ac23db0f62a3c0fb5dea1026709354b3ed13802',
      map: '729c53c23153e6e29fdfc05f798419166053ca875f50d3770564d4ff43c3cd5e' },
    1867: { regions: 20, vertices: 2960,
      definition: '11f78792de2156a38090bba82e246135d2ef27b555a763d5a3287a0dc47465ba',
      map: '854f4ea022f8f2337d4c22c444181395318c0acc64027a48ce5bb84c74d10fd1' },
    2468: { regions: 20, vertices: 2929,
      definition: 'c41be823610c0b66e903f01169fcbc0d598e49efd0a318a23df79d6789553b58',
      map: '7772be1fc2e5f78c9418585929b67470979e8f12b4e11b96989d47ad7edc1ada' },
    90210: { regions: 20, vertices: 2914,
      definition: 'b5304f10fa064e81fa951f6038752111710c2a78c449562c097d69df9c962986',
      map: 'eb3abe239f95782741560ab50e165a180957dc294bf7526c7245e0b81083ece4' },
    4294967295: { regions: 20, vertices: 3029,
      definition: '5ab1866c99fd27fe4ff89425200cd7645dc692a06777d2f0529ab9959272da02',
      map: 'b179138e7cf47a332e2f32d6ad9dca27db4c1a6b0f790cff162ebd6ae638cdcd' },
};

assert.equal(CURRENT_GENERATOR_REVISION, 1, 'a new revision needs its own pinned hashes in this test');
for (const [seed, expected] of Object.entries(REVISION_1)) {
  const id = `regional-v1:${seed}`;
  assert.equal(regionalMapId(seed), id, 'new games keep the revision-1 id');
  assert.deepEqual(fingerprint(id), expected, `revision 1 geometry for seed ${seed} changed; add a new generator revision instead of editing revision 1`);
  assert.equal(getWorldDefinitionById(id).id, id);
}

// Old saves hold the literal id string, so every id they can contain keeps resolving.
assert.equal(regionalMapSeed('regional-v1:1867'), 1867);
assert.equal(regionalMapSeed('regional-v1:4294967295'), 4294967295);
assert.equal(getRegionalMap('regional-v1:1867').definition.id, 'regional-v1:1867');
assert.equal(getRegionalMap('regional-v1:1867'), getRegionalMap(regionalMapId(1867)), 'one cached record per id');
// Ids from a generator this build does not have must not fall back to another generator's geometry.
for (const unknown of ['regional-v2:1867', 'regional-v0:1867', 'regional-v01:1867', 'regional-v1:4294967296', 'regional-v1:', 'regional-v1:-1',
  'regional-v1', 'regional:1867', 'regional-v1:1867x', '', null, undefined, 1867, {}]) {
  assert.equal(regionalMapSeed(unknown), null, `seed of ${String(unknown)}`);
  assert.equal(getRegionalMap(unknown), null, `record of ${String(unknown)}`);
}
console.log(`[regional-map-golden] revision 1 pinned for ${Object.keys(REVISION_1).length} seeds; legacy ids load; unknown revisions refused`);
