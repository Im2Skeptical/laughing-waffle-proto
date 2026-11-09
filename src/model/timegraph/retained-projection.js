import { createProjectionStateRestorer } from './state-restorer.js';

// One private, bounded previous future. No timeline/cache references escape;
// callers receive isolated mutable bodies with a shared frozen configuration.
export function retainProjectionForBrowsing({startSec,endSec,anchors}) {
  const byIdentity=new Map(),byValue=new Map();
  const freeze=value=>{
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      Object.values(value).forEach(freeze);Object.freeze(value);
    }
    return value;
  };
  const retained=anchors.filter(([sec])=>sec>=startSec&&sec<=endSec)
    .sort(([a],[b])=>a-b).map(([sec,data])=>{
      // Capture is a copy, not a replay or validation pass over the whole run.
      // The standard restorer validates each body on first use.
      const {gameConfig,...body}=data;
      let config=byIdentity.get(gameConfig);
      if(!config){
        const key=JSON.stringify(gameConfig);
        config=byValue.get(key)??freeze(structuredClone(gameConfig));
        byValue.set(key,config);byIdentity.set(gameConfig,config);
      }
      return [sec,{...structuredClone(body),gameConfig:config}];
    });
  byIdentity.clear();byValue.clear();
  if(!retained.length||retained[0][0]>startSec)return null;
  const restorer=createProjectionStateRestorer();
  return {startSec,endSec,anchorCount:retained.length,
    getStateAt(second){
      if(!Number.isFinite(second))return null;
      const target=Math.floor(second);
      if(target<startSec||target>endSec)return null;
      let lo=0,hi=retained.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(retained[mid][0]<=target)lo=mid;else hi=mid-1;}
      const [base,data]=retained[lo];
      return restorer.restore(data,base,target);
    }};
}
