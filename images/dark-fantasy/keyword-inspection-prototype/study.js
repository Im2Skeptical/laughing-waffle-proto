// Real Pixi inspector + prototype-only recursive keyword panels. Three
// navigation layouts share the game's fullscreen / mobile landscape flow.
import { getGamepieceFace } from '../../../src/model/gamepiece-presentation.js';
import { addChronicleInspection } from '../../../src/views/chronicle-inspection.js';
import { preloadChronicleArt } from '../../../src/views/chronicle-art.js';
import { attachDevPreviewDisplay } from '../../../src/views/dev-preview-display.js';
import { paintRelicPanel, RELIC } from '../../../src/views/chronicle-skin.js';
import { TEXT_STYLES } from '../../../src/views/settlement-theme.js';
import { keywordCopy } from './linked-copy-pixi.js';
import { terms } from './terms.js';

const $=id=>document.getElementById(id),host=$('inspection');
const variants={A:'Beside the word',B:'Reference rail',C:'Reading trail'},tiers=['bronze','silver','gold','diamond'];
const ids=[...$('card').options].map(option=>option.value),W=2000;
let variant=new URL(location.href).searchParams.get('variant')??'A';if(!variants[variant])variant='A';
let app,display,face,inspector,referenceLayer,targets=[],viewports=[],H=940,anchor=null,path=[],pinned=false,originAction=null;
let pending=false,focusAction=null,referenceScroll=0,trailStart=0,backdrop;
for(const id of ids)for(const trait of getGamepieceFace({tSec:0},'practice',id).stockTraits??[])terms[trait]??=`A Stock trait. Stock with ${trait} can satisfy matching inputs or Charge triggers. One unit can carry several Stock traits.`;

const register=(node,info)=>targets.push({node,...info});
const linkCopy=keywordCopy({register,open:openTerm});
function text(parent,value,x,y,size=36,width,header=false) {
  const node=new PIXI.Text(value,{...(header?TEXT_STYLES.header:TEXT_STYLES.body),fontSize:size,lineHeight:size*1.35,fill:RELIC.bone,wordWrap:!!width,wordWrapWidth:width});
  node.position.set(x,y);parent.addChild(node);return node;
}
function control(parent,label,x,y,width,action,run,{group='chrome',viewport,panelIndex}={}) {
  const node=new PIXI.Container();node.position.set(x,y);
  const bg=new PIXI.Graphics();paintRelicPanel(bg,0,0,width,88,RELIC.stone,RELIC.brass,2);node.addChild(bg);
  const copy=text(node,label,width/2,44,32);copy.anchor.set(.5);copy.eventMode='none';
  node.eventMode='static';node.cursor='pointer';node.hitArea=new PIXI.Rectangle(0,0,width,88);node.prototypeControl=true;
  node.accessible=true;node.accessibleType='button';node.accessibleTitle=label;
  node.on('pointertap',event=>{event.stopPropagation();run();});
  parent.addChild(node);register(node,{group,action,viewport,panelIndex});return node;
}
function queueDraw(focus) {focusAction=focus??focusAction;if(pending||!app)return;pending=true;requestAnimationFrame(()=>{pending=false;draw();});}
function updateState() {
  $('state').textContent=`${variant} · ${variants[variant]} · ${path.length?path.join(' › '):'No reference open'}${pinned?' · Pinned':''}`;
  $('spoken-reference').textContent=path.length?`${path.at(-1)}. ${terms[path.at(-1)]}`:'';
}
function openTerm(term,node,panelIndex) {
  if(!path.length) {anchor=node.getBounds().clone();originAction=`term:${term}`;}
  if(variant==='C'&&panelIndex!=null)path=path.slice(0,panelIndex+1);
  if(path.at(-1)!==term)path.push(term);
  referenceScroll=0;trailStart=Math.max(0,path.length-2);queueDraw('back');
}
function closeReference() {path=[];pinned=false;referenceScroll=0;anchor=null;queueDraw(originAction);originAction=null;}
function back() {path.pop();referenceScroll=0;trailStart=Math.max(0,path.length-2);if(path.length)queueDraw('back');else closeReference();}
function changeCard(direction) {
  $('card').value=ids[(ids.indexOf($('card').value)+direction+ids.length)%ids.length];
  if(!pinned)path=[];inspector=null;queueDraw();
}
function selectVariant(next,updateUrl=true) {
  variant=next;referenceScroll=0;trailStart=Math.max(0,path.length-2);
  if(updateUrl) {const url=new URL(location.href);url.searchParams.set('variant',variant);history.replaceState(null,'',url);}
  queueDraw();
}
function cycleVariant(direction) {const keys=Object.keys(variants);selectVariant(keys[(keys.indexOf(variant)+direction+keys.length)%keys.length]);}

