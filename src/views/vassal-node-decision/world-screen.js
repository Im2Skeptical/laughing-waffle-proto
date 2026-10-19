import { getArtRevision } from '../chronicle-art.js';
import { createWorldMapView } from '../world-map-pixi.js';
import { getRegionDefinition, getRegionReference } from '../../model/world-state.js';
import { PANEL, CONTENT, OPTION_COLUMN, MORTALITY_PLATE } from './constants.js';
import { confirmDockButton, confirmDockRect, renderTitlePlaque, renderLocationPlaque } from './chrome.js';
import { MAP_VIEWPORT_RECT } from '../world-map/constants.js';
import { actionCard, button } from './cards.js';
import { VASSAL_NODE_FAMILIES } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { renderMortalityEstimate } from './mortality.js';
import { clearChildren, createText, roundedRect } from '../settlement-view-primitives.js';
import { PALETTE, TEXT_STYLES } from '../settlement-theme.js';
import { addResourceAmount } from '../resource-cost-pixi.js';
import { addInteractionFeedback } from '../interaction-feedback.js';

// Live full-map node decisions, promoted from the opening workshop.
const MAP_BODY = Object.freeze({ x: 986, y: 234, width: 1358, height: 520 });
const FAMILY = { ...VASSAL_NODE_FAMILIES.crossroads, label: 'Crossroads', description: 'Move, connect, or explore your region.' };

function renderCampaignForcePanel(parent,campaign) {
  const rect={x:390,y:858,width:1650,height:190},f=campaign.activeForce,army=campaign.forces.attack;
  const armyUsed=campaign.mode==='attack',retinueUsed=campaign.mode!=='duel';
  const components=[
    {label:'Prowess',value:f.prowess,contribution:f.prowess,active:true,detail:`+${f.prowess} Force`},
    {label:'Personal Retinue',value:army.retinue,contribution:f.retinue,active:retinueUsed,detail:retinueUsed?`+${f.retinue} Force`:'Not used'},
    {label:'Warriors',value:army.warriors,contribution:f.armedWarriors,active:armyUsed,detail:armyUsed?`${army.armedWarriors} armed · +${f.armedWarriors} Force`:'Not used'},
    {label:'Arms',value:army.arms,contribution:null,active:armyUsed,detail:armyUsed?`${army.warriors-army.armedWarriors} Warriors unarmed`:'Not used'},
  ];
  const equation=[f.prowess,...(retinueUsed?[f.retinue]:[]),...(armyUsed?[f.armedWarriors]:[])].join(' + ');
  const panel=new PIXI.Container();panel.position.set(rect.x,rect.y);panel.eventMode='none';parent.addChild(panel);
  const background=new PIXI.Graphics();roundedRect(background,0,0,rect.width,rect.height,14,PALETTE.panel,PALETTE.accent,2);panel.addChild(background);
  const total=new PIXI.Graphics();roundedRect(total,18,18,234,154,8,0x25352d,PALETTE.accent,2);panel.addChild(total);
  panel.addChild(createText('Force',{...TEXT_STYLES.title,fontSize:28},34,28),
    createText(String(f.total),{...TEXT_STYLES.header,fontSize:60,fill:PALETTE.accent},34,64),
    createText(equation,{...TEXT_STYLES.body,fontSize:24,fill:PALETTE.textMuted},34,136));
  components.forEach((component,index)=>{
    const cell=new PIXI.Container();cell.position.set(264+index*345,18);panel.addChild(cell);cell.alpha=component.active?1:.4;
    const frame=new PIXI.Graphics();roundedRect(frame,0,0,333,154,8,0x1b2827,component.active?PALETTE.stroke:0x343e38,1);cell.addChild(frame);
    cell.addChild(createText(component.label,{...TEXT_STYLES.title,fontSize:26},16,10),
      createText(String(component.value),{...TEXT_STYLES.header,fontSize:46,fill:PALETTE.text},16,51),
      createText(component.detail,{...TEXT_STYLES.body,fontSize:24,fill:component.active?PALETTE.green:PALETTE.textMuted},16,116));
  });
  return {rect,total:f.total,equation,mode:campaign.mode,components};
}

