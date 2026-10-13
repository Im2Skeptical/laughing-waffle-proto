import { createWorldMapView } from '../../../src/views/world-map-pixi.js';
import { getRegionReference } from '../../../src/model/world-state.js';
import { button } from '../../../src/views/vassal-node-decision/cards.js';
import { clearChildren, createText, roundedRect } from '../../../src/views/settlement-view-primitives.js';
import { PALETTE, TEXT_STYLES } from '../../../src/views/settlement-theme.js';

// Experimental screen. Uses the complete live map; selection only emits input.
export function createOpeningWorldDecisionScreen({ app, layer, getState, getVassal, onSelect, onConfirm, tooltipView }) {
  const root = new PIXI.Container(), mapLayer = new PIXI.Container(), overlay = new PIXI.Container(), chrome = new PIXI.Container();
  root.visible = false; root.eventMode = 'static'; root.hitArea = app.screen; layer.addChild(root);
  const background = new PIXI.Graphics(); background.beginFill(PALETTE.background).drawRect(0,0,2424,1080);
  root.addChild(background,mapLayer,overlay,chrome);
  let decision = null, spec = null, busy = false, mode = 'move', selection = null, key = '', activeKey = null, dismissed = false;
  let modeButtons = [], confirmButton = null, message = '';
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
  const map = createWorldMapView({layer:mapLayer,getState,getSelectedRegionId:()=>selection??currentRegion(),
    getRegionSelectionActive:()=>false,getGraphScope:()=> 'settlement',
    setSelectedRegionId:pickRegion,onOpenDetailedSite:(_site,id)=>pickRegion(id),tooltipView});
  function target(o) { return o.locationRegionId ?? (o.intervention?.regionAId === currentRegion() ? o.intervention?.regionBId : o.intervention?.regionAId); }
  function pickRegion(id) {
    if (busy || mode === 'tour') return;
    const option = available().find(o => target(o) === id);
    if (!option) {message=mode==='move'?'Choose a highlighted reachable settlement.':'Choose a highlighted legal road destination.';draw();return;}
    selection=id;message='';onSelect(option.id);
  }
  function chooseMode(next) {
    if (busy) return;
    mode=next;selection=null;message='';key='';
    if (next==='tour' && groups()[2].length) onSelect(groups()[2][0].id);
    else draw();
  }
  function draw() {
    if (!root.visible) return;
    const signature=JSON.stringify([spec,decision?.options,decision?.nodeState.selectedOptionId,mode,selection,busy,message]);
    if(signature===key)return;key=signature;clearChildren(chrome);
    const header=new PIXI.Graphics();roundedRect(header,20,12,2384,110,12,PALETTE.panel,PALETTE.stroke,2);chrome.addChild(header);
    chrome.addChild(createText('WORLD DECISION', {...TEXT_STYLES.header,fontSize:32,fill:PALETTE.accent},48,27));
    chrome.addChild(createText(`${getRegionReference(getState(),currentRegion())} · ${spec?.title??''}`, {...TEXT_STYLES.body,fontSize:25},48,72));
    chrome.addChild(createText(mode==='move'?'Choose a destination on the map':mode==='build'?'Choose a highlighted region to connect':'Tour this region; your location stays the same', {...TEXT_STYLES.title,fontSize:29},980,48));
    button(chrome,{x:2240,y:34,width:140,height:56},'CLOSE',!busy,()=>{dismissed=true;root.visible=false;tooltipView?.hide?.({force:true});});
    const footer=new PIXI.Graphics();roundedRect(footer,20,842,2384,224,12,PALETTE.panel,PALETTE.stroke,2);chrome.addChild(footer);
    const local=groups()[2][0], chance=local?.randomReward?.relicChance;
    const description=local?.randomReward ? `${Math.round(chance)}% ordinary relic · ${Math.round(100-chance)}% ${local.randomReward.statDelta?`+${local.randomReward.statDelta}`:'gain to'} a random ability`
      : local?.label??'No local activity is available';
    const labels=['MOVE','BUILD A ROUTE',local?.randomReward?'TOUR THIS REGION':'LOCAL ACTIVITY'];
    const details=[`${groups()[0].length} reachable destination${groups()[0].length===1?'':'s'}`,`${groups()[1].length} legal connection${groups()[1].length===1?'':'s'}`,description];
    modeButtons=labels.map((label,index)=>{
      const id=['move','build','tour'][index], enabled=!busy&&groups()[index].some(o=>!o.blocked);
      const card=button(chrome,{x:44+index*600,y:858,width:580,height:128},label,enabled,()=>chooseMode(id),mode===id,{fontSize:36});
      card.children[1].y=24;
      card.addChild(createText(details[index],{...TEXT_STYLES.body,fontSize:24,wordWrap:true,wordWrapWidth:540},20,55));return card;
    });
    const choice=selected(), matching=choice&&available().some(o=>o.id===choice.id);
    const text=busy?'Resolving the world…':message|| (matching ? `${choice.label} · ${choice.phases} phases · ${choice.cost} Prestige${choice.blocked?` · ${choice.blocked}`:''}`
      : mode==='tour'?description:mode==='move'?'Click a highlighted destination to preview your journey.':'Click a highlighted destination to preview a new road.');
    chrome.addChild(createText(text,{...TEXT_STYLES.body,fontSize:25,wordWrap:true,wordWrapWidth:1770,fill:message?PALETTE.red:PALETTE.text},48,990));
    confirmButton=button(chrome,{x:1880,y:914,width:496,height:128},busy?'RESOLVING…':'CONFIRM',!busy&&matching&&!choice.blocked,()=>onConfirm(choice.id),false,{fontSize:36});
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
      const id=target(option);if(!id)continue;const p=map.getRegionClickPoint(id);if(!p)continue;
      gfx.lineStyle(4,option.blocked?PALETTE.red:PALETTE.green,.9).drawCircle(p.x,p.y,34);
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
  const point=control=>{if(!root.visible||!control)return null;const r=control.getBounds();return{x:r.x+r.width/2,y:r.y+r.height/2};};
  return {refresh,update:()=>{draw();updateOverlay();},isOpen:()=>root.visible,
    open:()=>{dismissed=false;root.visible=!!decision;map.setVisible(root.visible);map.refresh();key='';draw();},close:()=>{dismissed=true;root.visible=false;},
    getPoint:(kind,id)=>kind==='confirm'?point(confirmButton):kind==='option'?point(modeButtons[id]):kind==='worldMode'?point(modeButtons[['move','build','tour'].indexOf(id)]):kind==='worldTarget'?map.getRegionClickPoint(id):null,
    getSnapshot:()=>({open:root.visible,mode,selectedOptionId:decision?.nodeState.selectedOptionId,
      locationRegionId:currentRegion(),regionCount:getState()?.world?.regions?.length??0,
      connectionCount:getState()?.world?.connections?.length??0,
      targets:available().map(o=>({id:o.id,regionId:target(o),blocked:o.blocked})),tour:groups()[2][0]?.randomReward??null})};
}
