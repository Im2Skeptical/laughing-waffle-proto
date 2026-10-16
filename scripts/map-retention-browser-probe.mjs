import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';

const url='http://127.0.0.1:18137',output='artifacts/map-retention';
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const route=new URL(req.url,url).pathname;
    if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script>');return;}
    const file=path.resolve('.'+decodeURIComponent(route));if(!file.startsWith(process.cwd()+path.sep))throw Error('Outside workspace');
    res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.webp':'image/webp','.png':'image/png'})[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(18137,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),errors=[];
try{
  const page=await browser.newPage({viewport:{width:844,height:390}});page.on('pageerror',e=>errors.push(e.message));
  const reference=process.argv.indexOf('--baseline-ref');
  if(reference>=0){
    const body=execFileSync('git',['show',`${process.argv[reference+1]}:src/views/world-map-pixi.js`],{encoding:'utf8'});
    await page.route('**/src/views/world-map-pixi.js',route=>route.fulfill({contentType:'text/javascript',body}));
  }
  await page.goto(url);await page.waitForFunction(()=>!!globalThis.PIXI);
  await page.evaluate(async()=>{
    const {createNewGameState}=await import('/src/model/new-game.js');
    const {createTimelineFromInitialState,rebuildStateAtSecond}=await import('/src/model/timeline/index.js');
    const {createWorldMapView}=await import('/src/views/world-map-pixi.js');
    const {prepareChronicleArt}=await import('/src/views/chronicle-art.js');
    const {getDetailedCivilizationSummary}=await import('/src/model/detailed-settlements.js');
    const {getWorldDefinition,getRegionPolygon}=await import('/src/model/world-state.js');
    const {createMapPolygonReader}=await import('/src/views/world-map/geometry.js');
    const app=new PIXI.Application({width:2424,height:1080,resolution:844/2424});app.stop();document.body.append(app.view);
    await prepareChronicleArt(app.renderer);
    const timeline=createTimelineFromInitialState(createNewGameState(1867));
    const states=Array.from({length:9},(_,i)=>rebuildStateAtSecond(timeline,i).state);
    const definition=getWorldDefinition(states[0]),polygon=createMapPolygonReader(definition);
    if(!definition.regions.every(r=>JSON.stringify(polygon(r))===JSON.stringify(getRegionPolygon(definition,r))))throw Error('Indexed geometry changed regional outlines');
    let state=states[0];
    const map=createWorldMapView({layer:app.stage,getState:()=>state,getVisualTime:()=>0,getSelectedRegionId:()=>state.civilization.capitalRegionId,getGraphScope:()=> 'civilization'});
    await map.prepare(app.renderer);map.update();app.render();
    globalThis.fixture={app,map,states,setState:value=>{state=value;},originals:states.map(s=>JSON.stringify(s)),expected:states.map(s=>getDetailedCivilizationSummary(s).population.total),chaosAtFour:getDetailedCivilizationSummary(states[4]).chaos.chaosPower,first:app.renderer.extract.pixels()};
  });
  await page.screenshot({path:`${output}/${process.argv.includes('--baseline')?'baseline':'result'}.png`});
  const cdp=await page.context().newCDPSession(page);
  if(Number(process.env.PROBE_CPU_RATE)>1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.PROBE_CPU_RATE)});
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  const result=await page.evaluate(()=>{
    const {app,map,states,setState,originals,expected,first}=fixture;
    let destroyedText=0,destroyedObjects=0;
    const textDestroy=PIXI.Text.prototype.destroy,objectDestroy=PIXI.DisplayObject.prototype.destroy;
    PIXI.Text.prototype.destroy=function(){destroyedText++;return textDestroy.apply(this,arguments);};
    PIXI.DisplayObject.prototype.destroy=function(){destroyedObjects++;return objectDestroy.apply(this,arguments);};
    const samples=[];let semantics=true;
    function findText(test,node=app.stage){
      if(node instanceof PIXI.Text&&test(node))return node;
      for(const child of node.children??[]){const found=findText(test,child);if(found)return found;}
      return null;
    }
    try{
      // Consecutive viewed seconds at 2x, with no monster spread or camera change.
      for(const state of states.slice(1)){
        setState(state);const before=performance.now();map.update();const painted=performance.now();app.render();
        samples.push({second:state.tSec,updateMs:painted-before,paintMs:performance.now()-painted});
        semantics=semantics&&findText(t=>t.x===316&&t.y===21)?.text===String(expected[state.tSec]);
      }
      const allocations={destroyedText,destroyedObjects};
      setState(states[0]);map.update();app.render();
      const restored=app.renderer.extract.pixels(),rewind=first.length===restored.length&&first.every((value,i)=>value===restored[i]);
      const changed=JSON.parse(JSON.stringify(states[0]));
      changed.world.regions.find(r=>!r.monster).monster={defense:9};
      const before=map.getSemanticSnapshot().retainedScene?.builds;
      setState(changed);map.update();app.render();
      const after=map.getSemanticSnapshot();
      let difference=0;const pixels=app.renderer.extract.pixels();for(let i=0;i<pixels.length;i++)if(pixels[i]!==first[i])difference++;
      const invalidates=after.retainedScene==null||after.retainedScene.builds>before;
      setState(states[0]);map.update();
      findText(t=>t.text==='<').parent.emit('pointerdown');map.update();
      setState(states[4]);map.update();
      const collapsed=findText(t=>t.text.startsWith('Chaos '))?.text===`Chaos ${fixture.chaosAtFour} >`;
      return {...allocations,samples,semantics,rewind,invalidates,difference,collapsed,retained:after.retainedScene,unchanged:states.every((s,i)=>JSON.stringify(s)===originals[i])};
    }finally{PIXI.Text.prototype.destroy=textDestroy;PIXI.DisplayObject.prototype.destroy=objectDestroy;map.destroy();app.destroy(true);}
  });
  const {profile}=await cdp.send('Profiler.stop');
  const cpuRate=Number(process.env.PROBE_CPU_RATE??1);
  const suffix=(process.argv.includes('--baseline')?'baseline':'result')+(cpuRate>1?`-cpu${cpuRate}`:'');
  await writeFile(`${output}/${suffix}-profile.json`,JSON.stringify(profile));
  await writeFile(`${output}/${suffix}.json`,JSON.stringify({cpuRate,result,errors},null,2));
  assert.deepEqual(errors,[]);assert.equal(result.unchanged,true);
  assert.equal(result.semantics,true,'Retained HUD shows the current population');
  assert.equal(result.rewind,true,'Rewind restores all retained map and HUD pixels');
  assert.equal(result.invalidates,true);assert.ok(result.difference>500,'Monster changes replace retained map content');
  assert.equal(result.collapsed,true,'Collapsed Chaos counter updates during playback');
  if(!process.argv.includes('--baseline'))assert.ok(result.destroyedText<100,`2x playback recreates too much map text: ${result.destroyedText} destroyed labels`);
  console.log(JSON.stringify({passed:true,cpuRate,destroyedText:result.destroyedText,destroyedObjects:result.destroyedObjects,meanUpdateMs:result.samples.reduce((s,x)=>s+x.updateMs,0)/result.samples.length,artifact:output}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
