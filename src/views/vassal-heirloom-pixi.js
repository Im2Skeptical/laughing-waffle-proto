// Shared heirloom faces: the same distinct object reads in a slot or square card.
import { getHeirloomDefinition, getHeirloomInheritanceLabel, getHeirloomQualityLabel, VASSAL_HEIRLOOM_TUNING } from '../defs/gamepieces/vassal-heirloom-defs.js';
import { getChronicleTexture } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { addInteractionFeedback } from './interaction-feedback.js';

export const HEIRLOOM_COLOURS = Object.freeze({bronze:0xd39d6d,silver:0xbdc7c7,gold:0xd9b45d,diamond:0x92d7dc});
const percent = n => `${Math.round(n * 100)}%`;

export function heirloomEffectText(item) {
  const def = getHeirloomDefinition(item?.definitionId);
  const e = def?.effects ?? {};
  if (e.patronageNodePrestige) return `+${e.patronageNodePrestige} Prestige after each Patronage node.`;
  if (e.travelCostMultiplier) return `Travel takes ${percent(1-e.travelCostMultiplier)} less time.`;
  if (e.nodeDevelopment) return `+${e.nodeDevelopment} EXP after each node.`;
  if (e.firstInterventionDiscount) return `${percent(e.firstInterventionDiscount)} off the first purchase in each intervention shop.`;
  if (e.bonusCunning) return `+${e.bonusCunning} Cunning while equipped.`;
  if (e.bonusIntelligence) return `+${e.bonusIntelligence} Intelligence while equipped.`;
  if (e.patronageOptionMultiplier) return `×${e.patronageOptionMultiplier} Prestige from Patronage choices.`;
  if (e.travelNodeDevelopment) return `+${e.travelNodeDevelopment} EXP after each Travel node.`;
  if (e.extraShopOffers) return `+${e.extraShopOffers} offer in Practice Reform and Public Works shops.`;
  if (e.hourglassFirstActionMultiplier) return `The first action in each node takes ${percent(1-e.hourglassFirstActionMultiplier)} less time.`;
  if (e.wisdomDevelopmentMultiplier) return `×${e.wisdomDevelopmentMultiplier} EXP contributed by Wisdom.`;
  if (e.allTimeCostMultiplier) return `All Vassal actions take ${percent(1-e.allTimeCostMultiplier)} less time.`;
  if (e.mandateOfHeaven) return item.protectionSpent ? 'Protection spent this life.' : 'Prevent one fatal natural-mortality or Crisis outcome per life.';
  return item?.description ?? def?.description ?? '';
}

export function heirloomInheritanceText(state) {
  if (state === 'sanctified') return 'Survives this life Sanctified; becomes Unmarked when a future Vassal takes it.';
  if (state === 'fragile') return `${percent(VASSAL_HEIRLOOM_TUNING.fragileBreakChance)} chance to break at the end of this life.`;
  return 'Survives this life; becomes Fragile.';
}

export function addHeirloomArt(parent, id, rect) {
  const texture = getChronicleTexture(`heirlooms-v1/${id}.png`);
  if (!texture) return null;
  const sprite = new PIXI.Sprite(texture);
  sprite.position.set(rect.x, rect.y);
  sprite.width = rect.width; sprite.height = rect.height; sprite.eventMode = 'none';
  parent.addChild(sprite);
  return sprite;
}

export function addHeirloomSlot(parent, rect, item, {onActivate, tooltipView, emptyLabel='Empty', selected=false}={}) {
  const def = getHeirloomDefinition(item?.definitionId);
  const root = new PIXI.Container();root.position.set(rect.x,rect.y);
  root.eventMode='static';root.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);
  const g=new PIXI.Graphics();
  paintRelicPanel(g,0,0,rect.width,rect.height,RELIC.night,selected?0xacc782:HEIRLOOM_COLOURS[def?.quality]??RELIC.brass,selected?3:1);
  root.addChild(g);
  if(def) {
    const size=Math.min(rect.width,rect.height)-6;
    addHeirloomArt(root,def.id,{x:(rect.width-size)/2,y:(rect.height-size)/2,width:size,height:size});
    if(item.inheritanceState==='fragile') root.addChild(createText('!',{...TEXT_STYLES.title,fontSize:18,fill:0xf1a18b,stroke:RELIC.night,strokeThickness:3},rect.width-5,2,1));
  } else root.addChild(createText(emptyLabel,{...TEXT_STYLES.chip,fontSize:13,fill:RELIC.ash},rect.width/2,rect.height/2,.5,.5));
  const show=()=>tooltipView?.show?.({title:def?.label??'Empty active slot',scale:2,lines:def?[
    `${getHeirloomQualityLabel(def.quality)} · ${getHeirloomInheritanceLabel(item.inheritanceState)}`,
    heirloomEffectText(item),heirloomInheritanceText(item.inheritanceState),
  ]:['Equip a found heirloom, or choose a loadout when the next Vassal begins.']},root.getBounds());
  root.on('pointerover',event=>{if(event.pointerType!=='touch')show();});
  root.on('pointerout',()=>tooltipView?.hide?.());
  addInteractionFeedback(root,{x:0,y:0,width:rect.width,height:rect.height},{onActivate:onActivate??show});
  parent.addChild(root);return root;
}

