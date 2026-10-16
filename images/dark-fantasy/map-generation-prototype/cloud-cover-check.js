import { createCloudMesh } from './cloud-material.js';
import { cloudOpening,cloudWeatherTime } from './cloud-cover.js';
import { noise } from './water-drift.js';

// Exercise the real bank material's shared world mask, independently of artwork.
export function verifyCloudCover() {
  const width=128,height=80,renderer=new PIXI.Renderer({width,height,resolution:1});
  const target=PIXI.RenderTexture.create({width,height,resolution:1});
  const mesh=createCloudMesh();mesh.position.set(width/2,height/2);mesh.scale.set(width,height);
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  let maximumError=0,denseCores=0,sparseCores=0,openPixels=0;
  try {
    for(const t of [0,4800,9600])for(const sparse of [false,true]) {
      const bank={frame:0,columns:1,rows:1,life:1,alpha:1,evolution:.4,phase:17,warp:0,shear:0,
        x:500,y:500,width:4000,height:2400,rotation:.23,cover:true,sparse,
        weatherTime:cloudWeatherTime(t),salt:(1867%997)*.0713};
      mesh.setBank(bank,PIXI.Texture.WHITE);renderer.render(mesh,{renderTexture:target,clear:true});
      const pixels=renderer.extract.pixels(target);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const u=(x+.5)/width,v=(y+.5)/height,dx=(u-.5)*bank.width,dy=(v-.5)*bank.height;
        const wx=bank.x+dx*Math.cos(bank.rotation)-dy*Math.sin(bank.rotation);
        const wy=bank.y+dx*Math.sin(bank.rotation)+dy*Math.cos(bank.rotation);
        const opening=cloudOpening(wx,wy,bank.weatherTime,1867);
        const available=sparse?smooth(.22,.72,opening):1-opening;
        const broad=noise(u*2.2+17,v*2.2+13,.4),fine=noise(u*9+53,v*9+17,.2);
        const resistance=.50+.50*(.5+.5*(broad*.5+fine*.5));
        const threshold=(1-available)*1.12-.06;
        const expected=available<=0?0:255*smooth(threshold-.065,threshold+.065,resistance);
        const actual=pixels[(y*width+x)*4+3];
        maximumError=Math.max(maximumError,Math.abs(expected-actual));
        if(!sparse&&opening<.05&&actual>250)denseCores++;
        if(!sparse&&opening>.95&&actual===0)openPixels++;
        if(sparse&&opening>.95&&actual>250)sparseCores++;
      }
    }
    if(maximumError>2)throw Error(`World cloud-cover CPU/GPU mismatch: ${maximumError}`);
    if(!denseCores||!sparseCores||!openPixels)throw Error('Cover must retain dense banks and sparse clouds inside broad openings');
    return {pass:true,maximumError,denseCores,sparseCores,openPixels};
  } finally {mesh.destroy();target.destroy(true);renderer.destroy();}
}
