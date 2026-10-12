import { clearChildren, createText } from './settlement-view-primitives.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { addInteractionFeedback } from './interaction-feedback.js';

export function createVassalCommissionPicker({layer,getPresentation,isVisible,onChoose}) {
  const root=new PIXI.Container();root.zIndex=179;layer.addChild(root);let signature='';let cards=[];
  function update() {
    const presentation=getPresentation();const vassal=presentation.vassal;
    const offers=vassal?.commissionOffers??[];
    root.visible=isVisible() && !presentation.readOnly && offers.length>0 && !vassal.lifeMap.pendingResolution && !vassal.developmentChoiceQueue?.length;
    if(!root.visible)return;
    const next=JSON.stringify(offers);if(next===signature)return;signature=next;clearChildren(root);
    const blocker=new PIXI.Graphics().beginFill(0, .6).drawRect(0,0,2424,1080).endFill();blocker.eventMode='static';root.addChild(blocker);
    const frame=new PIXI.Graphics();paintRelicPanel(frame,330,260,1764,570,RELIC.night,RELIC.brass,3);root.addChild(frame);
    const label=(copy,x,y,size,width=1500,fill=RELIC.bone)=>root.addChild(createText(copy,{fontFamily:'Georgia',fontSize:size,fill,wordWrap:true,wordWrapWidth:width},x,y));
    label('CHOOSE A COMMISSION',374,298,40);label('Complete it through your vassal’s nodes, then choose the next.',374,359,28);
    cards=offers.map((offer,index)=>{
      const card=new PIXI.Container();card.position.set(374+index*568,424);card.eventMode='static';card.cursor='pointer';card.hitArea=new PIXI.Rectangle(0,0,540,344);
      const g=new PIXI.Graphics();paintRelicPanel(g,0,0,540,344,RELIC.night,RELIC.brass,2);card.addChild(g);
      const t=(copy,y,size,fill=RELIC.bone)=>card.addChild(createText(copy,{fontFamily:'Georgia',fontSize:size,fill,wordWrap:true,wordWrapWidth:492},24,y));
      t(offer.label,26,36);t(offer.description,96,28);t(`+${offer.prestige} Prestige`,248,34,RELIC.gold);t('ACCEPT ›',300,24,RELIC.gold);
      addInteractionFeedback(card,{x:0,y:0,width:540,height:344},{onActivate:()=>onChoose(offer.offerId)});root.addChild(card);return card;
    });
  }
  return {init:update,update,getSnapshot:()=>({open:root.visible,offers:getPresentation().vassal?.commissionOffers??[]}),getChoiceClickPoint:index=>root.visible?cards[index]?.toGlobal(new PIXI.Point(270,170)):null};
}
