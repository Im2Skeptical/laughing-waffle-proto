import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState } from '../src/model/state.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createTimeGraphController } from '../src/model/timegraph/controller-core.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool, selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { GRAPH_METRICS } from '../src/model/graph-metrics.js';
import { createMetricGraphView } from '../src/views/timegraphs-pixi.js';
import { prepareChronicleArt } from '../src/views/chronicle-art.js';

// Real controller, old/new forecast states, scroll, reveal and pointer handlers.
export async function previousProjectionFixture() {
  const app=new PIXI.Application({width:2424,height:1080,backgroundColor:0x101817});
  app.view.style.cssText='position:fixed;inset:0;width:100vw;height:auto;z-index:2147483647';
  document.body.replaceChildren(app.view);
  await prepareChronicleArt(app.renderer);
  const state=createNewGameState(131),timeline=createTimelineFromInitialState(state),cache=createProjectionCache();
  let preview=null,commits=0;
  const controller=createTimeGraphController({getTimeline:()=>timeline,getCursorState:()=>state,projectionCache:cache,metric:GRAPH_METRICS.civilization,horizonSec:96,forecastStepSec:16});
  controller.ensureForecastCoverageTo(96);
  controller.setSeries(GRAPH_METRICS.civilization.series.filter(s=>['totalPopulation','food'].includes(s.id)));
  controller.ensureCache();controller.ensureForecastCoverageTo(96);
  // This fixture computes synchronously rather than installing a worker. Keep
  // its published coverage at the exact computed end during close/open too.
  const viewController={...controller,getData:()=>({...controller.getData(),forecastCoverageEndSec:96})};
  const view=createMetricGraphView({app,layer:app.stage,controller:viewController,metric:GRAPH_METRICS.civilization,
    getTimeline:()=>timeline,getCursorState:()=>state,getWindowSpec:()=>({minSec:0,maxSec:96}),
    getPreviewStatus:()=>({active:!!preview,isForecastPreview:!!preview,previewSec:preview?.tSec}),
    setPreviewState:s=>{preview=s;},clearPreviewState:()=>{preview=null;},
    commitSecond:()=>{commits++;},commitForecastOnScrubRelease:true,
    canAutoPreviewForecastReveal:()=>false,openPosition:{x:50,y:320},windowWidth:2324,windowHeight:353});
  view.open();view.setOpeningRevealSecond(64);view.render();
  view.stageProjectionReplacementTransition({truncationStartSec:0,maxSecFloor:96});
  selectLifeMapVassal(state,0,getVassalCandidatePool(state).expectedPoolHash);
  timeline.baseStateData=serializeGameState(state);timeline.revision++;
  cache.clear();controller.handleInvalidate('action');controller.ensureForecastCoverageTo(96);
  view.setOpeningRevealSecond(null);
  view.restartForecastRevealFrom(8,{allowForecastStart:true,revealTargetEndSec:8,activateProjectionReplacementTransition:true});
  view.render();
  const authoritative=()=>JSON.stringify({base:timeline.baseStateData,actions:timeline.actions,historyEndSec:timeline.historyEndSec,revision:timeline.revision,state:serializeGameState(state)});
  const before=authoritative();
  globalThis.previousProjection={app,view,controller,timeline,
    inspect:()=>({graph:view.getDebugState(),previewSec:preview?.tSec??null,previewVassal:getCurrentLifeMapVassal(preview)?.vassalId??null,
      liveVassal:getCurrentLifeMapVassal(state)?.vassalId,commits,unchanged:authoritative()===before}),
    point(second){const r=view.getPlotStageRect();return {x:r.x+r.width*second/96,y:r.y+r.height*.5};},
    frame:()=>{view.render();app.renderer.render(app.stage);},
    replaceThrough(second){view.restartForecastRevealFrom(second,{allowForecastStart:true,revealTargetEndSec:second});view.render();},
  };
  previousProjection.frame();
  return {cap:view.getForecastScrubCapSec(),computed:96,previousUnveiled:64};
}
