import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspectAtlasUploads,assertArtworkPublication} from './artwork-oracles.mjs';
const owned={},foreign={};let lost=false,canvasAvailable=true;
const base={valid:true,_glTextures:{current:{texture:owned}}};
const sheet={textures:{a:{valid:true,baseTexture:base},b:{valid:true,baseTexture:base}}};
const gl={isContextLost:()=>lost,isTexture:value=>value===owned};
const context=vm.createContext({
  document:{querySelector:()=>canvasAvailable?{getContext:()=>gl}:null},
  PIXI:{Assets:{cache:{get:()=>sheet}}},
});
const read=()=>JSON.parse(JSON.stringify(vm.runInContext(`(${inspectAtlasUploads.toString()})(['control.json'])`,context)))[0];
assert.equal(read().uploaded,true);
assert.equal(read().baseTextures,1,'frames share their base context check');
base._glTextures={old:{texture:foreign}};
assert.equal(read().uploaded,false,'a populated foreign-context dictionary is not current upload proof');
base._glTextures={current:{texture:owned}};lost=true;
assert.equal(read().uploaded,false,'lost context is not usable');lost=false;
canvasAvailable=false;assert.equal(read().uploaded,false,'no current context cannot silently pass');canvasAvailable=true;
sheet.textures.a.valid=false;assert.equal(read().uploaded,false);sheet.textures.a.valid=true;
const result=read();result.uploaded=false;assert.equal(read().uploaded,true,'returned primitive data cannot mutate the oracle source');
sheet.linkedSheets=[{textures:{linked:{valid:true,baseTexture:{valid:true,_glTextures:{old:{texture:foreign}}}}}}];
assert.equal(read().uploaded,false,'a foreign or missing linked-sheet base cannot be hidden by a valid root sheet');
sheet.linkedSheets[0].linkedSheets=[sheet];assert.equal(read().sheets,2,'linked-sheet cycles do not loop or duplicate frames');
delete sheet.linkedSheets;
console.log('[artwork-oracles] current/foreign/missing/lost context, invalid frames and copied-output controls passed (semantic fixtures)');

const required=[{id:'terrain',prefix:'terrain/',textureCount:2},{id:'card',prefix:'card/',textureCount:1}];
const hidden={version:2,sealReady:true,map:{artReady:false,artPrepared:true},life:{decisionArtReady:false,decisionArtPrepared:true},
  artwork:{version:1,revision:5,groups:required.map(g=>({...g,validTextureCount:g.textureCount,hidden:true,loaded:true,failed:false,
    drawingAvailable:false,drawingAvailableCount:0,sampleFile:g.prefix+'sample.png',sampleDrawingAvailable:false}))}};
assert.equal(assertArtworkPublication(hidden,required,{prepared:true}).groups,2);
const early=structuredClone(hidden);Object.assign(early.artwork.groups[1],{hidden:false,drawingAvailable:true,drawingAvailableCount:1,sampleDrawingAvailable:true});
assert.throws(()=>assertArtworkPublication(early,required,{prepared:true}),/premature.*card/,'card publication fails even while both terrain flags stay false');
const missing=structuredClone(hidden);missing.artwork.groups.pop();assert.throws(()=>assertArtworkPublication(missing,required,{prepared:true}),/inventory/);
const incomplete=structuredClone(hidden);incomplete.artwork.groups[0].validTextureCount=1;
assert.throws(()=>assertArtworkPublication(incomplete,required,{prepared:true}),/missing\/invalid/);
const unknown=structuredClone(hidden);unknown.artwork.groups[0].drawingAvailable=null;
assert.throws(()=>assertArtworkPublication(unknown,required),/unknown/);
const shown=structuredClone(hidden);shown.sealReady=false;shown.map.artReady=shown.life.decisionArtReady=true;
for(const group of shown.artwork.groups)Object.assign(group,{hidden:false,drawingAvailable:true,drawingAvailableCount:group.textureCount,sampleDrawingAvailable:true});
assert.equal(assertArtworkPublication(shown,required,{revealed:true}).revealed,true);
assert.throws(()=>assertArtworkPublication(shown,required,{prepared:true}),/premature/);
const badIdentity=structuredClone(hidden);badIdentity.artwork.groups[1].id='terrain';
assert.throws(()=>assertArtworkPublication(badIdentity,required),/duplicate/);
console.log('[artwork-publication] endpoint controls cover non-terrain early publication, missing/invalid/unknown groups and full explicit reveal; actual-product mutation still required');
