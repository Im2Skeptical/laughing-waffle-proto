import { createVassalDebugDom } from "./vassal-debug-dom.js";
import { createSaveDiagnosticsDom } from './save-diagnostics-dom.js';

export function createSettlementDebugMenuDom({
  vassalDebugPresetController,
  getState,
  replaceVassalCandidate,
  openDevelopmentLab,
  openCurrentStateInGym,
  getSaveDiagnosticReport,
} = {}) {
  const utilityControls = document.createElement("div");
  utilityControls.dataset.testid = "utility-controls";
  utilityControls.style.cssText = [
    "position:fixed", "right:12px", "top:10px", "z-index:1000",
    "display:flex", "gap:8px", "align-items:center",
  ].join(";");

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "⌛";
  openButton.className = 'chronicle-workshop-seal';
  openButton.title = 'Hold the seal to open the workshop · Ctrl+Shift+D';
  openButton.setAttribute('aria-label','Hold to open development workshop');
  openButton.dataset.testid = "debug-open";
  openButton.style.cssText = [
    "min-height:34px", "padding:5px 12px", "border-radius:6px",
    "border:1px solid #d7b450", "background:#384755", "color:#f6efe3",
  ].join(";");

  utilityControls.append(openButton);
  const panel = document.createElement("section");
  panel.className = "codex-debug-panel";
  panel.style.cssText = [
    "display:none", "position:fixed", "inset:8px", "z-index:999",
    "overflow:auto", "padding:12px", "border:1px solid #d7b450",
    "border-radius:8px", "background:#252c33",
  ].join(";");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close debug";
  closeButton.title = "Close development tools";
  closeButton.dataset.testid = "debug-close";
  closeButton.style.cssText = [
    "display:none", "position:fixed", "left:12px", "top:10px", "z-index:1000",
    "min-height:34px", "padding:5px 12px", "border-radius:6px",
    "border:1px solid #d7b450", "background:#384755", "color:#f6efe3",
  ].join(";");

  const header = document.createElement("header");
  header.style.cssText = [
    "display:flex", "gap:8px", "align-items:center",
    "margin:0 112px 10px", "padding:0",
  ].join(";");
  const title = document.createElement("strong");
  title.textContent = "Live game tools";
  const vassalTab = document.createElement("button");
  vassalTab.type = "button";
  vassalTab.textContent = "Vassal Lab";
  vassalTab.dataset.testid = "debug-vassal-tab";
  const saveDiagnosticsTab = document.createElement('button');
  saveDiagnosticsTab.type = 'button'; saveDiagnosticsTab.textContent = 'Save diagnostics';
  saveDiagnosticsTab.dataset.testid = 'debug-save-diagnostics-tab';
  header.style.flexWrap = 'wrap';
  header.append(title, vassalTab, saveDiagnosticsTab);
  panel.append(header);
  const labLinks = document.createElement('div');
  labLinks.style.cssText = 'display:flex;gap:8px;margin:10px 112px';
  for (const [label, action, testid] of [
    ['New run setup in Gym', openDevelopmentLab, 'development-lab-open'],
    ['Open current state in Gym', openCurrentStateInGym, 'development-lab-clone'],
  ]) {
    const button = document.createElement('button');
    button.textContent = label; button.dataset.testid = testid;
    button.addEventListener('click', () => { try { action?.(); } catch (error) { alert(error.message); } });
    labLinks.append(button);
  }
  panel.append(labLinks);

  const vassalLab = createVassalDebugDom({
    getState,
    replaceVassalCandidate,
    presetController: vassalDebugPresetController,
  });
  const pages = {
    vassalLab,
    saveDiagnostics: createSaveDiagnosticsDom({ getReport: () => getSaveDiagnosticReport?.() ?? {} }),
  };
  const pageContainer = document.createElement("div");
  pageContainer.append(vassalLab.element, pages.saveDiagnostics.element);
  panel.append(pageContainer);
  let activePage = "vassalLab", initialized = false;
  function setActivePage(id) {
    activePage = pages[id] ? id : "vassalLab";
    for (const [key, page] of Object.entries(pages)) page.element.style.display = key === activePage ? "" : "none";
    pages[activePage].render?.();
  }

  function open() {
    panel.style.display = "block";
    utilityControls.classList.add('workshop-open');
    openButton.style.display = "none";
    closeButton.style.display = "";
    setActivePage(activePage);
  }

  function close() {
    panel.style.display = "none";
    utilityControls.classList.remove('workshop-open');
    openButton.style.display = "";
    closeButton.style.display = "none";
  }

  // Gesture timers belong to UI input only; world effects use timeline time.
  let holdTimer=null, holdOrigin=null;
  function cancelHold(){
    clearTimeout(holdTimer);holdTimer=null;holdOrigin=null;
    openButton.classList.remove('is-holding');
  }
  openButton.addEventListener('pointerdown',(event)=>{
    if(event.button!==0)return;
    cancelHold();holdOrigin={x:event.clientX,y:event.clientY,startedAt:performance.now()};
    openButton.classList.add('is-holding');
    holdTimer=setTimeout(()=>{cancelHold();open();},850);
  });
  openButton.addEventListener('pointermove',(event)=>{
    if(holdOrigin&&Math.hypot(event.clientX-holdOrigin.x,event.clientY-holdOrigin.y)>12)cancelHold();
  });
  openButton.addEventListener('pointerup',()=>{
    // A busy forecast/render frame can delay the timer behind the release event.
    const completed=holdOrigin&&performance.now()-holdOrigin.startedAt>=850;
    cancelHold();if(completed)open();
  });
  for(const event of ['pointercancel','pointerleave','lostpointercapture'])openButton.addEventListener(event,cancelHold);
  openButton.addEventListener('contextmenu',event=>event.preventDefault());
  function workshopKey(event){
    if(event.ctrlKey&&event.shiftKey&&event.code==='KeyD'){
      event.preventDefault();cancelHold();if(panel.style.display==='none')open();else close();
    }
    if(event.code==='Escape'&&panel.style.display!=='none')close();
  }
  function positionUtility(){
    const box=document.querySelector('canvas')?.getBoundingClientRect();
    if(!box?.width||!box?.height)return;
    // The illustrated header spans logical y=12..74. Align to its center,
    // rather than a viewport offset that drifts as the canvas is letterboxed.
    const top=`${box.top+box.height*43/1080-utilityControls.getBoundingClientRect().height/2}px`;
    const right=`${Math.max(5,window.innerWidth-box.right+box.width*28/2424)}px`;
    if(utilityControls.style.top!==top)utilityControls.style.top=top;
    if(utilityControls.style.right!==right)utilityControls.style.right=right;
  }
  vassalTab.addEventListener("click", () => setActivePage("vassalLab"));
  saveDiagnosticsTab.addEventListener('click', () => setActivePage('saveDiagnostics'));
  closeButton.addEventListener("click", close);
  return {
    init() {
      if (initialized) return;
      initialized = true;
      document.body.append(utilityControls, panel, closeButton);
      document.addEventListener('keydown',workshopKey);
      window.addEventListener('resize',positionUtility);
      window.visualViewport?.addEventListener('resize',positionUtility);
      positionUtility();
      vassalLab.init();
      setActivePage(activePage);
    },
    // Menu visibility and mobile browser chrome can move the canvas without a
    // window resize. Sample its final visible bounds, after layout has settled.
    update: positionUtility,
    refresh: positionUtility,
    close,
    destroy() {
      vassalLab.destroy();
      utilityControls.remove();
      panel.remove();
      closeButton.remove();
      cancelHold();
      document.removeEventListener('keydown',workshopKey);
      window.removeEventListener('resize',positionUtility);
      window.visualViewport?.removeEventListener('resize',positionUtility);
    },
  };
}
