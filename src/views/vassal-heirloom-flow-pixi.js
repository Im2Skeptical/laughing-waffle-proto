import { clearChildren, createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { getArtRevision } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { addHeirloomCard, heirloomInheritanceText } from './vassal-heirloom-pixi.js';
import { button } from './vassal-node-decision/cards.js';
import { getHeirloomDefinition } from '../defs/gamepieces/vassal-heirloom-defs.js';

const PANEL={x:150,y:158,width:2124,height:672};
const TABS={equipped:'Active',carry:'Bag',vault:'Lineage vault'};

export function createVassalHeirloomFlowView({
  app, layer, getState, getPresentation, isRecapOpen, onResolveOverflow, onConfirmLoadout,
  onDismissSummary, onOpenInventory, onCloseInventory, tooltipView,
}={}) {
  const root=new PIXI.Container();root.visible=false;root.eventMode='none';layer?.addChild(root);
  let signature='',dismissedReportId=null,selectedIds=[],lastMode=null;
  let browsing=false,tab='carry',page=0,controls=new Map(),cardRoots=[];
  let held=false;
  root.on('pointerdown',()=>{held=true;});
  for(const type of ['pointerup','pointerupoutside','pointercancel'])root.on(type,()=>{held=false;});

  function snapshot() {
    const presentation=getPresentation?.()??{},state=browsing?(presentation.state??getState?.()):getState?.();
    const lineage=state?.civilization?.vassalLineage,report=lineage?.lastInheritanceReport;
    const overflow=lineage?.pendingVaultOverflow??[],loadoutPending=lineage?.pendingHeirloomLoadout===true;
    const vassal=presentation.profileVassal??presentation.vassal??lineage?.vassalsById?.[lineage?.currentVassalId];
    const reportOpen=!!report&&report.vassalId!==dismissedReportId&&(report.entries??[]).length>0;
    const mode=overflow.length?'overflow':reportOpen?'summary':loadoutPending?'loadout':browsing?'inventory':null;
    return {state,lineage,report,overflow,vassal,mode,visible:!!mode&&isRecapOpen?.()!==true};
  }
  function closeInventory() {
    if(!browsing)return false;
    browsing=false;tooltipView?.hide?.({force:true});onCloseInventory?.();render(true);return true;
  }
  function control(id,rect,label,enabled,onPress,selected=false) {
    const node=button(root,rect,label,enabled,onPress,selected);controls.set(id,node);return node;
  }
  function text(label,x,y,size=24,fill=RELIC.bone,width) {
    const node=createText(label,{...TEXT_STYLES.body,fontSize:size,fill,...(width?{wordWrap:true,wordWrapWidth:width}:{})},x,y);
    root.addChild(node);return node;
  }
  function render(force=false) {
    if(held)return;
    const snap=snapshot();root.visible=snap.visible;root.eventMode=snap.visible?'static':'none';
    if(!snap.visible){if(root.children.length)clearChildren(root);signature='';controls=new Map();cardRoots=[];return;}
    // Cover the later HUD and navigation siblings while browsing.
    if(root.parent.getChildIndex(root)!==root.parent.children.length-1)root.parent.setChildIndex(root,root.parent.children.length-1);
    if(snap.mode!==lastMode){selectedIds=snap.mode==='overflow'?snap.overflow.slice(0,6).map(item=>item.instanceId):[];page=0;lastMode=snap.mode;}
    const vault=(snap.state?.civilization?.heirloomVault??[]).filter(Boolean);
    const inventory=snap.vassal?.heirlooms??{equipped:[],carry:[]};
    const nextSignature=getArtRevision()+JSON.stringify({mode:snap.mode,report:snap.report,overflow:snap.overflow,vault,inventory,selectedIds,tab,page});
    if(!force&&signature===nextSignature)return;
    signature=nextSignature;clearChildren(root);controls=new Map();cardRoots=[];
    const blocker=new PIXI.Graphics().beginFill(RELIC.night,.88).drawRect(0,0,app?.screen?.width??2424,app?.screen?.height??1080).endFill();
    blocker.eventMode='static';blocker.on('pointertap',event=>{event.stopPropagation();if(snap.mode==='inventory')closeInventory();});
    const g=new PIXI.Graphics();paintRelicPanel(g,PANEL.x,PANEL.y,PANEL.width,PANEL.height,RELIC.stone,RELIC.gold,3);
    g.eventMode='static';g.on('pointertap',event=>event.stopPropagation());root.addChild(blocker,g);
    const x=PANEL.x+30;
    text(({inventory:'HEIRLOOMS',loadout:'CHOOSE THIS VASSAL’S HEIRLOOMS',overflow:'CHOOSE SIX HEIRLOOMS TO KEEP',summary:'HEIRLOOM INHERITANCE'})[snap.mode],x,PANEL.y+20,32,RELIC.gold);
    let items=[],status='',helper='',limit=0;
    if(snap.mode==='inventory') {
      for(const [index,key]of Object.keys(TABS).entries()) {
        const slots=key==='vault'?vault:inventory[key]??[],count=slots.filter(Boolean).length,capacity=key==='vault'?6:3;
        control(`tab:${key}`,{x:x+index*346,y:PANEL.y+72,width:330,height:48},`${TABS[key]}  ${count}/${capacity}`,true,()=>{tab=key;page=0;render(true);},tab===key);
      }
      control('close',{x:PANEL.x+PANEL.width-210,y:PANEL.y+20,width:180,height:48},'CLOSE',true,closeInventory);
      items=tab==='vault'?vault:(inventory[tab]??[]).filter(Boolean);
      status=tab==='equipped'?'Active this life':tab==='carry'?'Carried · inactive':'Stored for a future Vassal';
      helper=tab==='equipped'?'Only active heirlooms grant effects. Tap an icon in the Vassal bar to inspect this loadout.'
        :tab==='carry'?'Carried heirlooms grant no effects. They pass through inheritance when this life ends; choose a new loadout for the next Vassal.'
          :'These heirlooms stayed behind. Choose up to three from the vault when the next Vassal begins.';
    } else if(snap.mode==='loadout') {
      items=vault;status='Equip for this life';limit=3;
      helper='Choose up to three. Sanctified items become Unmarked when taken; the rest stay in the vault. Your bag starts empty.';
      text(`${selectedIds.length}/3 active slots selected`,x,PANEL.y+76,24,RELIC.gold);
    } else if(snap.mode==='overflow') {
      items=snap.overflow;status='Keep in the vault';limit=6;
      helper='The vault holds six. Select the six to keep; all unselected heirlooms will be discarded.';
      text(`${selectedIds.length}/6 selected · ${items.length} surviving heirlooms`,x,PANEL.y+76,24,RELIC.gold);
    } else {
      items=snap.report?.entries??[];
      helper='Sanctified survives intact; taking it from the vault makes it Unmarked. Unmarked becomes Fragile after a life; Fragile may break.';
    }
    const pages=Math.max(1,Math.ceil(items.length/3));page=Math.min(page,pages-1);
    const visible=items.slice(page*3,page*3+3),cardWidth=650,gap=24;
    const cardStart=PANEL.x+(PANEL.width-visible.length*cardWidth-Math.max(0,visible.length-1)*gap)/2;
    if(!items.length)text(tab==='carry'?'Your bag is empty. Choose “Stow in bag” when you find an heirloom.':tab==='equipped'?'No active heirlooms.':'The lineage vault is empty.',x,PANEL.y+250,30,RELIC.ash,1900);
    visible.forEach((item,index)=>{
      const selected=selectedIds.includes(item.instanceId);
      const outcome=item.outcome==='broke'?'BROKE':item.outcome==='survived'?`Survived · ${item.toState??'unmarked'}`:null;
      const node=addHeirloomCard(root,{x:cardStart+index*(cardWidth+gap),y:PANEL.y+136,width:cardWidth,height:448},item,{
        selected,landscape:true,status:outcome??(selected?(snap.mode==='loadout'?'Will equip':'Will keep'):status),
        onActivate:limit?()=>{if(selected)selectedIds=selectedIds.filter(id=>id!==item.instanceId);else if(selectedIds.length<limit)selectedIds.push(item.instanceId);render(true);}:()=>tooltipView?.show?.({title:item.label??getHeirloomDefinition(item.definitionId)?.label??'Heirloom',scale:2,lines:[item.outcome==='broke'?'Broke at the end of this life.':heirloomInheritanceText(item.toState??item.inheritanceState??item.fromState)]},node.getBounds()),
        enabled:!limit||selected||selectedIds.length<limit,
      });cardRoots.push(node);
    });
    text(helper,x,PANEL.y+600,22,RELIC.ash,PANEL.width-520);
    if(pages>1){
      control('previous',{x:PANEL.x+PANEL.width-490,y:PANEL.y+72,width:110,height:48},'←',page>0,()=>{page--;render(true);});
      text(`${page+1}/${pages}`,PANEL.x+PANEL.width-350,PANEL.y+85,22);
      control('next',{x:PANEL.x+PANEL.width-260,y:PANEL.y+72,width:110,height:48},'→',page+1<pages,()=>{page++;render(true);});
    }
    if(snap.mode==='inventory')return;
    const confirm=()=>{
      if(snap.mode==='summary'){dismissedReportId=snap.report?.vassalId;onDismissSummary?.();}
      else {const result=(snap.mode==='loadout'?onConfirmLoadout:onResolveOverflow)?.([...selectedIds]);if(result?.ok===false)return;selectedIds=[];}
      render(true);
    };
    control('confirm',{x:PANEL.x+PANEL.width-460,y:PANEL.y+604,width:430,height:48},snap.mode==='loadout'?selectedIds.length?`EQUIP ${selectedIds.length} & BEGIN`:'BEGIN WITHOUT HEIRLOOMS':snap.mode==='overflow'?'KEEP THESE SIX':'CONTINUE',snap.mode!=='overflow'||selectedIds.length===6,confirm);
  }
  function openInventory(nextTab='carry') {
    if(snapshot().mode&&snapshot().mode!=='inventory')return false;
    browsing=true;tab=TABS[nextTab]?nextTab:'carry';page=0;tooltipView?.hide?.({force:true});onOpenInventory?.();render(true);return true;
  }
  const point=node=>{const b=node?.getBounds?.();return b?{x:b.x+b.width/2,y:b.y+b.height/2}:null;};
  return {init:()=>render(true),update:()=>render(),refresh:()=>render(true),isOpen:()=>root.visible===true,
    openInventory,closeInventory,
    getSemanticSnapshot:()=>({open:root.visible,mode:snapshot().mode,tab,page,selectedIds:[...selectedIds],cards:cardRoots.map(node=>({rect:node.getBounds()})),controls:Object.fromEntries([...controls].map(([id,node])=>[id,point(node)]))}),
  };
}
