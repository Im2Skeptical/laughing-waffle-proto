import { sampleMote, sampleSpriteFrame } from './timeline-presentation.js';
import { landmarkTexture } from './chronicle-art.js';
import { RELIC } from './chronicle-skin.js';

export function addTimelineLandmark(parent,rect,{kind='hamlet',startSec=0}={}) {
  const texture=landmarkTexture(kind,0);if(!texture)return null;
  const sprite=new PIXI.Sprite(texture);sprite.eventMode='none';
  sprite.position.set(rect.x,rect.y);sprite.width=rect.width;sprite.height=rect.height;
  parent.addChild(sprite);
  return {sample(time){sprite.texture=landmarkTexture(kind,sampleSpriteFrame(time,{
    frameCount:4,framesPerSecond:kind==='fire'?6:3,startSec,
  }));}};
}

export function createChronicleEffects(layer, getTime) {
  const g=new PIXI.Graphics();g.eventMode='none';layer.addChild(g);
  let previous=null;
  return {
    update(){
      const time=getTime();if(time===previous)return;previous=time;g.clear();
      const rect={x:66,y:100,width:1620,height:694};
      for(let i=0;i<36;i++){
        const p=sampleMote(time,i,rect);
        g.beginFill(i%4===0?RELIC.gold:RELIC.bone,p.alpha)
          .drawRect(Math.floor(p.x/2)*2,Math.floor(p.y/2)*2,p.frame===0?4:2,2).endFill();
      }
    },
    setVisible(visible){g.visible=visible;},
    destroy(){g.destroy();},
  };
}
