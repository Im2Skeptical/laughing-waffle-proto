import {deserializeGameState} from '../model/state.js';
import {performanceStartFixturePath,selectPerformanceStartSeed} from './performance-start-seeds.js';

export function getPerformanceRandomSeedPreference() {
 const params=new URLSearchParams(globalThis.location?.search??'');
 if(params.has('seed'))return params.get('seed')==='random';
 try{return globalThis.localStorage?.getItem('dev.performanceRandomSeed')==='on';}catch{return false;}
}

// Runtime-only Dev fixture. Normal saves and authoritative replay are unchanged.
export async function loadPerformanceStart({fetcher=globalThis.fetch,seed=selectPerformanceStartSeed()}={}){
 const info=JSON.parse(document.getElementById('game-build-info')?.textContent??'null');
 if(!info?.performanceFixtureKey)throw Error('Performance start unavailable; run npm start to bake it');
 const response=await fetcher(new URL(`${performanceStartFixturePath(seed)}?key=${info.performanceFixtureKey}`,document.baseURI));
 if(!response.ok)throw Error('Performance start missing; run npm start to rebuild it');
 const json=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
 if(json.format!==1||json.key!==info.performanceFixtureKey)throw Error('Performance start is stale; run npm start to rebuild it');
 if(json.stateData?.rng?.baseSeed!==seed)throw Error('Performance start seed does not match its forecast');
 const restore=data=>({...data,gameConfig:json.config});
 const forecast={...json.forecast,stateDataBySecond:json.forecast.stateDataBySecond.map(([sec,data])=>[sec,restore(data)]),lastStateData:restore(json.forecast.lastStateData)};
 return {ok:true,state:deserializeGameState(json.stateData),forecast,lossSec:json.lossSec};
}
