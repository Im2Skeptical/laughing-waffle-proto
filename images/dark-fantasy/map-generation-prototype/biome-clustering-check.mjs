import assert from 'node:assert/strict';
import { assignClusteredBiomes } from '../../../src/model/regional-map/biome-clustering.js';
import { generateMap, BIOMES } from '../../../src/model/regional-map/generator.js';

for(let seed=1860;seed<1880;seed++){
  let previous=-1,geometry=null,quota=null;
  for(const clustering of [0,.25,.5,.75,1]){
    const map=generateMap({seed,clustering,sizeVariation:.85,roughness:1,featureSet:seed%4});
    const outlines=map.regions.map(r=>r.outline);
    if(geometry)assert.deepEqual(outlines,geometry,'Clustering must not perturb region geometry');else geometry=outlines;
    if(quota)assert.deepEqual(map.quota,quota,'The driver must preserve quotas across the slider');else quota=map.quota;
    assert.equal(map.regions.length,20);assert.equal(map.quota.monster,2);
    for(const biome of Object.keys(BIOMES))assert.equal(map.regions.filter(r=>r.biome===biome).length,map.quota[biome]);
    assert.ok(map.matchingBorders>=previous,'Measured grouping must increase monotonically');previous=map.matchingBorders;
    assert.equal(map.matchingBorders,map.clusteringStudy.actualMatching);
    assert.ok(Math.abs(map.matchingBorders-map.clusteringStudy.targetMatching)<=1,'Middle settings must match their calibrated adjacency target');
    if(clustering===0)assert.equal(map.matchingBorders,0,'Anti-clustering must actively eliminate equal-colour neighbours');
    if(clustering===1)for(const biome of Object.keys(BIOMES)){
      const members=map.regions.filter(r=>r.biome===biome),seen=new Set(),pending=[members[0].id];
      while(pending.length){const id=pending.pop();if(seen.has(id))continue;seen.add(id);
        pending.push(...map.regions.find(r=>r.id===id).neighbours.filter(n=>members.some(r=>r.id===n)&&!seen.has(n)));}
      assert.equal(seen.size,members.length,`${biome} must be one connected group at 100%`);
    }
  }
}
assert.equal(generateMap().clusteringStudy.requested,.5,'Default clustering must be 50%');
console.log('Clustering: 20 seeds, active anti-clustering at zero, all six connected biome groups at 100%, calibrated monotone middle, unchanged quotas/geometry and 50% default pass.');

const line=Array.from({length:20},(_,i)=>({id:`L${i}`})),quota={plains:5,forest:4,islands:4,swamp:3,mountains:2,monster:2};
const edge=(a,b)=>({regions:[`L${a}`,`L${b}`],feature:null});
const narrow=assignClusteredBiomes({regions:line,edges:Array.from({length:19},(_,i)=>edge(i,i+1)),quota,clustering:1,seed:7});
assert.ok(narrow.fullyConnected,'A narrow graph must still fit contiguous quota blocks');
assert.throws(()=>assignClusteredBiomes({regions:line,edges:Array.from({length:19},(_,i)=>edge(0,i+1)),quota,clustering:1,seed:7}),/cannot fit/,'Report mathematically impossible quotas rather than silently returning disconnected groups');
