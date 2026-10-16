// Visual-only palette cycling. Resolve categorical indices on the GPU first;
// downsample the resulting colours, never the indices, for the existing zoom UI.
import { WATER_RAMPS, WATER_VARIANTS, writeWaterPalette } from './water-style.js';
import { WATER_DRIFT_GLSL, waterDriftPhase } from './water-drift.js';
import { createAnimationWindow } from './animation-window.js';

const vertex=`
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUV;
void main(){vUV=aTextureCoord;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0)).xy,0.0,1.0);}`;
const fragment=`
precision highp float;
varying vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uFields;
uniform sampler2D uOverlays;
uniform sampler2D uPalette;
uniform vec4 uWorld;
uniform vec2 uDriftPhase;
${WATER_DRIFT_GLSL}
vec3 paletteDelta(float index,float variation){
  float u=(floor(index*255.0+0.5)+0.5)/256.0;
  float lo=floor(variation),hi=min(${WATER_VARIANTS-1}.0,lo+1.0);
  vec3 before=texture2D(uPalette,vec2(u,0.5/${WATER_VARIANTS+1}.0)).rgb;
  vec3 a=texture2D(uPalette,vec2(u,(lo+1.5)/${WATER_VARIANTS+1}.0)).rgb;
  vec3 b=texture2D(uPalette,vec2(u,(hi+1.5)/${WATER_VARIANTS+1}.0)).rgb;
  return mix(a,b,fract(variation))-before;
}
void main(){
  vec4 scene=texture2D(uScene,vUV);
  vec4 fields=texture2D(uFields,vUV);
  float index=floor(fields.r*255.0+0.5);
  float variation=fields.b*${WATER_VARIANTS-1}.0;
  vec4 overlays=texture2D(uOverlays,vUV);
  vec3 delta=paletteDelta(fields.r,variation)*fields.g;
  delta=mix(delta,paletteDelta(overlays.r,variation),overlays.g);
  delta=mix(delta,paletteDelta(overlays.b,variation),overlays.a);
  float body=index>=48.0&&index<56.0?4.0:(index>=112.0&&index<128.0)||index>=240.0?2.0:1.0;
  vec3 drift=waterDrift(uWorld.xy+vUV*uWorld.zw,uDriftPhase,body)*fields.a;
  gl_FragColor=vec4(clamp(scene.rgb+(drift+delta)*scene.a,vec3(0.0),vec3(scene.a)),scene.a);
}`;
const mixColour=(a,b,t)=>[16,8,0].reduce((c,s)=>c|Math.round((a>>s&255)*(1-t)+(b>>s&255)*t)<<s,0);

// Bakes sharing an immutable bank also share one CPU table and GPU upload.
// Reference counts release the resource when the last owning cycle is disposed.
const palettes=new WeakMap();
function acquirePalette(bank) {
  let entry=palettes.get(bank);
  if(!entry){
    const bytes=new Uint8Array(256*(WATER_VARIANTS+1)*4);
    const texture=PIXI.Texture.fromBuffer(bytes,256,WATER_VARIANTS+1,{scaleMode:PIXI.SCALE_MODES.NEAREST,mipmap:PIXI.MIPMAP_MODES.OFF});
    entry={bytes,texture,owners:0,seconds:null};palettes.set(bank,entry);
  }
  entry.owners++;
  return {texture:entry.texture,
    update(seconds){if(entry.seconds===seconds)return false;writeWaterPalette(entry.bytes,bank,mixColour,seconds);
      entry.texture.baseTexture.update();entry.seconds=seconds;return true;},
    release(){if(!--entry.owners){entry.texture.destroy(true);palettes.delete(bank);}},
  };
}

export function createWaterCycle(texture,indices,strength,palette,base=null,variationAt=()=>0,drift={},overlays=null) {
  const width=texture.width,height=texture.height,packed=new Uint8Array(width*height*4);
  const animated=new Uint8Array(256);
  for(const ramp of WATER_RAMPS)animated.fill(1,ramp.start,ramp.start+ramp.length);
  for(let i=0;i<indices.length;i++) {
    const index=indices[i],amplitude=base&&base[i]===0?255:strength[i];
    packed[i*4]=index;
    // The still renderer deliberately softens river colours by 85%.
    packed[i*4+1]=animated[index]?Math.round(amplitude*(index>=16&&index<24?.15:1)):0;
    packed[i*4+2]=animated[index]?Math.round(Math.max(0,Math.min(1,variationAt(i%width,Math.floor(i/width))))*255):0;
    packed[i*4+3]=Math.round(Math.max(0,Math.min(1,drift.maskAt?.(i)??0))*255);
  }
  const fields=PIXI.Texture.fromBuffer(packed,width,height,{scaleMode:PIXI.SCALE_MODES.NEAREST,mipmap:PIXI.MIPMAP_MODES.OFF,
    alphaMode:PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA});
  // Raw indices/weights, not colour: the alpha byte must not premultiply RGB.
  // Non-ocean callers can share a single transparent texel.
  const overlayTexture=PIXI.Texture.fromBuffer(overlays??new Uint8Array(4),overlays?width:1,overlays?height:1,
    {scaleMode:PIXI.SCALE_MODES.NEAREST,mipmap:PIXI.MIPMAP_MODES.OFF,alphaMode:PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA});
  const paletteResource=acquirePalette(palette);
  const surface=createAnimationWindow(width,height,{windowed:drift.windowed,mipLevels:true}),{levels}=surface;
  const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[0,0,width,0,width,height,0,height],2)
    .addAttribute('aTextureCoord',[0,0,1,0,1,1,0,1],2).addIndex([0,1,2,0,2,3]);
  const shader=PIXI.Shader.from(vertex,fragment,{uScene:texture,uFields:fields,uOverlays:overlayTexture,uPalette:paletteResource.texture,
    uWorld:drift.world??[0,0,1,1],uDriftPhase:waterDriftPhase(0)});
  const mesh=new PIXI.Mesh(geometry,shader);mesh.blendMode=PIXI.BLEND_MODES.NONE;
  let last=null,lastRevision=-1;
  const stats={passes:0,renderPixels:0,paletteUpdates:0};
  return {levels,frame:surface.frame,stats,frames:0,lastUpdateMs:0,
    get visible(){return surface.visible;},
    setView:(view,pixelsPerTexel)=>surface.setView(view,pixelsPerTexel),
    update(renderer,seconds,force=false) {
      if(!surface.visible||last===seconds&&lastRevision===surface.revision&&!force)return;
      const started=performance.now();
      if(paletteResource.update(seconds))stats.paletteUpdates++;
      shader.uniforms.uDriftPhase=waterDriftPhase(seconds);
      renderer.render(mesh,{renderTexture:levels[0],clear:true,transform:surface.transform});
      surface.reduce(renderer);
      last=seconds;lastRevision=surface.revision;this.frames++;this.lastUpdateMs=performance.now()-started;
      Object.assign(stats,{passes:levels.length,renderPixels:surface.pixels});
    },
    destroy(){mesh.destroy();geometry.destroy();shader.destroy();surface.destroy();
      fields.destroy(true);overlayTexture.destroy(true);paletteResource.release();},
  };
}
