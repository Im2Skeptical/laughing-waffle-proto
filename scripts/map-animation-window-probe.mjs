import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const url='http://127.0.0.1:18136',output='artifacts/map-animation-window';
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const route=new URL(req.url,url).pathname;
    if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script>');return;}
    const file=path.resolve('.'+decodeURIComponent(route));
    if(!file.startsWith(process.cwd()+path.sep))throw Error('Outside workspace');
    res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.webp':'image/webp','.png':'image/png'})[path.extname(file)]??'application/octet-stream');
    res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(18136,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),errors=[];
try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>!!globalThis.PIXI);
  const result=await page.evaluate(async baseline=>{
    const {createWaterCycle}=await import('/images/dark-fantasy/map-generation-prototype/water-animation.js');
    const {createAtmosphere}=await import('/images/dark-fantasy/map-generation-prototype/atmosphere.js');
    const {prepareCloudArt}=await import('/images/dark-fantasy/map-generation-prototype/cloud-banks.js');
    await prepareCloudArt();
    const app=new PIXI.Application({width:900,height:500});app.stop();document.body.append(app.view);
    const width=3152,height=1032,n=width*height,rgba=new Uint8Array(n*4),indices=new Uint8Array(n),strength=new Uint8Array(n).fill(255);
    const palette=Uint32Array.from({length:256},(_,i)=>0x204060+i*0x010101);
    for(let i=0;i<n;i++){rgba.set([36+(i%11),83,103,255],i*4);indices[i]=128+i%16;}
    const texture=PIXI.Texture.fromBuffer(rgba,width,height,{scaleMode:PIXI.SCALE_MODES.NEAREST});
    const makeWater=windowed=>createWaterCycle(texture,indices,strength,palette,null,()=>.3,{world:[0,0,width,height],maskAt:()=>1,windowed});
    const mask=new Uint8Array(788*258*4).fill(255);
    const makeSky=windowed=>createAtmosphere({width:788,height:258,mask,world:[0,0,width,height],seed:1867,windowed});
    const water=makeWater(false),sky=makeSky(false),renderer=app.renderer,original=renderer.render;
    let calls=[];
    renderer.render=function(node,options){if(options?.renderTexture)calls.push(options.renderTexture.width*options.renderTexture.height);return original.apply(this,arguments);};
    water.update(renderer,300,true);sky.update(renderer,300,{wisps:true},true);
    const full={passes:calls.length,pixels:calls.reduce((a,b)=>a+b,0)};
    if(baseline){water.destroy();sky.destroy();texture.destroy(true);app.destroy(true);return {full};}
    const viewWater=makeWater(true),viewSky=makeSky(true);
    if(typeof viewWater.setView!=='function'||typeof viewSky.setView!=='function')throw Error('Animation still renders the entire atlas: missing camera window');
    const view={x:1130,y:340,width:640,height:300};
    viewWater.setView(view,1);viewSky.setView({x:view.x/4,y:view.y/4,width:view.width/4,height:view.height/4},4);
    calls=[];viewWater.update(renderer,300,true);viewSky.update(renderer,300,{wisps:true},true);
    const cropped={passes:calls.length,pixels:calls.reduce((a,b)=>a+b,0)};
    const sharedPalette=viewWater.stats.paletteUpdates===0&&water.stats.paletteUpdates===1;
    const compare=(fullTexture,partTexture,frame,inset)=>{
      const a=renderer.extract.pixels(fullTexture),b=renderer.extract.pixels(partTexture);
      let difference=0,maximum=0,count=0;
      for(let y=inset;y<partTexture.height-inset;y+=3)for(let x=inset;x<partTexture.width-inset;x+=3)for(let c=0;c<4;c++){
        const delta=Math.abs(a[((y+frame.y)*fullTexture.width+x+frame.x)*4+c]-b[(y*partTexture.width+x)*4+c]);
        difference+=delta;maximum=Math.max(maximum,delta);count++;
      }
      return {mean:difference/count,maximum};
    };
    const pixels={water:compare(water.levels[0],viewWater.levels[0],viewWater.frame,8),sky:compare(sky.texture,viewSky.texture,viewSky.frame,8)};
    const first=renderer.extract.pixels(viewWater.levels[0]),firstSky=renderer.extract.pixels(viewSky.texture);
    viewWater.update(renderer,600,true);viewSky.update(renderer,600,{wisps:true},true);
    viewWater.update(renderer,300,true);viewSky.update(renderer,300,{wisps:true},true);
    const equal=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
    const rewind=equal(first,renderer.extract.pixels(viewWater.levels[0]))&&equal(firstSky,renderer.extract.pixels(viewSky.texture));
    const oldFrame={...viewWater.frame};
    const stable=!viewWater.setView({...view,x:view.x+4},1);
    viewWater.setView({...view,x:view.x+300},1);viewWater.update(renderer,300,false);
    const pan={changed:viewWater.frame.x!==oldFrame.x,pixels:compare(water.levels[0],viewWater.levels[0],viewWater.frame,8)};
    viewWater.setView(view,.4);viewWater.update(renderer,300,false);
    const levels=viewWater.levels.length;
    const detached=!viewWater.setView({x:-1000,y:-1000,width:10,height:10},1)&&!viewWater.visible;
    for(const item of [water,viewWater,sky,viewSky])item.destroy();
    texture.destroy(true);app.destroy(true);
    return {full,cropped,pixels,rewind,stable,pan,levels,detached,sharedPalette};
  },process.argv.includes('--baseline'));
  await writeFile(`${output}/${process.argv.includes('--baseline')?'baseline':'result'}.json`,JSON.stringify({result,errors},null,2));
  if(!process.argv.includes('--baseline')){
    assert.ok(result.cropped.pixels<result.full.pixels*.25,'Render fewer than 25% of the previous animation pixels');
    assert.ok(result.cropped.passes<result.full.passes,'Do not rebuild unused water levels');
    for(const pixels of [result.pixels.water,result.pixels.sky,result.pan.pixels])assert.ok(pixels.mean<.25&&pixels.maximum<=8,`Crop must preserve world-space appearance: ${JSON.stringify(pixels)}`);
    assert.equal(result.rewind,true,'Exact appearance after forward/rewind');
    assert.equal(result.stable,true,'Small pans reuse the padded texture');assert.equal(result.pan.changed,true);
    assert.equal(result.levels,3,'A fractional zoom prepares only the two sampled levels and their source');
    assert.equal(result.detached,true,'Off-screen animation stops');
    assert.equal(result.sharedPalette,true,'Fine/distant/cropped cycles share one palette calculation and upload');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,...result,artifact:output}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