function scrollViewport(parent,content,rect,group,{initial=0,onScroll=()=>{}}={}) {
  const viewport=new PIXI.Container();viewport.position.set(rect.x,rect.y);parent.addChild(viewport);viewport.addChild(content);
  const mask=new PIXI.Graphics().beginFill(0xffffff).drawRect(0,0,rect.width,rect.height).endFill();viewport.addChild(mask);content.mask=mask;
  let scroll=0,drag=null;const max=Math.max(0,content.readingHeight-rect.height);
  const move=value=>{scroll=Math.max(0,Math.min(max,value));content.y=-scroll;onScroll(scroll);};
  viewport.eventMode='static';viewport.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);
  viewport.on('wheel',event=>{event.stopPropagation();move(scroll+(event.deltaY??event.nativeEvent?.deltaY??0));});
  viewport.on('pointerdown',event=>{event.stopPropagation();drag={y:viewport.toLocal(event.global).y,scroll};});
  viewport.on('pointermove',event=>{if(drag)move(drag.scroll+drag.y-viewport.toLocal(event.global).y);});
  for(const type of ['pointerup','pointerupoutside','pointercancel'])viewport.on(type,()=>{drag=null;});
  move(initial);viewports.push({node:viewport,group,getScroll:()=>scroll,max});return viewport;
}
function panel(term,index,x,y,width,height) {
  const current=index===path.length-1,panel=new PIXI.Container();panel.position.set(x,y);referenceLayer.addChild(panel);
  panel.keywordPanel=true;
  const bg=new PIXI.Graphics();paintRelicPanel(bg,0,0,width,height,0x1b211d,RELIC.gold,3);panel.addChild(bg);
  panel.eventMode='static';panel.hitArea=new PIXI.Rectangle(0,0,width,height);panel.on('pointertap',event=>event.stopPropagation());
  const group=current?'reference':'history';
  if(current) {
    control(panel,'‹ Back',22,18,152,'back',back,{group});
    control(panel,pinned?'Pinned':'Pin',186,18,140,'pin',()=>{pinned=!pinned;queueDraw('pin');},{group});
    control(panel,'×',width-106,18,84,'close',closeReference,{group});
  } else control(panel,'Return here',22,18,220,`return:${index}`,()=>{path=path.slice(0,index+1);referenceScroll=0;queueDraw('back');},{group});
  const content=new PIXI.Container();let cy=0;
  if(variant!=='C'&&path.length>1) {
    let cx=0;
    for(let i=0;i<path.length-1;i++) {
      const itemWidth=Math.min(widthFor(path[i]),width-48);
      if(cx+itemWidth>width-48) {cx=0;cy+=96;}
      control(content,path[i],cx,cy,itemWidth,`return:${i}`,()=>{path=path.slice(0,i+1);referenceScroll=0;queueDraw('back');},{group,panelIndex:index});cx+=itemWidth+8;
    }
    cy+=104;
  }
  const heading=text(content,term,0,cy,48,width-48,true);cy+=heading.height+20;
  const body=text(content,terms[term],0,cy,38,width-48);cy+=body.height+24;
  content.readingHeight=cy;
  const viewport=scrollViewport(panel,content,{x:24,y:126,width:width-48,height:height-160},group,{initial:current?referenceScroll:0,onScroll:value=>{if(current)referenceScroll=value;}});
  for(const target of targets)if(target.panelIndex===index&&!target.viewport)target.viewport=viewport;
  linkCopy(content,group,viewport,term,index);
  if(cy>height-160)text(panel,'Drag or scroll to read',24,height-32,22);
  return panel;
}
function widthFor(label) {return Math.max(150,Math.ceil(PIXI.TextMetrics.measureText(label,new PIXI.TextStyle({...TEXT_STYLES.body,fontSize:30})).width)+36);}
function drawReferences() {
  referenceLayer=new PIXI.Container();app.stage.addChild(referenceLayer);
  if(!path.length)return;
  if(variant==='A') {
    const width=850,height=Math.min(700,H-220),box=anchor??{x:W/2,y:H/2,height:0};
    const x=Math.max(24,Math.min(box.x,W-width-24)),below=box.y+box.height+20;
    const y=Math.max(114,Math.min(below+height<=H-110?below:box.y-height-20,H-height-110));
    panel(path.at(-1),path.length-1,x,y,width,height);
  } else if(variant==='B')panel(path.at(-1),path.length-1,W-874,114,850,H-226);
  else {
    const height=Math.min(610,H-250),width=900,gap=22;
    trailStart=Math.min(trailStart,Math.max(0,path.length-2));
    for(let i=trailStart;i<Math.min(path.length,trailStart+2);i++)panel(path[i],i,80+(i-trailStart)*(width+gap),H-height-112,width,height);
    if(trailStart)control(referenceLayer,'‹ Earlier',20,118,190,'earlier',()=>{trailStart=Math.max(0,trailStart-1);queueDraw();},{group:'reference'});
    if(trailStart+2<path.length)control(referenceLayer,'Later ›',W-218,118,190,'later',()=>{trailStart++;queueDraw();},{group:'reference'});
  }
}
function draw() {
  if(!app)return;
  const hadKeyboardFocus=!!document.activeElement?.closest('.pixi-accessibility');
  // Pixi's accessibility blur dispatches to its display object. Blur while
  // that object is still attached, before replacing the preview's scene.
  if(hadKeyboardFocus)app.view.focus({preventScroll:true});
  const scroll=inspector?{rules:inspector.getScroll(),glossary:inspector.getGlossaryScroll()}:{rules:0,glossary:0};
  H=Math.max(900,Math.round(W*host.clientHeight/host.clientWidth));app.renderer.resize(W,H);
  for(const child of app.stage.removeChildren())child.destroy({children:true});targets=[];viewports=[];
  const background=new PIXI.Sprite(backdrop);background.width=W;background.height=H;app.stage.addChild(background);
  app.stage.addChild(new PIXI.Graphics().beginFill(0x070b0c,.86).drawRect(0,0,W,H).endFill());
  face=getGamepieceFace({tSec:0},'practice',$('card').value,$('tier').value);
  control(app.stage,'‹',20,14,100,'previousCard',()=>changeCard(-1));text(app.stage,face.label,140,28,36,620,true);
  control(app.stage,'›',784,14,100,'nextCard',()=>changeCard(1));
  control(app.stage,`${$('tier').value[0].toUpperCase()+$('tier').value.slice(1)} quality`,910,14,290,'quality',()=>{$('tier').value=tiers[(tiers.indexOf($('tier').value)+1)%tiers.length];if(!pinned)path=[];inspector=null;queueDraw();});
  text(app.stage,'KEYWORD STUDY',1230,40,26,420);
  inspector=addChronicleInspection(app.stage,{x:16,y:118,width:W-32,height:H-226},{face});
  inspector.closeControl.visible=false; // shared Fullscreen/Exit owns this persistent preview
  inspector.setScroll(scroll.rules);inspector.setGlossaryScroll(scroll.glossary);
  for(const [group,content,getScroll] of [['rules',inspector.rules,inspector.getScroll],['glossary',inspector.glossary,inspector.getGlossaryScroll]]) {
    const viewport=content.parent;linkCopy(content,group,viewport);
    viewports.push({node:viewport,group,getScroll,max:Math.max(0,content.readingHeight-viewport.hitArea.height)});
  }
  drawReferences();
  const footer=new PIXI.Container();footer.position.set(0,H-100);app.stage.addChild(footer);
  control(footer,'←',520,0,110,'previousVariant',()=>cycleVariant(-1));text(footer,`${variant} · ${variants[variant]}`,665,24,34,670);
  control(footer,'→',1370,0,110,'nextVariant',()=>cycleVariant(1));
  text(footer,path.length?`${path.length} references${pinned?' · Pinned':''}`:'Tap an underlined word',24,28,26,465);
  updateState();app.render();
  if(focusAction) {
    const label=targets.find(target=>target.action===focusAction&&target.group===(path.length?'reference':'rules'))?.node.accessibleTitle;
    if(hadKeyboardFocus)requestAnimationFrame(()=>{const button=[...host.querySelectorAll('.pixi-accessibility button')].find(node=>node.title===label);(button??app.view).focus({preventScroll:true});});
    focusAction=null;
  }
}
function within(node,parent) {for(let current=node;current;current=current.parent)if(current===parent)return true;return false;}
function logicalBounds(node) {const area=node.hitArea??node.getLocalBounds(),point=node.toGlobal(new PIXI.Point(area.x,area.y));return {x:point.x,y:point.y,width:area.width*node.worldTransform.a,height:area.height*node.worldTransform.d};}
function clipped(target) {
  let rect=logicalBounds(target.node);
  if(target.viewport) {
    const clip=logicalBounds(target.viewport),right=Math.min(rect.x+rect.width,clip.x+clip.width),bottom=Math.min(rect.y+rect.height,clip.y+clip.height);
    rect={x:Math.max(rect.x,clip.x),y:Math.max(rect.y,clip.y),width:right-Math.max(rect.x,clip.x),height:bottom-Math.max(rect.y,clip.y)};
  }
  return rect.width>4&&rect.height>4&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=W+1&&rect.y+rect.height<=H+1?rect:null;
}
function pageBounds(rect) {
  const canvas=app.view.getBoundingClientRect(),matrix=new DOMMatrix(getComputedStyle(host).transform==='none'?undefined:getComputedStyle(host).transform);
  if(Math.abs(matrix.b)>.5)return {x:canvas.right-(rect.y+rect.height)/H*canvas.width,y:canvas.top+rect.x/W*canvas.height,width:rect.height/H*canvas.width,height:rect.width/W*canvas.height};
  return {x:canvas.x+rect.x/W*canvas.width,y:canvas.y+rect.y/H*canvas.height,width:rect.width/W*canvas.width,height:rect.height/H*canvas.height};
}
async function boot() {
  await preloadChronicleArt({includeSettlementPieces:true});
  backdrop=await PIXI.Assets.load('images/dark-fantasy/card-chrome-prototype/settlement-reference.png');
  app=new PIXI.Application({width:W,height:H,backgroundColor:RELIC.night,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true});
  app.view.tabIndex=0;app.view.setAttribute('aria-label','Practice keyword inspector. Tap or Tab to an underlined term to explore its meaning.');host.append(app.view);
  app.renderer.plugins.accessibility.div.classList.add('pixi-accessibility');app.stage.eventMode='static';
  // The shared portrait fallback rotates the canvas in CSS. Pixi's default
  // bounds-only mapping needs the inverse rotation for actual word taps.
  const mapPosition=app.renderer.events.mapPositionToPoint.bind(app.renderer.events);
  app.renderer.events.mapPositionToPoint=(point,x,y)=>{
    const transform=getComputedStyle(host).transform,matrix=new DOMMatrix(transform==='none'?undefined:transform);
    if(Math.abs(matrix.b)>.5) {const rect=app.view.getBoundingClientRect();point.x=(y-rect.top)/rect.height*W;point.y=(rect.right-x)/rect.width*H;}
    else mapPosition(point,x,y);
  };
  app.stage.on('pointertapcapture',event=>{if(path.length&&!pinned&&!within(event.target,referenceLayer)&&!event.target.keywordTerm&&!event.target.prototypeControl)closeReference();});
  display=attachDevPreviewDisplay(host,{onChange:()=>queueDraw()});new ResizeObserver(()=>queueDraw()).observe(host);
  app.ticker.add(()=>{for(const target of targets)target.node.accessible=!!clipped(target)&&(!path.length||['reference','history','chrome'].includes(target.group));});
  draw();$('card').disabled=false;$('tier').disabled=false;
  window.keywordWorkbench={get state(){return {variant,card:face.definitionId,tier:face.tier,path:[...path],pinned,fullscreen:display.active,renderer:'pixi',referencePanels:referenceLayer.children.filter(node=>node.keywordPanel).length};},
    get targets(){return targets.flatMap(target=>{const rect=clipped(target);return rect?[{group:target.group,action:target.action,panelIndex:target.panelIndex,...pageBounds(rect)}]:[];});},
    get viewports(){return viewports.map(viewport=>({group:viewport.group,scroll:viewport.getScroll(),max:viewport.max,...pageBounds(logicalBounds(viewport.node))}));},
    get reading(){return face.reading;}};
  document.body.dataset.ready='true';
}
for(const id of ['card','tier'])$(id).addEventListener('change',()=>{if(!pinned)path=[];inspector=null;queueDraw();});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&path.length) {event.preventDefault();back();}
  if(['ArrowLeft','ArrowRight'].includes(event.key)&&!event.target.closest('input,textarea,select,[contenteditable]')) {event.preventDefault();cycleVariant(event.key==='ArrowRight'?1:-1);}
});
window.addEventListener('popstate',()=>selectVariant(variants[new URL(location.href).searchParams.get('variant')]?new URL(location.href).searchParams.get('variant'):'A',false));
boot().catch(error=>{$('state').textContent=`Unable to load the keyword study: ${error.message}`;});
