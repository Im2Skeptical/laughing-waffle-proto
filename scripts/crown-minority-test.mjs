import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {populationBins,writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {controlSummary,resolveControl} from '../src/model/detailed-settlements/territory.js';

for(const seed of [123,42,424242,1,2,3,4,5,6,7,8,9]){
 const state=createNewGameState(seed),capital=state.civilization.remnant.capitalRegionId;
 const occupied=state.world.sites.filter(s=>s.regionId!==capital&&s.name!=='Remnant Province'&&state.world.regions.find(r=>r.id===s.regionId).controller==='external-a');
 assert.equal(occupied.length,10);
 for(const site of occupied){
  const c=controlSummary(state,site.regionId),bins=populationBins(site.detailedState);
  assert(c.support.neutral>c.total/2,`seed ${seed}, ${site.regionId}: most residents must be unaffiliated`);
  assert(c.share<.70,`seed ${seed}, ${site.regionId}: popular support must not hold the town`);
  assert(c.warriors>0&&c.warriors<c.total/2,'loyal Warriors are a minority');
  assert.equal(c.status,'occupied');assert(c.force>=c.required);
  assert.equal(c.unrest,c.targetUnrest,'the opening reflects occupation, not a calm popular holding');
  assert(bins.filter(b=>b.specialty==='warrior').every(b=>b.allegiance==='external-a'&&b.kind==='adults'));
 }
 const core=state.world.sites.filter(s=>s.regionId===capital||s.name==='Remnant Province');
 assert.equal(core.length,4);
 for(const site of core){
  const c=controlSummary(state,site.regionId),bins=populationBins(site.detailedState);
  const civilians=bins.filter(b=>b.allegiance==='external-a'&&b.specialty==='ordinary').reduce((n,b)=>n+b.count,0);
  assert.equal(c.status,'supported');assert(civilians>c.warriors,'loyal citizens outnumber the core garrison');
  assert(c.minimumShare>0&&c.minimumShare<c.share,'the starting shield is visible inside a healthy allegiance bar');
  assert.equal(c.warriors,site.regionId===capital?12:5);
  // Civilian allegiance keeps the core held if its small guard is lost.
  writePopulationBins(site.detailedState,bins.map(b=>({...b,specialty:'ordinary'})));
  assert.equal(controlSummary(state,site.regionId).status,'supported');
  writePopulationBins(site.detailedState,bins);
 }
 // Use the actual seeded minority, preserving every person and allegiance.
 const site=occupied[0],total=controlSummary(state,site.regionId).total;
 for(let i=0;i<4;i++)resolveControl(state);
 assert.equal(state.world.regions.find(r=>r.id===site.regionId).controller,'external-a');
 writePopulationBins(site.detailedState,populationBins(site.detailedState).map(b=>({...b,specialty:'ordinary'})));
 assert.equal(controlSummary(state,site.regionId).total,total);
 for(let i=0;i<4;i++)resolveControl(state);
 assert.equal(state.world.regions.find(r=>r.id===site.regionId).controller,'frontier','removing the garrison must cost real seeded control');
}
console.log('[crown-minority] 12 seeds: 10 real occupations, 4 civilian-backed core holdings, visible core thresholds and army-removal control loss OK');
