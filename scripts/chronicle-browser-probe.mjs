import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';

async function countImageColours(page,png) {
  return page.evaluate(async base64=>{
    const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=28;
    const context=canvas.getContext('2d');context.drawImage(img,0,0,64,28);
    const pixels=context.getImageData(0,0,64,28).data,colours=new Set();
    for(let i=0;i<pixels.length;i+=4)colours.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return colours.size;
  },png.toString('base64'));
}

const url='http://127.0.0.1:8083';
const artifact='artifacts/chronicle-browser-probe.json';
mkdirSync('artifacts',{recursive:true});
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','8083','--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
let browser;
const errors=[],failedAssets=[],graphicsWarnings=[],consoleTrail=[];
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(consoleTrail.length<40)consoleTrail.push(message.text().slice(0,1600));});
  page.on('console',message=>{if(graphicsWarnings.length<20&&/INVALID_(OPERATION|VALUE|ENUM)|CONTEXT_LOST|GL_INVALID|framebuffer.*(invalid|incomplete)|Could not initialize shader/i.test(message.text()))graphicsWarnings.push(message.text());});
  page.on('response',r=>{if(r.url().includes('/images/')&&r.status()>=400)failedAssets.push(r.url());});
  await page.addInitScript(()=>localStorage.setItem('civsurvivor.debugProfiles.boot.v2','probe-authored-setup'));
  await page.goto(url);
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__);
  await page.waitForFunction(()=>['chronicle-cards.png','chronicle-practices.png','chronicle-civic.png','realm-terrain.png','chronicle-gate.png','vassal-portraits.png','realm-landmarks.png']
    .every(name=>performance.getEntriesByType('resource').some(entry=>entry.name.endsWith(name)&&entry.responseEnd>0)));
  await page.screenshot({path:'artifacts/chronicle-menu.png'});
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.enterBootTestRun());
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().browseCapSec>60);
  const checkUtility=async()=>{
    await page.waitForFunction(()=>{
      const canvas=document.querySelector('canvas').getBoundingClientRect();
      const rail=document.querySelector('[data-testid="utility-controls"]').getBoundingClientRect();
      return Math.abs(rail.top-canvas.top-5)<2&&Math.abs(canvas.right-rail.right-10)<2;
    });
  };
  await checkUtility();
  const seal=page.getByTestId('debug-open');
  await seal.click();
  assert.equal(await page.getByTestId('debug-close').isVisible(),false,'A short tap cannot expose the workshop');
  await seal.click({delay:950});
  await page.getByTestId('debug-close').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('debug-close').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  const click=async point=>{
    const b=await page.locator('canvas').boundingBox();
    await page.mouse.click(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);
  };
  const hoverCard=async point=>{
    // Screen transitions replace Pixi nodes; let their world transforms paint
    // before sending a mouse event against the new screen coordinates.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const b=await page.locator('canvas').boundingBox();
    await page.mouse.move(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible);
    const title=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().title);
    assert.ok(title,'Mouse hover shows card details');
    await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
    await delay(600);
    const tooltip=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
    assert.ok(tooltip.visible&&!tooltip.pinned,'Stationary mouse details survive redraw without pinning');
    assert.equal(tooltip.title,title);
    await page.mouse.move(b.x+20/2424*b.width,b.y+100/1080*b.height);
    await page.waitForFunction(()=>!globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible);
  };
  const lever=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTimeLeverScreenRect());
  await click({x:lever.x+lever.width/2,y:lever.y+lever.height/2});
  await delay(100);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().playbackTarget),0);
  const seek=async t=>{
    const result=await page.evaluate(t=>globalThis.__SETTLEMENT_DEBUG__.browseSecond(t),t);
    assert.equal(result.ok,true,'The authoritative preview must be available for a visual seek');
    await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
    await delay(70);
  };
  const canvas=await page.locator('canvas').boundingBox();
  const crop={x:canvas.x+58/2424*canvas.width,y:canvas.y+88/1080*canvas.height,
    width:1640/2424*canvas.width,height:720/1080*canvas.height};
  const diskCrop={x:canvas.x+2150/2424*canvas.width,y:canvas.y+810/1080*canvas.height,
    width:260/2424*canvas.width,height:260/1080*canvas.height};
  await seek(12);
  const first=await page.screenshot({clip:crop});
  assert.ok(await countImageColours(page,first)>64,'The world must be painted before pause and rewind comparisons');
  const firstDisks=await page.screenshot({clip:diskCrop});
  await delay(220);
  assert.deepEqual(await page.screenshot({clip:crop}),first,'Paused world pixels must remain exactly frozen');
  assert.deepEqual(await page.screenshot({clip:diskCrop}),firstDisks,'Held time discs must remain exactly frozen');
  await seek(48);await seek(12);
  assert.deepEqual(await page.screenshot({clip:crop}),first,'Returning to the same time must restore identical world pixels after rewind');
  assert.deepEqual(await page.screenshot({clip:diskCrop}),firstDisks,'Rewinding restores the same astrolabe angle and phase');
  await page.screenshot({path:'artifacts/chronicle-world.png'});
  await hoverCard({x:1800,y:550});
  await hoverCard({x:1800,y:695});
  await click({x:2047,y:762});
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='settlement');
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await hoverCard({x:700,y:220});
  await hoverCard({x:110,y:510});
  await click({x:1883,y:36});
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='map');
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  // Touch both wheel faces and a lunar badge as primary drag controls.
  const wheelTouch=await page.context().newCDPSession(page);
  for(const [radius,startAngle] of [[60,0],[105,0],[111,-Math.PI/2]]) {
    await seek(48);
    const point=angle=>({x:canvas.x+(2280+radius*Math.cos(angle))/2424*canvas.width,
      y:canvas.y+(940+radius*Math.sin(angle))/1080*canvas.height});
    const start=point(startAngle);
    await wheelTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(let step=1;step<=8;step++) {
      const next=point(startAngle+step*Math.PI/32);
      await wheelTouch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[next]});
    }
    await wheelTouch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().viewedSec!==48);
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().playbackTarget),0,
      'Rotating a wheel detaches automatic movement and holds the chosen time');
  }
  await wheelTouch.detach();
  await seek(12);
  await page.getByTestId('chronicle-audio').click();
  await click({x:lever.x+lever.width/2,y:lever.y+10});
  await page.waitForFunction(()=>{
    const audio=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.audio;
    return audio.enabled&&audio.playing&&audio.rate>0;
  },null,{timeout:5000});
  let sound=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.audio);
  assert.equal(sound.enabled,true);assert.equal(sound.playing,true);assert.ok(sound.rate>0);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().playbackTarget),4,
    'The upper lever lock retains forward speed after release');
  await click({x:lever.x+lever.width/2,y:lever.y+lever.height-10});
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.audio.rate<0,null,{timeout:5000});
  sound=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.audio);
  assert.ok(sound.rate<0,'Rewind uses the negative timeline direction');
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().playbackTarget),-4,
    'The lower lever lock retains rewind speed after release');
  await click({x:lever.x+lever.width/2,y:lever.y+lever.height/2});
  // Sound follows the rendered frame. Wait for that frame on software-rendered
  // hosts instead of assuming a fixed wall-clock delay contains multiple ticks.
  await page.waitForFunction(()=>{
    const snapshot=globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
    return snapshot.playbackTarget===0&&!snapshot.worldMap.audio.playing;
  },null,{timeout:5000});
  sound=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.audio);
  assert.equal(sound.playing,false,'A held timeline is silent');
  await seek(0);
  await click({x:lever.x+lever.width/2,y:lever.y+lever.height-10});
  await page.waitForFunction(()=>{
    const snapshot=globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
    return snapshot.playbackTarget===0&&snapshot.viewedSec===0&&!snapshot.worldMap.audio.playing;
  },null,{timeout:5000});
  sound=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.audio);
  assert.equal(sound.sourceTime,0,'Sound cannot run past the beginning of visible history');
  await click({x:lever.x+lever.width/2,y:lever.y+lever.height/2});
  await page.getByTestId('chronicle-audio').click();
  for(const viewport of [{width:844,height:390},{width:1280,height:800},{width:844,height:390}]){
    await page.setViewportSize(viewport);await delay(150);
  }
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const mobileCanvas=await page.locator('canvas').boundingBox();
  const mobileClip={
    x:mobileCanvas.x+58/2424*mobileCanvas.width,y:mobileCanvas.y+88/1080*mobileCanvas.height,
    width:1640/2424*mobileCanvas.width,height:720/1080*mobileCanvas.height,
  };
  const countPaintedColours=async()=>countImageColours(page,await page.screenshot({clip:mobileClip}));
  // Viewport changes replace the compositor surface asynchronously. Wait for
  // actual painted terrain instead of assuming a fixed number of frames.
  let worldColours=await countPaintedColours();
  for(let attempt=0;attempt<10&&worldColours<=64;attempt++){
    await delay(150);worldColours=await countPaintedColours();
  }
  await page.screenshot({path:'artifacts/chronicle-mobile.png'});
  if(worldColours<=64){
    const diagnostics=await page.evaluate(()=>{
      const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2')??canvas.getContext('webgl');
      const state=globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
      const debugRenderer=gl?.getExtension('WEBGL_debug_renderer_info');
      return {contextLost:gl?.isContextLost(),canvas:{width:canvas.width,height:canvas.height,display:getComputedStyle(canvas).display},
        mode:state.worldMap.mode,time:state.viewedSec,visibility:document.visibilityState,
        renderer:debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):null};
    });
    writeFileSync('artifacts/chronicle-mobile-diagnostics.json',JSON.stringify({worldColours,diagnostics,graphicsWarnings},null,2));
  }
  assert.ok(worldColours>64,'Phone resize must retain painted terrain, not a blank canvas');
  await checkUtility();
  const touch=await page.context().newCDPSession(page);
  const holdCard=async point=>{
    const box=await page.locator('canvas').boundingBox();
    const x=box.x+point.x/2424*box.width,y=box.y+point.y/1080*box.height;
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().pinned);
    const title=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().title);
    await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
    await delay(600);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await delay(150);
    const tooltip=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
    assert.ok(tooltip.visible&&tooltip.pinned,'Touch details survive redraw and release');
    assert.equal(tooltip.title,title);
    await page.touchscreen.tap(box.x+20/2424*box.width,box.y+100/1080*box.height);
    await page.waitForFunction(()=>!globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible);
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible),false,'Outside tap dismisses details');
    await page.touchscreen.tap(x,y);
    await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
    await delay(100);
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().pinned),true,'Short tap pins details across redraw');
    await page.touchscreen.tap(x,y);await delay(50);
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible),false,'Tapping the same card again dismisses details');
  };
  await holdCard({x:1800,y:550});
  await holdCard({x:1800,y:695});
  await click({x:2047,y:762});await delay(150);
  await holdCard({x:700,y:220});
  await holdCard({x:110,y:510});
  await click({x:1883,y:36});
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.openNextSelection());
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getVassalCandidateClickPoint(0));
  const candidate=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getVassalCandidateClickPoint(0));
  const candidateBox=await page.locator('canvas').boundingBox();
  const candidateX=candidateBox.x+candidate.x/2424*candidateBox.width;
  const candidateY=candidateBox.y+candidate.y/1080*candidateBox.height;
  await page.touchscreen.tap(candidateX,candidateY);
  await page.touchscreen.tap(candidateX,candidateY);
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal);
  await delay(250);
  const node=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
  await click(await page.evaluate(id=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),node));
  await delay(150);
  const enter=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint());
  if(enter){await click(enter);await delay(150);}
  const choice=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(0)
    ??globalThis.__SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0));
  assert.ok(choice,'The first life node exposes an illustrated choice');
  const beforeInspection=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  await click({x:choice.x,y:choice.y-100});await delay(200);
  const afterInspection=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  assert.ok(afterInspection.inspectedCardId,'Tapping card art opens its full inspection');
  assert.equal(afterInspection.selectedOptionId,beforeInspection.selectedOptionId,'Inspection cannot select a choice');
  assert.deepEqual(afterInspection.purchaseOrder,beforeInspection.purchaseOrder,'Inspection cannot stage a purchase');
  await page.screenshot({path:'artifacts/chronicle-mobile-inspection.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
  assert.deepEqual(graphicsWarnings,[],'The renderer must not emit WebGL failures');
  writeFileSync(artifact,JSON.stringify({ok:true,checks:['assets','hidden workshop','pixel-identical pause','pixel-identical rewind seek','forward and reverse audio','wheel and lunar badge touch drags','vertical lever direction locks','phone landscape','utility rail alignment','desktop hover survives redraw and dismisses on exit','touch details survive redraw','Vassal double-tap confirmation','inspection preserves choices'],graphicsWarnings},null,2));
  console.log('[probe:chronicle] OK: seek-identical pixels, reversible sound, hidden workshop, phone landscape');
}catch(error){
  writeFileSync(artifact,JSON.stringify({error:error.stack,errors,failedAssets,graphicsWarnings,consoleTrail},null,2));
  console.error('[probe:chronicle] FAILED: '+error.message.split('\n')[0]+' · '+artifact);process.exitCode=1;
}finally{await browser?.close();server.kill();}
