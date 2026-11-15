// Create and retain the complete predeclared ordinary-seed corpus. This is
// correctness/fixture preparation, never interaction latency evidence.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createFixtures,digest} from './fixtures.mjs';

const output=path.resolve(process.argv[2]??'artifacts/perf-hillclimb/fixture-corpus');
await mkdir(output,{recursive:true});
const manifest={format:1,seeds:[123,424242,99117],policy:'ordinary settings, fixed first-legal itinerary, no seed selection or danger suppression',fixtures:[],failures:[]};
for(const seed of manifest.seeds){
  try{
    const fixtures=createFixtures(seed);
    for(const [id,fixture]of Object.entries(fixtures)){
      const {text,...meta}=fixture;
      await writeFile(path.join(output,`${seed}-${id}.json`),text);
      manifest.fixtures.push({...meta,file:`${seed}-${id}.json`});
    }
    const later=fixtures['later-history'];
    assert.ok(later.actions>=8||/loss|ended|no legal|cannot confirm/.test(later.itineraryStop),`seed ${seed} later history must be representative or retain an ordinary stop reason`);
  }catch(error){
    const evidence=`${seed}-failure.json`;
    await writeFile(path.join(output,evidence),JSON.stringify({error:error.stack,trace:error.fixtureTrace,stateData:error.fixtureStateData},null,2));
    for(const [id,fixture]of Object.entries(error.partialFixtures??{})){
      const {text,...meta}=fixture;await writeFile(path.join(output,`${seed}-${id}.json`),text);
      manifest.fixtures.push({...meta,file:`${seed}-${id}.json`});
    }
    manifest.failures.push({seed,error:error.stack,evidence});
  }
}
manifest.identity=digest(manifest);
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`[hillclimb-corpus] seeds=${manifest.seeds.length} fixtures=${manifest.fixtures.length} failures=${manifest.failures.length}; ${output}/manifest.json`);
process.exitCode=manifest.failures.length?1:0;
