import { createDevelopmentLabController } from '../controllers/development-lab-controller.js';
import { openLabHandoff, readLabHandoff } from '../controllers/development-lab-bridge.js';
import { LAB_EXHIBITS } from '../model/dev-lab/fixtures.js';
import { createLabScene } from './development-lab/scene.js';
import { createLabCards } from './development-lab/cards.js';
import { createZooView } from './development-lab/zoo.js';
import { renderWorkbench } from './development-lab/workbench.js';
import { renderPrototypes } from './development-lab/prototypes.js';
import { createLabNodeSandboxView } from './development-lab/node-sandbox.js';
import { createCardReviewController } from '../controllers/card-review-controller.js';
import { createCardReviewerView } from './development-lab/card-reviewer.js';
import { createNewRunSetupView } from './development-lab/new-run-setup.js';
import { el, button, confirmButton, select, input, field, section } from './development-lab/elements.js';

export function mountDevelopmentLab() {
  document.body.className = 'development-lab';
  const root = document.getElementById('app'); root.replaceChildren();
  let initialState = null, error = '';
  try { initialState = readLabHandoff(); } catch(e) { error = e.message; }
  const gym = createDevelopmentLabController({initialState}), museum = createDevelopmentLabController();
  let mode = 'zoo', seedValue = 42, storageOpen = false, scene = null, renderFrame = 0;
  let gymWorkspace = 'settlement', nodeSandbox = null, newRunSetup = null;
  const header = el('header','','lab-header'), title = el('div');
  title.append(el('small','DEVELOPER WORKBENCH'),el('h1','Development Lab'));
  const nav = el('nav');
  nav.setAttribute('aria-label','Development Lab sections');
  for(const [id,label] of [['zoo','Zoo · content'],['reviewer','Card reviewer'],['museum','Museum · systems'],['gym','Gym · sandbox'],['prototypes','Prototypes · design']]) {
    const link=el('a',label);link.href=`#/dev/${id}`;link.dataset.mode=id;nav.append(link);
  }
  const gameLink=el('a','Open game');gameLink.href=new URL('.',location.href).href;gameLink.target='_blank';gameLink.rel='noopener';nav.append(gameLink);
  header.append(title,nav);
  // Sticky offsets below the (sticky on phones) header follow its real height.
  new ResizeObserver(()=>document.documentElement.style.setProperty('--lab-header-h',`${getComputedStyle(header).position==='sticky'?header.offsetHeight:0}px`)).observe(header);
  const status=el('p','','lab-status'); status.setAttribute('role','status');status.dataset.testid='lab-status';
  const content=el('main');root.append(header,status,content);
  const controller=()=>mode==='museum'?museum:gym;
  const run=(action,{fromGraph=false}={})=>{
    const previousDetail=controller().getSnapshot().detail;
    if(!fromGraph)scene?.clearPreview();
    try{action();error='';}catch(e){error=e.message;}
    cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(render);
    if(error)status.scrollIntoView({block:'nearest'});
    else if(controller().getSnapshot().detail && controller().getSnapshot().detail!==previousDetail)requestAnimationFrame(()=>content.querySelector('[data-lab-result]')?.scrollIntoView({block:'start'}));
    return !error;
  };
  // Always compare with this build's live registries, independent of Gym drafts.
  const reviewState=museum.getSnapshot().state;
  const review=createCardReviewController({resolveLive:(kind,id)=>reviewState.gameConfig.gamepieces[kind==='practice'?'practices':'structures'][id]});
  const onReview=face=>run(()=>{
    const definition=controller().getSnapshot().state.gameConfig.gamepieces[face.kind==='practice'?'practices':'structures'][face.definitionId];
    review.flag(face.kind,face.definitionId,definition,face.tier);
    location.hash=`/dev/reviewer?card=${encodeURIComponent(`${face.kind}:${face.definitionId}`)}`;
  });
  const cards=createLabCards({onReview}), zoo=createZooView({controller:gym,cards,run,onReview,review});
  const reviewer=createCardReviewerView({review,cards,getState:()=>reviewState,run});
  function render() {
    document.body.classList.toggle('reviewer-active',mode==='reviewer');
    const active=document.activeElement, key=active?.getAttribute('aria-label'), start=active?.selectionStart;
    const scroll=window.scrollY;
    cards.dismissReading();
    content.replaceChildren();
    if(mode==='gym') {
      const workspaces=el('div','','lab-controls');
      for(const [id,label] of [['setup','New run setup'],['settlement','Settlement sandbox'],['node','Node sandbox']]) {
        const control=button(label,()=>{
          const params=new URLSearchParams(location.hash.split('?')[1]??'');
          params.set('workspace',id);location.hash=`/dev/gym?${params}`;
        },`lab-workspace-${id}`);
        control.setAttribute('aria-pressed',String(gymWorkspace===id));workspaces.append(control);
      }
      content.append(workspaces);
    }
    for(const link of nav.querySelectorAll('[data-mode]')) link.setAttribute('aria-current',link.dataset.mode===mode?'page':'false');
    // Phones scroll the nav sideways; keep the current section visible.
    const current=nav.querySelector('[aria-current=page]');
    if(current&&nav.scrollWidth>nav.clientWidth&&(current.offsetLeft<nav.scrollLeft||current.offsetLeft+current.offsetWidth>nav.scrollLeft+nav.clientWidth))nav.scrollLeft=current.offsetLeft-nav.offsetLeft-8;
    status.textContent=error || (mode==='reviewer'?'Card review drafts · saved on this device':mode==='prototypes'?'Isolated design studies · edits are temporary':controller().getSnapshot().message) || 'Disposable state · no player save slots are written';status.classList.toggle('lab-warning',!!error);
    if(mode==='zoo') zoo.render(content);
    else if(mode==='reviewer') {try{reviewer.render(content);}catch(e){status.textContent=`Card reviews unavailable: ${e.message}`;status.classList.add('lab-warning');}}
    else if(mode==='prototypes') renderPrototypes(content);
    else if(mode==='gym' && gymWorkspace==='setup') {
      newRunSetup??=createNewRunSetupView({getGymState:()=>gym.getSnapshot().state, review,
        openInGym:state=>{gym.importState(JSON.stringify(state));openLabHandoff(state,'gym',{sameTab:true});}});
      newRunSetup.render(content);
      status.textContent='New run profiles · launch recipes · player save slots are unchanged';
    }
    else if(mode==='gym' && gymWorkspace==='node') {
      nodeSandbox??=createLabNodeSandboxView();nodeSandbox.render(content);
      status.textContent='Node sandbox · disposable dummy state · no player saves or Gym timeline edits';
    }
    else {
      const ctl=controller(), snapshot=ctl.getSnapshot();
      const fixtures=select('Fixture',[...(snapshot.exhibitId==='custom'?[['custom','Current imported setup']]:[]),...LAB_EXHIBITS.map(e=>[e.id,e.title]),...ctl.names().map(name=>[`saved:${name}`,`Saved · ${name}`])],snapshot.exhibitId);
      const seed=input('Fixture seed',seedValue);seed.addEventListener('change',()=>{seedValue=Number(seed.value);});
      const loadFixture=()=>run(()=>fixtures.value==='custom'?ctl.reset():fixtures.value.startsWith('saved:')?ctl.load(fixtures.value.slice(6)):ctl.fixture(fixtures.value,Number(seed.value)));
      // Museum exhibits are read-only showcases, so choosing one opens it. The
      // Gym keeps an explicit Load because loading replaces sandbox edits.
      if(mode==='museum')fixtures.addEventListener('change',loadFixture);
      const controls=el('div','','lab-controls');
      controls.append(field(mode==='museum'?'Exhibit':'Start from fixture',fixtures),field('Seed',seed),button(mode==='museum'?'Reload with seed':'Load fixture',loadFixture,'lab-load-fixture'));
      content.append(controls);
      const toGym=()=>run(()=>{gym.importState(ctl.exportState());openLabHandoff(ctl.getSnapshot().state,'gym',{sameTab:true});});
      if(mode==='museum') {
        const exhibit=LAB_EXHIBITS.find(e=>e.id===snapshot.exhibitId);
        const description=exhibit?.description??'Your saved setup. Reset restores this exact state and RNG.';
        const intro=el('div','','lab-exhibit-intro');
        intro.append(el('h2',exhibit?.title??snapshot.exhibitId.replace('saved:','')),el('p',description));
        // Exhibits that ask for a sandbox experiment get that step beside the button.
        const gymSteps=description.split(/(?<=\.)\s+/).filter(sentence=>/\bGym\b/.test(sentence));
        const tryRow=el('div','','lab-controls lab-try-gym');
        if(gymSteps.length)tryRow.append(el('span',`Gym step: ${gymSteps.join(' ')}`));
        tryRow.append(button('Try this in Gym',toGym,'lab-to-gym'));
        intro.append(tryRow);content.append(intro);
      } else content.append(el('p','Edits apply automatically when you finish a field. Each edit starts a new timeline branch at the viewed second; Undo steps back one change. Reset returns to the loaded or saved setup.','lab-hint'));
      const transport=el('div','','lab-controls lab-transport');
      const group=(label,...nodes)=>{const node=el('div','','lab-group');node.setAttribute('role','group');node.setAttribute('aria-label',label);node.append(el('small',label),...nodes);return node;};
      const phase=select('Advance to phase',[['0','Birth'],['1','Food'],['2','Housing'],['3','Faith'],['4','Migration'],['5','Death']],'1');
      const undo=button(snapshot.undoLabel?`Undo ${snapshot.undoLabel}`:'Undo',()=>run(()=>ctl.undo()),'lab-undo');undo.disabled=!snapshot.undoLabel;
      transport.append(el('strong',`t=${snapshot.state.tSec}s`),
        group('Step',button('+1 second',()=>run(()=>ctl.advance('second'))),button('Next phase',()=>run(()=>ctl.advance('phase')),'lab-step'),button('+1 moon',()=>run(()=>ctl.advance('moon'))),button('+1 year',()=>run(()=>ctl.advance('year')))),
        group('Jump',phase,button('Advance to phase',()=>run(()=>ctl.advance('selected',Number(phase.value))))),
        group('Check',button('Compare forecast +60s',()=>run(()=>ctl.compare(60)),'lab-compare')),
        group('Restore',undo,button('Reset fixture',()=>run(()=>ctl.reset()),'lab-reset')));
      if(mode==='gym')transport.append(button('Play from here',()=>run(()=>openLabHandoff(snapshot.state,'play')),'lab-play'));
      content.append(transport);
      const horizon=input('Forecast span in seconds',snapshot.horizonSec);horizon.max='3600';
      horizon.addEventListener('change',()=>run(()=>ctl.setHorizon(horizon.value)));
      const second=input('Viewed second',snapshot.state.tSec);second.min=String(snapshot.branchSec);second.max=String(snapshot.endSec);
      second.addEventListener('change',()=>run(()=>ctl.seek(second.value)));
      const timelineControls=el('div','','lab-controls');
      controls.append(field('Forecast span (seconds)',horizon));
      timelineControls.append(field('Go to second',second),
        button('Branch start',()=>run(()=>ctl.seek(snapshot.branchSec))),button('Forecast end',()=>run(()=>ctl.seek(snapshot.endSec))),
        el('span',`Branch ${snapshot.branchSec}s → ${snapshot.endSec}s · drag the graph or either wheel. Step buttons extend the span if needed.`));
      content.append(timelineControls);
      if(!scene)scene=createLabScene({getController:controller,run,onReview});
      content.insertBefore(scene.node,transport);scene.refresh();
      // Sandbox tools first; saving and sharing sit below them.
      const after=[];
      if(mode==='gym') {
        const storage=el('div','','lab-controls'), name=input('Fixture name','','text');name.placeholder='Name this reproduction';name.enterKeyHint='done';
        let names=[];try{names=ctl.names();}catch(e){error=`Fixture storage unavailable: ${e.message}`;}
        const saved=select('Saved fixture',[['','Choose saved fixture'],...names],'');
        const download=()=>{
          const blob=new Blob([ctl.exportState()],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='development-lab-state.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        };
        const file=input('Import state JSON','','file');file.accept='.json,application/json';
        file.addEventListener('change',async()=>{try{const text=await file.files[0].text();run(()=>ctl.importState(text));}catch(e){run(()=>{throw e;});}});
        const savePanel=el('div','','lab-save-bar');
        const saveControls=el('div','','lab-controls');
        // Saving over an existing exhibit asks first instead of replacing it silently.
        const guardedSave=(label,testid,after)=>{
          const node=button(label,()=>{
            const overwrite=node.dataset.confirm==='yes';
            if(!overwrite&&ctl.exists(name.value)){node.dataset.confirm='yes';node.textContent=`Overwrite “${name.value.trim()}”?`;node.classList.add('lab-confirming');return;}
            run(()=>{ctl.save(name.value,{overwrite});after?.();});
          },testid);
          const disarm=()=>{delete node.dataset.confirm;node.textContent=label;node.classList.remove('lab-confirming');};
          node.addEventListener('blur',disarm);name.addEventListener('input',disarm);return node;
        };
        saveControls.append(field('Exhibit name',name),guardedSave('Save to Museum','lab-save-museum'),
          guardedSave('Save and open in Museum','lab-save-open-museum',()=>{museum.load(name.value.trim());location.hash='/dev/museum';}));
        savePanel.append(saveControls,el('small','Saved exhibits stay in this browser. Export JSON to share.'));after.push(savePanel);
        storage.append(saved,button('Load saved',()=>run(()=>ctl.load(saved.value))),confirmButton('Use current as reset','Replace the reset point?',()=>run(()=>ctl.setBaseline()),'lab-set-baseline'),button('Export JSON',download),button('Copy JSON',async()=>{try{await navigator.clipboard.writeText(ctl.exportState());status.textContent='State JSON copied';}catch(e){run(()=>{throw e;});}}),field('Import JSON',file));
        const savedPanel=el('details','','lab-panel');savedPanel.open=storageOpen;
        savedPanel.append(el('summary','Reproduce and share · saved fixtures / JSON'),storage,el('p',`Reset begins at ${snapshot.baselineSec}s. Play from here opens a separate unsaved run, preserving timestamps and RNG. Earlier history is unavailable; existing save slots remain intact.`));
        savedPanel.addEventListener('toggle',()=>{storageOpen=savedPanel.open;});after.push(savedPanel);
      }
      renderWorkbench(content,{controller:ctl,cards,run,gym:mode==='gym'});
      const result=content.querySelector('[data-lab-result]');
      for(const node of after)result?content.insertBefore(node,result):content.append(node);
    }
    if(key) {
      const replacement=[...content.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===key);
      replacement?.focus({preventScroll:true});if(start!=null&&replacement?.type==='search')replacement.setSelectionRange(start,start);
    }
    window.scrollTo(0,scroll);
  }
  function route() {
    cancelAnimationFrame(renderFrame);
    const next=location.hash.split('?')[0].split('/')[2];mode=['zoo','reviewer','museum','gym','prototypes'].includes(next)?next:'zoo';
    if(mode==='gym') {
      const params=new URLSearchParams(location.hash.split('?')[1]??'');
      const workspace=params.get('workspace');
      gymWorkspace=['setup','settlement','node'].includes(workspace)?workspace:'settlement';
    }
    render();window.scrollTo(0,0);
  }
  window.addEventListener('hashchange',route);
  window.addEventListener('pagehide',()=>{cards.destroy();scene?.destroy();nodeSandbox?.destroy();newRunSetup?.destroy();},{once:true});
  globalThis.__LAB_DEBUG__={getSnapshot:()=>controller().getSnapshot(),getCardReading:()=>cards.getReadingSnapshot(),getScene:()=>scene?.getSnapshot(),getRegionClickPoint:id=>scene?.getRegionClickPoint(id),getNodeSandbox:()=>nodeSandbox?.getSnapshot(),getNodeSandboxPoint:(kind,index)=>nodeSandbox?.getPoint(kind,index)};
  route();
}
