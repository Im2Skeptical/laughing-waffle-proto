// Reversible, test-response-only instrumentation of the actual private visibility
// Set. No global prototype patch or product file is modified. Acceptance timings
// still need matched overhead/A-A evidence for this distinct runner path.
export function instrumentArtworkBundle(original,{tracePublication=true,allowFault=false}={}){
  let body=original,prefix='',extension='';
  if(tracePublication){
    const declaration=/\b((?:var|let|const)\s+)?hiddenGroups\s*=\s*(?:\/\*[^]*?\*\/\s*)?new Set\(\);/g;
    const matches=[...body.matchAll(declaration)];
    if(matches.length!==1)throw new Error('expected one actual private hiddenGroups Set declaration');
    prefix=`class HillclimbPublicationSet extends Set {
      report(kind,group){
        const witness=globalThis.__HC_ART__;
        if(!witness||!Array.isArray(witness.publicationEvents))throw new Error('publication witness not installed');
        witness.publicationEvents.push({kind,time:performance.now(),prefix:typeof group?.prefix==='string'?group.prefix:null});
      }
      add(group){const had=super.has(group);super.add(group);if(!had)this.report('hide',group);return this;}
      delete(group){const removed=super.delete(group);if(removed)this.report('publish',group);return removed;}
      clear(){const groups=[...this];super.clear();for(const group of groups)this.report('publish',group);}
    }\n`;
    body=body.replace(declaration,`${matches[0][1]??''}hiddenGroups = new HillclimbPublicationSet();`);
  }
  if(allowFault){
    for(const symbol of ['PACKED_GROUPS','packedTextures','hiddenGroups','bumpRevision','getChronicleTexture'])
      if(!new RegExp(`\\b${symbol}\\b`).test(original))throw new Error(`actual artwork binding missing: ${symbol}`);
    extension=`\n// Local negative-control API exists only in this served response.
      let hillclimbPublishedGroup=null;
      globalThis.__HC_ART_MUTANT__={
        publish(){
          if(hillclimbPublishedGroup)throw new Error('negative control already active');
          const group=PACKED_GROUPS.chronicleHudFrames;
          const file=[...packedTextures.keys()].find(key=>key.startsWith(group.prefix));
          if(!file||!hiddenGroups.has(group))throw new Error('real loaded hidden HUD group required');
          const beforeDrawing=!!getChronicleTexture(file),from=performance.now();
          hiddenGroups.delete(group);bumpRevision();hillclimbPublishedGroup=group;
          return {groupId:'chronicleHudFrames',prefix:group.prefix,file,from,beforeDrawing,afterDrawing:!!getChronicleTexture(file)};
        },
        restore(){
          if(!hillclimbPublishedGroup)throw new Error('negative control not active');
          hiddenGroups.add(hillclimbPublishedGroup);bumpRevision();hillclimbPublishedGroup=null;
          return {to:performance.now()};
        }
      };`;
  }
  return {body:prefix+body+extension,prefix,extension,tracePublication,allowFault,
    scope:'specific private Set writes and optional actual non-terrain visibility fault; no production/dist edits or global prototype hooks'};
}
