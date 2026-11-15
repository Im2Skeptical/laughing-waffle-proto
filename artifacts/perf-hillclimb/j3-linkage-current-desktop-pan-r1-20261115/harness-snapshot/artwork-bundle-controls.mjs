// Reversible, test-response-only instrumentation of the actual private visibility
// stores. No global prototype patch or product file is modified. Acceptance timings
// still need matched overhead/A-A evidence for this distinct runner path.
export function instrumentArtworkBundle(original,{tracePublication=true,allowFault=false,phaseWitness=false,cooperativeWitness=false}={}){
  if(typeof phaseWitness!=='boolean')throw new Error('phaseWitness must be an explicit boolean');
  if(typeof cooperativeWitness!=='boolean'||cooperativeWitness&&!phaseWitness)throw new Error('cooperativeWitness requires explicit boolean and phaseWitness');
  let body=original,prefix='',extension='';
  if(tracePublication||allowFault){
    if(!/\bgetChronicleTexture\b/.test(original))throw new Error('actual drawing resolver missing');
    extension='\nglobalThis.__HC_ART_DRAW__=file=>!!getChronicleTexture(file);';
  }
  if(tracePublication){
    const declaration=/\b((?:var|let|const)\s+)?hiddenGroups\s*=\s*(?:\/\*[^]*?\*\/\s*)?new Set\(\);/g;
    const matches=[...body.matchAll(declaration)];
    if(matches.length!==1)throw new Error('expected one actual private hiddenGroups Set declaration');
    const packedDeclaration=/\b((?:var|let|const)\s+)?packedTextures\s*=\s*(?:\/\*[^]*?\*\/\s*)?new Map\(\);/g;
    const packedMatches=[...body.matchAll(packedDeclaration)];
    if(packedMatches.length!==1)throw new Error('expected one actual private packedTextures Map declaration');
    if(!/\bpackedGroupFor\b/.test(original))throw new Error('actual packed-group classifier missing');
    prefix=`class HillclimbPublicationSet extends Set {
      report(kind,group){
        const witness=globalThis.__HC_ART__;
        if(!witness||!Array.isArray(witness.publicationEvents))throw new Error('publication witness not installed');
        witness.publicationEvents.push({kind,time:performance.now(),prefix:typeof group?.prefix==='string'?group.prefix:null});
      }
      add(group){const had=super.has(group);super.add(group);if(!had)this.report('hide',group);return this;}
      delete(group){const removed=super.delete(group);if(removed)this.report('publish',group);return removed;}
      clear(){const groups=[...this];super.clear();for(const group of groups)this.report('publish',group);}
    }
    class HillclimbPackedTextureMap extends Map {
      set(file,texture){
        super.set(file,texture);
        const group=packedGroupFor(file);
        if(group&&group!==PACKED_GROUPS.resources&&!hiddenGroups.has(group)){
          globalThis.__HC_ART__.publicationEvents.push({kind:'unwithheld-load',time:performance.now(),prefix:group.prefix,file});
        }
        return this;
      }
    }\n`;
    body=body.replace(declaration,`${matches[0][1]??''}hiddenGroups = new HillclimbPublicationSet();`);
    body=body.replace(packedDeclaration,`${packedMatches[0][1]??''}packedTextures = new HillclimbPackedTextureMap();`);
  }
  if(allowFault){
    for(const symbol of ['PACKED_GROUPS','packedTextures','hiddenGroups','getChronicleTexture'])
      if(!new RegExp(`\\b${symbol}\\b`).test(original))throw new Error(`actual artwork binding missing: ${symbol}`);
    // esbuild can rename the artwork function because the timeline exports an
    // unrelated bumpRevision(timeline). Bind only the unique no-argument art
    // increment, and reject ambiguous bundles rather than calling by guess.
    const revisionBindings=[...original.matchAll(/\bfunction (bumpRevision\d*)\(\)\s*\{\s*\w+\s*\+=\s*1;\s*\}/g)];
    if(revisionBindings.length!==1)throw new Error('expected one actual no-argument artwork revision increment');
    const artBumpRevision=revisionBindings[0][1];
    extension+=`\n// Local negative-control API exists only in this served response.
      let hillclimbPublishedGroup=null;
      globalThis.__HC_ART_MUTANT__={
        publish(){
          if(hillclimbPublishedGroup)throw new Error('negative control already active');
          const group=PACKED_GROUPS.chronicleHudFrames;
          const file=[...packedTextures.keys()].find(key=>key.startsWith(group.prefix));
          if(!file||!hiddenGroups.has(group))throw new Error('real loaded hidden HUD group required');
          const beforeDrawing=!!getChronicleTexture(file),from=performance.now();
          hiddenGroups.delete(group);${artBumpRevision}();hillclimbPublishedGroup=group;
          return {groupId:'chronicleHudFrames',prefix:group.prefix,file,from,beforeDrawing,afterDrawing:!!getChronicleTexture(file)};
        },
        restore(){
          if(!hillclimbPublishedGroup)throw new Error('negative control not active');
          hiddenGroups.add(hillclimbPublishedGroup);${artBumpRevision}();hillclimbPublishedGroup=null;
          return {to:performance.now()};
        }
      };`;
  }
  if(phaseWitness){body=instrumentPhaseBody(body);prefix+=phaseWitnessPrefix;}
  if(cooperativeWitness){
    body=instrumentCooperativeBody(body);
    prefix=prefix.replace('  if(site===\'terrain-enter\'', '  hillclimbCoopPhase(id,site,time);\n  if(site===\'terrain-enter\'');
    prefix+=cooperativeWitnessPrefix;
  }
  return {body:prefix+body+extension,prefix,extension,tracePublication,allowFault,phaseWitness,
    phaseWitnessVersion:phaseWitness?PHASE_WITNESS_VERSION:null,
    cooperativeWitness,cooperativeWitnessVersion:cooperativeWitness?COOPERATIVE_WITNESS_VERSION:null,
    scope:'specific private Set/packed-Map writes and optional actual non-terrain visibility fault; no production/dist edits or global prototype hooks'+
      (phaseWitness?'; opt-in bounded preparation phase markers v1; diagnostic response overhead explicitly uncalibrated':'')};
}

