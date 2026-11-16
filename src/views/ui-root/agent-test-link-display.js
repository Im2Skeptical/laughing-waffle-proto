import { getGameFullscreenElement, requestGameDisplayMode, usesTouchGameDisplay } from '../game-display-mode.js';

// Navigation cannot carry a fullscreen gesture into a new document. Keep the
// captured game covered until a local tap selects graphics and it is wide.
// Run before importing game views: terrain renderers capture graphics at creation.
export function requireTestLinkDisplay() {
  const landscape=window.matchMedia('(orientation: landscape)');
  if(!usesTouchGameDisplay())return Promise.resolve();
  return new Promise(resolve=>{
    const gate=document.createElement('section');gate.className='test-link-display';gate.dataset.testid='test-link-display';
    gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-labelledby','test-link-display-title');
    const card=document.createElement('div');card.className='test-link-display-card';
    const title=document.createElement('h1');title.id='test-link-display-title';title.textContent='Open test situation';
    const intro=document.createElement('p');intro.textContent='Choose graphics. Both open fullscreen in landscape.';
    function graphicsButton(label,detail,testid){
      const button=document.createElement('button');button.type='button';button.dataset.testid=testid;
      const title=document.createElement('span');title.textContent=label;
      const description=document.createElement('small');description.textContent=detail;
      button.append(title,description);return button;
    }
    const open=graphicsButton('Performance graphics','Faster loading · simple map and icons','test-link-display-open');
    const full=graphicsButton('Full graphics','Illustrations and terrain · larger download','test-link-display-full');
    const status=document.createElement('p');status.setAttribute('role','status');status.dataset.testid='test-link-display-status';
    const fallback=document.createElement('button');fallback.type='button';fallback.dataset.testid='test-link-display-continue';fallback.textContent='Continue in landscape';fallback.hidden=true;
    card.append(title,intro,open,full,status,fallback);gate.append(card);document.body.append(gate);
    let attempted=false,pending=false,finished=false,graphics=null;
    function finish(){
      if(finished)return;finished=true;
      landscape.removeEventListener('change',sync);
      document.removeEventListener('fullscreenchange',sync);document.removeEventListener('webkitfullscreenchange',sync);
      card.textContent='Opening test situation…';gate.setAttribute('role','status');gate.removeAttribute('aria-labelledby');gate.removeAttribute('aria-modal');
      resolve({graphics,dismiss:()=>gate.remove(),showError:()=>{
        card.textContent='Could not load the game. Reload this page to retry.';
        const retry=document.createElement('button');retry.type='button';retry.textContent='Reload test situation';retry.onclick=()=>location.reload();card.append(retry);
      }});
    }
    function sync(){
      if(finished)return;
      if(attempted&&!pending&&landscape.matches&&getGameFullscreenElement()){finish();return;}
      fallback.hidden=!attempted||pending||!landscape.matches;
      if(!attempted||pending)return;
      status.textContent=landscape.matches
        ? 'Fullscreen did not open. Continue in landscape, or try again.'
        : 'Turn your phone sideways to continue.';
    }
    async function choose(value){
      if(pending)return;
      graphics=value;attempted=true;pending=true;open.disabled=true;full.disabled=true;fallback.hidden=true;status.textContent='Opening fullscreen…';
      // Request in this click's activation, before awaiting any game work.
      try {await requestGameDisplayMode({forceFullscreen:true});}
      catch { /* Rotation and the landscape browser fallback remain available. */ }
      finally {pending=false;open.disabled=false;full.disabled=false;sync();}
    }
    open.addEventListener('click',()=>{void choose('performance');});
    full.addEventListener('click',()=>{void choose('full');});
    fallback.addEventListener('click',()=>{if(attempted&&!pending&&landscape.matches)finish();});
    gate.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=[open,full,fallback].filter(button=>!button.hidden&&!button.disabled);
      if(!controls.length){event.preventDefault();return;}
      const index=controls.indexOf(document.activeElement);
      event.preventDefault();controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus();
    });
    landscape.addEventListener('change',sync);
    document.addEventListener('fullscreenchange',sync);document.addEventListener('webkitfullscreenchange',sync);
    open.focus();
  });
}