export function addHeirloomCard(parent, rect, item, {selected=false, status='', onActivate, enabled=true, landscape=false}={}) {
  const def=getHeirloomDefinition(item?.definitionId);
  const root=new PIXI.Container();root.position.set(rect.x,rect.y);
  root.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);root.eventMode=onActivate?'static':'none';
  const broke=item?.outcome==='broke';
  const rim=broke?RELIC.red:selected?0xacc782:HEIRLOOM_COLOURS[def?.quality]??RELIC.brass;
  const g=new PIXI.Graphics();paintRelicPanel(g,0,0,rect.width,rect.height,RELIC.stone,rim,selected?3:1.5);root.addChild(g);
  const title=createText(def?.label??item?.label??'Empty slot',{...TEXT_STYLES.cardTitle,fontSize:landscape?32:26,lineHeight:landscape?36:29,wordWrap:true,wordWrapWidth:rect.width-32},16,12);
  root.addChild(title);
  const artSize=landscape?Math.min(rect.height-132,Math.floor((rect.width-60)/2)):Math.min(rect.width-32,rect.height-250);
  const artX=landscape?20:(rect.width-artSize)/2,artY=76;
  if(def){const art=addHeirloomArt(root,def.id,{x:artX,y:artY,width:artSize,height:artSize});if(art&&broke)art.alpha=.4;}
  const x=landscape?artSize+44:16,width=landscape?rect.width-artSize-64:rect.width-32;
  const metaY=landscape?92:artY+artSize+12;
  const meta=`${getHeirloomQualityLabel(def?.quality)} · ${getHeirloomInheritanceLabel(item?.inheritanceState??item?.toState??item?.fromState??'sanctified')}`;
  const metaNode=createText(meta,{...TEXT_STYLES.chip,fontSize:landscape?24:18,fill:rim,wordWrap:true,wordWrapWidth:width},x,metaY);root.addChild(metaNode);
  const effect=createText(heirloomEffectText(item),{...TEXT_STYLES.body,fontSize:landscape?30:24,lineHeight:landscape?35:28,fill:RELIC.bone,wordWrap:true,wordWrapWidth:width},x,metaY+metaNode.height+16);
  while(effect.height>rect.height-effect.y-52&&effect.style.fontSize>20){effect.style.fontSize--;effect.style.lineHeight=effect.style.fontSize+3;}
  root.addChild(effect);
  if(landscape&&!item.outcome) {
    const inheritance=createText(heirloomInheritanceText(item.inheritanceState),{...TEXT_STYLES.body,fontSize:23,lineHeight:27,fill:RELIC.ash,wordWrap:true,wordWrapWidth:width},x,effect.y+effect.height+22);
    while(inheritance.height>rect.height-inheritance.y-54&&inheritance.style.fontSize>20){inheritance.style.fontSize--;inheritance.style.lineHeight=inheritance.style.fontSize+3;}
    root.addChild(inheritance);
  }
  if(status)root.addChild(createText(selected?`✓ ${status}`:status,{...TEXT_STYLES.chip,fontSize:landscape?24:20,lineHeight:26,fill:broke?0xf1a18b:selected?0xacc782:RELIC.ash,wordWrap:true,wordWrapWidth:rect.width-32},16,rect.height-40));
  if(onActivate)addInteractionFeedback(root,{x:0,y:0,width:rect.width,height:rect.height},{enabled,onActivate});
  parent.addChild(root);return root;
}
