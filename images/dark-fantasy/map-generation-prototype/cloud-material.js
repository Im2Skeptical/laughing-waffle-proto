// One mesh per visible bank, drawn into the existing cloud target. Local shape
// erosion/deformation does not add a filter target or full-screen render pass.
import { WATER_DRIFT_GLSL } from './water-drift.js';
import { CLOUD_COVER_GLSL } from './cloud-cover.js';

const vertex=`
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUV;
void main(){vUV=aTextureCoord;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0)).xy,0,1);}`;
const fragment=`
precision highp float;
varying vec2 vUV;
uniform vec2 uCoverCentre;
uniform vec4 uCover;
uniform sampler2D uAtlas;
uniform vec4 uFrame;
uniform vec4 uShape;
uniform vec4 uMotion;
${WATER_DRIFT_GLSL}
${CLOUD_COVER_GLSL}
void main(){
  vec2 p=vUV;
  float z=uMotion.x;
  float a=driftNoise(vec3(p*2.2+vec2(uMotion.y,13),z));
  float b=driftNoise(vec3(p*3.0+vec2(31,uMotion.y),z*.73));
  p+=vec2(a,b)*uMotion.z;
  p.x+=(p.y-.5)*uMotion.w;
  float inside=step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);
  vec4 source=texture2D(uAtlas,uFrame.xy+clamp(p,.002,.998)*uFrame.zw);
  // Births grow dense lobes first; deaths eat through fragments rather than
  // fading an entire cloud sheet. Local noise follows each bank's own motion.
  // Authored bright lobes plus finer local density break up large sweeping cuts.
  float fine=driftNoise(vec3(p*9.0+vec2(53,uMotion.y),z*.5));
  float luminance=dot(source.rgb,vec3(.299,.587,.114));
  float resistance=.25*source.a+.25*luminance+.50*(.5+.5*(a*.5+fine*.5));
  float available=1.0;
  if(uCover.w>.5){
    // Weather controls development of the bank, not a screen cutting through
    // it. Local resistance supplies the shape of every emerging/dying lobe.
    float opening=cloudOpening(uCoverCentre,uCover.x,uCover.y);
    available=uCover.z>.5?smoothstep(.22,.72,opening):1.0-opening;
  }
  if(uShape.x<=0.0||available<=0.0){gl_FragColor=vec4(0.0);return;}
  float threshold=(1.0-min(uShape.x,available))*1.12-.06;
  float erosion=smoothstep(threshold-.065,threshold+.065,resistance);
  gl_FragColor=source*erosion*uShape.y*inside;
}`;

export function createCloudMesh() {
  const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[-.5,-.5,.5,-.5,.5,.5,-.5,.5],2)
    .addAttribute('aTextureCoord',[0,0,1,0,1,1,0,1],2).addIndex([0,1,2,0,2,3]);
  const shader=PIXI.Shader.from(vertex,fragment,{uAtlas:PIXI.Texture.WHITE,uFrame:[0,0,1,1],uShape:[0,0,0,0],uMotion:[0,0,0,0],uCoverCentre:[0,0],uCover:[0,0,0,0]});
  const mesh=new PIXI.Mesh(geometry,shader);mesh.eventMode='none';
  mesh.setBank=(bank,atlas)=>{
    Object.assign(shader.uniforms,{uAtlas:atlas,
      uCoverCentre:[bank.x??0,bank.y??0],
      uCover:[bank.weatherTime??0,bank.salt??0,+!!bank.sparse,+!!bank.cover],
      uFrame:[(bank.frame%bank.columns)/bank.columns,Math.floor(bank.frame/bank.columns)/bank.rows,1/bank.columns,1/bank.rows],
      uShape:[bank.life,bank.alpha,0,0],uMotion:[bank.evolution,bank.phase,bank.warp,bank.shear]});
  };
  const destroy=mesh.destroy.bind(mesh);
  mesh.destroy=options=>{destroy(options);geometry.destroy();shader.destroy();};
  return mesh;
}
