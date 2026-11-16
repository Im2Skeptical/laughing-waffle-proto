import { createTestCapture, readTestCapture, cloneCaptureData, openTestCaptureFile } from '../../controllers/agent-test-links.js';

const download=(name,text)=>{
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url);
};

// Explicit adapters, not DOM/Pixi snapshots: restored panels retain their real
// event handlers. UI state and the optional Dev journal never enter GameState.
export function installAgentTestLinkSession({runner,session,menu,getState,getNavigation,setNavigation,
  panels,ready,prepare,source:readSource,isBusy,hold,onFailure}) {
  let loaded=null,lastError=null,phase='idle';
  const source=()=>readSource();
  function captureView() {
    if(!session.canResume())throw Error('Open a game before capturing a test situation.');
    if(isBusy())throw Error('Finish the current loading, decision or drag before capturing.');
    const state=getState();
    const result={format:1,navigation:cloneCaptureData(getNavigation()),panels:{}};
    for(const [id,adapter] of Object.entries(panels))result.panels[id]=cloneCaptureData(adapter.capturePanelState());
    if(result.panels.decisionDraft.actions?.length&&state.tSec!==runner.getTimeline().historyEndSec)throw Error('Return to the present before capturing a staged decision.');
    return {state,view:result};
  }
  function validateView(view) {
    if(!['map','settlement','vassalLife'].includes(view.navigation?.mode))throw Error('Unknown test-link game view.');
    const expected=Object.keys(panels),actual=Object.keys(view.panels??{});
    if(expected.length!==actual.length||actual.some(id=>!Object.hasOwn(panels,id))||expected.some(id=>!Object.hasOwn(view.panels,id)))throw Error('The test capture does not cover this build’s panel inventory.');
  }
  async function capture({baseUrl=location.href}={}) {
    const {state,view}=captureView();
    const diagnostics={format:1,source:source(),viewedSec:state.tSec,frontierSec:runner.getTimeline().historyEndSec,
      trace:runner.exportPlayerActionTrace(),replay:runner.exportCurrentSave()};
    // Freeze synchronously before compression or network awaits let play advance.
    const captured=await createTestCapture({state,view,source:source(),baseUrl});
    const response=await fetch(new URL('build-info.json',document.baseURI),{cache:'no-store'});
    if(!response.ok||(await response.json()).build!==source().build)throw Error('The loaded game is stale. Save and reload before capturing.');
    return {...captured,diagnostics};
  }
  async function restore() {
    phase='decode';
    const packet=await readTestCapture(location.hash,source());
    if(!packet)return false;
    validateView(packet.view);
    if(packet.view.navigation.regionId&&!packet.state.world.regions.some(region=>region.id===packet.view.navigation.regionId))throw Error('The captured region is missing.');
    const current=await fetch(new URL('build-info.json',document.baseURI),{cache:'no-store'});
    if(!current.ok||(await current.json()).build!==source().build)throw Error('The preview changed during entry. Reload and use a current test link.');
    const result=session.enterDisposableState(packet.state);
    if(!result.ok)throw Error(result.reason);
    session.openMenu();
    setNavigation(packet.view.navigation);
    phase='prepare';await prepare?.(stage=>{phase=stage;});
    // Fresh-run preparation can latch a forecast before follow is suspended.
    // Panel drafts must read the captured cursor, not that incidental preview.
    hold?.();
    // Drafts and modal prerequisites precede any view that reads their content.
    for(const id of Object.keys(panels)) {
      if(id==='tooltip'||id==='menu')continue;
      phase=`panel:${id}`;
      panels[id].restorePanelState(packet.view.panels[id]);
    }
    phase='panel-readiness';await ready();
    panels.tooltip.restorePanelState(packet.view.panels.tooltip);
    if(!packet.view.panels.menu)session.resume();
    panels.menu.restorePanelState(packet.view.panels.menu);
    hold?.();
    loaded={source:packet.source,viewedSec:packet.state.tSec};
    phase='ready';
    const badge=document.createElement('div');badge.dataset.testid='agent-test-link-badge';
    badge.style.cssText='color:#eff7ed;background:#152725;padding:2px 4px;font:10px/1 system-ui;white-space:nowrap';
    badge.textContent='Test';badge.title=`Unsaved test capture. Refresh restarts at ${loaded.viewedSec}s.`;badge.tabIndex=0;
    document.querySelector('[data-testid="utility-controls"]').append(badge);
    return true;
  }
  const api={
    capture,
    async download(options){const result=await capture(options);download('test-capture.json',result.text);return {url:result.url,needsFile:result.needsFile,encodedCharacters:result.encodedCharacters};},
    downloadDiagnostics(){const saved=runner.exportCurrentSave();download('test-diagnostics.json',JSON.stringify({format:1,source:source(),trace:runner.exportPlayerActionTrace(),replay:saved}));return {ok:saved.ok};},
    openFile:text=>openTestCaptureFile(text,source(),location.href),
    getPanelInventory:()=>Object.keys(panels),
    getStatus:()=>({loaded,lastError,phase}),
  };
  globalThis.__AGENT_TEST_LINKS__=api;
  if(new URLSearchParams(location.hash.split('?')[1]??'').has('test')||new URLSearchParams(location.hash.split('?')[1]??'').has('testFile')) {
    const loading=document.createElement('div');loading.dataset.testid='test-link-loading';loading.setAttribute('role','status');
    loading.style.cssText='position:fixed;inset:0;z-index:3000;display:grid;place-items:center;color:#eff7ed;background:#101a1e;font:20px system-ui';
    loading.textContent='Opening test situation…';document.body.append(loading);
    const menuElement=document.getElementById('game-menu');if(menuElement)menuElement.inert=true;
    void restore().catch(error=>{lastError=error.message;phase='error';session.openMenu({force:true});menu.show();menu.showError(`Test link failed: ${error.message}`);onFailure?.(error);})
      .finally(()=>{loading.remove();if(menuElement)menuElement.inert=false;});
  }
  return api;
}
