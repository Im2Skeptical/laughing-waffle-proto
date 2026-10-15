import { getArtRevision } from '../../../src/views/chronicle-art.js';
import { createWorldMapView } from '../../../src/views/world-map-pixi.js';
import { getRegionDefinition, getRegionReference } from '../../../src/model/world-state.js';
import { PANEL, CONTENT, OPTION_COLUMN, MORTALITY_PLATE } from '../../../src/views/vassal-node-decision/constants.js';
import { confirmDockButton, confirmDockRect, renderTitlePlaque, renderLocationPlaque } from '../../../src/views/vassal-node-decision/chrome.js';
import { MAP_VIEWPORT_RECT } from '../../../src/views/world-map/constants.js';
import { actionCard } from '../../../src/views/vassal-node-decision/cards.js';
import { VASSAL_NODE_FAMILIES } from '../../../src/defs/gamepieces/vassal-life-map-defs.js';
import { renderMortalityEstimate } from '../../../src/views/vassal-node-decision/mortality.js';
import { clearChildren, createText, roundedRect } from '../../../src/views/settlement-view-primitives.js';
import { PALETTE, TEXT_STYLES } from '../../../src/views/settlement-theme.js';

// Experimental modal. Complete live map inside the shared node-decision body.
const MAP_BODY = Object.freeze({ x: 986, y: 234, width: 1358, height: 520 });
const FAMILY = { ...VASSAL_NODE_FAMILIES.travel, label: 'World decision', description: 'Move, connect, or explore your region.' };
export function createOpeningWorldDecisionScreen({ app, layer, getState, getVassal, onSelect, onConfirm, tooltipView }) {
  const root = new PIXI.Container(), mapLayer = new PIXI.Container(), overlay = new PIXI.Container(), chrome = new PIXI.Container();
  root.visible = false; root.eventMode = 'static'; root.hitArea = app.screen; layer.addChild(root);
  const backdrop = new PIXI.Graphics().beginFill(0x171713,.68)
    .drawRect(0,0,app.screen.width,app.screen.height).endFill();
  backdrop.eventMode='static';
  backdrop.on('pointertap',()=>{if(!busy){dismissed=true;root.visible=false;tooltipView?.hide?.({force:true});}});
  const background = new PIXI.Graphics();
  roundedRect(background,PANEL.x,PANEL.y,PANEL.width,PANEL.height,18,0x292f2b,FAMILY.color,3);
  background.eventMode='static';background.on('pointertap',event=>event.stopPropagation());
  root.addChild(backdrop,background,mapLayer,chrome);
  const mapScale = Math.min(MAP_BODY.width / MAP_VIEWPORT_RECT.width, MAP_BODY.height / MAP_VIEWPORT_RECT.height);
  mapLayer.scale.set(mapScale);
  mapLayer.position.set(MAP_BODY.x - MAP_VIEWPORT_RECT.x * mapScale,
    MAP_BODY.y + (MAP_BODY.height - MAP_VIEWPORT_RECT.height * mapScale) / 2 - MAP_VIEWPORT_RECT.y * mapScale);
  let decision = null, spec = null, busy = false, mode = 'move', selection = null, key = '', activeKey = null, dismissed = false;
  let modeButtons = [], confirmButton = null, feedback = null, locationPlaque = null, locationLabel = '', message = '';
  let overlayKey = '';
  const currentRegion = () => getVassal()?.locationRegionId;
  const options = () => decision?.options ?? [];
  const groups = () => [
    options().filter(o => o.locationRegionId),
    options().filter(o => o.intervention?.kind === 'connection'),
    options().filter(o => !o.locationRegionId && !o.intervention && !o.classAction),
  ];
  const available = () => groups()[['move','build','tour'].indexOf(mode)] ?? [];
  const selected = () => options().find(o => o.id === decision?.nodeState.selectedOptionId);
  const brightRegions = () => [...new Set([currentRegion(), ...available().filter(o=>!o.blocked).map(target)].filter(Boolean))];
  const map = createWorldMapView({layer:mapLayer,getState,getSelectedRegionId:()=>selection??currentRegion(),
    getRegionSelectionActive:()=>false,getGraphScope:()=> 'settlement',
    getDisplayOptions:()=>({chrome:false,choiceRegionIds:brightRegions()}),
    setSelectedRegionId:pickRegion,onOpenDetailedSite:(_site,id)=>pickRegion(id),tooltipView});
  const overlayMask = new PIXI.Graphics().beginFill(0xffffff)
    .drawRect(MAP_VIEWPORT_RECT.x,MAP_VIEWPORT_RECT.y,MAP_VIEWPORT_RECT.width,MAP_VIEWPORT_RECT.height).endFill();
  mapLayer.addChild(overlay,overlayMask); overlay.eventMode = 'none'; overlay.mask = overlayMask;
  function target(o) { return o.locationRegionId ?? (o.intervention?.regionAId === currentRegion() ? o.intervention?.regionBId : o.intervention?.regionAId); }
  function pickRegion(id) {
    if (busy || mode === 'tour') return;
    const option = available().find(o => target(o) === id);
    if (!option || option.blocked) {message=mode==='move'?'Choose a highlighted reachable settlement.':'Choose a highlighted legal road destination.';draw();return;}
    selection=id;message='';onSelect(option.id);
  }
  function chooseMode(next) {
    if (busy || !groups()[['move','build','tour'].indexOf(next)]?.some(o=>!o.blocked)) return;
    mode=next;selection=null;message='';key='';
    if (next==='tour' && groups()[2].length) onSelect(groups()[2][0].id);
    else draw();
  }
  function draw() {
    if (!root.visible) return;
    const signature=JSON.stringify([getArtRevision(),spec,decision?.options,decision?.nodeState.selectedOptionId,mode,selection,busy,message]);
    if(signature===key)return;key=signature;clearChildren(chrome);
    renderTitlePlaque(chrome,FAMILY);
    const region = getRegionDefinition(getState(),currentRegion());
    const name=region?.name&&!/^Region\d+$/i.test(region.name)?region.name:null;
    locationLabel=`CURRENT REGION - ${getRegionReference(getState(),currentRegion())}${name?`\n${name}`:''}`;
    locationPlaque=renderLocationPlaque(chrome,locationLabel,FAMILY.color);
    const divider = new PIXI.Graphics().lineStyle(2,PALETTE.stroke,.9)
      .moveTo(958,PANEL.y+CONTENT.labelY).lineTo(958,PANEL.y+PANEL.height-28);
    chrome.addChild(divider);
    chrome.addChild(createText(mode==='move'?'Choose a bright destination on the map':mode==='build'?'Choose a bright region to connect':'Tour your current region', {...TEXT_STYLES.title,fontSize:26},MAP_BODY.x,PANEL.y+CONTENT.labelY));
    const local=groups()[2][0], chance=local?.randomReward?.relicChance;
    const description=local?.randomReward ? `${Math.round(chance)}% ordinary relic · ${Math.round(100-chance)}% ${local.randomReward.statDelta?`+${local.randomReward.statDelta}`:'gain to'} a random ability`
      : local?.label??'No local activity is available';
    const labels=['MOVE','BUILD A ROUTE',local?.randomReward?'TOUR THIS REGION':'LOCAL ACTIVITY'];
    const counts=groups().map(group=>group.filter(o=>!o.blocked).length);
    const details=[`Travel to another settlement.\n${counts[0]} reachable destination${counts[0]===1?'':'s'}`,`Build a road from here.\n${counts[1]} legal connection${counts[1]===1?'':'s'}`,description];
    modeButtons=labels.map((label,index)=>{
      const id=['move','build','tour'][index], group=groups()[index], enabled=!busy&&group.some(o=>!o.blocked);
      const selectedOption=group.find(o=>o.id===decision?.nodeState.selectedOptionId);
      const candidates=group.filter(o=>!o.blocked), priced=candidates.length?candidates:group;
      const option=selectedOption??[...priced].sort((a,b)=>a.cost-b.cost||a.phases-b.phases)[0];
      const from=!!option&&!selectedOption&&priced.some(o=>o.cost!==option.cost||o.phases!==option.phases);
      const card=actionCard(chrome,{
        x:PANEL.x+30+index*(OPTION_COLUMN.width+OPTION_COLUMN.gap),y:PANEL.y+CONTENT.cardY,
        width:OPTION_COLUMN.width,height:OPTION_COLUMN.height,
      },{
        title:label,artId:['travel','settlement','patronage'][index],summary:details[index],
        actionLabel:from?'FROM':'CHOOSE',faceLabel:from?'From':mode===id?'Selected':'Choose',
        enabled,selected:mode===id,costUnmet:!!option&&option.cost>(getVassal()?.prestige??0),
        cost:{phaseCost:option?.phases??0,prestigeCost:option?.cost??0,state:getState()},
        onClick:()=>chooseMode(id),onInspect:()=>chooseMode(id),
      });
      card.priceOptionId=option?.id;card.priceFrom=from;
      return card;
    });
    const choice=selected(), matching=choice&&available().some(o=>o.id===choice.id);
    const text=busy?'Resolving the world…':message|| (matching ? `${choice.label}${choice.blocked?` · ${choice.blocked}`:''}`
      : mode==='tour'?description:mode==='move'?'Click a highlighted destination to preview your journey.':'Click a highlighted destination to preview a new road.');
    feedback=createText(text,{...TEXT_STYLES.body,fontSize:24,lineHeight:28,wordWrap:true,wordWrapWidth:MAP_BODY.width,fill:message?PALETTE.red:PALETTE.text},MAP_BODY.x,774);
    feedback.scale.set(Math.min(1,54/Math.max(1,feedback.height)));chrome.addChild(feedback);
    const dock=confirmDockRect(app);
    renderMortalityEstimate(chrome,decision?.mortalityEstimate,{x:dock.x-MORTALITY_PLATE.gap-MORTALITY_PLATE.width,y:dock.y+(dock.height-MORTALITY_PLATE.height)/2,width:MORTALITY_PLATE.width,height:MORTALITY_PLATE.height},!busy&&!!matching&&!choice.blocked);
    confirmButton=confirmDockButton(chrome,app,{label:busy?'Resolving...':'Confirm',enabled:!busy&&!!matching&&!choice.blocked,onClick:()=>onConfirm(choice.id)});
  }
  function updateOverlay() {
    if(!root.visible)return; map.update();
    const positions=available().map(o=>[o.id,target(o),o.blocked,map.getRegionClickPoint(target(o))]);
    const nextKey=JSON.stringify([mode,selected()?.id,map.getRegionClickPoint(currentRegion()),positions]);
    if(nextKey===overlayKey)return;overlayKey=nextKey;overlay.removeChildren().forEach(c=>c.destroy());
    const gfx=new PIXI.Graphics();gfx.eventMode='none';overlay.addChild(gfx);
    const origin=map.getRegionClickPoint(currentRegion());
    if(origin){gfx.lineStyle(5,PALETTE.accent).drawCircle(origin.x,origin.y,42);}
    for(const option of available()) {
      const id=target(option);if(!id||option.blocked)continue;const p=map.getRegionClickPoint(id);if(!p)continue;
      gfx.lineStyle(4,PALETTE.green,.9).drawCircle(p.x,p.y,34);
      if(selected()?.id===option.id&&origin){gfx.lineStyle(6,PALETTE.accent,.95);if(mode==='build'){
        const dx=p.x-origin.x,dy=p.y-origin.y,d=Math.hypot(dx,dy);for(let n=0;n<d;n+=30){const end=Math.min(d,n+18);gfx.moveTo(origin.x+dx*n/d,origin.y+dy*n/d).lineTo(origin.x+dx*end/d,origin.y+dy*end/d);}
      }else {const path=decision?.regionalMap?.selectedPath??[];if(path.length>1){for(let i=1;i<path.length;i++){const a=map.getRegionClickPoint(path[i-1]),b=map.getRegionClickPoint(path[i]);if(a&&b)gfx.moveTo(a.x,a.y).lineTo(b.x,b.y);}}else gfx.moveTo(origin.x,origin.y).lineTo(p.x,p.y);}}
    }
  }
  function refresh(next, node, isBusy=false) {
    decision=next;spec=node;busy=isBusy;
    if(!next){root.visible=false;activeKey=null;dismissed=false;key='';return;}
    if(activeKey!==node.id){activeKey=node.id;dismissed=false;mode=groups()[0].length?'move':groups()[1].length?'build':'tour';selection=null;key='';}
    root.visible=!dismissed;
    map.setVisible(root.visible);map.refresh();draw();updateOverlay();
  }
  const mapPoint=id=>{const p=map.getRegionClickPoint(id);return p?mapLayer.toGlobal(p):null;};
  const point=control=>{if(!root.visible||!control)return null;const r=control.getBounds();return{x:r.x+r.width/2,y:r.y+r.height/2};};
  const bounds=control=>{const r=control.getBounds();return{x:r.x,y:r.y,width:r.width,height:r.height};};
  return {refresh,getHudDeltas:()=>{const choice=selected();return root.visible&&choice&&available().some(o=>o.id===choice.id)&&!choice.blocked?{prestige:-choice.cost,stats:{}}:null;},update:()=>{draw();updateOverlay();},isOpen:()=>root.visible,
    open:()=>{dismissed=false;root.visible=!!decision;map.setVisible(root.visible);map.refresh();key='';draw();},close:()=>{dismissed=true;root.visible=false;},
    getPoint:(kind,id)=>kind==='confirm'?point(confirmButton):kind==='option'?point(modeButtons[id]):kind==='worldMode'?point(modeButtons[['move','build','tour'].indexOf(id)]):kind==='worldCost'?point(modeButtons[['move','build','tour'].indexOf(id)]?.costPanel):kind==='worldTarget'?mapPoint(id):null,
    getSnapshot:()=>({open:root.visible,mode,selectedOptionId:decision?.nodeState.selectedOptionId,
      locationRegionId:currentRegion(),regionCount:getState()?.world?.regions?.length??0,
      connectionCount:getState()?.world?.connections?.length??0,
      panel:PANEL,mapBody:MAP_BODY,artworkReady:modeButtons.length>0&&modeButtons.every(card=>card.illustration?.texture?.baseTexture.valid),brightRegionIds:brightRegions(),locationPlaque:locationPlaque?{label:locationLabel,rect:bounds(locationPlaque)}:null,
      prices:modeButtons.flatMap((card,index)=>card.costPanel?[{mode:['move','build','tour'][index],optionId:card.priceOptionId,from:card.priceFrom,
        ...card.costPanel.costSummary,rect:bounds(card.costPanel),cardRect:bounds(card)}]:[]),feedback:feedback?{text:feedback.text,rect:bounds(feedback)}:null,
      dimmedRegionIds:(getState()?.world?.regions??[]).map(r=>r.id).filter(id=>!brightRegions().includes(id)),
      targets:available().map(o=>({id:o.id,regionId:target(o),blocked:o.blocked,cost:o.cost,phases:o.phases})),tour:groups()[2][0]?.randomReward??null})};
}
