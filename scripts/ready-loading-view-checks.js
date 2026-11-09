import { createGameLoadingDom } from '../src/views/game-loading-dom.js';

export async function readyLoadingFixture({baseline=false}={}) {
  await new Promise((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href='/styles.css';link.onload=resolve;link.onerror=reject;document.head.append(link);
  });
  const menu=document.createElement('main');menu.id='game-menu';
  const content=document.createElement('div');content.className='game-menu-content';menu.append(content);
  content.append(Object.assign(document.createElement('h2'),{textContent:'Preparing your chronicle…'}));
  const view=createGameLoadingDom();content.append(view.element);document.body.replaceChildren(menu);
  const status={operation:'newGame',phase:'loading',elapsedMs:8500,stages:[{stage:'forecast',label:'Preparing historical graphs',detail:'Unveiling the opening forecast',completed:45,total:100,elapsedMs:3500,sinceProgressMs:0,active:true}]};
  const before=JSON.stringify(status);
  view.update(status);
  const progress=view.element.querySelector('[role=progressbar]');
  if(progress.getAttribute('aria-valuenow')!=='45')throw Error('loading progress no longer reflects real work');
  const details=view.element.querySelector('details'),summary=details.querySelector('summary');
  details.open=true;summary.focus();view.update({...status,elapsedMs:9000});
  if(!details.open||document.activeElement!==summary)throw Error('flavour update disrupts focus/timing inspection');
  view.update({...status,phase:'failed',reason:'fixture failure'},true);
  if(!progress.hidden||!view.element.textContent.includes('Stopped during: Preparing historical graphs'))throw Error('loading failures must retain the real stage');
  view.reset();
  const setMode=operation=>{
    view.update({...status,operation,elapsedMs:0});
    const line=view.element.querySelector('.game-loading-flavour');
    if(!baseline && !line?.textContent.includes(operation==='newGame'?'fallen empire':'surviving empire'))throw Error('loading context copy is wrong');
  };
  setMode('newGame');
  if(JSON.stringify(status)!==before)throw Error('loading view mutated its diagnostics');
  globalThis.readyLoading={view,setMode};
  return {checks:['real progress/failure stages','stable focus and timing inspection','fresh/returning context','unchanged diagnostics']};
}
