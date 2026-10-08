import { createWorldMapView } from '../world-map-pixi.js';
import { createMetricGraphView } from '../timegraphs-pixi.js';
import { createSunAndMoonDisksView, SUN_AND_MOON_DISKS_LAYOUT } from '../sunandmoon-disks-pixi.js';
import { createTooltipView } from '../tooltip-pixi.js';
import { GRAPH_METRICS } from '../../model/graph-metrics.js';
import { getActiveGraphGroups, toggleGraphGroup } from '../ui-root/settlement-graph-groups.js';
import { el, field, select, input, disclosure, isNarrow } from './elements.js';
import { attachDevPreviewDisplay } from '../dev-preview-display.js';

// One persistent stage: DOM edits never interrupt a map/wheel/graph gesture.
export function createLabScene({getController,run,onReview}) {
  const node=el('section','','lab-scene'), controls=el('div','','lab-controls');
  const display={}, groupPanel=el('details','','lab-disclosure lab-scene-series'), seriesPanel=el('div','','lab-controls');
  let scope='settlement', visibleIds=['food','gold','totalPopulation','housingCapacity'];
  let lastController=null, lastTimeline=null, lastHorizon=null;
  const state=()=>getController().getSnapshot().state;
  const snapshot=()=>getController().getSnapshot();
  const graphController=()=>getController().getGraphController();
  const graphAdapter=new Proxy({}, {get:(_target,key)=>(...args)=>graphController()[key]?.(...args)});
  const allSeries=()=>GRAPH_METRICS[scope].getSeries(null,state());
  function configureSeries() {
    graphController().setMetric(GRAPH_METRICS[scope]);
    graphController().setSubject(scope==='settlement'?snapshot().regionId:null);
    graphController().setSeries(allSeries().filter(s=>visibleIds.includes(s.id)));
  }
  function toggleGroup(id) {
    visibleIds=toggleGraphGroup(id,visibleIds,scope,allSeries());
    configureSeries(); renderSeries();
  }
  function renderSeries() {
    seriesPanel.replaceChildren();
    for(const series of allSeries()) {
      const check=input(`Plot ${series.label}`,'','checkbox');check.checked=visibleIds.includes(series.id);
      check.addEventListener('change',()=>{visibleIds=check.checked?[...visibleIds,series.id]:visibleIds.filter(id=>id!==series.id);configureSeries();});
      seriesPanel.append(field(series.label,check));
    }
  }
  const scopeSelect=select('Graph scope',[['settlement','Selected settlement'],['civilization','Civilization']],scope);
  const setScope=value=>{scope=value;scopeSelect.value=value;configureSeries();renderSeries();};
  scopeSelect.addEventListener('change',()=>setScope(scopeSelect.value));
  controls.append(field('Trends',scopeSelect));
  // Map layers and graph series are long checkbox lists, so each folds away.
  const layers=el('div','','lab-controls');
  for(const [key,label] of Object.entries({terrain:'Terrain',scenery:'Scenery',connections:'Connections',workers:'Workers',structures:'Structures',actors:'Actors',alerts:'Alerts'})) {
    const check=input(`Map ${label}`,'','checkbox');check.checked=true;
    check.addEventListener('change',()=>{display[key]=check.checked;map.refresh();});
    layers.append(field(label,check));
  }
  const seriesSummary=el('summary');seriesSummary.append(el('span','Graph series','lab-disclosure-title'));
  groupPanel.append(seriesSummary,seriesPanel);
  node.append(controls,disclosure('Map layers',[layers],{key:'scene:layers',open:!isNarrow(),count:7}),groupPanel);
  const viewport=el('div','','lab-scene-viewport');node.append(viewport);
  const displayMode=attachDevPreviewDisplay(viewport);
  const app=new PIXI.Application({width:2424,height:1200,backgroundColor:0x111c21,antialias:true,resolution:1});
  app.stage.eventMode='static';app.stage.hitArea=app.screen;
  // Pixi enables its DOM accessibility overlay after Tab. Its full-size parent
  // must pass pointer input through to the map/wheels; child buttons stay usable.
  const accessibility=app.renderer.plugins.accessibility;
  if(accessibility?.div)accessibility.div.style.pointerEvents='none';
  app.view.setAttribute('aria-label','Interactive world map, timegraph and timewheel');
  app.view.dataset.testid='lab-scene';viewport.append(app.view);
  const mapLayer=new PIXI.Container(), graphLayer=new PIXI.Container(), wheelLayer=new PIXI.Container(), overlay=new PIXI.Container();
  app.stage.addChild(mapLayer,graphLayer,wheelLayer,overlay);
  const tooltip=createTooltipView({layer:overlay,app,onReview});
  const chooseRegion=id=>{setScope('settlement');run(()=>getController().selectRegion(id));};
  const map=createWorldMapView({layer:mapLayer,getState:state,getSelectedRegionId:()=>snapshot().regionId,
    getRegionSelectionActive:()=>true,getGraphScope:()=>scope,setSelectedRegionId:chooseRegion,
    onOpenDetailedSite:(_site,id)=>chooseRegion(id),getDisplayOptions:()=>display,
    onShowCivilizationGraph:()=>setScope('civilization'),onShowSelectedRegionGraph:chooseRegion,tooltipView:tooltip});
  const seek=(second,fromGraph=false)=>{
    if(second!==state().tSec)run(()=>getController().seek(second),{fromGraph});
    return {ok:true};
  };
  const bounds=()=>({minSec:snapshot().branchSec,maxSec:snapshot().endSec,minEditableSec:snapshot().branchSec});
  const graph=createMetricGraphView({app,layer:graphLayer,controller:graphAdapter,tooltipView:tooltip,
    getMetricDef:()=>GRAPH_METRICS[scope],getTimeline:()=>getController().getTimeline(),getCursorState:state,
    getPreviewStatus:()=>({isForecastPreview:state().tSec>snapshot().branchSec,previewSec:state().tSec}),
    canAutoPreviewForecastReveal:()=>false,getEditableHistoryBounds:bounds,
    setPreviewState:next=>seek(next.tSec,true),clearPreviewState:()=>{},commitSecond:second=>seek(second,true),
    commitForecastOnScrubRelease:true,forecastPreviewStatusNote:'Lab preview',
    getWindowSpec:({zoomed})=>({minSec:zoomed?Math.max(snapshot().branchSec,state().tSec-15):snapshot().branchSec,
      maxSec:zoomed?Math.min(snapshot().endSec,state().tSec+30):snapshot().endSec,scrubSec:state().tSec}),
    openPosition:{x:16,y:848},windowWidth:1980,windowHeight:332,headerHeight:42,
    forecastRevealTargetDurationSec:.01,forecastRevealMinRateSecPerSec:100000,
    plotSnapshotBoundsQuantumSec:1,plotSnapshotCoverForecast:true,
    getActiveSeriesGroups:()=>getActiveGraphGroups(visibleIds,scope,allSeries()),onToggleSeriesGroup:toggleGroup,
    onToggleSystemTargetMode:()=>{groupPanel.open=!groupPanel.open;},showClose:false,showPin:false,draggable:false});
  const layout={...SUN_AND_MOON_DISKS_LAYOUT,
    moon:{...SUN_AND_MOON_DISKS_LAYOUT.moon,x:2206,y:1010,scale:.46},
    season:{...SUN_AND_MOON_DISKS_LAYOUT.season,x:2206,y:1010,scale:.75}};
  const wheel=createSunAndMoonDisksView({app,layer:wheelLayer,referenceLayer:overlay,layout,tooltipView:tooltip,
    getState:state,getTimeline:()=>getController().getTimeline(),getEditableHistoryBounds:bounds,
    getForecastPreviewCapSec:()=>snapshot().endSec,browseCursorSecond:seek,commitCursorSecond:seek,
    previewCursorSecond:seek,clearPreviewState:()=>{},commitPreviewToLive:()=>({ok:true}),
    requestPauseBeforeDrag:()=>graph.resetForecastPreviewState()});
  map.init();wheel.init();
  function refresh() {
    const ctl=getController(), timeline=ctl.getTimeline(), horizon=snapshot().horizonSec;
    configureSeries();
    if(ctl!==lastController||timeline!==lastTimeline||horizon!==lastHorizon) {
      lastController=ctl;lastTimeline=timeline;lastHorizon=horizon;
      graphController().ensureCache();
      graphController().ensureForecastCoverageTo(snapshot().endSec);
      graph.resetDataContext();
      graph.open();graph.suspendForecastRevealPlayheadFollow();
      renderSeries();
    }
    map.refresh();
  }
  app.ticker.add(()=>{if(!node.isConnected)return;graphController().update();map.update();wheel.update();graph.render();});
  return {node,refresh,clearPreview:()=>graph.resetForecastPreviewState(),
    getSnapshot:()=>({map:map.getSemanticSnapshot(),graph:graph.getDebugState(),plot:graph.getPlotScreenRect(),wheel:{...wheel.getSemanticSnapshot(),dragging:wheel.isDragging()}}),
    getRegionClickPoint:id=>map.getRegionClickPoint(id),
    destroy(){displayMode.destroy();map.destroy();graph.destroy();wheel.destroy();tooltip.destroy?.();app.destroy(true,{children:true});}};
}
