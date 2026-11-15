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
