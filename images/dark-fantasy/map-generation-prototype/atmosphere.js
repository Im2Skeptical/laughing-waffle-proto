// Presentation-only weather: absolute time, world coordinates and a fixed seed.
// Density is rendered once at low resolution; shadows sample that same cloud
// field with an offset. No frame history, particle state or simulation RNG.
import { noise, WATER_DRIFT_GLSL } from './water-drift.js';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function atmospherePhase(seconds,seed) {
  const salt=(seed%997)*.713;
  return {wind:[seconds*.48+18*Math.sin(seconds/173),seconds*.13+24*Math.sin(seconds/269)],
    evolve:seconds/237, fogTime:seconds/181, salt,
    threshold:.55+.035*Math.sin(seconds/311+salt)+.025*Math.sin(seconds/947+salt*.3)};
}
export function sampleAtmosphere(x,y,seconds,seed) {
  const p=atmospherePhase(seconds,seed),u=(x-p.wind[0])/93+p.salt,v=(y-p.wind[1])/71;
  const wx=noise(u*.73+19,v*.73-37,p.evolve*.31),wy=noise(u*.61-53,v*.61+17,p.evolve*.29+31);
  const qx=u+wx*1.25,qy=v+wy*1.25;
  const a=noise(qx*.8-qy*.6,qx*.6+qy*.8,p.evolve);
  const b=noise(qx*1.72+qy*1.31-41,-qx*1.31+qy*1.72+29,p.evolve*.73+11);
  const c=noise(qx*4.7+73,qy*4.7-13,p.evolve*.61+47);
  const mass=.5+.5*(a*.52+b*.32+c*.16);
  const cloud=smooth(p.threshold,p.threshold+.24,mass);
  const fx=(x*.8-y*.6)/110+wx*.7,fy=(x*.6+y*.8)/97+wy*.7;
  const fog=.5+.5*(.73*noise(fx+p.salt+seconds*.0007,fy,p.fogTime)
    +.27*noise(fx*2.1+73,fy*2.1-p.salt,p.fogTime*.61));
  return {cloud,fog,tone:Math.max(0,Math.min(1,.64+a*.20+c*.12))};
}

const vertex=`
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUV;
void main(){vUV=aTextureCoord;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0)).xy,0.0,1.0);}`;
const densityFragment=`
precision highp float;
varying vec2 vUV;
uniform vec4 uWorld;
uniform vec2 uWind;
uniform vec4 uPhase;
uniform float uSeconds;
${WATER_DRIFT_GLSL}
void main(){
  vec2 w=uWorld.xy+vUV*uWorld.zw;
  vec2 uv=(w-uWind)/vec2(93.0,71.0)+vec2(uPhase.z,0);
  vec2 warp=vec2(driftNoise(vec3(uv*.73+vec2(19,-37),uPhase.x*.31)),
    driftNoise(vec3(uv*.61+vec2(-53,17),uPhase.x*.29+31.0)));
  vec2 q=uv+warp*1.25;
  float a=driftNoise(vec3(q.x*.8-q.y*.6,q.x*.6+q.y*.8,uPhase.x));
  float b=driftNoise(vec3(q.x*1.72+q.y*1.31-41.0,-q.x*1.31+q.y*1.72+29.0,uPhase.x*.73+11.0));
  float c=driftNoise(vec3(q*4.7+vec2(73,-13),uPhase.x*.61+47.0));
  float mass=.5+.5*(a*.52+b*.32+c*.16);
  float cloud=smoothstep(uPhase.w,uPhase.w+.24,mass);
  vec2 f=vec2(w.x*.8-w.y*.6,w.x*.6+w.y*.8)/vec2(110,97)+warp*.7;
  float fog=.5+.5*(.73*driftNoise(vec3(f+vec2(uPhase.z+uSeconds*.0007,0),uPhase.y))
    +.27*driftNoise(vec3(f*2.1+vec2(73,-uPhase.z),uPhase.y*.61)));
  gl_FragColor=vec4(cloud,fog,clamp(.64+a*.20+c*.12,0.0,1.0),1);
}`;
const compositeFragment=`
precision highp float;
varying vec2 vUV;
uniform sampler2D uDensity;
uniform sampler2D uMask;
uniform vec2 uShadowOffset;
uniform vec3 uEnabled;
void main(){
  vec3 field=texture2D(uDensity,vUV).rgb;
  vec3 mask=texture2D(uMask,vUV).rgb;
  float shadow=texture2D(uDensity,vUV-uShadowOffset).r*.105*uEnabled.z*mask.b;
  float fog=mask.r*(.18+field.g*.57)*uEnabled.x;
  float cloud=field.r*.26*uEnabled.y*mask.b;
  vec3 colour=vec3(.11,.16,.19)*shadow;
  float alpha=shadow;
  colour=colour*(1.0-fog)+vec3(.59,.64,.66)*fog;
  alpha=alpha*(1.0-fog)+fog;
  colour=colour*(1.0-cloud)+mix(vec3(.60,.66,.67),vec3(.84,.86,.79),field.b)*cloud;
  alpha=alpha*(1.0-cloud)+cloud;
  gl_FragColor=vec4(colour,alpha);
}`;

