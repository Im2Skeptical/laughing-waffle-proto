import { prepareCloudArt } from './cloud-banks.js';
import { createCloudMesh } from './cloud-material.js';
import { cloudBanks } from './cloud-weather.js';

// A mature bank crossing a weather opening must not reveal a continuous cut
// through opaque artwork. Follow sharp, nearly straight edges in both axes.
export async function verifyCloudMask() {
  const atlases=await prepareCloudArt(),size=192;
  const renderer=new PIXI.Renderer({width:size,height:size,resolution:1});
  const target=PIXI.RenderTexture.create({width:size,height:size,resolution:1});
  const mesh=createCloudMesh();mesh.position.set(size/2);mesh.scale.set(size);
  const render=bank=>{mesh.setBank(bank,atlases[bank.family]);renderer.render(mesh,{renderTexture:target,clear:true});return renderer.extract.pixels(target);};
  let longestCut=0,worstBank=null;
  try {
    for(const time of [60,2400,4800,9600]) {
      const banks=cloudBanks([-1182,-387,3152,1032],time,1867).filter(b=>b.life>.7);
      for(const bank of banks) {
        const raw=render({...bank,cover:false,life:1}),masked=render(bank);
        render({...bank,life:0});
        if(render(bank).some((v,i)=>v!==masked[i]))throw Error(`Weather-mask restoration drift: ${bank.id}`);
        for(const transpose of [false,true])for(const sign of [-1,1]) {
          let previous=new Map();
          for(let y=0;y<size;y++) {
            const current=new Map();
            for(let x=2;x<size-2;x++) {
              const at=(dx)=>((transpose?(x+dx)*size+y:y*size+x+dx)*4+3);
              if(raw[at(-2)]<140||raw[at(2)]<140||masked[at(-2*sign)]>15||masked[at(2*sign)]<110)continue;
              const run=1+Math.max(previous.get(x-1)||0,previous.get(x)||0,previous.get(x+1)||0);
              current.set(x,run);
              if(run>longestCut){longestCut=run;worstBank={id:bank.id,time};}
            }
            previous=current;
          }
        }
      }
    }
    if(longestCut>24)throw Error(`Cloud emerges through a smooth mask edge: ${longestCut}px, ${JSON.stringify(worstBank)}`);
    return {pass:true,longestCut,worstBank};
  } finally {mesh.destroy();target.destroy(true);renderer.destroy();}
}
