import { createAtmosphere,sampleAtmosphere } from './atmosphere.js';

export function verifyAtmosphereGpu() {
  const width=48,height=24,mask=new Uint8Array(width*height*4),seed=1867,world=[-200,25,width*6,height*6];
  for(let i=0;i<width*height;i++){mask[i*4]=i%width<width/2?0:110;mask[i*4+2]=255;mask[i*4+3]=255;}
  const renderer=new PIXI.Renderer({width,height,resolution:1});
  const sky=createAtmosphere({width,height,mask,world,seed});
  let maximumError=0,initial=null,changed=0;
  try {
    for(const t of [0,7.875,320,997,1600,0]) {
      sky.update(renderer,t,{fog:true,clouds:true,shadows:true});
      const density=renderer.extract.pixels(sky.density),result=renderer.extract.pixels(sky.texture);
      for(let i=0;i<width*height;i++) {
        const expected=sampleAtmosphere(world[0]+(i%width+.5)*6,world[1]+(Math.floor(i/width)+.5)*6,t,seed);
        for(const [c,key] of ['cloud','fog','tone'].entries()) {
          const error=Math.abs(density[i*4+c]-expected[key]*255);maximumError=Math.max(maximumError,error);
          if(error>2)throw Error(`Atmosphere GPU ${key} mismatch at ${t}: ${error}`);
        }
      }
      if(!initial)initial=result.slice();
      else if(t===0&&result.some((v,i)=>v!==initial[i]))throw Error('Atmosphere did not restore exact RGBA');
      else if(t===320)changed=result.reduce((n,v,i)=>n+(Math.abs(v-initial[i])>2),0);
    }
    if(!changed)throw Error('Atmosphere remained still');
    sky.update(renderer,320,{fog:true,clouds:false,shadows:false});
    const fog=renderer.extract.pixels(sky.texture);
    for(let i=0;i<width*height;i++)if(i%width<width/2&&fog[i*4+3])throw Error('Fog crossed the playable-area mask');
    sky.update(renderer,320,{fog:false,clouds:false,shadows:true});
    const shadow=renderer.extract.pixels(sky.texture),density=renderer.extract.pixels(sky.density);
    for(let y=2;y<height;y++)for(let x=3;x<width;x++) {
      const expected=density[((y-2)*width+x-3)*4]*.105;
      if(Math.abs(shadow[(y*width+x)*4+3]-expected)>1)throw Error('Shadow detached from its offset cloud');
    }
    sky.update(renderer,320,{fog:false,clouds:false,shadows:false});
    if(renderer.extract.pixels(sky.texture).some(v=>v!==0))throw Error('Disabled atmosphere left visible pixels');
    return {pass:true,maximumError,changedChannels:changed,restoredExactly:true,playableFogLeak:0,shadowAligned:true};
  } finally {sky.destroy();renderer.destroy();}
}