export const COOPERATIVE_WITNESS_VERSION=1;
// Private WeakMaps bind existing callback/stats identities; only bounded scalar
// copies enter the JSON witness. They never enter simulation or product state.
const cooperativeWitnessPrefix=`
globalThis.__HC_ART_COOP__={version:1,loaderLimit:8,jobLimit:4,invalid:0,unlinkedJobs:0,loaders:[],
  boundary:'post-clock collection; open waits right-censored; residual is other work/waits'};
const hillclimbCoopWaitIds=new WeakMap(),hillclimbCoopStats=new WeakMap();
function hillclimbCoopInvalid(loader){const w=globalThis.__HC_ART_COOP__;w.invalid=Math.min(2147483647,w.invalid+1);if(loader)loader.invalid=Math.min(2147483647,loader.invalid+1);}
function hillclimbCoopBindWait(wait,id){if(id===null)return;if(hillclimbCoopWaitIds.has(wait)&&hillclimbCoopWaitIds.get(wait)!==id){hillclimbCoopInvalid();return;}hillclimbCoopWaitIds.set(wait,id);}
function hillclimbCoopPhase(id,site,time){
  const w=globalThis.__HC_ART_COOP__;if(id===null)return;
  if(!Number.isFinite(time)){hillclimbCoopInvalid();return;}
  if(!Number.isInteger(id)||id<1||id>8){hillclimbCoopInvalid();return;}
  let l=w.loaders[id-1];
  if(!l){if(site!=='loader-enter'){hillclimbCoopInvalid();return;}l={id,phase:'loader',phaseStarted:{loader:time},waits:{},open:null,jobs:[],invalid:0};w.loaders.push(l);}
  const phases={'atlas-enter':'atlas','pre-terrain-wait-enter':'pre-terrain','main-enter':'main','main-return':'post-main','decision-enter':'decision','decision-return':'post-decision','ready-enter':'ready'};
  if(phases[site]){if(l.open||Object.hasOwn(l.phaseStarted,phases[site]))hillclimbCoopInvalid(l);l.phase=phases[site];l.phaseStarted[l.phase]=time;}
  const kind=site.startsWith('idle-')?'idle':site.startsWith('denied-delay-')?'denied-delay':null;
  if(!kind)return;
  if(site.endsWith('-enter')){if(l.open){hillclimbCoopInvalid(l);l.open.ambiguous=true;return;}l.open={kind,phase:l.phase,started:time,ambiguous:false};return;}
  if(!site.endsWith('-return'))return;
  const o=l.open;l.open=null;
  if(!o||o.kind!==kind||o.phase!==l.phase||o.ambiguous||time<o.started){hillclimbCoopInvalid(l);return;}
  const key=o.phase+':'+kind,s=l.waits[key]??(l.waits[key]={phase:o.phase,kind,count:0,totalMs:0,maxMs:0,lastReturned:time});
  if(s.count===2147483647){hillclimbCoopInvalid(l);return;}
  const ms=time-o.started;s.count++;s.totalMs+=ms;s.maxMs=Math.max(s.maxMs,ms);s.lastReturned=time;
}
function hillclimbCoopRegister(stats,wait){
  if(!wait)return;const id=hillclimbCoopWaitIds.get(wait),l=globalThis.__HC_ART_COOP__.loaders[id-1];
  if(!l){const w=globalThis.__HC_ART_COOP__;w.unlinkedJobs=Math.min(2147483647,w.unlinkedJobs+1);return;}
  if(!['main','decision'].includes(l.phase)){hillclimbCoopInvalid(l);return;}
  if(hillclimbCoopStats.has(stats)){hillclimbCoopInvalid(l);return;}
  hillclimbCoopStats.set(stats,{loader:l,phase:l.phase,current:null});
}
function hillclimbCoopJob(stats,name){
  const b=hillclimbCoopStats.get(stats);if(!b)return;
  const l=b.loader;if(l.phase!==b.phase||l.jobs.length>=4||b.current&&!['complete','cancel'].includes(b.current.status)){hillclimbCoopInvalid(l);return;}
  const time=performance.now(),j={name,phase:b.phase,started:time,updatedAt:time,status:'entered',steps:0,yields:0,longestStepMs:stats.longestStepMs??0,longestStepScope:'existing shared stats, cumulative across jobs'};
  b.baseSteps=stats.steps??0;b.baseYields=stats.yields??0;b.current=j;l.jobs.push(j);
}
function hillclimbCoopProgress(stats,status){
  const b=stats&&hillclimbCoopStats.get(stats),j=b?.current;if(!j)return;
  const steps=(stats.steps??0)-b.baseSteps,yields=(stats.yields??0)-b.baseYields;
  if(!Number.isSafeInteger(steps)||!Number.isSafeInteger(yields)||steps<0||yields<0||steps>2147483647||yields>2147483647||!Number.isFinite(stats.longestStepMs??0)){hillclimbCoopInvalid(b.loader);return;}
  j.steps=steps;j.yields=yields;j.longestStepMs=stats.longestStepMs??0;j.updatedAt=performance.now();j.status=status;
}
`;

