import assert from 'node:assert/strict';

export async function checkLifegraphRelicPools(page){
  await page.getByTestId('lifegraph-node-relic').click();
  const pool=page.getByTestId('lifegraph-relic-pool');
  await page.getByLabel('Relic Bronze appearance weight',{exact:true}).fill('70');
  await page.getByLabel('Relic Bronze appearance weight',{exact:true}).press('Tab');
  await page.waitForFunction(()=>__LAB_DEBUG__.getLifegraph().draft.generatorConfig.design.relicPools.relic.qualities.bronze.weight===70);
  assert.match(await pool.locator('tbody tr').filter({hasText:'Bronze'}).textContent(),/60.87%/);
  await page.getByLabel('Relic Diamond enabled',{exact:true}).uncheck();
  assert.equal(await page.locator('.lab-lifegraph-choice-card').count(),1,'ordinary and Special searches have separate reviewers');
  await page.getByTestId('lifegraph-node-specialRelic').click();
  await page.getByLabel('Special Relic Crown of Ages enabled',{exact:true}).waitFor();
  assert.equal(await pool.locator('input[type=checkbox]').count(),14);
  await page.getByRole('button',{name:'Disable all Relics',exact:true}).click();
  await page.getByText('No eligible Relics; this node offers a free exit.',{exact:true}).waitFor();
  await page.getByLabel('Special Relic Crown of Ages enabled',{exact:true}).check();
  await page.getByLabel('Special Relic Signet Ring enabled',{exact:true}).check();
  for(const [name,value]of [['Crown of Ages','99'],['Signet Ring','1']]){
    const weight=page.getByLabel(`Special Relic ${name} appearance weight`,{exact:true});await weight.fill(value);await weight.press('Tab');
  }
  await page.waitForFunction(()=>__LAB_DEBUG__.getLifegraph().draft.generatorConfig.design.relicPools.specialRelic.entries.signetRing.weight===1);
  assert.match(await pool.locator('tbody tr').filter({hasText:'Crown of Ages'}).textContent(),/99%/);
  await page.screenshot({path:'artifacts/lifegraph-special-relic-pool.png',fullPage:true});
  await page.getByTestId('lifegraph-play-type').click();
  await page.waitForFunction(()=>__LAB_DEBUG__.getNodeSandbox()?.modal.animation.phase==='open');
  const offers=await page.evaluate(()=>{const s=__LAB_DEBUG__.getNodeSandbox();return s.vassal.lifeMap.nodeStates[s.nodeId].options.map(o=>o.definitionId).sort();});
  assert.deepEqual(offers,['crownOfAges','signetRing'],'real modal uses the edited individual pool without disabled backfill');
  assert.equal(await page.evaluate(()=>{const s=__LAB_DEBUG__.getNodeSandbox();return s.vassal.lifeMap.nodeStates[s.nodeId].specialRelic;}),true);
  await page.screenshot({path:'artifacts/lifegraph-special-relic-player.png'});
  await page.getByTestId('lifegraph-close-player').click();
  await page.setViewportSize({width:390,height:844});
  await page.getByTestId('lifegraph-node-relic').click();await pool.waitFor();
  await page.screenshot({path:'artifacts/lifegraph-relic-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Relic appearance tools fit mobile');
  await page.setViewportSize({width:1280,height:800});
  const original=await page.evaluate(()=>__LAB_DEBUG__.getLifegraph().draft.generatorConfig.design.relicPools.relic.qualities.bronze.weight);
  assert.equal(original,70,'Special pool edits leave ordinary quality weights unchanged');
  await page.getByTestId('lifegraph-tab-share').click();
  await page.getByTestId('lifegraph-load-defaults').click();
  await page.getByTestId('lifegraph-tab-nodes').click();
}
