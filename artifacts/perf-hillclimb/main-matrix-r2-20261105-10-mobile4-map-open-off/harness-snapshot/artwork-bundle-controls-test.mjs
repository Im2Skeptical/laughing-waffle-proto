import assert from 'node:assert/strict';
import vm from 'node:vm';
import {instrumentArtworkBundle} from './artwork-bundle-controls.mjs';

// Mechanism fixture only. Actual full-game mutation/trace controls remain needed.
const source=`var packedTextures = new Map();
var hiddenGroups = /* @__PURE__ */ new Set();
var PACKED_GROUPS={chronicleHudFrames:{prefix:'hud/'}};var revision=0;
function bumpRevision(){revision++;}
function getChronicleTexture(file){return hiddenGroups.has(PACKED_GROUPS.chronicleHudFrames)?null:packedTextures.get(file);}
globalThis.fixture={packedTextures,hiddenGroups,PACKED_GROUPS};`;
const originalSetHas=Set.prototype.has;let clock=0;
const context=vm.createContext({performance:{now:()=>++clock},__HC_ART__:{publicationEvents:[]}});
const contextSetHas=vm.runInContext('Set.prototype.has',context);
const instrumented=instrumentArtworkBundle(source,{allowFault:true});
vm.runInContext(instrumented.body,context);
const {packedTextures,hiddenGroups,PACKED_GROUPS}=context.fixture,group=PACKED_GROUPS.chronicleHudFrames;
packedTextures.set('hud/test.png',{});
assert.equal(hiddenGroups.add(group),hiddenGroups);hiddenGroups.add(group);
assert.equal(context.__HC_ART__.publicationEvents.length,1,'duplicate hide is not an additional mutation');
assert.equal(hiddenGroups.delete({}),false);assert.equal(context.__HC_ART__.publicationEvents.length,1);
const published=context.__HC_ART_MUTANT__.publish();
assert.equal(published.beforeDrawing,false);assert.equal(published.afterDrawing,true);
const restored=context.__HC_ART_MUTANT__.restore();assert.ok(restored.to>published.from);
assert.deepEqual(Array.from(context.__HC_ART__.publicationEvents,e=>e.kind),['hide','publish','hide']);
hiddenGroups.clear();assert.equal(context.__HC_ART__.publicationEvents.at(-1).kind,'publish');
assert.equal(Set.prototype.has,originalSetHas,'no global prototype is patched');
assert.equal(vm.runInContext('Set.prototype.has',context),contextSetHas,'actual module-context Set prototype is unchanged');
assert.match(instrumentArtworkBundle('var hiddenGroups;\nhiddenGroups = /* @__PURE__ */ new Set();\nfunction getChronicleTexture(){}').body,
  /hiddenGroups = new HillclimbPublicationSet/,'real bundled separate declaration/assignment is supported');
assert.throws(()=>instrumentArtworkBundle(source.replace('hiddenGroups =','otherGroups =')),/one actual/);
assert.throws(()=>instrumentArtworkBundle(source+'\nvar hiddenGroups = new Set();'),/one actual/);
const plain=instrumentArtworkBundle(source,{tracePublication:false,allowFault:false});
assert.equal(plain.body,source,'reference path keeps original bytes');
assert.ok(!instrumentArtworkBundle(source).body.includes('__HC_ART_MUTANT__'),'normal observer has no fault API');
console.log('[artwork-bundle] private mutation trace, true drawing availability fault/restore, Set semantics and unchanged reference controls passed; actual-game proof pending');
