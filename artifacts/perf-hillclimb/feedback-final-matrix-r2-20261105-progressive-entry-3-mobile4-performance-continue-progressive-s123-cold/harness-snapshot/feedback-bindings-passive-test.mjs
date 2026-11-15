import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {installFeedbackBindings} from './feedback-bindings.mjs';

// Execute the actual retained Settlement accessor and thin root wiring, with
// forbidden active/model/render calls poisoned. No renderer or simulation runs.
const prototypeSource=await readFile('src/views/settlement-prototype-view.js','utf8');
const match=prototypeSource.match(/getSemanticSnapshot: (.+),\r?\n/);assert.ok(match);
const rawRoot={visible:false},semanticSnapshot={visible:false,regionId:'R18',activeTab:'overview',overview:{privateState:{rng:{seed:123}}}};
const poison=()=>{throw Error('active/render/model call under feedback getter');};
const prototypeReader=vm.runInNewContext(`(${match[1]})`,{root:rawRoot,semanticSnapshot,getState:poison,render:poison});
const rootSource=await readFile('src/views/ui-root-settlement-pixi.js','utf8');
const begin=rootSource.indexOf('    getRetainedFeedbackSnapshot: () => {');
const end=rootSource.indexOf('\n    getTimingSnapshot:',begin);assert.ok(begin>=0&&end>begin);
const expression=rootSource.slice(begin,end).trim().replace(/^getRetainedFeedbackSnapshot: /,'').replace(/,$/,'');
const cheap=()=>({getTimingSnapshot:()=>({visible:true})});
const read=vm.runInNewContext(`(${expression})`,{prototypeView:{getSemanticSnapshot:prototypeReader},
  worldMapView:cheap(),settlementGraphView:cheap(),vassalLifeMapView:cheap(),vassalNodeDecisionModalView:cheap(),
  lifeProcessingView:{isVisible:()=>false},vassalResolutionRecapView:cheap(),getState:poison,render:poison});
const untouched=JSON.stringify({rawRoot,semanticSnapshot});
for(let i=0;i<500;i++){
  const dto=read();assert.deepEqual(Object.keys(dto.settlement).sort(),['activeTab','regionId','visible']);
  assert.equal(dto.settlement.regionId,'R18');assert.equal(dto.settlement.visible,false);
  dto.settlement.regionId='corrupted-copy';dto.map.visible=false;
}
assert.equal(JSON.stringify({rawRoot,semanticSnapshot}),untouched);
rawRoot.visible=true;assert.equal(read().settlement.visible,true);

const canvas={isConnected:true,parentElement:null,hidden:false,getBoundingClientRect:()=>({left:0,top:0,right:1280,bottom:800,width:1280,height:800})};
const frame={map:{visible:true,detailVisible:false,panelPose:{x:0,y:0,scale:1}},
  settlement:{visible:false,regionId:'R18'},graph:{visible:true,scrubDrawSignature:'0|468|439|439|0:1000||civilization|468'},
  life:{visible:false},decision:{renderedVisible:false,purchaseOrder:[],observedDecisionNodeId:'n1',boardPracticeIds:['a']},recap:{open:false}};
const context=vm.createContext({document:{querySelector:()=>null,querySelectorAll:()=>[canvas]},innerWidth:1280,innerHeight:800,
  getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',overflowX:'visible',overflowY:'visible'}),
  performance:{timeOrigin:12345},__SETTLEMENT_DEBUG__:{getRetainedFeedbackSnapshot:()=>frame}});
vm.runInContext(`(${installFeedbackBindings.toString()})()`,context);
const key=b=>vm.runInContext(`__HC_READ_FEEDBACK__(${JSON.stringify(b)}).responseKey`,context);
const present=key('present');frame.graph.scrubDrawSignature='0|679|439|439|0:1000||civilization|679';
assert.equal(key('present'),present,'autonomous forecast position is not Present feedback/drift');
frame.graph.scrubDrawSignature='0|439|439|439|0:1000||civilization|-1';assert.notEqual(key('present'),present);
const panel=key('panel');frame.map.visible=false;frame.settlement.visible=true;
assert.notEqual(key('panel'),panel,'canonical retained Settlement surface, not unused panel phase');
const purchase=key('purchase');frame.decision.boardPracticeIds=['hover-only'];assert.equal(key('purchase'),purchase);
frame.decision.purchaseOrder=['recorded-offer'];assert.notEqual(key('purchase'),purchase);
console.log('[feedback-bindings] PASS: actual retained accessor/root wiring500 pure isolated reads; Present drift, Settlement surface and hover controls');
