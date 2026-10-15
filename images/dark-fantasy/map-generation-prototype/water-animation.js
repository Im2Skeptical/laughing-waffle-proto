// Visual-only palette cycling. Resolve categorical indices on the GPU first;
// downsample the resulting colours, never the indices, for the existing zoom UI.
import { WATER_RAMPS, waterPaletteColour } from './water-style.js';

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
uniform sampler2D uPalette;
void main(){
  vec4 scene=texture2D(uScene,vUV);
  vec2 fields=texture2D(uFields,vUV).rg;
  float index=floor(fields.r*255.0+0.5);
  float u=(index+0.5)/256.0;
  vec3 before=texture2D(uPalette,vec2(u,0.25)).rgb;
  vec3 after=texture2D(uPalette,vec2(u,0.75)).rgb;
  gl_FragColor=vec4(clamp(scene.rgb+(after-before)*fields.g*scene.a,vec3(0.0),vec3(scene.a)),scene.a);
}`;
const mixColour=(a,b,t)=>[16,8,0].reduce((c,s)=>c|Math.round((a>>s&255)*(1-t)+(b>>s&255)*t)<<s,0);

export function createWaterCycle(texture,indices,strength,palette,base=null) {
  const width=texture.width,height=texture.height,packed=new Uint8Array(width*height*4);
  const animated=new Uint8Array(256);
  for(const ramp of WATER_RAMPS)animated.fill(1,ramp.start,ramp.start+ramp.length);
  for(let i=0;i<indices.length;i++) {
    const index=indices[i],amplitude=base&&base[i]===0?255:strength[i];
    packed[i*4]=index;
    // The still renderer deliberately softens river colours by 85%.
    packed[i*4+1]=animated[index]?Math.round(amplitude*(index>=16&&index<24?.15:1)):0;
    packed[i*4+3]=255;
  }
  const fields=PIXI.Texture.fromBuffer(packed,width,height,{scaleMode:PIXI.SCALE_MODES.NEAREST,mipmap:PIXI.MIPMAP_MODES.OFF});
  const bytes=new Uint8Array(256*2*4);
  const paletteTexture=PIXI.Texture.fromBuffer(bytes,256,2,{scaleMode:PIXI.SCALE_MODES.NEAREST,mipmap:PIXI.MIPMAP_MODES.OFF});
  const levels=[];
  for(let n=0;n<=4&&Math.min(width,height)/2**n>=2;n++)levels.push(PIXI.RenderTexture.create({
    width:Math.ceil(width/2**n),height:Math.ceil(height/2**n),resolution:1,scaleMode:PIXI.SCALE_MODES.LINEAR,mipmap:PIXI.MIPMAP_MODES.OFF}));
  const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[0,0,width,0,width,height,0,height],2)
    .addAttribute('aTextureCoord',[0,0,1,0,1,1,0,1],2).addIndex([0,1,2,0,2,3]);
  const shader=PIXI.Shader.from(vertex,fragment,{uScene:texture,uFields:fields,uPalette:paletteTexture});
  const mesh=new PIXI.Mesh(geometry,shader);mesh.blendMode=PIXI.BLEND_MODES.NONE;
  const reducers=levels.slice(1).map((level,n)=>{const s=new PIXI.Sprite(levels[n]);s.width=level.width;s.height=level.height;return s;});
  let last=null;
  return {levels,frames:0,lastUpdateMs:0,
    update(renderer,seconds,force=false) {
      if(last===seconds&&!force)return;
      const started=performance.now();
      for(let i=0;i<256;i++)for(let row=0;row<2;row++) {
        const colour=row?waterPaletteColour(i,palette,mixColour,seconds):palette[i]||0,p=(row*256+i)*4;
        bytes[p]=colour>>16&255;bytes[p+1]=colour>>8&255;bytes[p+2]=colour&255;bytes[p+3]=255;
      }
      paletteTexture.baseTexture.update();
      renderer.render(mesh,{renderTexture:levels[0],clear:true});
      for(let n=1;n<levels.length;n++)renderer.render(reducers[n-1],{renderTexture:levels[n],clear:true});
      last=seconds;this.frames++;this.lastUpdateMs=performance.now()-started;
    },
    destroy(){mesh.destroy();geometry.destroy();shader.destroy();reducers.forEach(s=>s.destroy());
      levels.forEach(t=>t.destroy(true));fields.destroy(true);paletteTexture.destroy(true);},
  };
}

// Never catch up time spent hidden, paused, or blocked baking a new map.
export function createWaterClock() {
  let last=null,seconds=0;
  return {get seconds(){return seconds;},reset(){last=null;},seek(value){if(!Number.isFinite(value))throw new Error('Water phase must be finite');seconds=value;last=null;},
    step(now,playing){if(!playing){last=null;return false;}if(last===null){last=now;return false;}
      const elapsed=now-last;if(elapsed<1000/30-.5)return false;
      last=now;seconds+=Math.min(elapsed,100)/1000;return true;},
  };
}