export const cooperativeSource=`async function runCooperative(steps, { sliceMs = 250, stats = null, isCancelled = null, yieldTask = macrotask } = {}) {
  let sliceStart = performance.now(), stepStart = sliceStart;
  for (; ; ) {
    const step = steps.next();
    const now3 = performance.now();
    if (stats) {
      stats.steps = (stats.steps ?? 0) + 1;
      stats.longestStepMs = Math.max(stats.longestStepMs ?? 0, now3 - stepStart);
      if (now3 - stepStart > 100) (stats.slowSteps ?? (stats.slowSteps = [])).push([stats.steps, Math.round(now3 - stepStart)]);
    }
    if (step.done) return step.value;
    if (now3 - sliceStart >= sliceMs) {
      await yieldTask();
      if (isCancelled?.()) {
        steps.return();
        return void 0;
      }
      if (stats) stats.yields = (stats.yields ?? 0) + 1;
      sliceStart = stepStart = performance.now();
    } else stepStart = now3;
  }
}`;
export const cooperativePrepareBindings={
  register:'        const start = performance.now(), cooperation = {};',
  bake:'        const art = early?.art ?? await runCooperative(bakePixelTerrainSteps(map, bakeOptions(map)), cooperativeOptions(cooperation));',
  regional:'        const built = await runCooperative(prepareRegionalTilesSteps(presentation, landmarks, renderer), cooperativeOptions(cooperation));',
};
function instrumentCooperativeBody(original){
  if(original.includes('__HC_ART_COOP__')||original.includes('hillclimbCoop'))throw new Error('cooperative witness binding collision');
  let body=original;
  const once=(target,replacement,label)=>{if(body.split(target).length!==2)throw new Error('expected one actual cooperative '+label+' binding');body=body.replace(target,replacement);};
  let run=cooperativeSource
    .replace('    if (step.done) return step.value;','    if (step.done) {hillclimbCoopProgress(stats,"complete");return step.value;}')
    .replace('      await yieldTask();','      hillclimbCoopProgress(stats,"yield-enter");\n      await yieldTask();')
    .replace('        steps.return();','        hillclimbCoopProgress(stats,"cancel");\n        steps.return();')
    .replace('      sliceStart = stepStart = performance.now();','      hillclimbCoopProgress(stats,"yield-return");\n      sliceStart = stepStart = performance.now();');
  once(cooperativeSource,run,'runner');
  once('  hillclimbPhaseMark(hillclimbLoaderId,"atlas-enter");','  hillclimbCoopBindWait(wait2,hillclimbLoaderId);\n  hillclimbPhaseMark(hillclimbLoaderId,"atlas-enter");','wait identity');
  once(cooperativePrepareBindings.register,cooperativePrepareBindings.register+'\n        hillclimbCoopRegister(cooperation,backgroundWait);','stats identity');
  once(cooperativePrepareBindings.bake,cooperativePrepareBindings.bake.replace('await runCooperative(','await (hillclimbCoopJob(cooperation,"bake"),runCooperative(').replace('cooperativeOptions(cooperation));','cooperativeOptions(cooperation)));'),'bake');
  once(cooperativePrepareBindings.regional,cooperativePrepareBindings.regional.replace('await runCooperative(','await (hillclimbCoopJob(cooperation,"regional"),runCooperative(').replace('cooperativeOptions(cooperation));','cooperativeOptions(cooperation)));'),'regional');
  return body;
}

