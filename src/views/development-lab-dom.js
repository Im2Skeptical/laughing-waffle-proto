import { createDevelopmentLabController } from '../controllers/development-lab-controller.js';
import { openLabHandoff, readLabHandoff } from '../controllers/development-lab-bridge.js';
import { LAB_EXHIBITS } from '../model/dev-lab/fixtures.js';
import { createLabScene } from './development-lab/scene.js';
import { createLabCards } from './development-lab/cards.js';
import { createZooView } from './development-lab/zoo.js';
import { renderWorkbench } from './development-lab/workbench.js';
import { el, button, select, input, field, section } from './development-lab/elements.js';

export function mountDevelopmentLab() {
  document.body.className = 'development-lab';
  const root = document.getElementById('app'); root.replaceChildren();
  let initialState = null, error = '';
  try { initialState = readLabHandoff(); } catch(e) { error = e.message; }
  const gym = createDevelopmentLabController({initialState}), museum = createDevelopmentLabController();
  let mode = 'zoo', seedValue = 42, storageOpen = false, scene = null, renderFrame = 0;
  const header = el('header','','lab-header'), title = el('div');
  title.append(el('small','DEVELOPER WORKBENCH'),el('h1','Development Lab'));
  const nav = el('nav');
  for(const [id,label] of [['zoo','Zoo · content'],['museum','Museum · systems'],['gym','Gym · sandbox']]) {
    const link=el('a',label);link.href=`#/dev/${id}`;link.dataset.mode=id;nav.append(link);
  }
  const gameLink=el('a','Open game');gameLink.href=new URL('.',location.href).href;gameLink.target='_blank';gameLink.rel='noopener';nav.append(gameLink);
  header.append(title,nav);
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
  const cards=createLabCards(), zoo=createZooView({controller:gym,cards,run});
  function render() {
    const active=document.activeElement, key=active?.getAttribute('aria-label'), start=active?.selectionStart;
    const scroll=window.scrollY;
    content.replaceChildren();
    for(const link of nav.querySelectorAll('[data-mode]')) link.setAttribute('aria-current',link.dataset.mode===mode?'page':'false');
    status.textContent=error || controller().getSnapshot().message || 'Disposable state · no player save slots are written';status.classList.toggle('lab-warning',!!error);
    if(mode==='zoo') zoo.render(content);
    else {
      const ctl=controller(), snapshot=ctl.getSnapshot();
      const fixtures=select('Fixture',[...(snapshot.exhibitId==='custom'?[['custom','Current imported setup']]:[]),...LAB_EXHIBITS.map(e=>[e.id,e.title]),...ctl.names().map(name=>[`saved:${name}`,`Saved · ${name}`])],snapshot.exhibitId);
      const seed=input('Fixture seed',seedValue);seed.addEventListener('change',()=>{seedValue=Number(seed.value);});
      const controls=el('div','','lab-controls');
      controls.append(field(mode==='museum'?'Exhibit':'Start from fixture',fixtures),field('Seed',seed),button('Load fixture',()=>run(()=>fixtures.value==='custom'?ctl.reset():fixtures.value.startsWith('saved:')?ctl.load(fixtures.value.slice(6)):ctl.fixture(fixtures.value,Number(seed.value))),'lab-load-fixture'));
      content.append(controls);
      if(mode==='museum') {
        const exhibit=LAB_EXHIBITS.find(e=>e.id===snapshot.exhibitId);content.append(el('h2',exhibit?.title??snapshot.exhibitId.replace('saved:','')),el('p',exhibit?.description??'Your saved setup. Reset restores this exact state and RNG.'));
      } else content.append(el('p','Edits apply automatically when you finish a field. Each edit starts a new timeline branch at the viewed second. Reset returns to the loaded or saved setup.'));
      const transport=el('div','','lab-controls lab-transport');
      const phase=select('Advance to phase',[['0','Birth'],['1','Food'],['2','Housing'],['3','Faith'],['4','Migration'],['5','Death']],'1');
      transport.append(el('strong',`t=${snapshot.state.tSec}s`),button('+1 second',()=>run(()=>ctl.advance('second'))),button('Next phase',()=>run(()=>ctl.advance('phase')),'lab-step'),phase,button('Advance to phase',()=>run(()=>ctl.advance('selected',Number(phase.value)))));
      transport.append(button('+1 moon',()=>run(()=>ctl.advance('moon'))),button('+1 year',()=>run(()=>ctl.advance('year'))),button('Reset fixture',()=>run(()=>ctl.reset()),'lab-reset'),button('Compare forecast +60s',()=>run(()=>ctl.compare(60)),'lab-compare'));
      if(mode==='museum')transport.append(button('Experiment in Gym',()=>run(()=>{gym.importState(ctl.exportState());location.hash='/dev/gym';}),'lab-to-gym'));
      else transport.append(button('Play from here',()=>run(()=>openLabHandoff(snapshot.state,'play')),'lab-play'));
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
      if(!scene)scene=createLabScene({getController:controller,run});
      content.insertBefore(scene.node,transport);scene.refresh();
      if(mode==='gym') {
        const storage=el('div','','lab-controls'), name=input('Fixture name','','text');name.placeholder='Name this reproduction';
        let names=[];try{names=ctl.names();}catch(e){error=`Fixture storage unavailable: ${e.message}`;}
        const saved=select('Saved fixture',[['','Choose saved fixture'],...names],'');
        const download=()=>{
          const blob=new Blob([ctl.exportState()],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='development-lab-state.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        };
        const file=input('Import state JSON','','file');file.accept='.json,application/json';
        file.addEventListener('change',async()=>{try{const text=await file.files[0].text();run(()=>ctl.importState(text));}catch(e){run(()=>{throw e;});}});
        const savePanel=el('div','','lab-save-bar');
        const saveControls=el('div','','lab-controls');
        saveControls.append(field('Exhibit name',name),button('Save to Museum',()=>run(()=>ctl.save(name.value)),'lab-save-museum'),
          button('Save and open in Museum',()=>run(()=>{ctl.save(name.value);museum.load(name.value);location.hash='/dev/museum';})));
        savePanel.append(saveControls,el('small','Saved exhibits stay in this browser. Export JSON to share.'));content.append(savePanel);
        storage.append(saved,button('Load saved',()=>run(()=>ctl.load(saved.value))),button('Use current as reset',()=>run(()=>ctl.setBaseline())),button('Export JSON',download),button('Copy JSON',async()=>{try{await navigator.clipboard.writeText(ctl.exportState());status.textContent='State JSON copied';}catch(e){run(()=>{throw e;});}}),field('Import JSON',file));
        const savedPanel=el('details','','lab-panel');savedPanel.open=storageOpen;
        savedPanel.append(el('summary','Reproduce and share · saved fixtures / JSON'),storage,el('p',`Reset begins at ${snapshot.baselineSec}s. Play from here opens a separate unsaved run, preserving timestamps and RNG. Earlier history is unavailable; existing save slots remain intact.`));
        savedPanel.addEventListener('toggle',()=>{storageOpen=savedPanel.open;});content.append(savedPanel);
      }
      renderWorkbench(content,{controller:ctl,cards,run,gym:mode==='gym'});
    }
    if(key) {
      const replacement=[...content.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===key);
      replacement?.focus({preventScroll:true});if(start!=null&&replacement?.type==='search')replacement.setSelectionRange(start,start);
    }
    window.scrollTo(0,scroll);
  }
  function route() {
    cancelAnimationFrame(renderFrame);
    const next=location.hash.split('?')[0].split('/')[2];mode=['zoo','museum','gym'].includes(next)?next:'zoo';render();window.scrollTo(0,0);
  }
  window.addEventListener('hashchange',route);
  window.addEventListener('pagehide',()=>{cards.destroy();scene?.destroy();},{once:true});
  globalThis.__LAB_DEBUG__={getSnapshot:()=>controller().getSnapshot(),getScene:()=>scene?.getSnapshot(),getRegionClickPoint:id=>scene?.getRegionClickPoint(id)};
  route();
}
