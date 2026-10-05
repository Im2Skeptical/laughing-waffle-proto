import { getResearchProgression } from '../model/research-progression.js';
import { getGamepieceFace } from '../model/gamepiece-presentation.js';
import { getResearchLibraryCards, filterResearchLibraryCards, layoutResearchLibraryCards, RESEARCH_PRACTICE_SIZE } from './research-library-data.js';
import { addSettlementPiece } from './settlement-piece-pixi.js';
import { getArtRevision } from './chronicle-art.js';
import { createText, clearChildren } from './settlement-view-primitives.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { TEXT_STYLES } from './settlement-theme.js';

const COLOURS={bronze:0xd39d6d,silver:0xbdc7c7,gold:0xd9b45d,diamond:0x92d7dc};
const VIEW={x:52,y:470,width:2296,height:536};
const title = value => value[0].toUpperCase()+value.slice(1);
const percent = value => `${Number((value*100).toFixed(1))}%`;
const number = value => Number(value.toFixed(1)).toLocaleString();
const emptyFilters = () => ({search:'',pool:'',kind:'',availability:'',trait:''});

export function createResearchLibraryView({ layer, getState, tooltipView, onOpen, onClose }) {
  const root=new PIXI.Container();root.visible=false;root.eventMode='static';
  root.hitArea=new PIXI.Rectangle(0,78,2424,1002);
  root.on('pointertap',event=>event.stopPropagation());
  layer.addChild(root);
  const chrome=new PIXI.Container(), fields=new PIXI.Container(), viewport=new PIXI.Container(), ink=new PIXI.Container(), scrollbar=new PIXI.Graphics(), menus=new PIXI.Container();
  viewport.position.set(VIEW.x,VIEW.y);viewport.addChild(ink);
  viewport.eventMode='static';viewport.hitArea=new PIXI.Rectangle(0,0,VIEW.width,VIEW.height);
  const mask=new PIXI.Graphics().beginFill(0xffffff).drawRect(VIEW.x,VIEW.y,VIEW.width,VIEW.height).endFill();
  viewport.mask=mask;
  root.addChild(chrome,fields,viewport,mask,scrollbar,menus);
  // Native input captures text/IME only; the field, labels and all UI are Pixi.
  const input=document.createElement('input');input.type='search';input.maxLength=100;
  input.autocomplete='off';input.setAttribute('aria-label','Search the Research card library');
  input.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;font-size:16px;opacity:0;pointer-events:none';
  input.disabled=true;document.body.append(input);
  let state,progression,cards=[],filtered=[],layout={entries:[],groups:[],height:0},filters=emptyFilters();
  let scroll=0,visibleKey='',pieces=[],activeMenu=null,menuPage=0,drag=null,suppressTapUntil=0,barDrag=false;
  let focusBefore=null,artRevision=-1,summaryLabel=null,controls=new Map();
  const faces=new Map();

  function text(parent,label,x,y,size=28,fill=RELIC.bone,width=null,anchor=0) {
    const node=createText(label,{...TEXT_STYLES.body,fontSize:size,fill, ...(width?{wordWrap:true,wordWrapWidth:width}: {})},x,y,anchor);
    parent.addChild(node);return node;
  }
  function control(parent,id,rect,label,action,{accent=RELIC.gold,fill=RELIC.stone,size=28}={}) {
    const node=new PIXI.Container();node.position.set(rect.x,rect.y);
    node.eventMode='static';node.cursor='pointer';node.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);
    const frame=new PIXI.Graphics();paintRelicPanel(frame,0,0,rect.width,rect.height,fill,accent,1);
    node.addChild(frame);const labelNode=text(node,label,rect.width/2,(rect.height-size*1.2)/2,size,RELIC.bone,null,.5);
    if(labelNode.width>rect.width-24)labelNode.scale.set((rect.width-24)/labelNode.width);
    node.on('pointertap',event=>{event.stopPropagation();action();});
    parent.addChild(node);controls.set(id,node);return node;
  }
  function fieldOptions(id) {
    return ({pool:[['','All classes'],['common','Common'],['scholar','Scholar'],['warrior','Warrior']],
      kind:[['','All cards'],['practice','Practices'],['structure','Structures'],['cycle','Cycle Practices'],['charge','Charge Practices']],
      availability:[['','All tiers'],['unlocked','Unlocked'],['locked','Locked']],
      trait:[['','All traits'],...[...new Set(cards.flatMap(card=>card.traits))].sort().map(trait=>[trait,trait])],
    })[id];
  }
  function hideMenu() {
    activeMenu=null;clearChildren(menus);
    for(const id of [...controls.keys()])if(id.startsWith('option:')||id.startsWith('menu:'))controls.delete(id);
  }
  function drawMenu(id,page=0) {
    input.blur();tooltipView.hide({force:true});hideMenu();activeMenu=id;menuPage=page;
    const options=fieldOptions(id),anchor=controls.get(`filter:${id}`),x=anchor.x,y=442,width=anchor.hitArea.width;
    const backdrop=new PIXI.Graphics().beginFill(0,0.001).drawRect(0,78,2424,1002).endFill();
    backdrop.eventMode='static';backdrop.on('pointertap',event=>{event.stopPropagation();hideMenu();});menus.addChild(backdrop);
    const entries=options.slice(page*7,page*7+7),height=entries.length*68+(options.length>7?72:0)+16;
    const frame=new PIXI.Graphics();paintRelicPanel(frame,x,y,width,height,RELIC.night,RELIC.gold,2);menus.addChild(frame);
    entries.forEach(([value,label],i)=>control(menus,`option:${value}`,{x:x+8,y:y+8+i*68,width:width-16,height:64},label,()=>{
      filters[id]=value;hideMenu();refreshResults();
    },{fill:filters[id]===value?RELIC.raised:RELIC.stone}));
    if(options.length>7){
      const py=y+height-68;
      if(page>0)control(menus,'menu:previous',{x:x+8,y:py,width:80,height:60},'‹',()=>drawMenu(id,page-1));
      text(menus,`${page+1} / ${Math.ceil(options.length/7)}`,x+width/2,py+18,24,RELIC.ash,null,.5);
      if((page+1)*7<options.length)control(menus,'menu:next',{x:x+width-88,y:py,width:80,height:60},'›',()=>drawMenu(id,page+1));
    }
  }
  function drawFields() {
    clearChildren(fields);
    summaryLabel.text=`${filtered.length} of ${cards.length} cards · Grouped by unlock tier · Hover for rules, select to inspect`;
    for(const id of ['search','clear','filter:pool','filter:kind','filter:availability','filter:trait'])controls.delete(id);
    const definitions=[['search','Search',500],['pool','Class',330],['kind','Card type',330],['availability','Research access',310],['trait','Trait',460]];
    let x=52;
    for(const [id,label,width] of definitions){
      text(fields,label.toUpperCase(),x,360,21,RELIC.ash);
      const value=id==='search'?filters.search||'Name, effect or resource…':fieldOptions(id).find(([value])=>value===filters[id])[1];
      control(fields,id==='search'?'search':`filter:${id}`,{x,y:390,width,height:68},id==='search'?value:`${value}  ▾`,()=>{
        if(id==='search'){hideMenu();input.focus({preventScroll:true});drawFields();}
        else if(activeMenu===id)hideMenu();else drawMenu(id);
      },{accent:document.activeElement===input&&id==='search'?RELIC.gold:RELIC.brass,size:28});
      x+=width+16;
    }
    control(fields,'clear',{x,y:390,width:218,height:68},'Clear',()=>{filters=emptyFilters();input.value='';input.blur();hideMenu();refreshResults();});
  }
  function drawChrome() {
    clearChildren(chrome);controls.clear();
    const frame=new PIXI.Graphics();paintRelicPanel(frame,16,78,2392,988,RELIC.night,RELIC.brass,2);
    paintRelicPanel(frame,30,92,2364,104,RELIC.stone,RELIC.brass,1);chrome.addChild(frame);
    chrome.addChild(createText('RESEARCH · CARD LIBRARY',{...TEXT_STYLES.header,fontSize:42,fill:RELIC.bone},52,106));
    summaryLabel=text(chrome,'',54,157,24,RELIC.ash);
    addResourceIcon(chrome,'research',1240,145,56);
    text(chrome,number(progression.research),1290,128,52,RELIC.gold);
    text(chrome,'RESEARCH',1292,102,21,RELIC.ash);
    const milestone=progression.nextMilestone;
    text(chrome,milestone?`Next: ${milestone.label}`:'All tiers unlocked',1560,114,26,RELIC.gold,490);
    text(chrome,milestone?`${number(milestone.research-progression.research)} Research to go`:'The full pool is open',1560,155,24,RELIC.ash);
    control(chrome,'close',{x:2100,y:106,width:264,height:74},'Return ×',close,{size:30});
    progression.tiers.forEach((tier,i)=>{
      const x=52+i*580,width=556,accent=COLOURS[tier.id];
      const tile=control(chrome,`tier:${tier.id}`,{x,y:208,width,height:134},'',()=>setScroll(layout.groups.find(group=>group.id===tier.id).y),{accent,fill:tier.unlocked?RELIC.stone:RELIC.night});
      text(tile,`TIER ${i+1} · ${tier.unlocked?'UNLOCKED':'LOCKED'}`,20,10,20,tier.unlocked?accent:RELIC.ash);
      tile.addChild(createText(title(tier.id),{...TEXT_STYLES.title,fontSize:38,fill:accent},20,37));
      text(tile,tier.threshold?`${number(tier.threshold)} Research`:'Starting tier',20,94,24,RELIC.ash);
      text(tile,percent(tier.chance),width-22,16,58,accent,null,1);
      text(tile,'Practice quality chance',width-22,94,20,RELIC.ash,null,1);
    });
    text(chrome,'Odds are before Ingenuity. Structures keep their printed tier. Filters do not change the shop pool.',52,1031,23,RELIC.ash);
  }
  function scrollThumb() {
    const total=Math.max(VIEW.height,layout.height),height=Math.max(60,VIEW.height*VIEW.height/total),max=Math.max(0,layout.height-VIEW.height);
    return {height,max,y:VIEW.y+(max?scroll/max:0)*(VIEW.height-height)};
  }
  function drawScrollbar() {
    scrollbar.clear();
    const {height,y}=scrollThumb();
    scrollbar.beginFill(RELIC.stone).drawRect(2367,VIEW.y,24,VIEW.height).endFill();
    scrollbar.beginFill(RELIC.brass).drawRoundedRect(2370,y,18,height,4).endFill();
    scrollbar.eventMode='static';scrollbar.cursor='ns-resize';scrollbar.hitArea=new PIXI.Rectangle(2355,VIEW.y,48,VIEW.height);
  }
  function renderVisible(force=false) {
    ink.y=-scroll;
    const visible=layout.entries.map((entry,index)=>({...entry,index})).filter(entry=>entry.y+entry.height>=scroll-30&&entry.y<=scroll+VIEW.height+30);
    const key=visible.map(entry=>entry.index).join(',');
    if(!force&&key===visibleKey){drawScrollbar();return;}
    visibleKey=key;clearChildren(ink);pieces=[];
    for(const entry of visible){
      if(entry.kind==='heading'){
        const {tier}=entry,accent=COLOURS[tier.id];
        const g=new PIXI.Graphics();paintRelicPanel(g,0,entry.y,VIEW.width-8,72,RELIC.stone,accent,1);ink.addChild(g);
        text(ink,`${title(tier.id)} · ${entry.count} cards`,18,entry.y+15,34,accent);
        text(ink,tier.unlocked?'Research requirement met':`Unlocks at ${number(tier.threshold)} Research`,640,entry.y+23,26,RELIC.ash);
        text(ink,`${percent(tier.chance)} quality chance`,VIEW.width-28,entry.y+15,34,accent,null,1);
      }else if(entry.kind==='empty')text(ink,'No cards in this tier match your filters.',20,entry.y+8,28,RELIC.ash);
      else {
        const {card}=entry,key=`research:${card.kind}:${card.id}`;
        if(!faces.has(key))faces.set(key,getGamepieceFace(state,card.kind,card.id,card.tier));
        const face=faces.get(key),rect={x:entry.x+(entry.width-card.size.width)/2,y:entry.y+10,...card.size};
        let piece;
        piece=addSettlementPiece(ink,rect,{face,tooltipView,inspectionKey:key,compact:true,
          inspectionSide:entry.x<VIEW.width/2?'right':'left',onInspect:event=>{
            if(performance.now()<suppressTapUntil)return;
            tooltipView.pin({face,title:face.label,inspectionKey:key,inspectionSide:'left',artRevision:getArtRevision()},piece.getBounds(),key,{quick:event.pointerType==='touch'});
          }});
        pieces.push({card,piece});
        text(ink,card.def.label,entry.x+entry.width/2,rect.y+rect.height+8,23,RELIC.bone,entry.width-8,.5);
        const unlocked=progression.tiers.find(tier=>tier.id===card.tier).unlocked;
        text(ink,`${title(card.def.pool)} · ${title(card.kind)}${unlocked?'':' · Locked'}`,entry.x+entry.width/2,rect.y+rect.height+38,18,unlocked?RELIC.ash:COLOURS[card.tier],null,.5);
      }
    }
    drawScrollbar();
  }
  function setScroll(value) {
    scroll=Math.max(0,Math.min(Math.max(0,layout.height-VIEW.height),value));
    tooltipView.hide({force:true});renderVisible();
  }
  function refreshResults() {
    filtered=filterResearchLibraryCards(cards,filters,progression.tiers);
    layout=layoutResearchLibraryCards(filtered,progression.tiers,VIEW.width-24);
    scroll=0;tooltipView.hide({force:true});drawFields();renderVisible(true);
  }
  input.addEventListener('input',()=>{filters.search=input.value;refreshResults();});
  input.addEventListener('blur',()=>{
    // A native blur happens between pointerdown and pointertap. Keep the
    // pressed Pixi controls alive so Clear/dropdowns still receive that tap.
    const search=controls.get('search');
    if(root.visible&&search&&!search.destroyed){const frame=search.children[0];frame.clear();paintRelicPanel(frame,0,0,search.hitArea.width,search.hitArea.height,RELIC.stone,RELIC.brass,1);}
  });
  viewport.on('wheel',event=>{event.stopPropagation();hideMenu();setScroll(scroll+(event.deltaY??event.nativeEvent?.deltaY??0)*2);});
  viewport.on('pointerdowncapture',event=>{
    hideMenu();input.blur();drag={y:event.global.y,scroll,pointerId:event.pointerId,moved:false};
  });
  viewport.on('globalpointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    const distance=event.global.y-drag.y;
    if(Math.abs(distance)>12)drag.moved=true;
    if(drag.moved){suppressTapUntil=performance.now()+300;setScroll(drag.scroll-distance);}
  });
  const endDrag=()=>{if(drag?.moved)suppressTapUntil=performance.now()+300;drag=null;};
  for(const event of ['pointerup','pointerupoutside','pointercancel'])viewport.on(event,endDrag);
  const dragBar=event=>{const {height,max}=scrollThumb();setScroll((event.global.y-VIEW.y-barDrag.offset)/Math.max(1,VIEW.height-height)*max);};
  scrollbar.on('pointerdown',event=>{event.stopPropagation();const {height,y}=scrollThumb();barDrag={offset:event.global.y>=y&&event.global.y<=y+height?event.global.y-y:height/2};dragBar(event);});
  scrollbar.on('globalpointermove',event=>{if(barDrag)dragBar(event);});
  for(const event of ['pointerup','pointerupoutside','pointercancel'])scrollbar.on(event,()=>{barDrag=false;});

  function open() {
    if(root.visible)return;
    state=getState();if(!state)return;
    focusBefore=document.activeElement;filters=emptyFilters();input.value='';input.disabled=false;
    progression=getResearchProgression(state);cards=getResearchLibraryCards(state);faces.clear();
    root.visible=true;onOpen?.();drawChrome();refreshResults();artRevision=getArtRevision();
  }
  function close() {
    if(!root.visible)return;
    root.visible=false;input.disabled=true;input.blur();hideMenu();drag=null;barDrag=false;
    tooltipView.hide({force:true});clearChildren(ink);pieces=[];faces.clear();onClose?.();focusBefore?.focus?.();
  }
  function handleKeyDown(event) {
    if(!root.visible||event.defaultPrevented)return;
    if(tooltipView.getDebugState().pinned)return;
    if(event.key==='Escape'){
      if(activeMenu)hideMenu();else if(document.activeElement===input)input.blur();else close();
      event.preventDefault();return;
    }
    if(document.activeElement===input)return;
    if(event.key==='/'||(event.key.toLowerCase()==='f'&&(event.ctrlKey||event.metaKey))){event.preventDefault();input.focus();drawFields();return;}
    const targets={PageDown:scroll+VIEW.height-90,PageUp:scroll-VIEW.height+90,ArrowDown:scroll+120,ArrowUp:scroll-120,Home:0,End:layout.height};
    if(event.key in targets){event.preventDefault();setScroll(targets[event.key]);}
  }
  return {open,close,handleKeyDown,isOpen:()=>root.visible,update:()=>{
    if(root.visible&&getArtRevision()!==artRevision){artRevision=getArtRevision();renderVisible(true);}
  },getSemanticSnapshot:()=>({
    open:root.visible,renderer:'pixi',research:progression?.research??null,totalCards:cards.length,filteredCount:filtered.length,
    filters:{...filters},scroll,maxScroll:Math.max(0,layout.height-VIEW.height),viewport:{...VIEW},practiceSize:{...RESEARCH_PRACTICE_SIZE},
    tiers:layout.groups.map(({id,chance,threshold,unlocked,count})=>({id,chance,threshold,unlocked,count})),
    menu:activeMenu?{id:activeMenu,page:menuPage,options:fieldOptions(activeMenu).slice(menuPage*7,menuPage*7+7).map(([value,label])=>({value,label}))}:null,
    controls:[...controls].filter(([,node])=>!node.destroyed).map(([id,node])=>({id,...node.toGlobal(new PIXI.Point(node.hitArea.width/2,node.hitArea.height/2))})),
    visibleCards:pieces.filter(({piece})=>{const rect=piece.getBounds();return rect.y+rect.height>VIEW.y&&rect.y<VIEW.y+VIEW.height;})
      .map(({card,piece})=>{const rect=piece.getBounds();return {id:card.id,label:card.def.label,kind:card.kind,pool:card.def.pool,tier:card.tier,faceSize:{width:piece.pieceGeometry.width*piece.scale.x,height:piece.pieceGeometry.height*piece.scale.y},rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},point:{x:rect.x+rect.width/2,y:Math.max(VIEW.y+10,Math.min(VIEW.y+VIEW.height-10,rect.y+rect.height/2))}};}),
  })};
}