export function createVassalWorldDecisionScreen({ app, layer, getState, getVassal, onSelect, onSelectSettlement, onSelectCampaignTarget, onLeaveCampaign, onConfirm, onDismiss, tooltipView }) {
  const root = new PIXI.Container(), mapLayer = new PIXI.Container(), overlay = new PIXI.Container(), chrome = new PIXI.Container();
  root.visible = false; root.eventMode = 'static'; root.hitArea = app.screen; layer.addChild(root);
  const backdrop = new PIXI.Graphics().beginFill(0x171713,.68)
    .drawRect(0,0,app.screen.width,app.screen.height).endFill();
  backdrop.eventMode='static';
  backdrop.on('pointertap',()=>{if(!busy){dismissed=true;root.visible=false;tooltipView?.hide?.({force:true});onDismiss?.();}});
  const background = new PIXI.Graphics();
  roundedRect(background,PANEL.x,PANEL.y,PANEL.width,PANEL.height,18,0x292f2b,FAMILY.color,3);
  background.eventMode='static';background.on('pointertap',event=>event.stopPropagation());
  root.addChild(backdrop,background,mapLayer,chrome);
  const mapScale = Math.min(MAP_BODY.width / MAP_VIEWPORT_RECT.width, MAP_BODY.height / MAP_VIEWPORT_RECT.height);
  mapLayer.scale.set(mapScale);
  mapLayer.position.set(MAP_BODY.x - MAP_VIEWPORT_RECT.x * mapScale,
    MAP_BODY.y + (MAP_BODY.height - MAP_VIEWPORT_RECT.height * mapScale) / 2 - MAP_VIEWPORT_RECT.y * mapScale);
  let decision = null, spec = null, busy = false, mode = 'move', selection = null, key = '', activeKey = null, dismissed = false;
  let modeButtons = [], confirmButton = null, leaveButton = null, feedback = null, forcePanel = null, locationPlaque = null, locationLabel = '', message = '';
  let overlayKey = '';
  const currentRegion = () => getVassal()?.locationRegionId;
  const isFounding=()=>spec?.kind==='legacy'&&!!decision?.legacySettlement;
  const isCampaign=()=>!!decision?.campaign;
  const isMenuMap=()=>isFounding()||isCampaign();
  const options = () => isCampaign()?decision.campaign.targets:isFounding()?decision.legacySettlement.targets:decision?.options ?? [];
  const groups = () => [
    options().filter(o => o.locationRegionId),
    options().filter(o => o.intervention?.kind === 'connection'),
    options().filter(o => !o.locationRegionId && !o.intervention && !o.classAction),
  ];
  const available = () => isMenuMap()?options():groups()[['move','build','tour'].indexOf(mode)] ?? [];
  const selected = () => isCampaign()?options().find(option=>option.id===decision.campaign.selectedTargetId):isFounding()&&decision.nodeState.selectedOptionId!=='found-settlement'
    ? decision.options.find(option=>option.id===decision.nodeState.selectedOptionId)
    : options().find(o => isFounding()?o.settlementRegionId===decision.legacySettlement.selectedRegionId:o.id === decision?.nodeState.selectedOptionId);
  const matchesChoice=choice=>!!choice&&(isFounding()&&decision.nodeState.selectedOptionId!=='found-settlement'||available().some(option=>option.id===choice.id));
  const brightRegions = () => [...new Set([currentRegion(), ...available().filter(o=>!o.blocked).map(target)].filter(Boolean))];
  const map = createWorldMapView({layer:mapLayer,getState,getSelectedRegionId:()=>selection??currentRegion(),
    getRegionSelectionActive:()=>false,getGraphScope:()=> 'settlement',
    getDisplayOptions:()=>({chrome:false,choiceRegionIds:brightRegions()}),
    setSelectedRegionId:pickRegion,onOpenDetailedSite:(_site,id)=>pickRegion(id),tooltipView});
  const overlayMask = new PIXI.Graphics().beginFill(0xffffff)
    .drawRect(MAP_VIEWPORT_RECT.x,MAP_VIEWPORT_RECT.y,MAP_VIEWPORT_RECT.width,MAP_VIEWPORT_RECT.height).endFill();
  mapLayer.addChild(overlay,overlayMask); overlay.eventMode = 'passive'; overlay.mask = overlayMask;
  function target(o) { return o.regionId ?? o.settlementRegionId ?? o.locationRegionId ?? (o.intervention?.regionAId === currentRegion() ? o.intervention?.regionBId : o.intervention?.regionAId); }
  function pickRegion(id) {
    if (busy || mode === 'tour') return;
    if(isFounding()&&decision.nodeState.selectedOptionId!=='found-settlement')return;
    const option = available().find(o => target(o) === id);
    if (!option || option.blocked) {message=isCampaign()?option?.blocked??'Choose a highlighted target.':isFounding()?'Choose a highlighted frontier destination.':mode==='move'?'Choose a highlighted reachable settlement.':'Choose a highlighted legal road destination.';draw();return;}
    selection=id;message='';if(isCampaign())onSelectCampaignTarget?.(id);else if(isFounding())onSelectSettlement?.(id);else onSelect(option.id);
  }
  function chooseMode(next) {
    if (busy || !groups()[['move','build','tour'].indexOf(next)]?.some(o=>!o.blocked)) return;
    mode=next;selection=null;message='';key='';
    if (next==='tour' && groups()[2].length) onSelect(groups()[2][0].id);
    else draw();
  }
  let rewardBadges=[];
  function draw() {
    if (!root.visible) return;
    const signature=JSON.stringify([getArtRevision(),spec,decision?.options,decision?.legacySettlement,decision?.campaign,decision?.nodeState.selectedOptionId,mode,selection,busy,message]);
    if(signature===key)return;key=signature;clearChildren(chrome);forcePanel=null;
    const founding=isFounding(),campaign=isCampaign(),menu=isMenuMap(),family=campaign?{...VASSAL_NODE_FAMILIES.campaign,description:''}:founding?{...VASSAL_NODE_FAMILIES.legacy,description:''}:FAMILY;
    background.clear();roundedRect(background,PANEL.x,PANEL.y,PANEL.width,PANEL.height,18,0x292f2b,family.color,3);
    renderTitlePlaque(chrome,family);
    const region = getRegionDefinition(getState(),currentRegion());
    const name=region?.name&&!/^Region\d+$/i.test(region.name)?region.name:null;
    locationLabel=`CURRENT REGION - ${getRegionReference(getState(),currentRegion())}${name?`\n${name}`:''}`;
    locationPlaque=renderLocationPlaque(chrome,locationLabel,family.color);
    const divider = new PIXI.Graphics().lineStyle(2,PALETTE.stroke,.9)
      .moveTo(958,PANEL.y+CONTENT.labelY).lineTo(958,PANEL.y+PANEL.height-28);
    chrome.addChild(divider);
    chrome.addChild(createText(campaign?mode==='duel'?'Honour duel':'Choose a target':founding?'Choose a settlement destination':mode==='move'?'Choose a bright destination on the map':mode==='build'?'Choose a bright region to connect':'Tour your current region', {...TEXT_STYLES.title,fontSize:26},MAP_BODY.x,PANEL.y+CONTENT.labelY));
    leaveButton=campaign?button(chrome,{x:MAP_BODY.x+MAP_BODY.width-140,y:PANEL.y+CONTENT.labelY-8,width:140,height:44},'Leave',!busy,onLeaveCampaign):null;
    const local=groups()[2][0], chance=local?.randomReward?.relicChance;
    const description=local?.randomReward ? `${Math.round(chance)}% ordinary relic · ${Math.round(100-chance)}% ${local.randomReward.statDelta?`+${local.randomReward.statDelta}`:'gain to'} a random ability`
      : local?.label??'No local activity is available';
    const labels=menu?decision.options.map(option=>option.label):['MOVE','BUILD A ROUTE',local?.randomReward?'TOUR THIS REGION':'LOCAL ACTIVITY'];
    const counts=groups().map(group=>group.filter(o=>!o.blocked).length);
    const rewards=[...new Set(groups()[0].map(o=>o.prestigeDelta??0))].sort((a,b)=>a-b);
    const travelReward=rewards.length?`\n+${rewards.join(' / +')} Prestige by destination`:'';
    const details=menu?decision.options.map(option=>[option.description.replaceAll(' · ','\n'),...(decision.optionRequirements?.[option.id]??[]).map(entry=>entry.label)].join('\n')):[`Travel to another settlement.\n${counts[0]} reachable destination${counts[0]===1?'':'s'}${travelReward}`,`Build a road from here.\n${counts[1]} legal connection${counts[1]===1?'':'s'}`,description];
    modeButtons=labels.map((label,index)=>{
      const id=menu?decision.options[index].id:['move','build','tour'][index], group=menu?[decision.options[index]]:groups()[index], enabled=!busy&&group.some(o=>!o.blocked);
      const selectedOption=group.find(o=>o.id===decision?.nodeState.selectedOptionId);
      const candidates=group.filter(o=>!o.blocked), priced=candidates.length?candidates:group;
      const option=selectedOption??[...priced].sort((a,b)=>a.cost-b.cost||a.phases-b.phases)[0];
      const varyingReward=priced.some(o=>o.prestigeDelta!==option?.prestigeDelta);
      const active=campaign?decision.campaign.mode===id:menu?decision.nodeState.selectedOptionId===id:mode===id;
      const from=campaign?!!option?.from:!!option&&!selectedOption&&priced.some(o=>o.cost!==option.cost||o.phases!==option.phases);
      const choose=()=>{if(!menu)chooseMode(id);else if(decision.nodeState.selectedOptionId!==id)onSelect(id);};
      const card=actionCard(chrome,{
        x:PANEL.x+30+index*(OPTION_COLUMN.width+OPTION_COLUMN.gap),y:PANEL.y+CONTENT.cardY,
        width:OPTION_COLUMN.width,height:OPTION_COLUMN.height,
      },{
        title:label,artId:(campaign?['crisis','vigil','legacy']:founding?['settlement','development','legacy']:['travel','settlement','patronage'])[index],summary:details[index],
        actionLabel:from?'FROM':'CHOOSE',faceLabel:from?'From':active?'Selected':'Choose',
        enabled,showCost:!founding,selected:active,costUnmet:!!option&&option.cost>(getVassal()?.prestige??0),
        cost:{phaseCost:option?.phases??0,prestigeCost:option?.cost??0,foodCost:option?.foodCost??0,monsterPressureCost:option?.monsterPressureCost??0,riskLabel:option?.riskLabel,prestigeGain:!selectedOption&&varyingReward?0:option?.prestigeDelta??0,state:getState()},
        onClick:choose,onInspect:choose,
      });
      if(founding)card.choiceButton=button(chrome,{x:card.x,y:PANEL.y+CONTENT.cardY+OPTION_COLUMN.height+12,width:OPTION_COLUMN.width,height:78},
        decision.nodeState.selectedOptionId===id?'Selected':'Choose',enabled,choose,decision.nodeState.selectedOptionId===id);
      card.priceOptionId=option?.id;card.priceFrom=from;
      return card;
    });
    const choice=selected(), matching=matchesChoice(choice);
    const campaignText=campaign?(choice?`${decision.campaign.lastResult?.regionId===choice.regionId&&decision.campaign.lastResult.stage==='clear'&&decision.campaign.lastResult.success?'Buildup cleared. ':''}${choice.label}${choice.stage==='duel'?` · Victory: +1 Prowess, +${choice.prestigeDelta} Prestige`:` · Distance ${choice.distance} · Food ${choice.foodCost}`}\n${choice.defense} ÷ (${choice.force} + ${choice.defense}) = ${choice.risk}% defeat risk`:decision.campaign.lastResult?.text??'Choose a highlighted target.'):null;
    const text=busy?'Resolving the world…':message||campaignText|| (matching ? `${choice.label}${choice.blocked?` · ${choice.blocked}`:''}`
      : founding?decision.nodeState.selectedOptionId==='found-settlement'?'Choose a highlighted frontier destination.':'Choose a Legacy option.':mode==='tour'?description:mode==='move'?'Click a highlighted destination to preview your journey.':'Click a highlighted destination to preview a new road.');
    feedback=createText(text,{...TEXT_STYLES.body,fontSize:24,lineHeight:28,wordWrap:true,wordWrapWidth:MAP_BODY.width,fill:message?PALETTE.red:PALETTE.text},MAP_BODY.x,774);
    feedback.scale.set(Math.min(1,54/Math.max(1,feedback.height)));chrome.addChild(feedback);
    const dock=confirmDockRect(app);
    if(!campaign)renderMortalityEstimate(chrome,decision?.mortalityEstimate,{x:dock.x-MORTALITY_PLATE.gap-MORTALITY_PLATE.width,y:dock.y+(dock.height-MORTALITY_PLATE.height)/2,width:MORTALITY_PLATE.width,height:MORTALITY_PLATE.height},!busy&&!!matching&&!choice.blocked);
    if(campaign) {
      forcePanel=renderCampaignForcePanel(chrome,decision.campaign);
      addResourceAmount(chrome,'stock-edible',decision.campaign.resources.food,{x:PANEL.x+30,y:778,fontSize:28,iconSize:34});
      addResourceAmount(chrome,'prestige',decision.campaign.resources.prestige,{x:PANEL.x+220,y:778,fontSize:28,iconSize:34});
    }
    confirmButton=confirmDockButton(chrome,app,{label:busy?'Resolving...':'Confirm',enabled:!busy&&!!matching&&!choice.blocked,onClick:()=>onConfirm(founding&&decision.nodeState.selectedOptionId==='found-settlement'?'found-settlement':choice.id)});
  }
  function updateOverlay() {
    if(!root.visible)return; map.update();
    const positions=available().map(o=>[o.id,target(o),o.blocked,o.prestigeDelta,map.getRegionClickPoint(target(o))]);
    const nextKey=JSON.stringify([getArtRevision(),mode,busy,selected()?.id,decision?.campaign?.progress,map.getRegionClickPoint(currentRegion()),positions]);
    if(nextKey===overlayKey)return;overlayKey=nextKey;overlay.removeChildren().forEach(c=>c.destroy({children:true}));rewardBadges=[];
    const gfx=new PIXI.Graphics();gfx.eventMode='none';overlay.addChild(gfx);
    const origin=map.getRegionClickPoint(currentRegion());
    if(origin){gfx.lineStyle(5,PALETTE.accent).drawCircle(origin.x,origin.y,42);}
    for(const option of available()) {
      const id=target(option);if(!id||option.blocked)continue;const p=map.getRegionClickPoint(id);if(!p)continue;
      gfx.lineStyle(4,PALETTE.green,.9).drawCircle(p.x,p.y,34);
      if(selected()?.id===option.id&&origin){gfx.lineStyle(6,PALETTE.accent,.95);if(mode==='build'){
        const dx=p.x-origin.x,dy=p.y-origin.y,d=Math.hypot(dx,dy);for(let n=0;n<d;n+=30){const end=Math.min(d,n+18);gfx.moveTo(origin.x+dx*n/d,origin.y+dy*n/d).lineTo(origin.x+dx*end/d,origin.y+dy*end/d);}
      }else {const path=decision?.regionalMap?.selectedPath??[];if(path.length>1){for(let i=1;i<path.length;i++){const a=map.getRegionClickPoint(path[i-1]),b=map.getRegionClickPoint(path[i]);if(a&&b)gfx.moveTo(a.x,a.y).lineTo(b.x,b.y);}}else gfx.moveTo(origin.x,origin.y).lineTo(p.x,p.y);}}
      if(mode==='move'||isMenuMap()) {
        const badge=new PIXI.Container(), active=selected()?.id===option.id, width=isMenuMap()?110:210,height=60;
        badge.position.set(Math.max(MAP_VIEWPORT_RECT.x+8,Math.min(p.x-width/2,MAP_VIEWPORT_RECT.x+MAP_VIEWPORT_RECT.width-width-8)),
          Math.max(MAP_VIEWPORT_RECT.y+8,Math.min(p.y+42,MAP_VIEWPORT_RECT.y+MAP_VIEWPORT_RECT.height-height-8)));
        const background=new PIXI.Graphics();roundedRect(background,0,0,width,height,8,0x17211f,active?PALETTE.accent:PALETTE.green,3);badge.addChild(background);
        badge.addChild(createText(getRegionReference(getState(),id),{...TEXT_STYLES.chip,fontSize:30},12,height/2,0,.5));
        if(!isMenuMap())addResourceAmount(badge,'prestige',`+${option.prestigeDelta??0}`,{x:88,y:10,fontSize:34,iconSize:40,fill:0xb6ce92});
        badge.eventMode='static';badge.cursor=busy?'default':'pointer';badge.hitArea=new PIXI.Rectangle(0,0,width,height);
        badge.accessible=true;badge.accessibleType='button';badge.accessibleTitle=isMenuMap()?option.label:`${option.label}: +${option.prestigeDelta??0} Prestige`;
        addInteractionFeedback(badge,{x:0,y:0,width,height},{enabled:!busy,onActivate:()=>pickRegion(id)});
        overlay.addChild(badge);rewardBadges.push({optionId:option.id,regionId:id,reward:option.prestigeDelta??0,control:badge});
      }
    }
    for(const progress of decision?.campaign?.progress??[]) {
      const p=map.getRegionClickPoint(progress.regionId);if(!p)continue;
      const label=createText(progress.label,{...TEXT_STYLES.chip,fontSize:26,fill:PALETTE.green,stroke:0x101918,strokeThickness:5},p.x,p.y-48,.5,.5);label.eventMode='none';overlay.addChild(label);
    }
  }
  function refresh(next, node, isBusy=false) {
    decision=next;spec=node;busy=isBusy;
    if(!next){root.visible=false;map.setVisible(false);activeKey=null;dismissed=false;key='';return;}
    if(activeKey!==node.id){activeKey=node.id;dismissed=false;mode=isCampaign()?decision.campaign.mode:isFounding()?'found':groups()[0].length?'move':groups()[1].length?'build':'tour';selection=null;message='';key='';overlayKey='';}
    if(isCampaign()){mode=decision.campaign.mode;selection=selected()?.regionId??null;message='';}
    if(isFounding()){selection=decision.legacySettlement.selectedRegionId;message='';}
    root.visible=!dismissed;
    map.setVisible(root.visible);map.refresh();draw();updateOverlay();
  }
  const mapPoint=id=>{const p=map.getRegionClickPoint(id);return p?mapLayer.toGlobal(p):null;};
  const point=control=>{if(!root.visible||!control)return null;const r=control.getBounds();return{x:r.x+r.width/2,y:r.y+r.height/2};};
  const bounds=control=>{const r=control.getBounds();return{x:r.x,y:r.y,width:r.width,height:r.height};};
  return {refresh,
    // Like the main map, this independent camera needs its terrain prepared
    // behind the game's loading screen before any world decision is opened.
    async prepare(renderer){await map.prepare(renderer);map.setVisible(root.visible);},
    getHudDeltas:()=>{const choice=selected();return root.visible&&matchesChoice(choice)&&!choice.blocked?{prestige:(choice.prestigeDelta??0)-choice.cost,stats:{}}:null;},update:()=>{draw();updateOverlay();},isOpen:()=>root.visible,
    open:()=>{dismissed=false;root.visible=!!decision;map.setVisible(root.visible);map.refresh();key='';draw();},close:()=>{dismissed=true;root.visible=false;map.setVisible(false);},
    getPoint:(kind,id)=>kind==='confirm'?point(confirmButton):kind==='campaignLeave'?point(leaveButton):kind==='option'?point(modeButtons[id]?.choiceButton??modeButtons[id]):kind==='worldMode'?point(modeButtons[['move','build','tour'].indexOf(id)]):kind==='worldCost'?point(modeButtons[(isCampaign()?['attack','duel','quest']:isFounding()?['found-settlement','highest-stat','accumulated-prestige']:['move','build','tour']).indexOf(id)]?.costPanel):kind==='worldTarget'?mapPoint(id):kind==='worldReward'?point(rewardBadges.find(b=>b.regionId===id)?.control):null,
    getSnapshot:()=>{const {illustratedTerrain,camera}=map.getSemanticSnapshot();return {open:root.visible,mode,selectedOptionId:decision?.nodeState.selectedOptionId,selectedRegionId:selected()?target(selected())??null:null,
      locationRegionId:currentRegion(),regionCount:getState()?.world?.regions?.length??0,
      connectionCount:getState()?.world?.connections?.length??0,
      panel:PANEL,mapBody:MAP_BODY,map:{illustratedTerrain,camera},artworkReady:modeButtons.length>0&&modeButtons.every(card=>card.illustration?.texture?.baseTexture.valid),brightRegionIds:brightRegions(),locationPlaque:locationPlaque?{label:locationLabel,rect:bounds(locationPlaque)}:null,
      forcePanel,
      choiceButtons:(decision?modeButtons:[]).flatMap((card,index)=>card.choiceButton?[{id:decision.options[index].id,label:decision.nodeState.selectedOptionId===decision.options[index].id?'Selected':'Choose',rect:bounds(card.choiceButton)}]:[]),
      prices:(decision?modeButtons:[]).flatMap((card,index)=>card.costPanel?[{mode:isMenuMap()?decision.options[index].id:['move','build','tour'][index],optionId:card.priceOptionId,from:card.priceFrom,
        ...card.costPanel.costSummary,rect:bounds(card.costPanel),cardRect:bounds(card)}]:[]),feedback:feedback?{text:feedback.text,rect:bounds(feedback)}:null,
      dimmedRegionIds:(getState()?.world?.regions??[]).map(r=>r.id).filter(id=>!brightRegions().includes(id)),
      rewardBadges:rewardBadges.map(({control,...badge})=>({...badge,rect:bounds(control)})),
      targets:available().map(o=>({id:o.id,regionId:target(o),blocked:o.blocked,cost:o.cost,foodCost:o.foodCost,stage:o.stage,risk:o.risk,force:o.force,defense:o.defense,distance:o.distance,phases:o.phases,prestigeGain:o.prestigeDelta??0})),campaign:decision?.campaign??null,tour:groups()[2][0]?.randomReward??null};}};
}
