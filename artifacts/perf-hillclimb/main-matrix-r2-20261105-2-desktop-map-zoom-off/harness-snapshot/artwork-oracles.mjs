// Serialized into the actual page. Texture presence is checked against the
// game's existing canvas context, not an arbitrary historical Pixi context.
// This proves current-context texture presence, not GPU idle/physical scanout.
export function inspectAtlasUploads(files) {
  const canvas=document.querySelector('canvas');
  const gl=canvas?.getContext('webgl2')??canvas?.getContext('webgl')??null;
  const contextLost=gl?gl.isContextLost():null;
  return files.map(file=>{
    const sheet=PIXI.Assets.cache.get(`images/sprite-sheets/${file}`);
    const textures=Object.values(sheet?.textures??{}),bases=[...new Set(textures.map(t=>t.baseTexture))];
    const valid=textures.length>0&&textures.every(t=>t.valid===true&&t.baseTexture?.valid===true);
    const resident=gl&&!contextLost?bases.filter(base=>Object.values(base?._glTextures??{}).some(entry=>{
      try{return !!entry.texture&&gl.isTexture(entry.texture);}catch{return false;}
    })).length:0;
    return {file,textures:textures.length,baseTextures:bases.length,valid,
      uploaded:valid&&!!gl&&!contextLost&&resident===bases.length,
      contextAvailable:!!gl,contextLost,currentContextBases:resident,
      foreignOrMissingBases:bases.length-resident};
  });
}

// Pure functional publication oracle shared by normal endpoints and deliberate
// actual-product mutants. Terrain readiness alone cannot certify withholding.
export function assertArtworkPublication(snapshot,requiredGroups,{prepared=false,revealed=false}={}) {
  const need=(ok,message)=>{if(!ok)throw new Error(`artwork oracle: ${message}`);};
  need(snapshot?.version===2,'passive DTO v2 required');
  const artwork=snapshot.artwork;
  need(artwork?.version===1&&Array.isArray(artwork.groups),'all-atlas publication metadata unavailable');
  need(Array.isArray(requiredGroups)&&requiredGroups.length>0,'frozen required group inventory missing');
  const groups=new Map();
  for(const group of artwork.groups){need(typeof group.id==='string'&&!groups.has(group.id),'invalid/duplicate group identity');groups.set(group.id,group);}
  need(groups.size===requiredGroups.length,'required group inventory changed');
  for(const expected of requiredGroups){
    const group=groups.get(expected.id);need(group&&group.prefix===expected.prefix,`missing/wrong group ${expected.id}`);
    for(const name of ['hidden','drawingAvailable','loaded','failed'])need(typeof group[name]==='boolean',`${expected.id} unknown ${name}`);
    for(const name of ['textureCount','validTextureCount','drawingAvailableCount'])
      need(Number.isInteger(group[name])&&group[name]>=0,`${expected.id} invalid ${name}`);
    need(group.validTextureCount<=group.textureCount&&group.drawingAvailableCount<=group.textureCount,`${expected.id} contradictory counts`);
    need(group.loaded===(group.textureCount>0)&&group.drawingAvailable===(group.textureCount>0&&!group.hidden),
      `${expected.id} contradictory availability`);
    if(!revealed){
      need(group.drawingAvailable===false&&group.drawingAvailableCount===0&&group.sampleDrawingAvailable!==true,
        `premature non-resource publication ${expected.id}`);
      if(group.loaded)need(group.hidden===true,`loaded group not withheld ${expected.id}`);
    }
    if(prepared||revealed){
      need(group.loaded===true&&group.failed===false,`required group not loaded ${expected.id}`);
      need(group.textureCount===expected.textureCount&&group.validTextureCount===expected.textureCount,`required frames missing/invalid ${expected.id}`);
      need(typeof group.sampleFile==='string'&&group.sampleFile.startsWith(expected.prefix),`representative frame unavailable ${expected.id}`);
      need(group.sampleDrawingAvailable===revealed,`representative drawing availability wrong ${expected.id}`);
    }
    if(revealed)need(group.hidden===false&&group.drawingAvailable===true&&group.drawingAvailableCount===expected.textureCount,
      `explicit reveal unavailable ${expected.id}`);
  }
  if(!revealed)need(snapshot.map?.artReady===false&&snapshot.life?.decisionArtReady===false,'terrain published before explicit input');
  if(prepared)need(snapshot.map?.artPrepared===true&&snapshot.life?.decisionArtPrepared===true&&snapshot.sealReady===true,
    'preparation has not completed on both terrain surfaces');
  if(revealed)need(snapshot.map?.artReady===true&&snapshot.life?.decisionArtReady===true&&snapshot.sealReady===false,
    'explicit reveal not complete on both terrain surfaces');
  return {groups:groups.size,prepared,revealed,revision:artwork.revision,
    scope:'all frozen non-resource resolver groups and both terrains; no GPU idle/physical scanout or per-frame pixel equivalence claim'};
}
