import { minimalGraphics } from '../minimal-graphics.js';
import { getGraphicsOptions } from '../graphics-options.js';
import { prepareRegionalTiles, prepareRegionalTilesSteps } from './regional-tiles.js';
import { naturalRegionalMap, regionalPresentationSpec, createRegionalPresentation } from './regional-presentation.js';
import { getRegionalMap } from '../../model/regional-map/definition.js';
import { sampleSurroundings } from '../../model/regional-map/generator.js';
import { runCooperative } from '../../../images/dark-fantasy/map-generation-prototype/cooperative.js';
import { bakePixelTerrainSteps, destroyPixelTerrain, prepareIllustratedArt, pixelSpriteTextures, reliefSpriteTextures, pixelSpriteFits } from '../../../images/dark-fantasy/map-generation-prototype/pixel-terrain.js';
import { prepareCloudArt } from '../../../images/dark-fantasy/map-generation-prototype/cloud-banks.js';
import { createZoomArt, prepareLandmarkLods } from '../../../images/dark-fantasy/map-generation-prototype/zoom-art.js';
import { getIllustratedWorldBounds } from './world-bounds.js';
import {crownCityIdentities} from './crown-urban-prototype.js';

let assets;
const yieldToUi=()=>new Promise(resolve=>setTimeout(resolve,0));
function prepareAssets(){return assets??=Promise.all([prepareIllustratedArt(),prepareCloudArt(),prepareLandmarkLods()]).catch(error=>{assets=null;throw error;});}

// The workbench's sampled field, without its three unused background textures.
function surroundingsSampler(map) {
  const bounds=map.surroundings.bounds,n=321,data=new Float32Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const f=sampleSurroundings(map.surroundings,{x:bounds.minX+x/(n-1)*(bounds.maxX-bounds.minX),y:bounds.minY+y/(n-1)*(bounds.maxY-bounds.minY)});
    data.set([f.ocean,f.highlands,f.marsh,f.scrub],(y*n+x)*4);
  }
  return (p,out=new Float32Array(4))=>{
    const x=Math.max(0,Math.min(n-1.001,(p.x-bounds.minX)/(bounds.maxX-bounds.minX)*(n-1)));
    const y=Math.max(0,Math.min(n-1.001,(p.y-bounds.minY)/(bounds.maxY-bounds.minY)*(n-1)));
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=(iy*n+ix)*4,b=a+n*4;
    for(let i=0;i<4;i++)out[i]=(data[a+i]*(1-fx)+data[a+4+i]*fx)*(1-fy)+(data[b+i]*(1-fx)+data[b+4+i]*fx)*fy;
    return out;
  };
}