export function createAtmosphere({width,height,mask,world,seed}) {
  const makeTarget=()=>PIXI.RenderTexture.create({width,height,resolution:1,scaleMode:PIXI.SCALE_MODES.LINEAR,mipmap:PIXI.MIPMAP_MODES.OFF});
  const density=makeTarget(),texture=makeTarget();
  const maskTexture=PIXI.Texture.fromBuffer(mask,width,height,{scaleMode:PIXI.SCALE_MODES.LINEAR,
    mipmap:PIXI.MIPMAP_MODES.OFF,alphaMode:PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA});
  const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[0,0,width,0,width,height,0,height],2)
    .addAttribute('aTextureCoord',[0,0,1,0,1,1,0,1],2).addIndex([0,1,2,0,2,3]);
  const fieldShader=PIXI.Shader.from(vertex,densityFragment,{uWorld:world,uWind:[0,0],uPhase:[0,0,0,0],uSeconds:0});
  const compositeShader=PIXI.Shader.from(vertex,compositeFragment,{uDensity:density,uMask:maskTexture,
    uShadowOffset:[18/world[2],12/world[3]],uEnabled:[1,1,1]});
  const fieldMesh=new PIXI.Mesh(geometry,fieldShader),compositeMesh=new PIXI.Mesh(geometry,compositeShader);
  fieldMesh.blendMode=compositeMesh.blendMode=PIXI.BLEND_MODES.NONE;
  let lastTime=null,densityTime=null,lastOptions='';
  const stats={width,height,textureMiB:+(width*height*12/1048576).toFixed(2),frames:0,phaseSeconds:null,updateMs:0};
  return {texture,density,stats,
    update(renderer,seconds,{fog=true,clouds=true,shadows=true}={},force=false) {
      const key=`${fog}/${clouds}/${shadows}`;
      if(!force&&lastTime===seconds&&lastOptions===key)return false;
      const started=performance.now();
      const enabled=fog||clouds||shadows;
      if(enabled&&(force||densityTime!==seconds)) {
        const p=atmospherePhase(seconds,seed);
        Object.assign(fieldShader.uniforms,{uWind:p.wind,uPhase:[p.evolve,p.fogTime,p.salt,p.threshold],uSeconds:seconds});
        renderer.render(fieldMesh,{renderTexture:density,clear:true});
        densityTime=seconds;
      }
      compositeShader.uniforms.uEnabled=[+fog,+clouds,+shadows];
      if(enabled||lastOptions!==key||force)renderer.render(compositeMesh,{renderTexture:texture,clear:true});
      lastTime=seconds;lastOptions=key;
      Object.assign(stats,{phaseSeconds:seconds,frames:stats.frames+1,updateMs:Math.round((performance.now()-started)*100)/100,fog,clouds,shadows});
      return true;
    },
    destroy(){fieldMesh.destroy();compositeMesh.destroy();geometry.destroy();fieldShader.destroy();compositeShader.destroy();
      density.destroy(true);texture.destroy(true);maskTexture.destroy(true);},
  };
}
