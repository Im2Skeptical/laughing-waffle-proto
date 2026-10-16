import { prepareCloudArt } from './cloud-banks.js';
import { createCloudMesh } from './cloud-material.js';
import { CLOUD_FAMILIES } from './cloud-weather.js';

// All 24 real generated frames, exercised through the production bank shader.
export async function verifyCloudShapes() {
  const atlases=await prepareCloudArt(),size=96;
  const renderer=new PIXI.Renderer({width:size,height:size,resolution:1});
  const target=PIXI.RenderTexture.create({width:size,height:size,resolution:1});
  const mesh=createCloudMesh();mesh.position.set(size/2);mesh.scale.set(size);
  const render=(bank,atlas)=>{mesh.setBank(bank,atlas);renderer.render(mesh,{renderTexture:target,clear:true});return renderer.extract.pixels(target);};
  let retained=0,holes=0,changed=0,maxEdgeAlpha=0;
  const variants=[];
  try {
    for(const [family,profile] of CLOUD_FAMILIES.entries()) {
      const signatures=new Set();
      for(let frame=0;frame<8;frame++) {
        const bank={family,frame,life:1,alpha:profile.alpha,evolution:.4,phase:17+frame,warp:profile.warp,shear:0};
        const full=render(bank,atlases[family]);
        let visible=0,hash=2166136261;
        for(let i=0;i<size*size;i++) {
          const a=full[i*4+3];if(a>10)visible++;
          hash=Math.imul(hash^a,16777619);
          if(i%size===0||i%size===size-1||i<size||i>=size*(size-1))maxEdgeAlpha=Math.max(maxEdgeAlpha,a);
        }
        if(visible<50)throw Error(`Missing cloud art: ${profile.id}/${frame}`);
        signatures.add(hash);
        const partial=render({...bank,life:.5},atlases[family]);
        for(let i=3;i<full.length;i+=4)if(full[i]>15) {
          if(Math.abs(partial[i]-full[i])<=1)retained++;
          if(partial[i]===0)holes++;
        }
        const gone=render({...bank,life:0},atlases[family]);
        if(gone.some(v=>v!==0))throw Error('Dead/before-birth clouds leave pixels');
        const evolved=render({...bank,evolution:1.2,shear:profile.shear*.5},atlases[family]);
        changed+=evolved.reduce((n,v,i)=>n+(Math.abs(v-full[i])>2),0);
        if(render(bank,atlases[family]).some((v,i)=>v!==full[i]))throw Error('Cloud shape restoration drift');
      }
      if(signatures.size!==8)throw Error(`${profile.id}: repeated/blank variants`);
      variants.push(signatures.size);
    }
    if(maxEdgeAlpha>4)throw Error(`Cloud sheet bleeds across cell edges: alpha ${maxEdgeAlpha}`);
    if(!retained||!holes||!changed)throw Error('Lifecycle must erode locally and retain intact fragments');
    return {pass:true,variants,retained,holes,changed,maxEdgeAlpha,restoredExactly:true};
  } finally {mesh.destroy();target.destroy(true);renderer.destroy();}
}