export function createIllustratedTerrain(parent,rect,{getView,forceIllustrated=false,backgroundWait=null,isCurrent=()=>true}={}) {
  const container=new PIXI.Container();container.eventMode='none';parent.addChild(container);
  // Keep polygon geometry active until the entire illustrated replacement is ready.
  if (minimalGraphics && !forceIllustrated) {
    let illustrated=null,readyId=null,preparedId=null,destroyed=false;
    const stats={ready:false,bakes:0,frames:0};
    const ready=state=>!destroyed && readyId===state?.world?.definitionId && illustrated?.stats.ready;
    return {container,stats,supports:ready,worldBounds:()=>readyId?illustrated?.worldBounds():null,
      sitePoint:id=>illustrated?.sitePoint(id),roadPoints:edge=>illustrated?.roadPoints(edge),roadFerries:edge=>illustrated?.roadFerries(edge)??[],
      setState:(...args)=>illustrated?.setState(...args),update(...args){illustrated?.update(...args);if(readyId)Object.assign(stats,illustrated.stats);},
      prefetch:()=>false,cancelPrefetch(){},async prepare(){},
      async prepareProgressive(state,renderer,wait,isCurrent){
        if(destroyed)return;
        const reveal=()=>{
          if(!isCurrent()||destroyed||preparedId!==state?.world?.definitionId)return false;
          readyId=preparedId;stats.ready=true;return true;
        };
        if(preparedId===state?.world?.definitionId && illustrated?.stats.ready)return reveal;
        readyId=null;preparedId=null;illustrated?.destroy();
        illustrated=createIllustratedTerrain(container,rect,{getView,forceIllustrated:true,backgroundWait:wait,isCurrent});
        await illustrated.prepare(state,renderer);
        if(!isCurrent()||destroyed)return;
        preparedId=state?.world?.definitionId;Object.assign(stats,illustrated.stats,{ready:false,prepared:true});
        return reveal;
      },
      destroy(){destroyed=true;illustrated?.destroy();container.destroy({children:true});},
    };
  }
  let id=null,terrain=null,renderer=null,landmarks=null,lastPaint=-Infinity,lastTime=null;
  let staticLevels=[],meshes=[],generation=0,pending=null,presentation=null,active=null,presentationRoot=null;
  const cache=new Map();
  let variants=null;
  let animated=[],sky=null;
  let lastView=null,lastZoom=null;
  let lastGraphics=null;
  // A bake started ahead of prepare() for the world a New Game is about to enter.
  // It owns its own textures and never touches the live terrain until adopted.
  let prefetch=null;
  const stats={ready:false,bakes:0,flattenedProps:0,frames:0,updateMs:0};
  function clear(){
    for(const entry of cache.values()){entry.node.destroy();entry.levels.forEach(t=>t.destroy(true));}
    cache.clear();variants?.destroy();variants=null;presentation=null;active=null;presentationRoot=null;
    for(const child of container.removeChildren())child.destroy({children:true});
    staticLevels.forEach(t=>t.destroy(true));staticLevels=[];meshes=[];animated=[];sky=null;
    if(terrain)destroyPixelTerrain(terrain);terrain=null;stats.ready=false;lastTime=null;lastView=null;lastZoom=null;lastGraphics=null;
  }
  const cooperativeOptions=stats=>backgroundWait?{stats,sliceMs:8,yieldTask:backgroundWait,isCancelled:()=>!isCurrent()}:{stats};
  const bakeOptions=(map,state)=>({texel:2,sites:false,retainPresentation:true,centredSettlements:crownCityIdentities(state),sampleBackground:surroundingsSampler(map),windowedAnimation:!!getView,
    worldBounds:getIllustratedWorldBounds(map)});
  function discardPrefetch(){
    const entry=prefetch;if(!entry)return;
    prefetch=null;entry.cancelled=true;
    entry.promise.then(baked=>{if(baked)destroyPixelTerrain(baked.art);},()=>{});
  }
  function put(texture,bounds,texel,levels){
    const node=createZoomArt(texture,levels);meshes.push(node);
    node.position.set(rect.x+bounds.minX*rect.width,rect.y+bounds.minY*rect.height);
    node.scale.set(texel*rect.width/1576,texel*rect.height/516);container.addChild(node);return node;
  }
  return {container,stats,
    supports(state){return !!getRegionalMap(state?.world?.definitionId);},
    // Starts baking a world's terrain early (the New Game forecast wait). Safe to
    // call repeatedly; a different world, cancelPrefetch() and destroy() drop it.
    prefetch(state){
      const nextId=state?.world?.definitionId,record=getRegionalMap(nextId);
      if(!record||(id===nextId&&(terrain||pending)))return false;
      if(prefetch?.id===nextId)return true;
      discardPrefetch();
      const entry={id:nextId,cancelled:false,promise:null};
      entry.promise=(async()=>{
        await prepareAssets();if(entry.cancelled)return null;
        await new Promise(resolve=>setTimeout(resolve,0));if(entry.cancelled)return null;
        const map=naturalRegionalMap(record.map);
        const art=await runCooperative(bakePixelTerrainSteps(map,bakeOptions(map,state)),{isCancelled:()=>entry.cancelled});
        if(!art)return null;
        if(entry.cancelled){destroyPixelTerrain(art);return null;}
        return {art,map};
      })();
      entry.promise.catch(()=>{if(prefetch===entry)prefetch=null;});
      prefetch=entry;return true;
    },
    cancelPrefetch(){discardPrefetch();},
    async prepare(state,targetRenderer){
      const nextId=state?.world?.definitionId,record=getRegionalMap(nextId);
      if(id===nextId&&pending)return pending;
      if(id===nextId&&terrain)return;
      const request=++generation;clear();id=nextId;renderer=targetRenderer;
      // Adopt a matching early bake; a bake for any other world is dropped.
      let adopted=null;
      if(prefetch?.id===nextId){adopted=prefetch;prefetch=null;}else discardPrefetch();
      const work=(async()=>{
      if(!record)return;
      const stale=()=>request!==generation || !isCurrent();
      const early=adopted?await adopted.promise.catch(()=>null):null;
      if(stale()){if(early)destroyPixelTerrain(early.art);return;}
      const loaded=await prepareAssets();
      if(stale()){if(early)destroyPixelTerrain(early.art);return;}
      landmarks=loaded[2];
      // Let the loading screen paint before the one-time CPU bake.
      await new Promise(resolve=>setTimeout(resolve,0));
      if(stale()){if(early)destroyPixelTerrain(early.art);return;}
      const start=performance.now(),cooperation={};
      // The bake and variant builds are single-threaded CPU work. They hand the
      // main thread back between phases so the loading screen keeps painting.
      const map=early?.map??naturalRegionalMap(record.map);
      const art=early?.art??await runCooperative(bakePixelTerrainSteps(map,bakeOptions(map,state)),cooperativeOptions(cooperation));
      // A step-wise job finishes; a request replaced meanwhile discards the result.
      if(stale()){if(art)destroyPixelTerrain(art);return;}
      if(early)cooperation.prefetched=true;
      terrain=art;
      const density=art.stats.texel;
      animated.push({cycle:art.waterCycle,bounds:art.bounds,texel:density,
        node:put(art.waterCycle.levels[0],art.bounds,density,art.waterCycle.levels)});
      await yieldToUi();if(stale())return;
      // Flatten hundreds of immutable terrain paintings once. Live ownership,
      // settlements, roads, packets and selection remain separate overlays.
      const scenery=new PIXI.Container(),textures=pixelSpriteTextures(density),relief=reliefSpriteTextures(art,false,false);
      const props=art.props.filter(p=>p.background&&pixelSpriteFits(art,p,false,false))
        .sort((a,b)=>a.point.y-b.point.y);
      for(const prop of props){
        const node=new PIXI.Sprite(relief.get(prop)??textures[prop.kind]);
        node.position.set(Math.round((prop.point.x-art.bounds.minX)*1576/density-node.width/2),Math.round((prop.point.y-art.bounds.minY)*516/density-node.height));
        node.alpha=prop.background?.9:1;scenery.addChild(node);
      }
      for(let n=0;n<5;n++)staticLevels.push(PIXI.RenderTexture.create({width:Math.ceil(art.stats.width/2**n),height:Math.ceil(art.stats.height/2**n),resolution:1,scaleMode:PIXI.SCALE_MODES.LINEAR}));
      renderer.render(scenery,{renderTexture:staticLevels[0],clear:true});scenery.destroy({children:true});
      for(let n=1;n<staticLevels.length;n++){const sprite=new PIXI.Sprite(staticLevels[n-1]);sprite.width=staticLevels[n].width;sprite.height=staticLevels[n].height;renderer.render(sprite,{renderTexture:staticLevels[n],clear:true});sprite.destroy();}
      put(staticLevels[0],art.bounds,density,staticLevels);
      await yieldToUi();if(stale())return;
      presentation=createRegionalPresentation(terrain,map,state);
      presentation.prepareCities(landmarks.crownModularGeometry);
      presentationRoot=new PIXI.Container();container.addChild(presentationRoot);
      sky=new PIXI.Sprite(art.atmosphere.texture);container.addChild(sky);
      await yieldToUi();if(stale())return;
      // The three terrain variants are built here, not lazily by the first setState().
      const built=await runCooperative(prepareRegionalTilesSteps(presentation,landmarks,renderer),cooperativeOptions(cooperation));
      if(stale()){built?.destroy();return;}
      variants=built;
      Object.assign(stats,{variantBuilds:(stats.variantBuilds??0)+1,variantBuildMs:built.buildMs,cooperation});
      Object.assign(stats,{ready:true,bakes:stats.bakes+1,bakeMs:performance.now()-start,terrainBakeMs:art.stats.bakeMs,
        bounds:{...art.bounds},textureMiB:art.stats.textureMiB,flattenedProps:props.length,width:art.stats.width,height:art.stats.height});
      this.setState(state);
      this.update(state.tSec??0,1,true);
      })();
      pending=work;
      try {await work;}catch(error){if(request===generation)clear();throw error;}
      finally {if(pending===work)pending=null;}
    },
    update(seconds,zoom=1,force=false){
      if(!terrain||!stats.ready||!container.visible)return;
      const graphics=getGraphicsOptions();
      // Settings must take effect even at the same held second, without waiting
      // for the next 30 fps animation slot. Reframe on re-enabling the sky too.
      force=force||graphics!==lastGraphics;
      const showAtmosphere=graphics.fog||graphics.clouds||graphics.shadows||graphics.wisps;
      const view=getView?.(),density=terrain.stats.texel;
      zoom=view?.zoom??zoom;
      const effectiveZoom=zoom*renderer.resolution;
      const viewChanged=force||!lastView||!view||view.minX!==lastView.minX||view.minY!==lastView.minY
        ||view.maxX!==lastView.maxX||view.maxY!==lastView.maxY||effectiveZoom!==lastZoom;
      const sourceView=(bounds,texel)=>({x:(view.minX-bounds.minX)*1576/texel,y:(view.minY-bounds.minY)*516/texel,
        width:(view.maxX-view.minX)*1576/texel,height:(view.maxY-view.minY)*516/texel});
      let moved=false;
      const fine=terrain.bounds;
      const atmosphere=terrain.atmosphere;
      if(viewChanged){
        for(const entry of animated){
          const {cycle,node,bounds,texel}=entry;
          if(view)moved=cycle.setView(sourceView(bounds,texel),texel*rect.width/1576*effectiveZoom)||moved;
          moved=(!node.visible&&cycle.visible)||moved;node.visible=cycle.visible;
          const frame=cycle.frame;
          node.resizeSource(frame.width,frame.height);
          node.position.set(rect.x+(bounds.minX+frame.x*texel/1576)*rect.width,rect.y+(bounds.minY+frame.y*texel/516)*rect.height);
        }
        if(view&&showAtmosphere)moved=atmosphere.setView(sourceView(fine,density*4),density*4*rect.width/1576*effectiveZoom)||moved;
        sky.visible=showAtmosphere&&atmosphere.visible;
        const frame=atmosphere.frame,texel=density*4;
        sky.position.set(rect.x+(fine.minX+frame.x*texel/1576)*rect.width,rect.y+(fine.minY+frame.y*texel/516)*rect.height);
        sky.width=frame.width*texel*rect.width/1576;sky.height=frame.height*texel*rect.height/516;
        for(const mesh of meshes)if(mesh.visible)mesh.sampleZoom(effectiveZoom,true);
        lastView=view?{...view}:null;lastZoom=effectiveZoom;
        stats.cameraUpdates=(stats.cameraUpdates??0)+1;
      }
      if(viewChanged||active?.zoom!==effectiveZoom){active?.node.sampleZoom(effectiveZoom,true);if(active)active.zoom=effectiveZoom;}
      const now=performance.now();if(!force&&!moved&&(seconds===lastTime||now-lastPaint<1000/30))return;
      const start=performance.now();
      const water=[];
      for(const entry of animated)if(entry.node.visible){
        const frames=entry.cycle.frames;
        // A fixed absolute phase keeps still water reproducible across toggles,
        // rewind and camera moves. Its cached texture is reused while scrubbing.
        entry.cycle.update(renderer,graphics.water?seconds:0,force);
        if(entry.cycle.frames!==frames)water.push(entry);
      }
      const skyUpdated=sky.visible&&atmosphere.update(renderer,seconds,graphics,force);
      lastGraphics=graphics;
      lastTime=seconds;lastPaint=now;Object.assign(stats,{frames:stats.frames+1,viewedSec:seconds,updateMs:performance.now()-start,
        graphics:{...graphics},waterSeconds:graphics.water?seconds:0,
        animationPasses:water.reduce((sum,e)=>sum+e.cycle.stats.passes,0)+(skyUpdated?atmosphere.stats.passes:0),
        animationPixels:water.reduce((sum,e)=>sum+e.cycle.stats.renderPixels,0)+(skyUpdated?atmosphere.stats.renderPixels:0),
        waterWindows:animated.filter(e=>e.node.visible).map(e=>({...e.cycle.frame,levels:e.cycle.levels.length,backdrop:false})),
        atmosphereWindow:{...atmosphere.frame},backdropAnimating:false});
    },
    sitePoint(regionId){return presentation?.anchors.find(s=>s.regionId===regionId)?.point;},
    worldBounds(){return terrain?.bounds??null;},
    roadPoints(edge){return active?.roads.find(r=>r.id===[edge.regionAId,edge.regionBId].sort().join(':'))?.points;},
    roadFerries(edge){return active?.roads.find(r=>r.id===[edge.regionAId,edge.regionBId].sort().join(':'))?.ferries??[];},
    setState(state,display={}){
      if(!presentation||!stats.ready)return;
      const spec=regionalPresentationSpec(state,display),key=JSON.stringify(spec);
      if(active?.key===key)return;
      let entry=cache.get(key);
      if(!entry){
        const start=performance.now(),{crop}=presentation;
        if(!variants){
          variants=prepareRegionalTiles(presentation,landmarks,renderer);
          Object.assign(stats,{variantBuilds:(stats.variantBuilds??0)+1,variantBuildMs:variants.buildMs});
        }
        const composed=performance.now(),art=variants.compose(spec),{scene}=art,density=terrain.stats.texel;
        const levels=[];
        for(let n=0;n<5;n++)levels.push(PIXI.RenderTexture.create({width:Math.ceil(crop.width/2**n),height:Math.ceil(crop.height/2**n),resolution:1,scaleMode:PIXI.SCALE_MODES.LINEAR}));
        renderer.render(scene,{renderTexture:levels[0],clear:true});scene.destroy({children:true});
        for(let n=1;n<levels.length;n++){const sprite=new PIXI.Sprite(levels[n-1]);sprite.width=levels[n].width;sprite.height=levels[n].height;renderer.render(sprite,{renderTexture:levels[n],clear:true});sprite.destroy();}
        const node=createZoomArt(levels[0],levels);
        node.position.set(rect.x+(terrain.bounds.minX+crop.x*density/1576)*rect.width,
          rect.y+(terrain.bounds.minY+crop.y*density/516)*rect.height);
        node.scale.set(density*rect.width/1576,density*rect.height/516);
        entry={key,node,levels,roads:art.roads,biomes:art.biomes,
          sites:art.sites,monsterPieces:art.monsterPieces};
        cache.set(key,entry);
        Object.assign(stats,{presentationBuilds:(stats.presentationBuilds??0)+1,presentationMs:performance.now()-composed,presentationTotalMs:performance.now()-start});
      }
      presentationRoot.removeChildren();presentationRoot.addChild(entry.node);active=entry;
      cache.delete(key);cache.set(key,entry);
      while(cache.size>4){const oldest=cache.keys().next().value,victim=cache.get(oldest);victim.node.destroy();victim.levels.forEach(t=>t.destroy(true));cache.delete(oldest);}
      Object.assign(stats,{biomes:entry.biomes,sites:entry.sites,roads:entry.roads.length,connections:spec.connections.length,
        monsterPieces:entry.monsterPieces,presentationCache:cache.size});
    },
    destroy(){generation++;discardPrefetch();clear();container.destroy();},
  };
}
