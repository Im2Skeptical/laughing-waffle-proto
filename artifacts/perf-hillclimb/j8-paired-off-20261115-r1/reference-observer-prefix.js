class HillclimbPublicationSet extends Set {
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
    }

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
  hillclimbCoopPhase(id,site,time);
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
