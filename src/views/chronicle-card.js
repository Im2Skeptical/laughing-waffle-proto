import { addIllustration } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';

export function addGamepieceCard(parent, rect, {
  artId, title, value = '', detail = '', tier = 'bronze', tooltipView,
  empty = false, onClick, selected = false,
} = {}) {
  const root = new PIXI.Container(); root.position.set(rect.x, rect.y);
  const border = {bronze:0x967044,silver:0xaebeb5,gold:0xc8a24e,diamond:0x7bb2b5}[tier] ?? RELIC.brass;
  const bg = new PIXI.Graphics();
  paintRelicPanel(bg,0,0,rect.width,rect.height,RELIC.night,selected?RELIC.bone:border,selected?3:2);
  root.addChild(bg);
  const miniature=rect.width<140||rect.height<84;
  if(!empty) addIllustration(root,artId,{x:5,y:5,width:rect.width-10,height:rect.height-(miniature?10:39)});
  if(!miniature){
    const band = new PIXI.Graphics();
    band.beginFill(RELIC.night,.95).drawRect(4,rect.height-38,rect.width-8,34).endFill();
    root.addChild(band);
    const label = createText(empty?'Vacant':title,{
      ...TEXT_STYLES.cardTitle,fontSize:Math.min(24,Math.max(20,rect.width*.13)),
      fill:empty?RELIC.ash:RELIC.bone,wordWrap:true,wordWrapWidth:rect.width-12,align:'center',
    },rect.width/2,rect.height-22,.5,.5);
    root.addChild(label);
  }
  if(value&&!empty&&rect.height>=90) {
    const badge = new PIXI.Graphics(); paintRelicPanel(badge,6,6,Math.min(rect.width-12,92),28,RELIC.night,border,1);
    root.addChild(badge,createText(value,{...TEXT_STYLES.chip,fontSize:18,fill:RELIC.bone},12,10));
  }
  root.eventMode='static';root.cursor=onClick?'pointer':'help';
  root.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);
  const spec={title:title??'Vacant slot',lines:detail.split('\n').filter(Boolean),accentColor:border,maxWidth:290,scale:3};
  const key=`gamepiece:${rect.x}:${rect.y}:${artId}:${title}`;
  root.on('pointerover',(event)=>{bg.tint=0xffe6b8;if(event.pointerType!=='touch')tooltipView?.show?.(spec,root.getBounds());});
  root.on('pointerout',()=>{bg.tint=0xffffff;tooltipView?.hide?.();});
  // Pin on press, so a hold works even if a timeline redraw replaces this card
  // before release. The shared tooltip owns the pin, not the transient sprite.
  root.on('pointerdown',(event)=>{event.stopPropagation();if(!onClick)tooltipView?.pin?.(spec,root.getBounds(),key);});
  root.on('pointertap',(event)=>{event.stopPropagation();onClick?.();});
  parent.addChild(root);return root;
}
