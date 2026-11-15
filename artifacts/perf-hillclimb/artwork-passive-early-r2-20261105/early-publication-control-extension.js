
globalThis.__HC_ART_DRAW__=file=>!!getChronicleTexture(file);
// Local negative-control API exists only in this served response.
      let hillclimbPublishedGroup=null;
      globalThis.__HC_ART_MUTANT__={
        publish(){
          if(hillclimbPublishedGroup)throw new Error('negative control already active');
          const group=PACKED_GROUPS.chronicleHudFrames;
          const file=[...packedTextures.keys()].find(key=>key.startsWith(group.prefix));
          if(!file||!hiddenGroups.has(group))throw new Error('real loaded hidden HUD group required');
          const beforeDrawing=!!getChronicleTexture(file),from=performance.now();
          hiddenGroups.delete(group);bumpRevision2();hillclimbPublishedGroup=group;
          return {groupId:'chronicleHudFrames',prefix:group.prefix,file,from,beforeDrawing,afterDrawing:!!getChronicleTexture(file)};
        },
        restore(){
          if(!hillclimbPublishedGroup)throw new Error('negative control not active');
          hiddenGroups.add(hillclimbPublishedGroup);bumpRevision2();hillclimbPublishedGroup=null;
          return {to:performance.now()};
        }
      };