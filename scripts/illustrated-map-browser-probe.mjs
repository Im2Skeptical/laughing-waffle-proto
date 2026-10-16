import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const output='artifacts/illustrated-map',port=18134,prefix='/laughing-waffle-proto/';
const url=`http://127.0.0.1:${port}${prefix}`;
await mkdir(output,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(request,response)=>{
 try {
  const pathname=decodeURIComponent(new URL(request.url,url).pathname);
  if(!pathname.startsWith(prefix))throw new Error('Outside deployment');
  const file=path.resolve('dist',pathname.slice(prefix.length)+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(path.resolve('dist')+path.sep))throw new Error('Outside dist');
  response.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');
  response.end(await readFile(file));
 }catch{response.statusCode=404;response.end('Not found');}
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()}: ${r.url()}`);});
 await page.goto(url);
 await page.getByText('Developer tools',{exact:true}).click();
 const seedInput=page.getByRole('spinbutton',{name:'New game seed'});
 assert.equal(await seedInput.inputValue(),'','fresh games use random seeds by default');
 await seedInput.fill('1867');await seedInput.blur();
 await page.getByRole('button',{name:'New game',exact:true}).click();
 await page.getByRole('button',{name:'Start here',exact:true}).first().click();
 console.log('Opening game with seed 1867');
 await page.waitForFunction(()=>document.querySelector('#game-menu')?.hidden===true,null,{timeout:180000});
 const snapshot=()=>page.evaluate(()=>{
  const s=__SETTLEMENT_DEBUG__.getSnapshot();return {worldMap:s.worldMap,complete:s.runComplete};
 });
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().runComplete.open,null,{timeout:60000});
 let s=await snapshot();
 if(s.complete.open){
  const p=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));
  const b=await page.locator('canvas').boundingBox();await page.mouse.click(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);
 }
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 await page.waitForTimeout(600);
 s=await snapshot();assert.equal(s.worldMap.illustratedTerrain.ready,true);
 assert.equal(s.worldMap.illustratedTerrain.bakes,1);
 await page.screenshot({path:`${output}/desktop.png`});
 const region=s.worldMap.regionMapIndicators.find(r=>r.hasDetailedSettlement&&!r.neutral&&!r.monster).regionId;
 const p=await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),region);
 const bounds=await page.locator('canvas').boundingBox();await page.mouse.click(bounds.x+p.x/2424*bounds.width,bounds.y+p.y/1080*bounds.height);
 await page.waitForTimeout(650);s=await snapshot();assert.equal(s.worldMap.selectedRegionId,region);assert.equal(s.worldMap.detailPanelVisible,true);
 for(const t of [12,64,12,0]){await page.evaluate(t=>__SETTLEMENT_DEBUG__.browseSecond(t),t);await page.waitForTimeout(60);}
 s=await snapshot();assert.equal(s.worldMap.illustratedTerrain.bakes,1,'time/selection changes retain terrain');
 await page.screenshot({path:`${output}/selected.png`});
 await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(350);
 // Leaving fullscreen opens the game menu. Resume before checking phone input.
 if(await page.locator('#game-menu').isVisible())await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#game-menu')?.hidden===true,null,{timeout:30000});
 const mobileRegion=s.worldMap.regionMapIndicators.find(r=>r.regionId!==region&&r.hasDetailedSettlement&&!r.neutral&&!r.monster).regionId;
 const target=await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),mobileRegion);
 const phoneBounds=await page.locator('canvas').boundingBox();
 await page.touchscreen.tap(phoneBounds.x+target.x/2424*phoneBounds.width,phoneBounds.y+target.y/1080*phoneBounds.height);
 await page.waitForTimeout(650);
 await page.screenshot({path:`${output}/mobile.png`});
 const mobile=await snapshot();assert.equal(mobile.worldMap.illustratedTerrain.bakes,1,'mobile layout retains the same terrain');
 assert.equal(mobile.worldMap.selectedRegionId,mobileRegion,'touch selects another live settlement');
 assert.equal(mobile.worldMap.detailPanelVisible,true,'touch opens its settlement panel');
 await page.goto(`${url}images/dark-fantasy/map-generation-prototype/?waterMotion=0`);
 await page.waitForFunction(()=>window.mapWorkbench?.atmosphere,null,{timeout:180000});
 const workbench=await page.evaluate(()=>({version:mapWorkbench.version,regions:mapWorkbench.map.regions.length}));
 assert.equal(workbench.regions,20,'the standalone workbench still loads shared geography and artwork');
 assert.deepEqual(errors,[]);
 const result={pass:true,terrain:s.worldMap.illustratedTerrain,selectedRegion:region,workbench,errors};
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} catch(error){await writeFile(`${output}/failure.json`,JSON.stringify({message:error.message,errors},null,2));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
