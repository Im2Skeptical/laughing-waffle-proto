import assert from 'node:assert/strict';

// Shared by the Development Lab probe; exercise the actual game's Pixi inputs.
export async function checkNodeSandbox(page, context) {
  const before = await page.evaluate(()=>({state:JSON.stringify(__LAB_DEBUG__.getSnapshot().state),storage:JSON.stringify({...localStorage})}));
  await page.getByTestId('lab-workspace-node').click();
  const canvas=page.getByTestId('lab-node-sandbox');
  const snapshot=()=>page.evaluate(()=>{const s=__LAB_DEBUG__.getNodeSandbox();return {seed:s.settings.seed,research:s.settings.research,actualResearch:s.state.civilization.research.total,type:s.settings.type,tSec:s.state.tSec,modal:s.modal.open,staged:s.modal.purchaseOrder.length,prestige:s.modal.currentPrestige,projected:s.modal.projectedPrestige,inspected:s.modal.inspectedCardId,offers:s.modal.offers.map(o=>({label:o.label,kind:o.kind,canStage:o.canStage})),selected:s.modal.selectedOptionId,pending:!!s.vassal?.lifeMap.pendingResolution};});
  async function point(kind,index=0) {
    await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox().modal.animation.phase==='open');
    await canvas.scrollIntoViewIfNeeded();
    const p=await page.evaluate(({kind,index})=>__LAB_DEBUG__.getNodeSandboxPoint(kind,index),{kind,index});
    assert.ok(p,`${kind} target exists`);
    const r=await canvas.boundingBox();return {x:r.x+p.x*r.width/2424,y:r.y+p.y*r.height/1080};
  }
  async function click(kind,index=0) {
    const p=await point(kind,index);await page.mouse.move(p.x,p.y);
    // Mouse hover installs the game's preview layout after its short dwell.
    await page.waitForTimeout(180);
    const settled=await point(kind,index);await page.mouse.click(settled.x,settled.y);
  }
  async function staged() {
    try { await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox().modal.purchaseOrder.length===1,null,{timeout:3000}); }
    catch {
      const actual=await page.evaluate(()=>{const s=__LAB_DEBUG__.getNodeSandbox();return {type:s.settings.type,open:s.modal.open,pending:s.modal.interactionPending,costs:s.modal.costPanels.map(c=>({state:c.interactionState,disabled:c.disabled})),status:document.querySelector('.lab-panel [role="status"]').textContent};});
      throw new Error(`Expected one staged offer; actual ${JSON.stringify(actual)}`);
    }
  }
  await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox()?.modal.animation.phase==='open');
  const initial=await snapshot();
  await click('offer');await staged();
  assert.ok((await snapshot()).projected<initial.prestige,'stage reserves Prestige');
  await click('undo');await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox().modal.purchaseOrder.length===0);
  assert.equal((await snapshot()).projected,initial.prestige);
  await click('face');await page.waitForFunction(()=>!!__LAB_DEBUG__.getNodeSandbox().modal.inspectedCardId);
  await click('inspectClose');
  const from=await point('face'), to=await point('tableau',2);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
  await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox().modal.purchaseOrder.length===1);
  await page.getByTestId('lab-node-refresh').click();
  assert.equal((await snapshot()).staged,0);assert.deepEqual((await snapshot()).offers,initial.offers,'same seed reproduces offers and clears draft');
  await page.getByTestId('lab-node-next-seed').click();assert.equal((await snapshot()).seed,43);
  assert.notDeepEqual((await snapshot()).offers,initial.offers);
  await page.getByLabel('Refresh seed',{exact:true}).fill('42');await page.getByTestId('lab-node-refresh').click();
  assert.deepEqual((await snapshot()).offers,initial.offers);
  await page.getByLabel('Refresh seed',{exact:true}).fill('-1');await page.getByTestId('lab-node-refresh').click();
  assert.equal((await snapshot()).seed,42,'invalid refresh preserves the fixture');
  await page.getByLabel('Refresh seed',{exact:true}).fill('42');
  await page.getByLabel('Dummy class',{exact:true}).selectOption('unclassed');
  await page.getByLabel('Research',{exact:true}).fill('100');await page.getByTestId('lab-node-refresh').click();
  const silverUnlock=await snapshot();assert.equal(silverUnlock.actualResearch,100);
  await page.getByLabel('Research',{exact:true}).fill('300');await page.getByTestId('lab-node-refresh').click();
  const researchSetup=await snapshot();assert.equal(researchSetup.research,300);assert.equal(researchSetup.actualResearch,300);
  assert.notDeepEqual(researchSetup.offers,silverUnlock.offers,'Research changes the real quality rolls');
  assert.ok(researchSetup.offers.some(o=>o.label.startsWith('Learn Silver')));
  await page.getByTestId('lab-node-refresh').click();assert.deepEqual((await snapshot()).offers,researchSetup.offers,'same seed and Research reproduce offers');
  await page.getByTestId('lab-node-next-seed').click();assert.equal((await snapshot()).research,300);
  await page.getByLabel('Refresh seed',{exact:true}).fill('42');await page.getByTestId('lab-node-refresh').click();
  assert.deepEqual((await snapshot()).offers,researchSetup.offers);
  await page.getByLabel('Research',{exact:true}).fill('-1');await page.getByTestId('lab-node-refresh').click();
  assert.equal((await snapshot()).actualResearch,300,'invalid Research preserves the fixture');
  await page.getByLabel('Research',{exact:true}).fill('0');await page.getByLabel('Dummy class',{exact:true}).selectOption('scholar');
  await page.getByLabel('Sandbox node type').selectOption('publicWorks');await page.getByTestId('lab-node-refresh').click();
  assert.ok((await snapshot()).offers.every(o=>o.kind==='structure'));
  await click('offer');await staged();
  await click('confirm');await page.waitForFunction(()=>!__LAB_DEBUG__.getNodeSandbox().modal.open);
  assert.ok((await snapshot()).pending,'Confirm starts real resolution');
  await page.getByLabel('Sandbox node type').selectOption('patronage');await page.getByTestId('lab-node-refresh').click();
  await click('confirm');
  await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox().modal.blockedNotice==='Choose an option first.');
  assert.equal((await snapshot()).modal,true,'a blocked Confirm explains itself without closing the node');
  await click('option');assert.ok((await snapshot()).selected);
  await click('confirm');await page.getByTestId('lab-node-resolve').click();
  assert.ok((await snapshot()).tSec>0);assert.equal((await snapshot()).pending,false);
  await page.getByLabel('Sandbox node type').selectOption('practiceReform');await page.getByTestId('lab-node-refresh').click();
  await canvas.scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/development-lab-node-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'portrait page contains the wide canvas');
  await page.setViewportSize({width:844,height:390});
  const fullscreen=page.locator('.lab-node-viewport .dev-preview-fullscreen');
  await fullscreen.click();await page.waitForFunction(()=>document.querySelector('.lab-node-viewport').classList.contains('dev-preview-expanded'));
  await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox().modal.animation.phase==='open');
  const touch=await context.newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const tap=await point('offer');
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tap]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox().modal.purchaseOrder.length===1);
  await page.screenshot({path:'artifacts/development-lab-node-mobile.png'});
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();
  await fullscreen.click();await page.setViewportSize({width:1280,height:800});
  const after=await page.evaluate(()=>({state:JSON.stringify(__LAB_DEBUG__.getSnapshot().state),storage:JSON.stringify({...localStorage})}));
  assert.ok(before.state===after.state,'dummy interactions leave the Gym timeline untouched');
  assert.ok(before.storage===after.storage,'dummy interactions write no saved state');
  await page.getByRole('link',{name:'Zoo · content',exact:true}).click();await canvas.waitFor({state:'detached'});
  assert.equal(await canvas.count(),0,'node workspace is absent from Zoo');
  await page.getByRole('link',{name:'Museum · systems',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-mode="museum"]').getAttribute('aria-current')==='page');
  assert.equal(await canvas.count(),0,'node workspace is absent from Museum');
  await page.getByRole('link',{name:'Gym · sandbox',exact:true}).click();await page.getByTestId('lab-workspace-settlement').click();
}
