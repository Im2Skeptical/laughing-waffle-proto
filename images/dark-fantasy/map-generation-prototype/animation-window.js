// Coordinates stay in source texels; cropping never changes world/time sampling.
// A padded window survives small pans, and only sampled colour LODs are reduced.
export function createAnimationWindow(width,height,{windowed=false,mipLevels=false,padding=64}={}) {
  const frame={x:0,y:0,width:windowed?1:width,height:windowed?1:height};
  const levels=[],reducers=[],transform=new PIXI.Matrix();
  let visible=!windowed,revision=0;
  function resize(count){
    while(levels.length>count){levels.pop().destroy(true);reducers.pop()?.destroy();}
    for(let n=0;n<count;n++){
      const w=Math.ceil(frame.width/2**n),h=Math.ceil(frame.height/2**n);
      if(!levels[n]){
        levels.push(PIXI.RenderTexture.create({width:w,height:h,resolution:1,scaleMode:PIXI.SCALE_MODES.LINEAR,mipmap:PIXI.MIPMAP_MODES.OFF}));
        if(n)reducers.push(new PIXI.Sprite(levels[n-1]));
      }else if(levels[n].width!==w||levels[n].height!==h)levels[n].resize(w,h,true);
      if(n){reducers[n-1].texture=levels[n-1];reducers[n-1].width=w;reducers[n-1].height=h;}
    }
  }
  resize(windowed||!mipLevels?1:Math.min(5,Math.max(1,Math.floor(Math.log2(Math.min(width,height))) )));
  return {frame,levels,transform,
    get visible(){return visible;},get revision(){return revision;},
    get uv(){return [frame.x/width,frame.y/height,frame.width/width,frame.height/height];},
    get pixels(){return levels.reduce((sum,t)=>sum+t.width*t.height,0);},
    setView(view,pixelsPerTexel=1){
      if(!windowed)return false;
      const left=Math.max(0,view.x),top=Math.max(0,view.y),right=Math.min(width,view.x+view.width),bottom=Math.min(height,view.y+view.height);
      if(right<=left||bottom<=top){if(visible)revision++;visible=false;return false;}
      const count=mipLevels?Math.min(5,Math.ceil(Math.max(0,Math.log2(1/Math.max(.001,pixelsPerTexel))))+1):1;
      const x=Math.max(0,Math.floor((left-padding)/32)*32),y=Math.max(0,Math.floor((top-padding)/32)*32);
      const endX=Math.min(width,Math.ceil((right+padding)/32)*32),endY=Math.min(height,Math.ceil((bottom+padding)/32)*32);
      const fits=left>=frame.x+(frame.x?padding/2:0)&&top>=frame.y+(frame.y?padding/2:0)
        &&right<=frame.x+frame.width-(frame.x+frame.width<width?padding/2:0)
        &&bottom<=frame.y+frame.height-(frame.y+frame.height<height?padding/2:0);
      const tooLarge=frame.width>endX-x+padding||frame.height>endY-y+padding;
      if(visible&&fits&&!tooLarge&&levels.length===count)return false;
      visible=true;
      Object.assign(frame,{x,y,width:endX-x,height:endY-y});
      transform.set(1,0,0,1,-x,-y);resize(count);revision++;
      return true;
    },
    reduce(renderer){for(let n=1;n<levels.length;n++)renderer.render(reducers[n-1],{renderTexture:levels[n],clear:true});},
    destroy(){reducers.forEach(s=>s.destroy());levels.forEach(t=>t.destroy(true));},
  };
}
