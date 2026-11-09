import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState } from '../src/model/state.js';
import { createWorldMapView } from '../src/views/world-map-pixi.js';
import { prepareChronicleArt } from '../src/views/chronicle-art.js';

export async function readyMapFixture() {
  const app=new PIXI.Application({width:2424,height:1080,backgroundColor:0x101919,antialias:true});
  app.view.style.cssText='position:fixed;left:0;top:0;width:100vw;height:auto;z-index:2147483647';
  document.body.append(app.view);
  const state=createNewGameState(1867);
  // A declared presentation fixture exercises an island connection even when
  // this seed's random starting roads avoid it. No game initializer is changed.
  state.world.connections.push({regionAId:'R09',regionBId:'R17'});
  const before=JSON.stringify(serializeGameState(state));
  let second=0;
  const view=createWorldMapView({layer:app.stage,getState:()=>state,getVisualTime:()=>second,
    getSelectedRegionId:()=>state.civilization.capitalRegionId,getRegionSelectionActive:()=>false});
  view.init();
  globalThis.readyMapStage='shared artwork';
  await prepareChronicleArt(app.renderer);
  globalThis.readyMapStage='terrain';
  const reveal=await view.prepareProgressive(app.renderer,()=>Promise.resolve(),()=>true);
  reveal?.();await view.prepare(app.renderer);view.refresh();
  view.update(0);app.renderer.render(app.stage);
  app.ticker.add(()=>view.update(1/60));
  const walk=node=>[node,...(node.children??[]).flatMap(walk)];
  const report=()=>{
    const snapshot=view.getSemanticSnapshot();
    const nodes=walk(app.stage);
    return {ready:snapshot.illustratedTerrain?.ready,roads:snapshot.illustratedTerrain?.roads,
      zoom:snapshot.camera.zoom,
      connections:state.world.connections.length,ferries:nodes.filter(n=>n.label==='ferry-crossing').length,
      ferrySizes:nodes.filter(n=>n.label==='ferry-boat').map(n=>{const b=n.getBounds(),k=app.view.getBoundingClientRect().width/2424;return {width:b.width*k,height:b.height*k};}),
      unchanged:JSON.stringify(serializeGameState(state))===before};
  };
  globalThis.readyMap={app,view,state,report,setSecond(value){second=value;view.update(0);app.renderer.render(app.stage);}};
  return report();
}
