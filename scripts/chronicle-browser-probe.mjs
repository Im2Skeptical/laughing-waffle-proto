import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {VASSAL_NORMAL_NODE_FAMILY_IDS} from '../src/defs/gamepieces/vassal-life-map-defs.js';


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

const shopOnly=process.argv.includes('--shop-only');
const url='http://127.0.0.1:8083';
const artifact='artifacts/chronicle-browser-probe.json';
mkdirSync('artifacts',{recursive:true});
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','8083','--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
let browser,page;
const errors=[],failedAssets=[],graphicsWarnings=[],consoleTrail=[];
const interactionTimings={};
async function openProbePage(viewport) {
  page=await browser.newPage({viewport,hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(consoleTrail.length<40)consoleTrail.push(message.text().slice(0,1600));});
  page.on('console',message=>{if(graphicsWarnings.length<20&&/INVALID_(OPERATION|VALUE|ENUM)|CONTEXT_LOST|GL_INVALID|framebuffer.*(invalid|incomplete)|Could not initialize shader/i.test(message.text()))graphicsWarnings.push(message.text());});
  page.on('response',r=>{if(r.url().includes('/images/')&&r.status()>=400)failedAssets.push(r.url());});
  await page.addInitScript(()=>{
    globalThis.__PERF_ENABLED__=true;
    localStorage.setItem('civsurvivor.debugProfiles.boot.v2','probe-authored-setup');
  });
  await page.goto(url);
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__);
  // Worker image decoding does not report every request on the page timeline.
  // Assert the loaded textures instead of mistaking absent timing entries for a stall.
  await page.waitForFunction(names=>names.every(name=>{
    const asset=PIXI.Assets.get(`images/sprite-sheets/${name}`);
    return !!asset?.textures&&Object.keys(asset.textures).length>0;
  }),
    ['resource-language.json','piece-frames.json','chronicle-illustrations.json','vassal-portraits.json','chronicle-gate.json','timegraph-chronicle.json'], { timeout: 45000 });
}
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  await openProbePage({width:1280,height:800});
  // Keyword inspection measures prefixes with a cloned, resolved TextStyle.
  // Rendering those fragments must retain the measured font and whitespace.
  const fragmentTypography=await page.evaluate(()=>{
    const cases=[
      ['Produce 1 Stock','Produce',false],
      ['Produce 1 Stock',' 1 ',false],
      ['A named moon phase. A Cycle Practice with this timing','Cycle Practice',false],
      ['Qualifying events advance a Practice’s private meter.','Practice',false],
      ['Food phase','Food phase',true],
    ];
    return cases.flatMap(([text,fragment,bold])=>{
      const source=new PIXI.Text(text,{fontFamily:'Arial',fontSize:38,lineHeight:51,
        fontWeight:bold?'bold':'normal',wordWrap:true,wordWrapWidth:802,
        __preserveFontFamily:true,__disableTitleSmallCaps:true});
      const style=source.style.clone();style.wordWrap=false;
      const expectedFont=style.toFontString(),expectedWidth=PIXI.TextMetrics.measureText(fragment,style).width;
      const copy=new PIXI.Text(fragment,style.clone());
      const actualFont=copy.style.toFontString(),actualWidth=PIXI.TextMetrics.measureText(copy.text,copy.style).width;
      source.destroy();copy.destroy();
      return expectedFont===actualFont&&Math.abs(expectedWidth-actualWidth)<.01?[]:
        [{fragment,expectedFont,actualFont,expectedWidth,actualWidth}];
    });
  });
  assert.deepEqual(fragmentTypography,[],'Keyword fragments keep the font and spacing used for layout');
  const scrollAlpha=await page.evaluate(async()=>{
    const art=new Image();art.src='images/sprite-sheets/timegraph-chronicle.png';await art.decode();
    const canvas=document.createElement('canvas');canvas.width=art.width;canvas.height=art.height;
    const context=canvas.getContext('2d');context.drawImage(art,0,0);
    return [[0,0],[1000,50],[1000,400]].map(([x,y])=>context.getImageData(x,y,1,1).data[3]);
  });
  assert.deepEqual(scrollAlpha.slice(0,2),[0,0],'The illustrated frame has no opaque rectangular backing');
  assert.ok(scrollAlpha[2]>240,'The parchment remains a readable solid plotting surface');
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
  const seek=async t=>{
    const result=await page.evaluate(t=>globalThis.__SETTLEMENT_DEBUG__.browseSecond(t),t);
    assert.equal(result.ok,true,'The authoritative preview must be available for a visual seek');
    await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
    await delay(70);
  };
  let candidateBox;
  let touch=await page.context().newCDPSession(page);
  if(!shopOnly) {
  const hoverCard=async (point,inspectionSide=null)=>{
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
    if(tooltip.reading) {
      assert.equal(tooltip.expanded,false,'Hover is a quick textual read');
      assert.deepEqual(tooltip.glossary,[],'Symbol explanations belong in inspect');
      assert.ok(tooltip.reading.effects.length,'Activation effects are individually readable');
    }
    if(inspectionSide){
      assert.ok(inspectionSide==='right'?tooltip.x>point.x:tooltip.x+tooltip.width<point.x,
        `${inspectionSide} inspection leaves its source exposed`);
      await page.screenshot({path:`artifacts/chronicle-${inspectionSide}-${title.replace(/[^a-z0-9]/gi,'-')}-inspection.png`});
    }
    await page.mouse.move(b.x-5,b.y-5);
    await page.waitForFunction(()=>!globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible).catch(async error=>{
      const state=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
      writeFileSync('artifacts/chronicle-hover-failure.json',JSON.stringify(state,null,2));
      throw error;
    });
  };
  const regionalStructurePoint=()=>page.evaluate(()=>{
    const m=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap;
    const piece=m.selectedRegion.detailedSettlement.structures.find(Boolean),r=m.layout.detail;
    const scale=Math.min((r.width-44)/(8*120),(r.height-566)/160);
    return {x:r.x+22+(r.width-44-8*120*scale)/2+(piece.origin+piece.width/2)*120*scale,
      y:r.y+548+80*scale};
  });
  const regionalPracticePoint=()=>page.evaluate(()=>{
    const m=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap,r=m.layout.detail;
    const index=m.selectedRegion.detailedSettlement.practices.findIndex(piece=>piece.practiceId);
    if(index<0)throw new Error('The regional tooltip probe needs an installed Practice');
    const width=(r.width-44-12*4)/5;
    return {x:r.x+22+index*(width+12)+width/2,y:r.y+140+width*.7};
  });
  const lever=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTimeLeverScreenRect());
  await click({x:lever.x+lever.width/2,y:lever.y+lever.height/2});
  await delay(100);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().playbackTarget),0);
  const canvas=await page.locator('canvas').boundingBox();
  const crop={x:canvas.x+16/2424*canvas.width,y:canvas.y+88/1080*canvas.height,
    width:1448/2424*canvas.width,height:720/1080*canvas.height};
  const wheels=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTimeWheelSnapshot());
  const diskLeft=wheels.season.x-wheels.season.radius-8;
  const diskTop=wheels.season.y-wheels.season.radius-20;
  const diskCrop={x:canvas.x+diskLeft/2424*canvas.width,
    y:canvas.y+diskTop/1080*canvas.height,
    width:(Math.min(2424,wheels.season.x+wheels.season.radius+8)-diskLeft)/2424*canvas.width,
    height:(Math.min(1080,wheels.season.y+wheels.season.radius+6)-diskTop)/1080*canvas.height};
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
  await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getWorldMapClickPoint('cedar-woods')));
  await page.waitForFunction(()=>{const m=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating&&!m.panelReveal?.animating;});
  await hoverCard(await regionalPracticePoint(),'left');
  await hoverCard(await regionalStructurePoint(),'left');
  await hoverCard(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph.legendButtons[0]));
  await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('settlement')));
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='settlement');
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await hoverCard({x:700,y:220},'right');
  await hoverCard({x:675,y:680},'right');
  await click(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('map')));
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='map');
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  // Both faces scrub; the larger centre distinguishes a tap from a drag.
  const wheelTouch=await page.context().newCDPSession(page);
  for(const [radius,startAngle] of [[wheels.moon.radius*.83,Math.PI],[wheels.season.radius*.88,Math.PI],[wheels.centre.diameter*.25,-Math.PI/2]]) {
    await seek(48);
    const point=angle=>({x:canvas.x+(wheels.moon.x+radius*Math.cos(angle))/2424*canvas.width,
      y:canvas.y+(wheels.moon.y+radius*Math.sin(angle))/1080*canvas.height});
    const start=point(startAngle);
    await wheelTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(let step=1;step<=8;step++) {
      const next=point(startAngle+step*Math.PI/16);
      await wheelTouch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[next]});
    }
    await wheelTouch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().viewedSec!==48);
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().playbackTarget),0,
      'Rotating a wheel detaches automatic movement and holds the chosen time');
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getPhaseReferenceSnapshot().open),false,
      'A centre drag cannot accidentally open the phase reference');
  }
  await wheelTouch.detach();
  await seek(12);
  await click(wheels.centre);
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getPhaseReferenceSnapshot().open);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getPhaseReferenceSnapshot().phaseId),'death');
  for (const id of ['birth','food','housing','faith','migration','death']) {
    await click(await page.evaluate(id=>globalThis.__SETTLEMENT_DEBUG__.getPhaseReferenceClickPoint(id),id));
    const reference=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getPhaseReferenceSnapshot());
    assert.equal(reference.phaseId,id);
    assert.ok(reference.report.sections.find(section=>section.type==='table').rows.length>0);
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().viewedSec),12,
      'Inspecting a phase never scrubs or advances time');
  }
  await page.screenshot({path:'artifacts/chronicle-phase-reference.png'});
  await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getPhaseReferenceClickPoint('close')));
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
    x:mobileCanvas.x+16/2424*mobileCanvas.width,y:mobileCanvas.y+88/1080*mobileCanvas.height,
    width:1448/2424*mobileCanvas.width,height:720/1080*mobileCanvas.height,
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
  const holdCard=async point=>{
    const box=await page.locator('canvas').boundingBox();
    const x=box.x+point.x/2424*box.width,y=box.y+point.y/1080*box.height;
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await delay(150);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().pinned);
    const title=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().title);
    await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
    await delay(600);
    const tooltip=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
    assert.ok(tooltip.visible&&tooltip.pinned,'Touch details survive redraw and release');
    assert.equal(tooltip.title,title);
    if(tooltip.reading) {
      assert.equal(tooltip.expanded,false,'A touch first opens the quick Practice translation');
      assert.deepEqual(tooltip.glossary,[],'The phone quick read excludes the glossary');
      assert.ok(tooltip.titlePoint,'The quick read title opens inspect');
      await page.screenshot({path:'artifacts/chronicle-mobile-practice-quick.png'});
    }
    await page.touchscreen.tap(box.x+20/2424*box.width,box.y+1070/1080*box.height);
    await page.waitForFunction(()=>!globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible);
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible),false,'Outside tap dismisses details');
    await page.touchscreen.tap(x,y);
    await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
    await delay(100);
    const shortTap=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
    if(!shortTap.pinned)writeFileSync('artifacts/chronicle-touch-failure.json',JSON.stringify({title,point,shortTap,map:await page.evaluate(()=>{const m=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return {selected:m.selectedRegionId,open:m.detailPanelVisible};})},null,2));
    assert.equal(shortTap.pinned,true,`Short tap pins ${title} details across redraw`);
    if(shortTap.reading) {
      const p=shortTap.titlePoint;
      await page.touchscreen.tap(box.x+p.x/2424*box.width,box.y+p.y/1080*box.height);
      await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().expanded);
    }
    const currentTooltip=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
    if(currentTooltip.expanded) {
      assert.ok(currentTooltip.glossary.length,'The title opens the full symbol explanations');
      assert.ok(currentTooltip.glossaryRect.x>=currentTooltip.rulesRect.x+currentTooltip.rulesRect.width,'Glossary occupies the right-hand column');
      const keywordState=()=>page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().keywords);
      const keywordTap=async action=>{
        const state=await keywordState(),target=state.targets.find(target=>target.action===action);
        assert.ok(target,`Visible inspector keyword control: ${action}`);
        await page.touchscreen.tap(box.x+(target.x+target.width/2)/2424*box.width,box.y+(target.y+target.height/2)/1080*box.height);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      };
      const initialKeywords=await keywordState();
      assert.equal(initialKeywords.flavourLinked,false,'Flavour remains plain italic text');
      const dragTarget=initialKeywords.targets.find(target=>target.group==='symbols'&&target.action.startsWith('term:'));
      const dragX=box.x+(dragTarget.x+dragTarget.width/2)/2424*box.width;
      const dragY=box.y+(dragTarget.y+dragTarget.height/2)/1080*box.height;
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:dragX,y:dragY}]});
      for(const dy of [10,20,30])await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:dragX,y:dragY+dy}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await delay(100);
      assert.equal((await keywordState()).depth,0,'Dragging a linked symbol does not open its definition');
      // Both Practices and Structures expose the same recursive references.
      const first=currentTooltip.reading.type==='Structure'?'term:Stock capacity bonus':'term:Stock';
      await keywordTap(first);
      if(currentTooltip.reading.type==='Structure')await keywordTap('term:Stock');
      await keywordTap('term:Stock traits');
      await keywordTap('term:Bone');
      await keywordTap('term:Charge');
      const expectedDepth=currentTooltip.reading.type==='Structure'?5:4;
      assert.equal((await keywordState()).term,'Charge');
      assert.equal((await keywordState()).depth,expectedDepth);
      assert.equal((await keywordState()).panels,1,'Recursive reading uses one panel');
      await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
      await delay(100);
      assert.equal((await keywordState()).term,'Charge','References survive settlement redraw');
      await page.screenshot({path:`artifacts/chronicle-mobile-${currentTooltip.reading.type.toLowerCase()}-keywords.png`});
      await keywordTap('‹ Back');
      assert.equal((await keywordState()).term,'Bone');
      await page.keyboard.press('Escape');
      await delay(100);
      assert.equal((await keywordState()).term,'Stock traits','Escape retraces one keyword');
      assert.ok(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().expanded),'Escape keeps the full inspector open');
      await keywordTap('×');
      assert.equal((await keywordState()).depth,0,'Close dismisses the entire reference stack');
      await keywordTap(first);
      await page.touchscreen.tap(box.x+140/2424*box.width,box.y+124/1080*box.height);
      await delay(100);
      assert.equal((await keywordState()).depth,0,'Outside tap dismisses the reference');
      assert.ok(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().expanded),'Outside reference tap keeps inspection open');
      const p=currentTooltip.closePoint;
      await page.touchscreen.tap(box.x+p.x/2424*box.width,box.y+p.y/1080*box.height);
    } else await page.touchscreen.tap(x,y);
    await delay(50);
    assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().visible),false,'Close dismisses expanded inspection; compact details toggle on their source');
  };
  await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getWorldMapClickPoint('cedar-woods')));
  await page.waitForFunction(()=>{const m=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating&&!m.panelReveal?.animating;});
  await holdCard(await regionalPracticePoint());
  await holdCard(await regionalStructurePoint());
  await holdCard(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph.legendButtons[0]));
  await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('settlement')));await delay(150);
  await holdCard({x:700,y:220});
  await holdCard({x:675,y:680});
  await click(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('map')));
  await seek(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().frontierSec));
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.openNextSelection());
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getVassalCandidateClickPoint(0));
  const candidate=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getVassalCandidateClickPoint(0));
  candidateBox=await page.locator('canvas').boundingBox();
  const candidateX=candidateBox.x+candidate.x/2424*candidateBox.width;
  const candidateY=candidateBox.y+candidate.y/1080*candidateBox.height;
  await page.touchscreen.tap(candidateX,candidateY);
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await delay(150);
  const selection=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.selectCandidate(0));
  assert.equal(selection.ok,true,'The supported fixture action selects the previewed candidate');
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal);
  await delay(250);
  const node=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
  await click(await page.evaluate(id=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),node));
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint());
  const enter=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint());
  if(enter)await click(enter);
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(0)
    ??globalThis.__SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0));
  const choice=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(0)
    ??globalThis.__SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0));
  assert.ok(choice,'The first life node exposes a choice');
  const beforeInspection=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  for (const panel of beforeInspection.costPanels) {
    assert.ok(panel.rect.height / 1080 * candidateBox.height >= 44, 'Cost footers stay touch-sized on a phone');
    assert.ok(panel.description.includes('phase') || panel.description.includes('moon') || panel.description.includes('year'),
      'Icon amounts retain a readable duration description');
  }
  const firstCard=beforeInspection.costPanels[0];
  await click({x:firstCard.cardRect.x+firstCard.cardRect.width/2,y:(firstCard.cardRect.y+firstCard.rect.y)/2});await delay(200);
  const afterInspection=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  if(beforeInspection.offers.length || !['patronage','development','relic'].includes(beforeInspection.family)) {
    assert.ok(afterInspection.inspectedCardId,'Tapping gamepiece art opens its full inspection');
    assert.equal(afterInspection.selectedOptionId,beforeInspection.selectedOptionId,'Inspection cannot select a choice');
  } else {
    // Personal outcomes show all tradeoffs on the card and select on a tap.
    // Full gamepiece inspection is covered by the shop scenario below.
    assert.equal(afterInspection.inspectedCardId,null,'Personal outcomes need no inspection overlay');
    assert.ok(afterInspection.selectedOptionId,'Tapping a personal outcome selects it');
  }
  assert.deepEqual(afterInspection.purchaseOrder,beforeInspection.purchaseOrder,'Inspection cannot stage a purchase');
  await page.screenshot({path:'artifacts/chronicle-mobile-inspection.png'});
  const inspectedCost=afterInspection.inspectedCardId
    ? await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapInspectionCostPoint()) : choice;
  const noopBox=await page.locator('canvas').boundingBox();
  const noopStart=performance.now();
  await page.touchscreen.tap(noopBox.x+350/2424*noopBox.width,noopBox.y+960/1080*noopBox.height);
  interactionTimings.backdropTapMs=Math.round(performance.now()-noopStart);
  const costTouch=await page.context().newCDPSession(page);
  const optionStartAt=performance.now();
  await costTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{
    x:candidateBox.x+inspectedCost.x/2424*candidateBox.width, y:candidateBox.y+inspectedCost.y/1080*candidateBox.height,
  }]});
  interactionTimings.optionTouchStartMs=Math.round(performance.now()-optionStartAt);
  await delay(220);
  const optionReleaseStart=performance.now();
  await costTouch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  interactionTimings.optionReleaseMs=Math.round(performance.now()-optionReleaseStart);
  interactionTimings.optionDispatchMs=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getPerfSnapshot().runtime.actionDispatchLastMs);
  await costTouch.detach();
  await page.waitForFunction(()=>{
    const decision=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision;
    return decision.costPanels.some(panel=>panel.selected)||decision.purchaseOrder.length>0;
  },null,{timeout:5000});
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.resolving),false,
    'A held cost press stages or selects; confirmation stays separate');

  }
  if(!shopOnly) {
    // Separate authored runs own separate UI and forecast sessions.
    await touch.detach();await browser.close();
    browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
    await openProbePage({width:844,height:390});
    await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.enterBootTestRun());
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().browseCapSec>60);
    touch=await page.context().newCDPSession(page);
  } else await page.setViewportSize({width:844,height:390});
  await checkUtility();candidateBox=await page.locator('canvas').boundingBox();

  // Use the supported authoring controls to reach a real shop on a fresh run.
  // This exercises Prestige, affordability and staged cards in the same modal
  // as the zero-Prestige travel choices above, without editing simulation state.
  await page.goto(url+'/#/dev/gym?workspace=setup');
  await page.getByTestId('debug-profile-copy').click();
  await page.getByTestId('debug-lifeMapLab-tab').click();
  for (const family of VASSAL_NORMAL_NODE_FAMILY_IDS.filter(id=>!['practiceReform','publicWorks'].includes(id))) {
    const weight=page.getByTestId('life-map-lab-weight-early-'+family);
    await weight.fill('0');await weight.press('Enter');
  }
  await page.getByTestId('debug-start-new-run').click();
  await page.getByTestId('lab-play-badge').waitFor({timeout:60000});
  await page.getByTestId('debug-open').click({delay:950});
  await page.getByTestId('debug-vassal-tab').click();
  for (const [field,value] of [['prestige',20],['age',20],['cunning',0],['wisdom',0],['effectiveness',0],['intelligence',0]]) {
    const input=page.getByTestId('vassal-debug-'+field);
    await input.fill(String(value));await input.press('Enter');
  }
  await page.getByTestId('vassal-debug-apply').click();
  await page.keyboard.press('Escape');
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.selectCandidate(0));
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal?.debugInjected);
  await seek(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().frontierSec));
  await delay(250);
  const shopNode=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
  await click(await page.evaluate(id=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),shopNode));
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint());
  const shopEnter=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint());
  if(shopEnter)await click(shopEnter);
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
    .lifeMapDecision.costPanels.length>0);
  let shopBefore=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  if(['philosopherFounding','warlordFounding'].includes(shopBefore.family)) {
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.animation.phase==='open');
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels[0]?.disabled===false);
    await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0)));
    await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.selectedOptionId);
    await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getLifeMapConfirmClickPoint());
    const founding=await page.evaluate(()=>{const s=globalThis.__SETTLEMENT_DEBUG__.getSnapshot();return {decision:s.lifeMapDecision,viewed:s.viewedSec,frontier:s.frontierSec,processing:s.worldMap.lifeDecisionProcessing};});
    writeFileSync('artifacts/chronicle-founding-fixture.json',JSON.stringify(founding,null,2));
    await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapConfirmClickPoint()));
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapRecap.open,null,{timeout:45000});
    await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapRecapDismissClickPoint()));
    await page.waitForFunction(()=>!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapRecap.open);
    await delay(250);
    const nextShopNode=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
    await click(await page.evaluate(id=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),nextShopNode));
    await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint());
    await click(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint()));
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels.length>0);
    shopBefore=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  }
  assert.ok(['practiceReform','publicWorks'].includes(shopBefore.family),`The configured opening leads to a shop (actual: ${shopBefore.family})`);
  assert.equal(shopBefore.offers.length,3,'The visit retains all three shop offers');
  assert.ok(shopBefore.costPanels.length>0&&shopBefore.costPanels.length<=3,'Full-size offers show prices on the current page');
  const affordableIndex=shopBefore.costPanels.findIndex(panel=>!panel.disabled&&panel.prestigeCost>0);
  assert.ok(affordableIndex>=0,'The fixture exposes a paid, affordable offer');
  const shopChoice=await page.evaluate(index=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(index),affordableIndex);
  const shopNoopStart=performance.now();
  await page.touchscreen.tap(candidateBox.x+350/2424*candidateBox.width,candidateBox.y+960/1080*candidateBox.height);
  interactionTimings.shopBackdropTapMs=Math.round(performance.now()-shopNoopStart);
  const tap=async point=>{
    const b=await page.locator('canvas').boundingBox();
    await page.touchscreen.tap(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);
  };
  const shopTapStart=performance.now();
  await tap(shopChoice);
  if (await page.evaluate(()=>!!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.replacementOfferId)) {
    await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapTableauClickPoint(4)));
  }
  interactionTimings.shopTapMs=Math.round(performance.now()-shopTapStart);
  interactionTimings.shopDispatchMs=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getPerfSnapshot().runtime.actionDispatchLastMs);
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length===1);
  const shopAfter=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  assert.equal(shopAfter.currentPrestige,shopBefore.currentPrestige,'Staging leaves actual Prestige unchanged');
  assert.equal(shopAfter.projectedPrestige,shopBefore.currentPrestige-shopBefore.costPanels[affordableIndex].prestigeCost);
  assert.equal(shopAfter.costPanels.length,shopBefore.costPanels.length,'Staging keeps full-size prices visible');
  assert.ok(shopAfter.costPanels[affordableIndex].staged,'The purchased offer is visibly staged in its original position');
  const panelCentres=decision=>decision.costPanels.map(({rect})=>[rect.x+rect.width/2,rect.y+rect.height/2]);
  assert.deepEqual(panelCentres(shopAfter),panelCentres(shopBefore),
    'The remaining offer touch targets cannot shift after staging');
  for (const [index,panel] of shopAfter.costPanels.entries()) {
    assert.equal(panel.unaffordable,!panel.staged&&panel.prestigeCost>shopAfter.projectedPrestige);
    assert.equal(panel.disabled,panel.staged||panel.unaffordable||shopAfter.offers.find(offer=>offer.offerId===shopAfter.visibleOfferIds[index])?.canStage===false);
    assert.ok(panel.description.includes('Prestige'),'The accessible price includes its Prestige row');
  }
  await tap(shopChoice);await delay(200);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length),1,
    'A staged footer cannot buy the same offer twice');
  await page.screenshot({path:'artifacts/chronicle-mobile-shop.png'});
  const practiceIndex=shopAfter.practices.findIndex(piece=>piece?.presentation?.reading);
  assert.ok(practiceIndex>=0,'The shop tableau includes a Practice for the phone quick-read flow');
  const practicePoint=await page.evaluate(index=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapTableauClickPoint(index),practiceIndex);
  await tap(practicePoint);
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.quickCardId);
  const quickShop=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  assert.equal(quickShop.inspectedCardId,null,'A phone shop Practice tap opens the quick read first');
  assert.deepEqual(quickShop.purchaseOrder,shopAfter.purchaseOrder,'Reading a staged offer does not stage another purchase');
  await tap({x:quickShop.inspectionRect.x+quickShop.inspectionRect.width/2,
    y:quickShop.inspectionRect.y+quickShop.inspectionRect.height-30});
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.quickCardId),quickShop.quickCardId,'Tapping the quick read body leaves it open');
  const outsideCostIndex=quickShop.costPanels.findIndex(panel=>{
    const x=panel.rect.x+panel.rect.width/2,y=panel.rect.y+panel.rect.height/2,r=quickShop.inspectionRect;
    return !panel.disabled&&(x<r.x||x>r.x+r.width||y<r.y||y>r.y+r.height);
  });
  assert.ok(outsideCostIndex>=0,'An affordable shop footer lies outside the quick read');
  const outsideCost=quickShop.costPanels[outsideCostIndex].rect;
  await tap({x:outsideCost.x+outsideCost.width/2,y:outsideCost.y+outsideCost.height/2});
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.quickCardId),null,'Tapping outside dismisses the shop quick read');
  assert.deepEqual(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder),shopAfter.purchaseOrder,'Dismissal cannot activate an underlying cost footer');
  await tap(practicePoint);
  const titlePoint=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionTitlePoint);
  const titleBox=await page.locator('canvas').boundingBox();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{
    x:titleBox.x+titlePoint.x/2424*titleBox.width,y:titleBox.y+titlePoint.y/1080*titleBox.height,
  }]});
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await delay(200);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.quickCardId),quickShop.quickCardId,'A held title survives shop redraws');
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId),'practice:'+shopAfter.practices[practiceIndex].practiceId,'The shop Practice title opens inspect');
  assert.ok(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionAboveChrome),'Full Practice inspect rises above the vassal HUD and navigation');
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  assert.ok(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionAboveChrome),'Full inspect retains its foreground layer after redraw');
  const shopKeyword=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionKeywords.targets.find(target=>target.action.startsWith('term:')));
  assert.ok(shopKeyword,'Shop inspectors expose shared keyword links');
  await tap({x:shopKeyword.x+shopKeyword.width/2,y:shopKeyword.y+shopKeyword.height/2});
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionKeywords.depth===1);
  const shopReference=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionKeywords.term);
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await delay(100);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionKeywords.term),shopReference,'Shop references survive redraw');
  await page.keyboard.press('Escape');
  await delay(100);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionKeywords.depth),0,'Root Back dismisses shop reference');
  assert.ok(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId),'Keyword navigation keeps the shop inspector open');
  await page.screenshot({path:'artifacts/chronicle-mobile-practice-foreground.png'});
  const reviewPoint=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionDevPoint);
  assert.ok(reviewPoint,'shop inspector exposes the Dev review control');
  const reviewPopup=page.waitForEvent('popup');
  await tap(reviewPoint);
  const reviewerPage=await reviewPopup;
  await reviewerPage.getByRole('heading',{name:'Card reviewer',exact:true}).waitFor();
  assert.ok(reviewerPage.url().includes('/dev/reviewer?card='),'Dev opens the flagged card in the reviewer');
  assert.equal(await reviewerPage.locator('.review-queue button').count(),1);
  await reviewerPage.close();
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId),quickShop.quickCardId,'review handoff preserves the current shop inspection');
  const inspectNavigation=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().navigation);
  await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('map')));
  const dismissedInspect=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(dismissedInspect.lifeMapDecision.inspectedCardId,null,'The inspect backdrop catches taps over the bottom-left controls');
  assert.ok(dismissedInspect.lifeMapDecision.open,'Tapping behind inspect cannot navigate away from the node');
  assert.equal(dismissedInspect.lifeMapDecision.inspectionAboveChrome,false,'Closing inspect restores the regular modal layer');
  assert.deepEqual(dismissedInspect.navigation,inspectNavigation,'The underlying navigation control does not activate');
  const inspectOffer=async()=>{
    await tap(await page.evaluate(index=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferFacePoint(index),affordableIndex));
    const quick=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.quickCardId);
    if(quick)await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionTitlePoint));
  };
  await inspectOffer();
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId),shopAfter.purchaseOrder[0],
    'Staged offers retain their full inspection');
  await page.screenshot({path:'artifacts/chronicle-mobile-shop-inspection.png'});
  await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapInspectionClosePoint()));
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapInspectionClosePoint()),null,
    'Closing the enlarged inspection returns to the staged shop');
  await inspectOffer();
  await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapInspectionClosePoint()));
  const secondOffer=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(0));
  await tap(secondOffer);
  if (await page.evaluate(()=>!!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.replacementOfferId)) {
    await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapTableauClickPoint(4)));
  }
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length===2);
  let limitedShop=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  if(!limitedShop.costPanels.some(panel=>panel.unaffordable&&panel.disabled)) {
    await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferPageClickPoint(1)));
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels.some(panel=>panel.unaffordable));
    limitedShop=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  }
  assert.ok(limitedShop.costPanels.some(panel=>panel.unaffordable&&panel.disabled),
    'Spending the projected balance visibly disables an unaffordable offer');
  const unavailableOffer=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(0));
  await tap(unavailableOffer);await delay(150);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length),2,
    'Tapping an unaffordable footer cannot stage a purchase');
  await page.screenshot({path:'artifacts/chronicle-mobile-shop.png'});
  if(limitedShop.offerPage!==shopAfter.offerPage) {
    await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapOfferPageClickPoint(0)));
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.offerPage===0);
  }
  // Exercise keyboard navigation last: Pixi's accessibility mode traverses
  // the whole scene, so it should not carry into the timing-sensitive recap.
  await inspectOffer();
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId);
  const keyboardTarget=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionKeywords.targets.find(target=>target.action.startsWith('term:')));
  const keyboardTerm=keyboardTarget.action.slice(5);
  await page.keyboard.press('Tab');
  await page.getByTitle(`Explain ${keyboardTerm}`,{exact:true}).first().focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(term=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionKeywords.term===term,keyboardTerm);
  await page.waitForFunction(()=>document.activeElement?.title==='‹ Back');
  await page.keyboard.press('Enter');
  await page.waitForFunction(term=>document.activeElement?.title===`Explain ${term}`,keyboardTerm);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionKeywords.depth),0,'Back returns to the originating keyword');
  await tap(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getLifeMapInspectionClosePoint()));
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId),null,'Canvas taps work after keyboard reading');
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
  assert.deepEqual(graphicsWarnings,[],'The renderer must not emit WebGL failures');
  writeFileSync(artifact,JSON.stringify({ok:true,checks:shopOnly?['shop staging and affordability','shared inspector keyword references','right-hand symbol key','Back and Close','keyboard focus and touch handoff']:['resource sprite assets','hidden workshop','pixel-identical pause','pixel-identical rewind seek','forward and reverse audio','solar, moon and centre touch drags','six-phase reference without time changes','vertical lever direction locks','phone landscape','touch-sized cost footers','utility rail alignment','desktop hover survives redraw and dismisses on exit','Practice hover/inspect separation and right-hand glossary','touch details survive redraw','Vassal preview and confirmation','inspection preserves choices','shop staging preserves positions and full inspections','projected Prestige and affordability','recursive keyword references and Back/Close','keyboard focus and touch handoff'],interactionTimings,graphicsWarnings},null,2));
  console.log(`[probe:chronicle] OK: ${shopOnly?'shop checks':'option dispatch '+Math.round(interactionTimings.optionDispatchMs)+' ms'}, shop dispatch ${Math.round(interactionTimings.shopDispatchMs)} ms`);
}catch(error){
  writeFileSync(artifact,JSON.stringify({error:error.stack,interactionTimings,errors,failedAssets,graphicsWarnings,consoleTrail},null,2));
  console.error('[probe:chronicle] FAILED: '+error.message.split('\n')[0]+' · '+artifact);process.exitCode=1;
}finally{await browser?.close();server.kill();}
