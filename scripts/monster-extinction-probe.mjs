import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {controlSummary} from '../src/model/detailed-settlements/territory.js';

if(!isMainThread){
 const {seed,maxYears}=workerData,state=initializeReplayClock(createNewGameState(seed));let fifty=null;
 for(let second=32;second<=maxYears*32&&!state.runStatus?.complete;second+=32){
  const result=advanceReplayStateToSecond(state,second);if(!result.ok&&!state.runStatus?.complete)throw Error(`seed ${seed}: ${result.reason}`);
  if(second===1600&&state.tSec===1600){
   const held=state.world.regions.filter(r=>r.controller==='external-a'),summaries=held.map(r=>controlSummary(state,r.id));
   fifty={held:held.length,occupied:summaries.filter(s=>s.status==='occupied').length,shieldsOffLeft:summaries.filter(s=>s.minimumShare>0).length,
    capitalHeld:state.world.regions.find(r=>r.id===state.civilization.remnant.capitalRegionId).controller==='external-a'};
  }
 }
 parentPort.postMessage({seed,complete:!!state.runStatus?.complete,years:state.tSec/32,reason:state.runStatus?.reason??null,spawns:state.civilization.chaos.expansionEvents,monsterRegions:state.world.regions.filter(r=>r.monster).length,fifty});
}else{
 const count=Number(process.argv[2]??32),maxYears=400;
 if(!Number.isInteger(count)||count<1||count>128)throw Error('Usage: monster-extinction-probe.mjs [seed count 1–128]');
 const seeds=[123,42,424242,...Array.from({length:Math.max(0,count-3)},(_,i)=>i*7919+1)].slice(0,count),rows=[];
 for(let offset=0;offset<seeds.length;offset+=4){
  const batch=await Promise.all(seeds.slice(offset,offset+4).map(seed=>new Promise((resolve,reject)=>{
   const worker=new Worker(new URL(import.meta.url),{workerData:{seed,maxYears}});worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error(`worker exit ${code}`));});
  })));
  rows.push(...batch);console.log(`[monster-extinction] ${rows.length}/${count} starts measured`);
 }
 const complete=rows.filter(r=>r.complete),values=complete.map(r=>r.years).sort((a,b)=>a-b);
 const heldAt50=rows.filter(r=>r.fifty).map(r=>r.fifty.held);
 const report={count,maxYears,targetMeanYears:200,censored:rows.length-complete.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,min:values[0]??null,max:values.at(-1)??null,
  fifty:{sampled:heldAt50.length,meanHeld:heldAt50.length?heldAt50.reduce((a,b)=>a+b,0)/heldAt50.length:null,minHeld:heldAt50.length?Math.min(...heldAt50):null,maxHeld:heldAt50.length?Math.max(...heldAt50):null,capitalsHeld:rows.every(r=>r.fifty?.capitalHeld)},rows};
 mkdirSync('artifacts/monster-escalation',{recursive:true});writeFileSync(`artifacts/monster-escalation/extinction-${count}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,rows:undefined,artifact:`artifacts/monster-escalation/extinction-${count}.json`}));
 if(report.censored||report.mean>=report.targetMeanYears||report.fifty.sampled!==count||report.fifty.meanHeld<10||!report.fifty.capitalsHeld)process.exitCode=1;
}
