// Reversible, test-response-only instrumentation of the actual private visibility
// stores. No global prototype patch or product file is modified. Acceptance timings
// still need matched overhead/A-A evidence for this distinct runner path.
export function instrumentArtworkBundle(original,{tracePublication=true,allowFault=false}={}){
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
  return {body:prefix+body+extension,prefix,extension,tracePublication,allowFault,
    scope:'specific private Set/packed-Map writes and optional actual non-terrain visibility fault; no production/dist edits or global prototype hooks'};
}
