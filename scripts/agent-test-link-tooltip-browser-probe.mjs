import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
const out='artifacts/agent-test-links/tooltip';await mkdir(out,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
try {
  const page=await browser.newPage();await page.goto(process.argv[2]??'http://localhost:5197/?dev=1');
  await page.waitForFunction(()=>!!globalThis.__AGENT_TEST_LINKS__);
  await page.evaluate(()=>__SETTLEMENT_DEBUG__.enterBootTestRun());
  const results=await page.evaluate(async()=>{
    const {createTooltipView}=await import('/src/views/tooltip-pixi.js');
    const {getGamepieceFace}=await import('/src/model/gamepiece-presentation.js');
    const {getResearchLibraryCards}=await import('/src/views/research-library-data.js');
    const {deserializeGameState}=await import('/src/model/state.js');
    const capturedState=await __AGENT_TEST_LINKS__.capture();const state=deserializeGameState(capturedState.packet.state);
    const card=getResearchLibraryCards(state).find(card=>card.kind==='practice');
    const face=getGamepieceFace(state,card.kind,card.id,card.tier);
    const layer=new PIXI.Container();const tip=createTooltipView({layer,app:{screen:{width:2424,height:1080}}});
    const specs=[
      {name:'plain hover',spec:{title:'Hover',lines:['Read me']},pinned:false},
      {name:'card hover',spec:{title:face.label,face,inspectionKey:'reading'},pinned:false},
      {name:'pinned inspection',spec:{title:face.label,face,inspectionKey:'reading'},pinned:true},
      {name:'quick pinned reading',spec:{title:face.label,face,inspectionKey:'reading'},pinned:true,quick:true},
      {name:'graph anchor',spec:{title:'Graph',lines:['Read me']},pinned:false,graph:true},
    ];
    const results=[];
    for(const item of specs){
      tip.hide({force:true});const anchor={x:900,y:420,width:100,height:80,offsetX:5,offsetY:3,coordinateSpace:'screen'};
      if(item.graph){anchor.aboveRect={x:0,y:700,width:2424,height:380};anchor.belowRect={x:0,y:0,width:2424,height:100};}
      if(item.pinned)tip.pin(item.spec,anchor,'reading',{quick:item.quick});else tip.show(item.spec,anchor,{dismissOnExit:true});
      const before=tip.getDebugState();const captured=JSON.parse(JSON.stringify(tip.capturePanelState()));
      tip.restorePanelState(captured);const after=tip.getDebugState();
      const recaptured=tip.capturePanelState();tip.hide();await new Promise(resolve=>setTimeout(resolve,0));
      results.push({name:item.name,pinned:item.pinned,before:{pinned:before.pinned,width:before.width,height:before.height,x:before.x,y:before.y},
        after:{pinned:after.pinned,width:after.width,height:after.height,x:after.x,y:after.y},captured,recaptured,visibleAfterHide:tip.isVisible()});
    }
    return results;
  });
  for(const item of results){
    assert.deepEqual(item.after,item.before,item.name);
    for(const field of ['anchor','pinned','dismissOnExit','quick','scroll','glossaryScroll','reference'])assert.deepEqual(item.recaptured[field],item.captured[field],`${item.name}: ${field}`);
    assert.equal(item.visibleAfterHide,item.pinned,item.name);
  }
  await writeFile(`${out}/checks.json`,JSON.stringify({ok:true,cases:results.map(item=>item.name)},null,2));
  console.log(JSON.stringify({ok:true,cases:results.length,artifacts:out}));
}finally{await browser.close();}
