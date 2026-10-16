import { attachRngHelpers } from '../rng.js';

const cache=new Map();

// Exact fallback for narrow/awkward graphs where pair swaps can get trapped.
// Connected subsets partition the graph while preserving every biome quota.
function connectedPartition(neighbours,sizes) {
  const count=neighbours.length,all=(1<<count)-1,order=sizes.map((size,label)=>({size,label})).sort((a,b)=>b.size-a.size);
  const failed=new Set(),assignment=Array(count).fill(-1);
  const componentSizes=mask=>{
    const sizes=[];
    while(mask){let frontier=mask&-mask;mask^=frontier;let size=0;
      while(frontier){const bit=frontier&-frontier;frontier^=bit;size++;
        const next=neighbours[31-Math.clz32(bit)]&mask;frontier|=next;mask^=next;}
      sizes.push(size);
    }
    return sizes;
  };
  const search=(available,depth)=>{
    if(depth===order.length)return available===0;
    const key=`${available}:${depth}`;if(failed.has(key))return false;
    const remaining=order.slice(depth),parts=componentSizes(available),possible=new Set([0]);
    for(const {size} of remaining)for(const n of [...possible])possible.add(n+size);
    if(parts.length>remaining.length||parts.some(n=>!possible.has(n))){failed.add(key);return false;}
    let layer=new Set();for(let mask=available;mask;mask&=mask-1)layer.add(mask&-mask);
    for(let size=1;size<order[depth].size;size++){
      const next=new Set();for(const group of layer){let fringe=0;
        for(let mask=group;mask;mask&=mask-1)fringe|=neighbours[31-Math.clz32(mask&-mask)];
        for(let mask=fringe&available&~group;mask;mask&=mask-1)next.add(group|(mask&-mask));
      }
      layer=next;
    }
    for(const group of layer)if(search(available^group,depth+1)){
      for(let mask=group;mask;mask&=mask-1)assignment[31-Math.clz32(mask&-mask)]=order[depth].label;
      return true;
    }
    failed.add(key);return false;
  };
  return search(all,0)?assignment:null;
}

// Solve both endpoints using the same seeded search, then select a measured
// adjacency target. The slider never changes search randomness or geography.
export function assignClusteredBiomes({regions,edges,quota,clustering,seed}) {
  const names=Object.keys(quota),byId=new Map(regions.map((r,i)=>[r.id,i]));
  const shared=edges.filter(e=>e.regions.length===2).map(e=>e.regions.map(id=>byId.get(id)));
  const neighbours=regions.map(()=>0);
  for(const [a,b] of shared){neighbours[a]|=1<<b;neighbours[b]|=1<<a;}
  const affinity=regions.map(r=>{
    const local=edges.filter(e=>e.regions.includes(r.id)),features=local.map(e=>e.feature);
    return names.map(name=>name==='islands'?(local.some(e=>e.regions.length===1)?.85:-.35)
      :name==='swamp'?(features.includes('river')?.65:0)
      :name==='mountains'?(features.includes('ridge')?.85:-.1):0);
  });
  const key=JSON.stringify([seed,neighbours,quota,affinity]);
  let solutions=cache.get(key);
  const evaluate=assignment=>{
    const masks=names.map(()=>0);let matching=0,fit=0,groups=0;
    for(let i=0;i<assignment.length;i++){masks[assignment[i]]|=1<<i;fit+=affinity[i][assignment[i]];}
    for(const [a,b] of shared)if(assignment[a]===assignment[b])matching++;
    for(let mask of masks)while(mask){
      let frontier=mask&-mask;mask^=frontier;groups++;
      while(frontier){const bit=frontier&-frontier;frontier^=bit;
        const next=neighbours[31-Math.clz32(bit)]&mask;frontier|=next;mask^=next;}
    }
    return {matching,groups,fit};
  };
  if(!solutions){
    const rng={rng:{seed:seed^0x62a81f}};attachRngHelpers(rng);
    const pool=new Map();let minimum=null,maximum=null;
    const remember=(assignment,result)=>{
      const candidate={assignment:assignment.slice(),...result},old=pool.get(result.matching);
      if(!old||result.groups<old.groups||result.groups===old.groups&&result.fit>old.fit)pool.set(result.matching,candidate);
      if(!minimum||result.matching<minimum.matching||result.matching===minimum.matching&&result.fit>minimum.fit)minimum=candidate;
      if(result.groups===names.length&&(!maximum||result.matching>maximum.matching||result.matching===maximum.matching&&result.fit>maximum.fit))maximum=candidate;
    };
    const initial=names.flatMap((name,n)=>Array(quota[name]).fill(n));
    for(const mode of ['spread','group'])for(let restart=0;restart<(mode==='spread'?6:16);restart++){
      const assignment=initial.slice();
      for(let i=assignment.length-1;i>0;i--){const j=rng.rngNextInt(0,i);[assignment[i],assignment[j]]=[assignment[j],assignment[i]];}
      let current=evaluate(assignment);remember(assignment,current);
      const steps=mode==='spread'?2200:3600;
      const score=r=>mode==='spread'?-r.matching:r.matching-(r.groups-names.length)*8;
      for(let step=0;step<steps;step++){
        const a=rng.rngNextInt(0,assignment.length-1),b=rng.rngNextInt(0,assignment.length-1);
        if(assignment[a]===assignment[b])continue;
        [assignment[a],assignment[b]]=[assignment[b],assignment[a]];
        const result=evaluate(assignment),delta=score(result)-score(current);
        const temperature=(mode==='spread'?2.3:3.5)*Math.pow(1-step/steps,2)+.025;
        remember(assignment,result);
        if(delta>=0||rng.rngNextFloat()<Math.exp(delta/temperature))current=result;
        else [assignment[a],assignment[b]]=[assignment[b],assignment[a]];
      }
    }
    if(!maximum){const connected=connectedPartition(neighbours,names.map(name=>quota[name]));
      if(connected)remember(connected,evaluate(connected));
      else throw new Error('This footprint cannot fit the requested connected biome quotas');
    }
    solutions={minimum,maximum,pool};cache.set(key,solutions);
    if(cache.size>12)cache.delete(cache.keys().next().value);
  }
  const amount=Math.max(0,Math.min(1,clustering));
  const target=Math.round(solutions.minimum.matching+(solutions.maximum.matching-solutions.minimum.matching)*amount);
  const chosen=amount===0?solutions.minimum:amount===1?solutions.maximum:
    [...solutions.pool.values()].filter(s=>s.matching>=solutions.minimum.matching&&s.matching<=solutions.maximum.matching)
      .sort((a,b)=>Math.abs(a.matching-target)-Math.abs(b.matching-target)||a.matching-b.matching||a.groups-b.groups)[0];
  regions.forEach((r,i)=>{r.biome=names[chosen.assignment[i]];});
  return {requested:amount,minimumMatching:solutions.minimum.matching,maximumMatching:solutions.maximum.matching,
    targetMatching:target,actualMatching:chosen.matching,groups:chosen.groups,fullyConnected:chosen.groups===names.length};
}
