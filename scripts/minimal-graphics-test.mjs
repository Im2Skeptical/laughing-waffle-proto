import assert from 'node:assert/strict';
globalThis.location={search:'?dev=1'};
const loads=[],uploads=[];
const texture={baseTexture:{valid:true,width:16,height:16,realWidth:16,realHeight:16}};
globalThis.PIXI={
  Container:class{destroy(){this.destroyed=true;}},
  SCALE_MODES:{NEAREST:0},MIPMAP_MODES:{OFF:0},
  Assets:{async load(url){loads.push(url);return {textures:{'food.png':texture},data:{}};}},
};
const art=await import('../src/views/chronicle-art.js');
const renderer={prepare:{add(texture){uploads.push(texture);},async upload(){}}};
await art.preloadChronicleArt({includeSettlementPieces:true});
await art.prepareChronicleArt(renderer);
assert.equal(art.getResourceTexture('food'),texture);
assert.equal(art.getChronicleTexture('piece-frames-v1/practice.png'),null);
assert.equal(art.getChronicleTexture('settlement-pieces-v4/forage.png'),null);
assert.deepEqual(loads,['images/sprite-sheets/resource-language.json']);
assert.deepEqual(uploads,[texture]);
await art.prepareChronicleArt(renderer);
assert.equal(uploads.length,1,'icon uploads are reused');
const {createIllustratedTerrain}=await import('../src/views/world-map/illustrated-terrain.js');
const terrain=createIllustratedTerrain({addChild(){}},{});
assert.equal(terrain.supports({world:{definitionId:'regional-v1:123'}}),false);
assert.equal(terrain.prefetch({}),false);
await terrain.prepare({},{});terrain.update(10,1);
assert.equal(terrain.stats.bakes,0);terrain.destroy();
assert.equal(terrain.container.destroyed,true);
console.log('[minimal-graphics] OK: shared icons loaded/uploaded once; no illustrations or terrain bake');
