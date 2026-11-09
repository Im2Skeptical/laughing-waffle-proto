import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const baseline=process.argv.includes('--baseline'),root=path.resolve('.'),output=`artifacts/previous-projection${baseline?'-before':''}`;
await mkdir(output,{recursive:true});
const original=new Set(['src/views/timegraphs-pixi.js','src/views/timegraphs/projection-replacement-state.js','src/model/timegraph/controller-core.js']);
const mime={'.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<body style="margin:0;background:#101817"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script>');return;}
    const file=path.resolve(root,`.${decodeURIComponent(pathname)}`);
    if(!file.startsWith(root+path.sep))throw Error('Outside checkout');
    const relative=path.relative(root,file).replaceAll(path.sep,'/');
    res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');
    res.end(baseline&&original.has(relative)?execFileSync('git',['show',`HEAD:${relative}`],{windowsHide:true}):await readFile(file));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS),results=[],errors=[];
let page;
try{
 for(const viewport of [{width:1280,height:800},{width:844,height:390}]){
  page=await browser.newPage({viewport,hasTouch:true,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?dev=1`);
  const initial=await page.evaluate(async()=>{const {previousProjectionFixture}=await import('/scripts/previous-projection-view-checks.js');return previousProjectionFixture();});
  const click=async second=>{
    const p=await page.evaluate(second=>previousProjection.point(second),second),b=await page.locator('canvas').boundingBox();
    const x=b.x+p.x/2424*b.width,y=b.y+p.y/1080*b.height;
    if(viewport.width===844)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
    await page.evaluate(()=>previousProjection.frame());
    return page.evaluate(()=>previousProjection.inspect());
  };
  if(baseline){
    assert.ok(initial.cap<=8,'original blocks browsing the old future');
    await page.screenshot({path:`${output}/${viewport.width}.png`});
  }else{
    assert.equal(initial.cap,64,'retains only unveiled coverage, not computed 96');
    const old=await click(48);
    assert.equal(old.previewSec,48);assert.equal(old.previewVassal,null);assert.ok(old.liveVassal);
    assert.equal(old.commits,0,'previous future cannot commit even with commit-on-release configured');
    assert.equal(old.unchanged,true);assert.equal(old.graph.viewingPreviousProjection,true);
    assert.match(old.graph.scopeLabel,/Previous projection.*read only/);
    assert.match(old.graph.replacementBoundaryLabel,/Replacing previous projection/);
    await page.screenshot({path:`${output}/${viewport.width}.png`});
    const capped=await click(80);assert.equal(capped.previewSec,64,'unveiled limit clamps mouse');
    await page.evaluate(()=>{previousProjection.view.close();previousProjection.view.open();previousProjection.frame();});
    assert.equal((await click(48)).previewSec,48,'close/open preserves the previous future');
    await page.evaluate(()=>previousProjection.replaceThrough(64));
    await page.waitForFunction(()=>{previousProjection.frame();return previousProjection.inspect().graph.previousProjectionBrowseEndSec===null;});
    const replaced=await page.evaluate(()=>previousProjection.inspect());
    assert.equal(replaced.graph.previousProjectionBrowseEndSec,null,`replacement releases retained states: ${JSON.stringify({visible:replaced.graph.revealedCoverageEndSec,target:replaced.graph.forecastRevealTargetEndSec,coverage:replaced.graph.computedCoverageEndSec,replacement:replaced.graph.projectionReplacement})}`);
    results.push({viewport,initial,previewSec:old.previewSec,readOnly:true,unchanged:old.unchanged});
  }
  await page.close();page=null;
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/result.json`,JSON.stringify({ok:true,baseline,results},null,2));
 console.log(`[previous-projection] ${baseline?'BASELINE reproduced old-future browse block':'PASS desktop/phone: unveiled cap, old-state browsing, read-only release, navigation and replacement'}`);
}catch(e){await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});await writeFile(`${output}/result.json`,JSON.stringify({error:e.stack,errors,results},null,2));console.error(`[previous-projection] FAILED ${e.message}; ${output}/result.json`);process.exitCode=1;}
finally{await browser.close();server.close();}
