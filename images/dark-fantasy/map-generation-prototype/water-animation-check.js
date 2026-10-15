// Browser GPU regression: use an isolated small fixture, not a full-scene readback.
import { createWaterCycle } from './water-animation.js';
import { waterPaletteColour } from './water-style.js';
export function verifyWaterGpu() {
  const renderer=new PIXI.Renderer({width:64,height:4,resolution:1});
  const palette=mapWorkbench.waterFields.palette,mix=(a,b,t)=>[16,8,0].reduce((c,s)=>c|Math.round((a>>s&255)*(1-t)+(b>>s&255)*t)<<s,0);
  const indices=new Uint8Array(256),strength=new Uint8Array(256),rgba=new Uint8Array(1024),base=new Uint32Array(256);
  for(let i=0;i<256;i++){indices[i]=i;strength[i]=180;base[i]=i>=16&&i<24?0:0x486773;const c=base[i]?mix(base[i],palette[i]||0,180/255):palette[i]||0;
    rgba[i*4]=c>>16&255;rgba[i*4+1]=c>>8&255;rgba[i*4+2]=c&255;rgba[i*4+3]=255;}
  const texture=PIXI.Texture.fromBuffer(rgba,64,4),cycle=createWaterCycle(texture,indices,strength,palette,base);
  let maximumError=0,changed=0;
  try {
    for(const t of [0,.125,1.7,-.4,0]) {
      cycle.update(renderer,t,true);const pixels=renderer.extract.pixels(cycle.levels[0]);
      for(let i=0;i<256;i++)for(let channel=0;channel<3;channel++) {
        const shift=16-channel*8,before=palette[i]||0,after=waterPaletteColour(i,palette,mix,t);
        const amplitude=(i>=16&&i<24?Math.round(255*.15):180)/255;
        const expected=Math.max(0,Math.min(255,rgba[i*4+channel]+((after>>shift&255)-(before>>shift&255))*amplitude));
        const error=Math.abs(pixels[i*4+channel]-expected);maximumError=Math.max(maximumError,error);
        if(error>2)throw new Error(`GPU palette mismatch: phase ${t}, index ${i}, channel ${channel}, expected ${expected}, got ${pixels[i*4+channel]}`);
        if(t===1.7&&Math.abs(pixels[i*4+channel]-rgba[i*4+channel])>5)changed++;
      }
    }
    if(!changed)throw new Error('GPU water remained still');
    return {pass:true,maximumError,changedChannels:changed};
  } finally {cycle.destroy();texture.destroy(true);renderer.destroy();}
}
