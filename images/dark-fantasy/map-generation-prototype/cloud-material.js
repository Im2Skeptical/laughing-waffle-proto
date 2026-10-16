// One mesh per visible bank, drawn into the existing cloud target. Local shape
// erosion/deformation does not add a filter target or full-screen render pass.
import { WATER_DRIFT_GLSL } from './water-drift.js';

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
uniform sampler2D uAtlas;
uniform vec4 uFrame;
uniform vec4 uShape;
uniform vec4 uMotion;
${WATER_DRIFT_GLSL}
void main(){
  vec2 p=vUV;
  float z=uMotion.x;
  float a=driftNoise(vec3(p*4.0+vec2(uMotion.y,13),z));
  float b=driftNoise(vec3(p*5.0+vec2(31,uMotion.y),z*.73));
  p+=vec2(a,b)*uMotion.z;
  p.x+=(p.y-.5)*uMotion.w;
  float inside=step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);
  vec4 source=texture2D(uAtlas,uFrame.xy+clamp(p,.002,.998)*uFrame.zw);
  // Births grow dense lobes first; deaths eat through fragments rather than
  // fading an entire cloud sheet. Local noise follows each bank's own motion.
  float resistance=.44*source.a+.56*(.5+.5*a);
  float threshold=(1.0-uShape.x)*1.12-.06;
  float erosion=smoothstep(threshold-.035,threshold+.035,resistance);
  gl_FragColor=source*erosion*uShape.y*inside;
}`;

export function createCloudMesh() {
  const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[-.5,-.5,.5,-.5,.5,.5,-.5,.5],2)
    .addAttribute('aTextureCoord',[0,0,1,0,1,1,0,1],2).addIndex([0,1,2,0,2,3]);
  const shader=PIXI.Shader.from(vertex,fragment,{uAtlas:PIXI.Texture.WHITE,uFrame:[0,0,1,1],uShape:[0,0,0,0],uMotion:[0,0,0,0]});
  const mesh=new PIXI.Mesh(geometry,shader);mesh.eventMode='none';
  mesh.setBank=(bank,atlas)=>{
    Object.assign(shader.uniforms,{uAtlas:atlas,
      uFrame:[(bank.frame%4)/4,Math.floor(bank.frame/4)/2,1/4,1/2],
      uShape:[bank.life,bank.alpha,0,0],uMotion:[bank.evolution,bank.phase,bank.warp,bank.shear]});
  };
  const destroy=mesh.destroy.bind(mesh);
  mesh.destroy=options=>{destroy(options);geometry.destroy();shader.destroy();};
  return mesh;
}
