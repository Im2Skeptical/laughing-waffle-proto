// Serialized into the product realm; reads only DOM ink and retained display DTOs.
export function installFeedbackBindings() {
  const dom = id => document.querySelector(`[data-testid="${id}"]`);
  const visible = element => {
    if (!element?.isConnected) return false;
    for (let p=element;p;p=p.parentElement) {
      const s=getComputedStyle(p);
      if(p.hidden||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;
    }
    const r=element.getBoundingClientRect();
    return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;
  };
  const cue=(binding,shown,key,valid=true)=>({sourceKey:`${performance.timeOrigin}:${binding}`,
    sourceValid:valid,visible:!!shown,responseKey:JSON.stringify(key)});
  globalThis.__HC_BEGIN_SAVE_ACK__=()=>{
    const operation=__HC__.active,samples=[];let frame=null,stopped=false,overflow=0;
    const read=()=>{
      if(stopped)return;
      const start=performance.now(),summary=dom('game-save-summary');
      const sample={atMs:start,visible:visible(summary),text:summary?.textContent??null};
      sample.cpuMs=performance.now()-start;
      if(samples.length<512)samples.push(sample);else overflow++;
      frame=requestAnimationFrame(read);
    };
    frame=requestAnimationFrame(read);
    globalThis.__HC_STOP_SAVE_ACK__=()=>{
      stopped=true;cancelAnimationFrame(frame);
      const nativeComplete=__HC__.saveEvents.find(e=>e.kind==='complete'&&e.time>=operation.started);
      const saving=samples.find(s=>s.atMs>=operation.started&&s.visible&&s.text?.startsWith('Saving'));
      const saved=samples.find(s=>s.atMs>=operation.started&&s.visible&&s.text?.startsWith('Saved.')&&nativeComplete&&s.atMs>=nativeComplete.time);
      return {samples,overflow,firstVisibleSaving:saving??null,firstVisibleSavedAfterNativeComplete:saved??null,
        nativeComplete:nativeComplete??null,scope:'sampled viewport-visible recovery text plus rAF opportunity; no physical paint claim; no visible sample remains censored'};
    };
  };
  globalThis.__HC_READ_FEEDBACK__ = binding => {
    if(binding==='slot-picker')return cue(binding,visible(dom('game-slot-1')),visible(dom('game-slot-1')));
    if(binding==='loading'){
      const loading=document.querySelector('.game-loading-details');
      return cue(binding,visible(loading),visible(loading));
    }
    if(binding==='menu-save'){
      const menu=dom('game-menu'),summary=dom('game-save-summary');
      return cue(binding,visible(menu),[visible(menu),visible(summary)?summary.textContent:null]);
    }
    if(binding==='art-seal'){
      const seal=dom('debug-open');return cue(binding,visible(seal),[seal?.textContent,seal?.dataset.artworkReady]);
    }
    const api=globalThis.__SETTLEMENT_DEBUG__;
    const s=api?.getRetainedFeedbackSnapshot?.();
    if(!s)return cue(binding,false,null,false);
    const {map,graph,life,decision,recap}=s;
    const surface=[...document.querySelectorAll('canvas')].some(visible);
    const baseValid=surface&&!!map&&!!graph;
    if(binding==='camera')return cue(binding,map.visible&&surface,map.camera,baseValid);
    if(binding==='panel')return cue(binding,surface,[map.detailVisible,map.panelPose],baseValid);
    if(binding==='present'||binding==='scrub'){
      // Signature is retained only after drawScrub issued marker commands.
      // Ignore autonomously changing graph bounds/forecast preview in quiescence.
      const fields=graph.scrubDrawSignature?.split('|')??[];
      return cue(binding,surface&&graph.visible,fields.slice(0,3),baseValid&&fields.length===8);
    }
    if(binding==='life')return cue(binding,surface,[life.visible,life.displayedVassalId],baseValid);
    if(binding==='node')return cue(binding,surface&&life.visible,life.selectedCandidateNodeId,baseValid);
    if(binding==='entry')return cue(binding,surface,[life.entryVisible,life.entryOpen],baseValid);
    if(binding==='decision')return cue(binding,surface,[life.entryVisible,decision.renderedVisible,decision.nodeId],baseValid);
    if(binding==='category')return cue(binding,surface&&decision.renderedVisible,[decision.observedDecisionNodeId,decision.shopTag,decision.offerIds],baseValid);
    if(binding==='purchase')return cue(binding,surface&&decision.renderedVisible,[decision.observedDecisionNodeId,decision.purchaseOrder],baseValid);
    if(binding==='confirm')return cue(binding,surface,[decision.renderedVisible,decision.renderedPose,s.processingVisible,recap?.open],baseValid);
    if(binding==='recap')return cue(binding,surface,[recap?.open,life.visible],baseValid);
    if(binding==='map-return')return cue(binding,surface,[map.visible,life.visible,map.detailVisible,map.panelPose],baseValid);
    throw Error(`unbound feedback cue ${binding}`);
  };
}

export function feedbackBinding(step) {
  if(step==='new-game-to-slot-picker')return 'slot-picker';
  if(['ordinary-new-through-opening','performance-new','performance-continue','opening-load','nontrivial-load','performance-entry-full-opening','progressive-entry-to-art-ready','required-asset-manual-retry'].includes(step))return 'loading';
  if(step.includes('present'))return 'present';
  if(['map-pan','map-zoom','map-pinch-zoom'].includes(step))return 'camera';
  if(step.includes('settlement-open')||step==='settlement-close')return 'panel';
  if(step.includes('map-return')||step==='return-to-map')return 'map-return';
  if(step.startsWith('scrub-')||step.startsWith('life-history-'))return 'scrub';
  return {'life-map-open':'life','node-select':'node','entry-dialog-open':'entry',
    'node-entry-confirm':'decision','shop-category-selection':'category',
    'purchase-to-staged-preview':'purchase','confirm-to-recomputed-preview':'confirm',
    'recap-return':'recap','save-to-persisted':'menu-save','explicit-art-reveal':'art-seal',
    'explicit-reveal':'art-seal','deferred-atlas-to-prepared':'art-seal','remaining-background-wait-to-prepared':'art-seal'}[step]??null;
}
