// Visual-only palette cycling. Resolve categorical indices on the GPU first;
// downsample the resulting colours, never the indices, for the existing zoom UI.
import { WATER_RAMPS, WATER_VARIANTS, waterPaletteColour } from './water-style.js';
import { WATER_DRIFT_GLSL, waterDriftPhase } from './water-drift.js';

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
  const bytes=new Uint8Array(256*(WATER_VARIANTS+1)*4);
  const paletteTexture=PIXI.Texture.fromBuffer(bytes,256,WATER_VARIANTS+1,{scaleMode:PIXI.SCALE_MODES.NEAREST,mipmap:PIXI.MIPMAP_MODES.OFF});
  const levels=[];
  for(let n=0;n<=4&&Math.min(width,height)/2**n>=2;n++)levels.push(PIXI.RenderTexture.create({
    width:Math.ceil(width/2**n),height:Math.ceil(height/2**n),resolution:1,scaleMode:PIXI.SCALE_MODES.LINEAR,mipmap:PIXI.MIPMAP_MODES.OFF}));
  const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[0,0,width,0,width,height,0,height],2)
    .addAttribute('aTextureCoord',[0,0,1,0,1,1,0,1],2).addIndex([0,1,2,0,2,3]);
  const shader=PIXI.Shader.from(vertex,fragment,{uScene:texture,uFields:fields,uOverlays:overlayTexture,uPalette:paletteTexture,
    uWorld:drift.world??[0,0,1,1],uDriftPhase:waterDriftPhase(0)});
  const mesh=new PIXI.Mesh(geometry,shader);mesh.blendMode=PIXI.BLEND_MODES.NONE;
  const reducers=levels.slice(1).map((level,n)=>{const s=new PIXI.Sprite(levels[n]);s.width=level.width;s.height=level.height;return s;});
  let last=null;
  return {levels,frames:0,lastUpdateMs:0,
    update(renderer,seconds,force=false) {
      if(last===seconds&&!force)return;
      const started=performance.now();
      for(let i=0;i<256;i++)for(let row=0;row<=WATER_VARIANTS;row++) {
        const colour=row?waterPaletteColour(i,palette,mixColour,seconds,row-1):palette[i]||0,p=(row*256+i)*4;
        bytes[p]=colour>>16&255;bytes[p+1]=colour>>8&255;bytes[p+2]=colour&255;bytes[p+3]=255;
      }
      paletteTexture.baseTexture.update();
      shader.uniforms.uDriftPhase=waterDriftPhase(seconds);
      renderer.render(mesh,{renderTexture:levels[0],clear:true});
      for(let n=1;n<levels.length;n++)renderer.render(reducers[n-1],{renderTexture:levels[n],clear:true});
      last=seconds;this.frames++;this.lastUpdateMs=performance.now()-started;
    },
    destroy(){mesh.destroy();geometry.destroy();shader.destroy();reducers.forEach(s=>s.destroy());
      levels.forEach(t=>t.destroy(true));fields.destroy(true);overlayTexture.destroy(true);paletteTexture.destroy(true);},
  };
}
