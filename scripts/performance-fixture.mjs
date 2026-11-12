import {createHash} from 'node:crypto';
import {readdir,readFile,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PERFORMANCE_START_SEEDS,performanceStartFixturePath} from '../src/controllers/performance-start-seeds.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function performanceFixtureKey(sourceRoot=root){
  const files=['scripts/performance-fixture.mjs','scripts/performance-fixture-recipe.mjs','src/controllers/performance-start-seeds.js','package-lock.json','src/views/ui-root/settlement-timegraph-window.js'];
  async function visit(folder){for(const entry of await readdir(path.join(sourceRoot,folder),{withFileTypes:true})){
    if(entry.name==='tests')continue;
    const file=`${folder}/${entry.name}`;
    if(entry.isDirectory())await visit(file);else if(entry.name.endsWith('.js'))files.push(file);
  }}
  await visit('src/model');await visit('src/defs');
  const hash=createHash('sha256');
  for(const file of files.sort())hash.update(file+'\0'+(await readFile(path.join(sourceRoot,file),'utf8')).replace(/\r\n/g,'\n'));
  return hash.digest('hex');
}
export async function ensurePerformanceFixture(){
  const key=await performanceFixtureKey();
  for(const seed of PERFORMANCE_START_SEEDS){
    const fixturePath=performanceStartFixturePath(seed),metaPath=path.join(root,fixturePath+'.meta.json');
    try{if(JSON.parse(await readFile(metaPath,'utf8')).key===key && (await stat(path.join(root,fixturePath))).isFile())continue;}catch{}
    console.log(`[performance-start] Baking seed ${seed} with current simulation...`);
    const {bakePerformanceStart}=await import('./performance-fixture-recipe.mjs');
    const payload=await bakePerformanceStart(seed);
    const compressed=gzipSync(JSON.stringify({key,...payload}),{level:9});
    await mkdir(path.dirname(metaPath),{recursive:true});
    await writeFile(path.join(root,fixturePath),compressed);
    await writeFile(metaPath,JSON.stringify({key,seed,bytes:compressed.length}));
    console.log(`[performance-start] Seed ${seed} ready: through ${payload.forecast.endSec} seconds, ${compressed.length} compressed bytes`);
  }
  // Remove the superseded single-seed output so production builds contain only the pool.
  await rm(path.join(root,'images/dev-fixtures/performance-start.json.gz'),{force:true});
  await rm(path.join(root,'images/dev-fixtures/performance-start.json.gz.meta.json'),{force:true});
  return key;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await ensurePerformanceFixture();
