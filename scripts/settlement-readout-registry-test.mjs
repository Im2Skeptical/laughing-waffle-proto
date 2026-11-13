import assert from 'node:assert/strict';
import {createRegionalReadoutRegistry} from '../src/views/world-map/regional-readout-prototype.js';

function root(regionId,fitZoom){
 const calls=[];
 return {mapRegionId:regionId,progressiveReadout:true,expandedFitZoom:fitZoom,calls,
  expandedFitsAtZoom:()=>true,
  updateFloatingLayout:(zoom,disclosure)=>calls.push({zoom,...disclosure}),
  measureFloating:()=>({regionId,last:calls.at(-1)})};
}
const main=createRegionalReadoutRegistry(),decision=createRegionalReadoutRegistry();
const selected=root('town',2.1),neighbour=root('neighbour',1.8),otherWorld=root('town',Infinity);
main.add(selected);main.add(neighbour);decision.add(otherWorld);
main.updateRegionalReadoutScale(1.5,'town');
assert.equal(selected.calls.at(-1).selectedRegionId,'town');
assert.equal(neighbour.calls.at(-1).expanded,false);
const before=main.getFloatingReadoutMeasurements();
decision.updateRegionalReadoutScale(2.5,null);
assert.deepEqual(main.getFloatingReadoutMeasurements(),before,'Another map cannot change this map camera, selection or disclosure');
assert.equal(otherWorld.calls.at(-1).expanded,false);
assert.equal(main.getFloatingReadoutMeasurements().length,2);
assert.equal(decision.getFloatingReadoutMeasurements().length,1,'Registries cannot expose each other\'s readouts');
main.updateRegionalReadoutScale(2.2,null);
assert.equal(selected.calls.at(-1).expanded,true,'Another world\'s impossible fit cannot constrain this map');
assert.equal(otherWorld.calls.length,1,'Updates only reach their owning map');
neighbour.destroyed=true;main.updateRegionalReadoutScale(2.2,null);
assert.equal(main.getFloatingReadoutMeasurements().length,1,'Destroyed roots leave their registry');
console.log('Readout registries: independent cameras, selection, thresholds, measurements and disposal across map instances passed.');