export const PHASE_WITNESS_VERSION=1;
// These are the inspected esbuild counterparts, not guessed line-number patches.
// Whole exact semantic blocks must occur once. Any changed/missing/duplicate site
// requires fresh inspection rather than silently omitting a marker.
export const phaseLoaderSource=`async function loadProgressiveArtwork({ renderer, canLoad, isCurrent, prepareTerrain, onReady, onError }) {
  const wait2 = async () => {
    while (isCurrent()) {
      if (!canLoad()) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      await new Promise((resolve) => {
        if (globalThis.requestIdleCallback) requestIdleCallback(resolve, { timeout: 1e3 });
        else setTimeout(resolve, 32);
      });
      if (canLoad()) return;
    }
  };
  const artwork = await loadProgressiveChronicleArt({ renderer, wait: wait2, isCurrent, onError });
  if (!artwork?.ok) return;
  await wait2();
  if (!isCurrent()) return;
  try {
    const revealTerrain = await prepareTerrain(wait2, isCurrent);
    if (!isCurrent()) return;
    onReady(() => {
      if (!isCurrent()) return false;
      if (revealTerrain && revealTerrain() === false) return false;
      return artwork.reveal();
    });
  } catch (error) {
    onError(error);
  }
}`;
export const phaseRootSource=`          prepareTerrain: async (wait2, isCurrent) => {
            const main = await worldMapView.prepareProgressive(app.renderer, wait2, isCurrent);
            if (!isCurrent()) return;
            const decision = await vassalNodeDecisionModalView.prepareProgressive(app.renderer, wait2, isCurrent);
            return () => {
              if (!isCurrent()) return false;
              return main?.() !== false && decision?.() !== false;
            };
          },
          onReady: (reveal) => {
            if (epoch === progressiveArtEpoch) {
              pendingArtworkReveal = reveal;
              settlementDebugMenu.refresh();
            }
          },
          onError: (error) => console.warn("[progressive-artwork]", error.message)
        }).catch((error) => console.warn("[progressive-artwork]", error.message));`;

