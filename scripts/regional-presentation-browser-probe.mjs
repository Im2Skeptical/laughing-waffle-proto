import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const seed=Number(process.argv[2]??1867);
const windowed=process.argv.includes('--windowed');
const output=`artifacts/regional-presentation/${seed}${windowed?'-windowed':''}`,url='http://127.0.0.1:18135';
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,url).pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<html><body style="margin:0;background:#14262a"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script></body></html>');return;}
    const file=path.resolve('.'+decodeURIComponent(pathname));
    if(!file.startsWith(process.cwd()+path.sep))throw Error('Outside workspace');
    res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.webp':'image/webp','.png':'image/png'})[path.extname(file)]??'application/octet-stream');
    res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(18135,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),errors=[];
try{
  const page=await browser.newPage({viewport:{width:1576,height:600}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>!!globalThis.PIXI);
  await page.evaluate(async ({seed,windowed})=>{
    const {createNewGameState}=await import('/src/model/new-game.js');
    const {createIllustratedTerrain}=await import('/src/views/world-map/illustrated-terrain.js');
    const state=createNewGameState(seed);
    state.world.regions.forEach(r=>{delete r.monster;});
    const before=JSON.stringify(state),app=new PIXI.Application({width:1576,height:600,backgroundColor:0x14262a});
    app.stop();document.body.append(app.view);
    const world=new PIXI.Container(),pose={x:0,y:0,zoom:1};app.stage.addChild(world);
    const {getRegionalMap}=await import('/src/model/regional-map/definition.js');
    const points=getRegionalMap(state.world.definitionId).map.regions.flatMap(r=>r.outline);
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
    const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const width=Math.min(1450/(maxX-minX),520/(maxY-minY)*1576/516),height=width*516/1576;
    const rect={x:60-minX*width,y:40-minY*height,width,height};
    const view=createIllustratedTerrain(world,rect,windowed?{getView:()=>({
      minX:((-pose.x)/pose.zoom-rect.x)/width,minY:((-pose.y)/pose.zoom-rect.y)/height,
      maxX:((1576-pose.x)/pose.zoom-rect.x)/width,maxY:((600-pose.y)/pose.zoom-rect.y)/height,zoom:pose.zoom,
    })}:{});
    await view.prepare(state,app.renderer);
    const paint=state=>{world.position.set(pose.x,pose.y);world.scale.set(pose.zoom);view.setState(state);view.update(300,pose.zoom,true);app.renderer.render(app.stage);};
    paint(state);
    window.fixture={state,app,view,paint,pose,before,first:app.renderer.extract.pixels()};
  },{seed,windowed});
  await page.screenshot({path:`${output}/natural.png`});
  const initial=await page.evaluate(()=>structuredClone(fixture.view.stats));
  assert.equal(initial.sites.length,6,'Every live town uses a planned biome village');
  assert.ok(initial.sites.every(s=>s.buildings>=5),'Villages contain the approved building compositions');
  assert.ok(initial.roads>=1,'Live gameplay connections use prototype terrain routes');
  if(windowed){
    assert.equal(initial.backdropAnimating,false,'Covered background water does not render');
    assert.ok(initial.animationPasses<13,'Live camera uses fewer animation passes');
    assert.ok(initial.waterWindows.every(w=>w.width<initial.width),'Water target follows the camera width');
  }
  const results=[];
  for(const phase of ['spread','islands','occupied-town','clear','road-removed','town-removed','restore']){
    results.push(await page.evaluate(phase=>{
      const {state,view,app,paint}=fixture,next=JSON.parse(JSON.stringify(state)),natural=view.stats.biomes;
      const forest=natural.find(r=>r.underlying==='forest').id,island=natural.find(r=>r.underlying==='islands').id;
      if(phase==='spread'||phase==='islands')next.world.regions.find(r=>r.id===forest).monster={defense:1};
      if(phase==='islands')next.world.regions.find(r=>r.id===island).monster={defense:1};
      if(phase==='occupied-town')next.world.regions.find(r=>r.id===next.world.sites[0].regionId).monster={defense:1};
      if(phase==='road-removed')next.world.connections=[];
      if(phase==='town-removed')next.world.sites=[];
      if(phase==='restore')for(let i=0;i<5;i++){
        const other=JSON.parse(JSON.stringify(state));
        other.world.regions.slice(0,i+2).forEach(r=>{r.monster={defense:1};});
        paint(other); // Evict the original composite before testing restoration.
      }
      const before=JSON.stringify(next),start=performance.now();paint(next);
      const pixels=app.renderer.extract.pixels();
      let difference=0;for(let i=0;i<pixels.length;i++)if(pixels[i]!==fixture.first[i])difference++;
      return {phase,ms:performance.now()-start,difference,unchanged:before===JSON.stringify(next),stats:structuredClone(view.stats)};
    },phase));
    if(['spread','islands','restore'].includes(phase))await page.screenshot({path:`${output}/${phase}.png`});
  }
  await writeFile(`${output}/result.json`,JSON.stringify({initial,results,errors},null,2));
  for(const r of results){
    assert.equal(r.unchanged,true,`${r.phase}: renderer must not change game state`);
    assert.equal(r.stats.bakes,1,`${r.phase}: no repeated water/geography bake`);
    const occupied=r.stats.biomes.filter(b=>b.biome==='monster');
    assert.equal(occupied.length,['spread','occupied-town'].includes(r.phase)?1:r.phase==='islands'?2:0,`${r.phase}: exact viewed occupation`);
    if(['spread','islands'].includes(r.phase)){assert.ok(r.difference>1000);assert.ok(r.stats.monsterPieces>0);}
    if(['clear','restore'].includes(r.phase))assert.equal(r.difference,0,`${r.phase}: original terrain restored pixel-for-pixel`);
    if(r.phase==='road-removed')assert.equal(r.stats.roads,0);
    if(r.phase==='occupied-town')assert.equal(r.stats.sites.length,5);
    assert.equal(r.stats.variantBuilds,1,'State changes reuse prepared terrain variants');
    if(r.phase==='town-removed')assert.equal(r.stats.sites.length,0);
  }
  const camera=[];
  for(const pose of [{x:-800,y:-160,zoom:2.5},{x:450,y:130,zoom:.35},{x:0,y:0,zoom:1}]){
    camera.push(await page.evaluate(pose=>{
      const f=fixture;Object.assign(f.pose,pose);f.paint(f.state);
      const pixels=f.app.renderer.extract.pixels();let difference=0;
      for(let i=0;i<pixels.length;i++)if(pixels[i]!==f.first[i])difference++;
      return {pose,difference,passes:f.view.stats.animationPasses,pixels:f.view.stats.animationPixels,backdrop:f.view.stats.backdropAnimating};
    },pose));
    await page.screenshot({path:`${output}/camera-${pose.zoom}.png`});
  }
  assert.equal(camera.at(-1).difference,0,'Panning and zooming restore the same world-space appearance');
  if(windowed)assert.equal(camera[1].backdrop,true,'Distant water appears beyond the fine layer fade');
  const unchanged=await page.evaluate(()=>{
    const same=fixture.before===JSON.stringify(fixture.state);
    fixture.view.destroy();fixture.app.destroy(true);
    return same;
  });
  assert.equal(unchanged,true);assert.deepEqual(errors,[]);
  await writeFile(`${output}/camera.json`,JSON.stringify(camera,null,2));
  console.log(JSON.stringify({passed:true,sites:initial.sites.length,roads:initial.roads,animation:{passes:initial.animationPasses,pixels:initial.animationPixels},camera,artifact:`${output}/result.json`}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
