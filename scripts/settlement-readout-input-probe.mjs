import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';

const output='artifacts/combined-settlement-readouts';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS),errors=[],reports=[];
try{
 const page=await browser.newPage({viewport:{width:1000,height:650},hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.PROBE_URL??'http://localhost:5184/')+'build-info.json');
 await page.addScriptTag({url:'https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js'});
 await page.evaluate(async()=>{
  const {addFloatingSettlementPrototype}=await import('/src/views/world-map/floating-settlement-prototype.js');
  document.body.innerHTML='';document.body.style.margin='0';
  const app=new PIXI.Application({width:1000,height:650,backgroundColor:0x21352e});document.body.appendChild(app.view);
  globalThis.__fixture={app,addFloatingSettlementPrototype,last:null,root:null};
 });
 for(const state of ['capital','player','unheld','unrest'])for(const zoom of [.5,2]){
  const variant='progressive';
  const result=await page.evaluate(({variant,state,zoom})=>{
   const f=__fixture;f.root?.destroy({children:true});f.app.stage.removeChildren();
   // Exercise the normal default without a prototype query parameter.
   const held=state==='capital'||state==='player',holder=held?(state==='capital'?'external-a':'player'):null;
   const total=state==='player'?999:120,loyal=held?Math.round(total*.9):0;
   const parts=[{id:'player',name:'Free',count:holder==='player'?loyal:0,colour:0xe4c271},{id:'external-a',name:'Crown',count:holder==='external-a'?loyal:0,colour:0xc17a57},{id:'neutral',name:'Unaffiliated',count:total-loyal,colour:0x8e9c91}];
   const indicator={regionId:'fixture',controller:holder,crownCapital:state==='capital',totalWorkerCount:state==='player'?123:9,activeWorkerCount:8,unusedWorkerCount:1,prestigePerNode:999,prestigePopulationPerPoint:20,
    influence:{holder,total,parts,minimumLoyal:held?30:null,minimumShare:held?(zoom===.5?.05:.95):null,force:held?20:0,required:held?4:null,status:held?'supported':'unheld',warriors:16,warriorForce:16,bonusForce:4,unrest:state==='unrest'?{remainingYears:7.8,chaosPerYear:1}:null}};
   f.indicator=indicator;
   const parent=new PIXI.Container();parent.position.set(500,260);parent.scale.set(zoom);f.app.stage.addChild(parent);
   const tooltipView={show(){},hide(){},pin(spec,anchor,key){f.last={title:spec.title,key};}};
   f.root=f.addFloatingSettlementPrototype(parent,{x:0,y:0},indicator,{reference:'Fixture',tooltipView,spriteBounds:{min:{x:-25,y:-40},max:{x:25,y:0}}});
   f.root.updateFloatingLayout(zoom,{expanded:zoom>1});f.app.renderer.render(f.app.stage);
   return f.root.measureFloating();
  },{variant,state,zoom});
  assert(Math.abs(result.screenScale-.756)<1e-7,'Fixed screen scale survives zoom');
  assert.equal(!!result.crown,state==='capital');
  const compact=result.disclosure?.mode==='compact';
  if(state==='capital'&&!compact)assert(Math.abs(result.crown.x+result.crown.width/2-result.shieldAnchor.x)<.2);
  if(compact){assert.equal(result.bar,null);assert.equal(!!result.prestige,state==='player','Minimized player towns retain active Prestige; potential stays hidden');assert(result.badge.y>result.sprite.y+result.sprite.height,'Compact worker/income badge clears the landmark');}
  if(state==='unrest')assert.equal(result.unrestLabel,'Unrest 8y');
  if(state==='unheld')assert.equal(result.shownForce,null);
  const mid=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
  for(const [point,expected] of [[mid(result.countBounds),'floating-count:fixture'],...(result.prestige?[[mid(result.prestige),'floating-prestige:fixture']]:[]),...(!compact?[[result.shieldAnchor,'floating-influence:fixture']]:[]),...(result.crown?[[mid(result.crown),'crown-capital']]:[])]){
   await page.evaluate(()=>{__fixture.last=null;});await page.touchscreen.tap(point.x,point.y);
   const actual=await page.evaluate(()=>__fixture.last);assert.equal(actual?.key,expected,`${variant}/${state}/${zoom}: actual Pixi touch inspection`);
  }
  reports.push({variant,state,zoom,layout:result.layoutVariant,scale:result.screenScale});
 }
 const shared=await page.evaluate(async()=>{
  const {addRegionalReadoutPrototype,createRegionalReadoutRegistry}=await import('/src/views/world-map/regional-readout-prototype.js');
  const registry=createRegionalReadoutRegistry();
  const f=__fixture;f.root.destroy({children:true});f.app.stage.removeChildren();
  const roots=[500,60].map((bottom,i)=>addRegionalReadoutPrototype(f.app.stage,{x:0,y:0},{...f.indicator,regionId:'shared-'+i},{variant:'floating',registry,reference:'Shared',spriteBounds:{min:{x:-25,y:-40},max:{x:25,y:0}},regionPolygon:[{x:-200,y:-200},{x:200,y:-200},{x:200,y:bottom},{x:-200,y:bottom}]}));
  roots[1].visible=false; // Offscreen/hidden regions still set the common fit.
  const modes=(z,selected=null)=>{registry.updateRegionalReadoutScale(z,selected);return registry.getFloatingReadoutMeasurements().map(r=>r.disclosure.mode);};
  const compact=modes(1),expanded=modes(2.5);
  roots[1].expandedFitsAtZoom=()=>false;const unsafe=modes(2.5);
  const selected=modes(.5,'shared-1'),selectedDoesNotBlockOthers=modes(1.5,'shared-1');
  const switched=modes(.5,'shared-0'),deselected=modes(.5);
  const modal=createRegionalReadoutRegistry();
  const modalRoot=addRegionalReadoutPrototype(f.app.stage,{x:0,y:0},{...f.indicator,regionId:'shared-0'},{variant:'floating',registry:modal,reference:'Modal',spriteBounds:{min:{x:-25,y:-40},max:{x:25,y:0}},regionPolygon:[{x:-200,y:-200},{x:200,y:-200},{x:200,y:500},{x:-200,y:500}]});
  modes(.5,'shared-0');const before=JSON.stringify(registry.getFloatingReadoutMeasurements());
  modalRoot.expandedFitZoom=Infinity;modal.updateRegionalReadoutScale(2.5,null);
  const isolated=before===JSON.stringify(registry.getFloatingReadoutMeasurements())&&modal.getFloatingReadoutMeasurements().length===1&&registry.getFloatingReadoutMeasurements().length===2;
  return {compact,expanded,unsafe,selected,selectedDoesNotBlockOthers,switched,deselected,isolated};
 });
 assert.deepEqual(shared,{compact:['compact','compact'],expanded:['expanded','expanded'],unsafe:['compact','compact'],selected:['compact','expanded'],selectedDoesNotBlockOthers:['expanded','expanded'],switched:['expanded','compact'],deselected:['compact','compact'],isolated:true},'Selection forces only its crest; other regions retain shared zoom and fit logic, including after switching/deselecting');
 assert.deepEqual(errors,[]);writeFileSync(output+'/input-report.json',JSON.stringify({errors,reports},null,2));
 console.log('Settlement readout input: 8 capital/player/unheld/Unrest cases; real Pixi touch, Crown, offscreen/unsafe-fit gating, selected override, switching and deselection passed.');
}finally{await browser.close();}
