import { mapAssetUrl } from './asset-url.js';
// Overhead cloud-top banks, positioned from absolute time rather than frame history.
import { CLOUD_FAMILIES,cloudBanks } from './cloud-weather.js';
import { createCloudMesh } from './cloud-material.js';

let atlasPromise,atlases;
export function prepareCloudArt() {
  return atlasPromise ??= Promise.all(CLOUD_FAMILIES.map(family=>
    PIXI.Assets.load(mapAssetUrl(family.asset)))).then(textures=>{
      for(const atlas of textures) {
        atlas.baseTexture.scaleMode=PIXI.SCALE_MODES.LINEAR;
        atlas.baseTexture.mipmap=PIXI.MIPMAP_MODES.OFF;
      }
      atlases=textures;return textures;
    }).catch(error=>{atlasPromise=null;throw error;});
}

// Signed distance to the playable union, encoded over [-256, 256] world units.
// Keeping interior distance lets the animated boundary cross the map edge.
export function cloudDistanceField(regionIds,sourceWidth,sourceHeight,width,height) {
  const occupied=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const px=Math.min(sourceWidth-1,Math.floor((x+.5)*sourceWidth/width));
    const py=Math.min(sourceHeight-1,Math.floor((y+.5)*sourceHeight/height));
    occupied[y*width+x]=+(regionIds[py*sourceWidth+px]>=0);
  }
  const distanceTo=value=>{
    const distance=Float32Array.from(occupied,v=>v===value?0:1e6),diagonal=Math.SQRT2;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const i=y*width+x;
      if(x)distance[i]=Math.min(distance[i],distance[i-1]+1);
      if(y)distance[i]=Math.min(distance[i],distance[i-width]+1,
        x?distance[i-width-1]+diagonal:1e6,x+1<width?distance[i-width+1]+diagonal:1e6);
    }
    for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--) {
      const i=y*width+x;
      if(x+1<width)distance[i]=Math.min(distance[i],distance[i+1]+1);
      if(y+1<height)distance[i]=Math.min(distance[i],distance[i+width]+1,
        x?distance[i+width-1]+diagonal:1e6,x+1<width?distance[i+width+1]+diagonal:1e6);
    }
    return distance;
  };
  const outside=distanceTo(1),inside=distanceTo(0),scale=sourceWidth/width;
  return Uint8Array.from(outside,(d,i)=>Math.round(Math.max(0,Math.min(1,
    ((d-inside[i])*scale+256)/512))*255));
}

export function createCloudLayer(width,height,world,seed) {
  if(!atlases)throw new Error('Cloud art must be prepared before baking atmosphere');
  const container=new PIXI.Container(),pool=[];
  return {container,
    update(seconds) {
      const banks=cloudBanks(world,seconds,seed);
      while(pool.length<banks.length){const mesh=createCloudMesh();pool.push(mesh);container.addChild(mesh);}
      for(let i=0;i<pool.length;i++) {
        const mesh=pool[i],bank=banks[i];mesh.visible=!!bank;if(!bank)continue;
        mesh.setBank(bank,atlases[bank.family]);
        mesh.position.set((bank.x-world[0])*width/world[2],(bank.y-world[1])*height/world[3]);
        mesh.scale.set(bank.width*width/world[2],bank.height*height/world[3]);
        mesh.rotation=bank.rotation;
      }
      return banks.length;
    },
    destroy(){container.destroy({children:true});},
  };
}
