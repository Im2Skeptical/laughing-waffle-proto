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
