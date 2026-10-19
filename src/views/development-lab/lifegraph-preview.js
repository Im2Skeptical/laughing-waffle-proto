import { drawLifeMapNodeIcon } from '../life-map-node-icon.js';
import { layoutChronicleNodes } from '../timeline-presentation.js';
import { getVassalLifeMapNodeFamily } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { preloadChronicleArt, getArtRevision } from '../chronicle-art.js';
import { el, button, select, field } from './elements.js';

export function createLifegraphPreview({controller,onPlay}){
  const root=el('section','','lab-lifegraph-preview');
  const controls=el('div','','lab-controls'),viewport=el('div','','lab-lifegraph-graph-scroll');
  const app=new PIXI.Application({width:1800,height:700,backgroundColor:0x111c21,antialias:true,resolution:1});
  app.stage.eventMode='static';app.stage.hitArea=app.screen;
  app.view.dataset.testid='lifegraph-preview';app.view.setAttribute('aria-label','Lifegraph preview using game node graphics. Select a node below or click an icon.');
  viewport.append(app.view);let graphKey='',revision=-1,points=new Map();
  let zoom=1;
  const fit=()=>{viewport.style.setProperty('--lifegraph-zoom',String(zoom));};
  controls.append(button('Zoom in',()=>{zoom=Math.min(3,zoom+0.25);fit();}),button('Zoom out',()=>{zoom=Math.max(1,zoom-0.25);fit();}),button('Fit graph',()=>{zoom=1;fit();},'','quiet'));
  const picker=select('Graph node',[]);picker.addEventListener('change',()=>controller.selectNode(picker.value));
  controls.append(field('Select node',picker),button('Play selected node',()=>onPlay(controller.getSnapshot().selectedNodeId),'lifegraph-play-node','primary'));
  root.append(controls,viewport);fit();
  function refresh(){
    const {graph,selectedNodeId}=controller.getSnapshot();
    const key=JSON.stringify([graph,selectedNodeId,getArtRevision()]);if(key===graphKey)return;graphKey=key;
    app.stage.removeChildren().forEach(child=>child.destroy({children:true}));picker.replaceChildren();points=new Map();
    if(!graph)return;
    points=layoutChronicleNodes(graph.nodes,{x:78,y:110,width:1640,height:475});
    const byId=new Map(graph.nodes.map(n=>[n.id,n])),lines=new PIXI.Graphics();app.stage.addChild(lines);
    for(const e of graph.edges){const a=points.get(e.fromNodeId),b=points.get(e.toNodeId);const selected=e.fromNodeId===selectedNodeId||e.toNodeId===selectedNodeId;
      lines.lineStyle(selected?4:2,selected?0xe0c785:0x576c69,selected?1:0.65).moveTo(a.x,a.y).lineTo(b.x,b.y);}
    for(let depth=Math.min(...graph.nodes.map(n=>n.depth));depth<=Math.max(...graph.nodes.map(n=>n.depth));depth++){
      const n=graph.nodes.find(n=>n.depth===depth);if(!n)continue;const x=points.get(n.id).x;
      const column=graph.generatorConfig.design.columns.find(c=>c.id===n.milestoneId);
      const heading=n.bookend==='founding'?(depth===-1?'Founding':`${depth+1} · Founding`):n.bookend==='legacy'?(depth===graph.generatorConfig.normalDepthCount?'Legacy':`${depth+1} · Legacy`):column?`${depth+1} · ${column.label}`:`${depth+1} · ${n.band==='mid'?'middle':n.band}`;
      if(column||n.bookend){const band=new PIXI.Graphics();band.beginFill(0xc3a45e,.08).drawRoundedRect(x-54,72,108,555,12).endFill();app.stage.addChild(band);}
      const text=new PIXI.Text(heading,{fontFamily:'Arial',fontSize:15,fill:column?0xe5cd8a:0xc7cbb8,wordWrap:true,wordWrapWidth:140,align:'center'});text.anchor.set(.5);text.position.set(x,28);app.stage.addChild(text);
    }
    for(const n of graph.nodes){
      const p=points.get(n.id),family=getVassalLifeMapNodeFamily(n),selected=n.id===selectedNodeId;
      const container=new PIXI.Container();container.position.set(p.x,p.y);container.eventMode='static';container.cursor='pointer';container.hitArea=new PIXI.Rectangle(-58,-46,116,100);
      const graphic=new PIXI.Graphics();if(selected)graphic.lineStyle(3,0xf1d38b).beginFill(0x293d36,.9).drawRoundedRect(-48,-48,96,106,13).endFill();
      drawLifeMapNodeIcon(graphic,n,{fill:family?.color??0x82967b,accent:selected?0xffe4a3:0xe8d9ab,outline:0x101a19,scale:.8});container.addChild(graphic);
      const label=new PIXI.Text(family?.label??n.family,{fontFamily:'Arial',fontSize:14,fill:0xf2ead3,align:'center',wordWrap:true,wordWrapWidth:118});label.anchor.set(.5,0);label.position.set(0,40);container.addChild(label);
      if(n.generationRuleId){const dot=new PIXI.Graphics();dot.beginFill(0xdac17b).drawCircle(35,-35,5).endFill();container.addChild(dot);}
      container.on('pointertap',event=>{if(event.detail===2)onPlay(n.id);else controller.selectNode(n.id);});app.stage.addChild(container);
      const option=el('option',`${n.depth+1} · lane ${n.lane+1} · ${family?.label??n.family}`);option.value=n.id;picker.append(option);
    }
    picker.value=selectedNodeId??'';
  }
  void preloadChronicleArt().then(refresh);
  app.ticker.add(()=>{if(root.isConnected&&revision!==getArtRevision()){revision=getArtRevision();refresh();}});
  return {node:root,refresh,setVisible(visible){visible?app.start():app.stop();},getPoint(id){const p=points.get(id);if(!p)return null;const rect=app.view.getBoundingClientRect();return {x:rect.x+p.x*rect.width/1800,y:rect.y+p.y*rect.height/700};},destroy(){app.destroy(true,{children:true});root.remove();}};
}