const phaseWitnessPrefix=`
// Bounded response-only phase witness v1. No poller or extra scheduling boundary.
globalThis.__HC_ART_PHASE__={version:1,eventLimit:32,loaderLimit:8,countLimit:2147483647,
  events:[],droppedEvents:0,loaderCount:0,droppedLoaders:0,loaders:[],unlinkedSites:{},callingLoader:null,
  linkage:'prepare/ready capture synchronous caller; error callbacks explicitly unlinked'};
function hillclimbPhaseIncrement(value){return Math.min(2147483647,value+1);}
function hillclimbPhaseMark(id,site,value=null){
  const w=globalThis.__HC_ART_PHASE__,time=performance.now();
  const loader=id===null?null:w.loaders[id-1],sites=loader?loader.sites:w.unlinkedSites;
  const s=sites[site]??(sites[site]={count:0,lastAt:null,last:null});
  s.count=hillclimbPhaseIncrement(s.count);s.lastAt=time;s.last=value;
  if(loader){loader.lastPhase=site;loader.lastAt=time;}
  if(w.events.length<32)w.events.push({id,site,time,value});else w.droppedEvents=hillclimbPhaseIncrement(w.droppedEvents);
  if(site==='terrain-enter'||site==='ready-enter')w.callingLoader=id;
}
function hillclimbPhaseStart(){
  const w=globalThis.__HC_ART_PHASE__;w.loaderCount=hillclimbPhaseIncrement(w.loaderCount);
  if(w.loaders.length>=8){w.droppedLoaders=hillclimbPhaseIncrement(w.droppedLoaders);hillclimbPhaseMark(null,'unretained-loader');return null;}
  const id=w.loaders.length+1;w.loaders.push({id,sites:{},gates:{},lastPhase:null,lastAt:null});hillclimbPhaseMark(id,'loader-enter');return id;
}
function hillclimbPhaseGate(id,site,value){
  const loader=id===null?null:globalThis.__HC_ART_PHASE__.loaders[id-1];
  if(loader){const g=loader.gates[site]??(loader.gates[site]={count:0,denied:0,last:null,lastAt:null});
    g.count=hillclimbPhaseIncrement(g.count);if(!value)g.denied=hillclimbPhaseIncrement(g.denied);
    g.last=!!value;g.lastAt=performance.now();}
  return value;
}
`;
function instrumentPhaseBody(original){
  if(original.includes('__HC_ART_PHASE__')||original.includes('hillclimbPhase'))throw new Error('phase witness binding collision');
  if([...original.matchAll(/\bfunction\s+loadProgressiveArtwork\s*\(/g)].length!==1)throw new Error('expected one actual phase loader declaration');
  // Normalizing line endings happens only in the explicit diagnostic response.
  let body=original.replace(/\r\n/g,'\n');
  const once=(target,replacement,label)=>{
    if(body.split(target).length!==2)throw new Error(`expected one actual phase ${label} binding`);
    body=body.replace(target,replacement);
  };
  let loader=phaseLoaderSource
    .replace('  const wait2 = async () => {','  const hillclimbLoaderId = hillclimbPhaseStart();\n  const wait2 = async () => {\n    hillclimbPhaseMark(hillclimbLoaderId,"wait-enter");')
    .replace('while (isCurrent())','while (hillclimbPhaseGate(hillclimbLoaderId,"wait-current",isCurrent()))')
    .replace('if (!canLoad())','if (!hillclimbPhaseGate(hillclimbLoaderId,"pre-idle-load",canLoad()))')
    .replace('        await new Promise','        hillclimbPhaseMark(hillclimbLoaderId,"denied-delay-enter");\n        await new Promise')
    .replace('        continue;','        hillclimbPhaseMark(hillclimbLoaderId,"denied-delay-return");\n        continue;')
    .replace('\n      await new Promise','\n      hillclimbPhaseMark(hillclimbLoaderId,"idle-enter");\n      await new Promise')
    .replace('      if (canLoad()) return;','      hillclimbPhaseMark(hillclimbLoaderId,"idle-return");\n      if (hillclimbPhaseGate(hillclimbLoaderId,"post-idle-load",canLoad())) {hillclimbPhaseMark(hillclimbLoaderId,"wait-return");return;}')
    .replace('    }\n  };','    }\n    hillclimbPhaseMark(hillclimbLoaderId,"wait-stale-return");\n  };')
    .replace('  const artwork = await','  hillclimbPhaseMark(hillclimbLoaderId,"atlas-enter");\n  const artwork = await')
    .replace('  if (!artwork?.ok) return;','  if (!hillclimbPhaseGate(hillclimbLoaderId,"atlas-ok",artwork?.ok)) {hillclimbPhaseMark(hillclimbLoaderId,"atlas-return",false);return;}\n  hillclimbPhaseMark(hillclimbLoaderId,"atlas-return",true);')
    .replace('  await wait2();','  hillclimbPhaseMark(hillclimbLoaderId,"pre-terrain-wait-enter");\n  await wait2();\n  hillclimbPhaseMark(hillclimbLoaderId,"pre-terrain-wait-return");')
    .replaceAll('if (!isCurrent()) return;','if (!hillclimbPhaseGate(hillclimbLoaderId,"loader-current",isCurrent())) {hillclimbPhaseMark(hillclimbLoaderId,"loader-stale-return");return;}')
    .replace('    const revealTerrain = await','    hillclimbPhaseMark(hillclimbLoaderId,"terrain-enter");\n    const revealTerrain = await')
    .replace('    const revealTerrain = await prepareTerrain(wait2, isCurrent);','    const revealTerrain = await prepareTerrain(wait2, isCurrent);\n    hillclimbPhaseMark(hillclimbLoaderId,"terrain-return");')
    .replace('    onReady(() => {','    hillclimbPhaseMark(hillclimbLoaderId,"ready-enter");\n    onReady(() => {')
    .replace('      if (!isCurrent()) return false;','      if (!hillclimbPhaseGate(hillclimbLoaderId,"reveal-current",isCurrent())) {hillclimbPhaseMark(hillclimbLoaderId,"reveal-stale-return");return false;}')
    .replace('      if (revealTerrain && revealTerrain() === false) return false;','      if (revealTerrain && revealTerrain() === false) {hillclimbPhaseMark(hillclimbLoaderId,"terrain-reveal-denied");return false;}')
    .replace('    });\n  } catch','    });\n    hillclimbPhaseMark(hillclimbLoaderId,"ready-return");\n  } catch')
    .replace('    onError(error);','    hillclimbPhaseMark(hillclimbLoaderId,"caught-error");\n    onError(error);');
  let root=phaseRootSource
    .replace('            const main = await','            const hillclimbRootLoaderId = globalThis.__HC_ART_PHASE__.callingLoader;\n            hillclimbPhaseMark(hillclimbRootLoaderId,"main-enter");\n            const main = await')
    .replace('            if (!isCurrent()) return;','            hillclimbPhaseMark(hillclimbRootLoaderId,"main-return");\n            if (!hillclimbPhaseGate(hillclimbRootLoaderId,"root-current",isCurrent())) {hillclimbPhaseMark(hillclimbRootLoaderId,"root-stale-return");return;}')
    .replace('            const decision = await','            hillclimbPhaseMark(hillclimbRootLoaderId,"decision-enter");\n            const decision = await')
    .replace('            return () => {','            hillclimbPhaseMark(hillclimbRootLoaderId,"decision-return");\n            return () => {')
    .replace('              if (!isCurrent()) return false;','              if (!hillclimbPhaseGate(hillclimbRootLoaderId,"root-reveal-current",isCurrent())) return false;')
    .replace('            if (epoch === progressiveArtEpoch) {','            const hillclimbReadyLoaderId = globalThis.__HC_ART_PHASE__.callingLoader;\n            if (hillclimbPhaseGate(hillclimbReadyLoaderId,"ready-epoch",epoch === progressiveArtEpoch)) {')
    .replace('              pendingArtworkReveal = reveal;','              pendingArtworkReveal = reveal;\n              hillclimbPhaseMark(hillclimbReadyLoaderId,"pending-reveal");')
    .replace('onError: (error) => console.warn("[progressive-artwork]", error.message)','onError: (error) => {hillclimbPhaseMark(null,"root-error-unlinked",epoch);return console.warn("[progressive-artwork]", error.message);}')
    .replace('}).catch((error) => console.warn("[progressive-artwork]", error.message));','}).catch((error) => {hillclimbPhaseMark(null,"root-rejection-unlinked",epoch);return console.warn("[progressive-artwork]", error.message);});');
  once(phaseLoaderSource,loader,'loader');once(phaseRootSource,root,'root');return body;
}
