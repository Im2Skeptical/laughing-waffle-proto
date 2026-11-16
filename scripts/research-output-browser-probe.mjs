import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';

const base=new URL(process.argv[2]??'http://localhost:5214/').origin+'/';
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const errors=[];mkdirSync('artifacts',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:960,height:540},hasTouch:true});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(base,route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script></body></html>'}));
 await page.goto(base);await page.waitForFunction(()=>!!globalThis.PIXI);
 const checks=await page.evaluate(async()=>{
  const {preloadChronicleArt}=await import('/src/views/chronicle-art.js');
  const {addSettlementPiece}=await import('/src/views/settlement-piece-pixi.js');
  const {getGamepieceFace}=await import('/src/model/gamepiece-presentation.js');
  const {createNewGameState}=await import('/src/model/new-game.js');
  const {getDetailedSettlementViewModel}=await import('/src/model/detailed-settlements.js');
  await preloadChronicleArt({includeSettlementPieces:true});
  const app=new PIXI.Application({width:960,height:540,backgroundColor:0x101713});document.body.append(app.view);
  const ids=['observation','fieldStudy','scholarship','teaching','experimentation','anatomicalStudy','heresiography','doomsdayChronicle','surveying','monsterHunting'];
  const state=createNewGameState(735),local=state.world.sites.find(s=>s.regionId===state.civilization.capitalRegionId).detailedState;
  const original=JSON.stringify(state),catalogue=[];
  for(const [i,id] of ids.entries()){
   const x=10+(i%5)*190,y=40+Math.floor(i/5)*260,face=getGamepieceFace(null,'practice',id);
   const title=new PIXI.Text(face.label,{fontFamily:'Georgia',fontSize:15,fill:0xf5e2ad});title.position.set(x,y-28);app.stage.addChild(title);
   const card=addSettlementPiece(app.stage,{x,y,width:146,height:204},{face,reducedMotion:true});
   catalogue.push({id,sections:card.faceSections,hitTop:card.hitArea.y});
  }
  const unchanged=JSON.stringify(state)===original;
  local.practiceSlots=ids.slice(5).map((practiceId,i)=>({practiceId,instanceId:900+i,tier:'silver',stock:0,charge:1}));
  const live=getDetailedSettlementViewModel(state,state.civilization.capitalRegionId).practices.filter(Boolean).map(p=>{
   const root=addSettlementPiece(new PIXI.Container(),{x:0,y:0,width:170,height:238},{face:p.face,reducedMotion:true});
   return {id:p.practiceId,sections:root.faceSections};
  });
  const face=getGamepieceFace(null,'practice','observation');
  const render=(face,options={})=>{
   const root=addSettlementPiece(new PIXI.Container(),{x:0,y:0,width:170,height:238},{face,...options});
   return {sections:root.faceSections,feedback:root.practiceFeedback};
  };
  const seasonal=render({...face,production:[{icon:'research',season:'spring',value:1},{icon:'research',season:'winter',value:2}]}).sections;
  const mixed=render({...face,stockCapacity:4,stockTraits:['Record'],production:[{icon:'stock',value:1},{icon:'research',value:2}]}).sections;
  const influence=render(getGamepieceFace(null,'practice','fm_publicDisputation')).sections;
  const pulse=render({...face,activationAge:0},{reducedMotion:true}).feedback;
  return {catalogue,live,unchanged,seasonal,mixed,influence,pulse};
 });
 writeFileSync('artifacts/research-output-browser.json',JSON.stringify({checks,errors},null,2));
 for(const item of [...checks.catalogue,...checks.live]){
  const research=!['surveying','monsterHunting'].includes(item.id);
  assert.equal(!!item.sections.research,research,item.id);
  if(research){assert.equal(item.sections.research.x+item.sections.research.width,170,item.id+' top right');assert.equal(item.sections.research.y,-8);}
 }
 for(const item of checks.catalogue.filter(item=>!['teaching','experimentation','surveying','monsterHunting'].includes(item.id))){
  assert.equal(item.sections.yields,null,item.id+' Research is shown once');assert.ok(item.hitTop<=-8);
 }
 assert.equal(checks.catalogue.find(c=>c.id==='teaching').sections.yields.height,31,'training remains below');
 assert.equal(checks.catalogue.find(c=>c.id==='experimentation').sections.yields.height,31,'quality benefit remains below');
 assert.equal(checks.catalogue.find(c=>c.id==='fieldStudy').sections.charge.width,170,'Charge uses freed recipe width');
 assert.equal(checks.seasonal.research.height,84,'season-specific Research remains distinct');
 assert.ok(!checks.mixed.research&&checks.mixed.stock&&checks.mixed.yields.height===58,'captured mixed recipes remain truthful');
 assert.ok(checks.influence.research.y>=checks.influence.stock.y+checks.influence.stock.height,'allegiance stays visible');
 assert.equal(checks.pulse.kind,'producing');assert.ok(checks.unchanged);assert.deepEqual(errors,[]);
 await page.screenshot({path:'artifacts/research-card-roles-phone.png'});
 console.log('[research-output-browser] catalogue/live Research placement, secondary effects, seasonal/captured mixed recipes and feedback OK');
}finally{await browser.close();}
