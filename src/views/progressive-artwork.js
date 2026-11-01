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
  const artwork=await loadProgressiveChronicleArt({renderer,wait,isCurrent,onError});
  if(!artwork?.ok)return;
  await wait();if(!isCurrent())return;
  try{
    const revealTerrain=await prepareTerrain(wait,isCurrent);
    if(!isCurrent())return;
    onReady(()=>{
      if(!isCurrent())return false;
      if(revealTerrain && revealTerrain()===false)return false;
      return artwork.reveal();
    });
  }catch(error){onError(error);}
}
