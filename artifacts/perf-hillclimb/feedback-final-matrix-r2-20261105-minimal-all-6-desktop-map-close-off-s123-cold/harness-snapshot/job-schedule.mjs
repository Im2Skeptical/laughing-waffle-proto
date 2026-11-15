import assert from 'node:assert/strict';

export const EXECUTABLE_JOBS=Object.freeze(['entry','performance-new','performance-continue',
  'map-pan','map-zoom','map-open','map-close','scrub-anchor','scrub-off-anchor','life','save-history','save-opening','art']);
const aliases=Object.freeze({all:EXECUTABLE_JOBS,map:['map-pan','map-zoom','map-open','map-close'],
  scrub:['scrub-anchor','scrub-off-anchor'],save:['save-history','save-opening'],
  performance:['performance-new','performance-continue']});

export function normalizeJobSelection(requested){
  assert.ok(Array.isArray(requested)&&requested.length>0,'nonempty job selection required');
  const result=[];
  for(const name of requested){
    assert.equal(typeof name,'string');
    const expanded=aliases[name]??[name];
    for(const job of expanded){
      assert.ok(EXECUTABLE_JOBS.includes(job),`unknown executable job: ${job}`);
      assert.ok(!result.includes(job),`duplicate executable job after alias expansion: ${job}`);
      result.push(job);
    }
  }
  return result;
}

export function assertDiscoveryCell(cell,manifest){
  assert.equal(manifest.failed,false,'successful cell must have a successful leaf manifest');
  assert.deepEqual(manifest.config.jobs,[cell.job],'leaf executes exactly its declared canonical job');
  assert.equal(manifest.config.seed,cell.seed);assert.equal(manifest.config.cache,cell.cache);
  assert.equal(manifest.config.population,cell.population);assert.equal(manifest.config.artwork,cell.artwork);
  assert.equal(manifest.config.samples,1,'construction cell declares one independent launch');
  assert.ok(Array.isArray(manifest.launches));assert.equal(manifest.launches.length,1,'one planned cell equals one measured browser launch');
  assert.equal(manifest.launches[0].job,cell.job);assert.equal(manifest.launches[0].sample,0);
  return {ok:true,launchId:manifest.launches[0].launchId,job:cell.job};
}
