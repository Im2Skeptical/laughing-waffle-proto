import {loadProgressiveChronicleArt} from './chronicle-art.js';
// One sequential background queue. Hidden/menu/decision work suspends its next batch.
export async function loadProgressiveArtwork({renderer,canLoad,isCurrent,prepareTerrain,onReady,onError}) {
  const wait=async()=>{
    while(isCurrent()) {
      if(!canLoad()){await new Promise(resolve=>setTimeout(resolve,200));continue;}
      await new Promise(resolve=>{
        if(globalThis.requestIdleCallback)requestIdleCallback(resolve,{timeout:1000});
        else setTimeout(resolve,32);
      });
      if(canLoad())return;
    }
  };
  await loadProgressiveChronicleArt({renderer,wait,isCurrent,onReady,onError});
  await wait();if(!isCurrent())return;
  try{await prepareTerrain(wait,isCurrent);onReady();}catch(error){onError(error);}
}
