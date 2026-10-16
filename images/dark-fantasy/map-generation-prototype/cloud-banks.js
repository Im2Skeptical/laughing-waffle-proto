// Overhead cloud-top banks, positioned from absolute time rather than frame history.
import { decorationRandom } from './generator.js';
import { cloudWind } from './cloud-dissolve.js';

let atlasPromise,atlasFrames;
export function prepareCloudArt() {
  return atlasPromise ??= PIXI.Assets.load(new URL('./cloud-banks-v2.png',import.meta.url).href).then(atlas=>{
    atlas.baseTexture.scaleMode=PIXI.SCALE_MODES.LINEAR;
    atlas.baseTexture.mipmap=PIXI.MIPMAP_MODES.OFF;
    const w=atlas.width/2,h=atlas.height/2;
    return atlasFrames=[[0,0],[1,0],[0,1],[1,1]]
      .map(([x,y])=>new PIXI.Texture(atlas.baseTexture,new PIXI.Rectangle(x*w,y*h,w,h)));
  });
}

export function cloudBanks(world,seconds,seed) {
  const [windX,windY]=cloudWind(seconds);
  const banks=[];
  const left=Math.floor((world[0]-windX-420)/440),right=Math.ceil((world[0]+world[2]-windX+420)/440);
  const top=Math.floor((world[1]-windY-300)/310),bottom=Math.ceil((world[1]+world[3]-windY+300)/310);
  for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++) {
    const cellSeed=seed^Math.imul(col,73856093)^Math.imul(row,19349663);
    let sample=0;
    const rng=()=>decorationRandom(cellSeed,sample++);
    if(rng()>.78)continue;
    const x=col*440+(rng()-.5)*200,y=row*310+(rng()-.5)*150;
    const width=330+rng()*150,frame=Math.floor(rng()*4),phase=rng()*Math.PI*2;
    banks.push({id:`${col}/${row}`,frame,x:x+windX+14*Math.sin(seconds/311+phase),
      y:y+windY+11*Math.sin(seconds/397+phase),width:width*(.94+.06*Math.sin(seconds/433+phase)),
      alpha:.78});
  }
  return banks;
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
  const frames=atlasFrames;
  if(!frames)throw new Error('Cloud art must be prepared before baking atmosphere');
  const container=new PIXI.Container(),pool=[];
  return {container,
    update(seconds) {
      const banks=cloudBanks(world,seconds,seed);
      while(pool.length<banks.length){const sprite=new PIXI.Sprite();sprite.anchor.set(.5);pool.push(sprite);container.addChild(sprite);}
      for(let i=0;i<pool.length;i++) {
        const sprite=pool[i],bank=banks[i];sprite.visible=!!bank;if(!bank)continue;
        sprite.texture=frames[bank.frame];
        sprite.position.set((bank.x-world[0])*width/world[2],(bank.y-world[1])*height/world[3]);
        sprite.width=bank.width*width/world[2];
        sprite.height=bank.width*frames[bank.frame].height/frames[bank.frame].width*height/world[3];
        sprite.alpha=bank.alpha;
      }
      return banks.length;
    },
    destroy(){container.destroy({children:true});},
  };
}
