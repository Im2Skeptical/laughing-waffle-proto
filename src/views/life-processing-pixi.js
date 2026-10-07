// Screen-level feedback leaves navigation and inspection available.
import { createText, roundedRect } from './settlement-view-primitives.js';
import { addInteractionFeedback } from './interaction-feedback.js';
export function createLifeProcessingView({ app, layer, getStatus, onRetry, onReturn }) {
  const root=new PIXI.Container(); root.zIndex=220; root.visible=false;
  const bg=new PIXI.Graphics(); roundedRect(bg,0,0,520,82,12,0x202923,0xd5b777,2);
  const label=createText('',{fontFamily:'Georgia',fontSize:20,fill:0xffe5a3},24,16);
  const progress=new PIXI.Graphics();
  const retry=new PIXI.Container(); retry.position.set(398,12); retry.eventMode='static';
  retry.hitArea=new PIXI.Rectangle(0,0,105,40);
  retry.addChild(createText('Retry',{fontFamily:'Georgia',fontSize:18,fill:0xffe5a3},16,10));
  addInteractionFeedback(retry,{x:0,y:0,width:105,height:40},{onActivate:onRetry});
  const back=new PIXI.Container(); back.position.set(285,12); back.eventMode='static';
  back.hitArea=new PIXI.Rectangle(0,0,105,40);
  back.addChild(createText('Go back',{fontFamily:'Georgia',fontSize:18,fill:0xffe5a3},10,10));
  addInteractionFeedback(back,{x:0,y:0,width:105,height:40},{onActivate:onReturn});
  root.addChild(bg,label,progress,retry,back); layer.addChild(root);
  return {
    getControlClickPoint(id) {
      const control = id === 'retry' ? retry : id === 'back' ? back : null;
      if (!root.visible || !control?.visible) return null;
      return control.toGlobal(new PIXI.Point(52, 20));
    },
    update() {
    const status=getStatus(); root.visible=!!status; if(!status)return;
    // Node panels are added later and can be raised for inspection. Keep
    // recovery controls above their backdrops so visible buttons receive taps.
    if (root.parent.getChildIndex(root) !== root.parent.children.length - 1) {
      root.parent.setChildIndex(root, root.parent.children.length - 1);
    }
    root.position.set((app.screen.width-520)/2,app.screen.height-332);
    retry.visible=status.phase==='error';
    back.visible=retry.visible && status.canReturn;
    label.text=status.phase==='error'?'Preparation failed':status.phase==='preparing'?'Preparing next choices…'
      :status.phase==='revealing'?'Unveiling the next chapter…':status.phase==='committing'?'Committing decision…':'Resolving the chapter…';
    progress.clear();
    const span=status.targetSec-status.startSec;
    const fraction=span>0?Math.min(.95,(status.computedSec-status.startSec)/span):0;
    progress.beginFill(0xd5b777,.25).drawRoundedRect(24,58,472,5,2).endFill();
    if(status.ready) progress.beginFill(0xd5b777).drawRoundedRect(24,58,472,5,2).endFill();
    else {
      progress.beginFill(0xd5b777,.7).drawRoundedRect(24,58,Math.max(2,472*fraction),5,2).endFill();
      progress.beginFill(0xffe5a3).drawCircle(24+((performance.now()/3)%472),60,4).endFill();
    }
  }};
}
