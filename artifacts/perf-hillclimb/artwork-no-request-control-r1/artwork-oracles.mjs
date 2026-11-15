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
