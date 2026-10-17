import { prepareRegionalTiles, prepareRegionalTilesSteps } from './regional-tiles.js';
import { naturalRegionalMap, regionalPresentationSpec, createRegionalPresentation } from './regional-presentation.js';
import { getRegionalMap } from '../../model/regional-map/definition.js';
import { sampleSurroundings } from '../../model/regional-map/generator.js';
import { runCooperative } from '../../../images/dark-fantasy/map-generation-prototype/cooperative.js';
import { bakePixelTerrainSteps, destroyPixelTerrain, prepareIllustratedArt, pixelSpriteTextures, reliefSpriteTextures, pixelSpriteFits } from '../../../images/dark-fantasy/map-generation-prototype/pixel-terrain.js';
import { prepareCloudArt } from '../../../images/dark-fantasy/map-generation-prototype/cloud-banks.js';
import { createZoomArt, prepareLandmarkLods } from '../../../images/dark-fantasy/map-generation-prototype/zoom-art.js';
import { getIllustratedWorldBounds } from './world-bounds.js';

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

export function createIllustratedTerrain(parent,rect,{getView}={}) {
  const container=new PIXI.Container();container.eventMode='none';parent.addChild(container);
  let id=null,terrain=null,renderer=null,landmarks=null,lastPaint=-Infinity,lastTime=null;
  let staticLevels=[],meshes=[],generation=0,pending=null,presentation=null,active=null,presentationRoot=null;
  const cache=new Map();
  let variants=null;
  let animated=[],sky=null;
  let lastView=null,lastZoom=null;
  const stats={ready:false,bakes:0,flattenedProps:0,frames:0,updateMs:0};
  function clear(){
    for(const entry of cache.values()){entry.node.destroy();entry.levels.forEach(t=>t.destroy(true));}
    cache.clear();variants?.destroy();variants=null;presentation=null;active=null;presentationRoot=null;
    for(const child of container.removeChildren())child.destroy({children:true});
    staticLevels.forEach(t=>t.destroy(true));staticLevels=[];meshes=[];animated=[];sky=null;
    if(terrain)destroyPixelTerrain(terrain);terrain=null;stats.ready=false;lastTime=null;lastView=null;lastZoom=null;
  }
  function put(texture,bounds,texel,levels){
    const node=createZoomArt(texture,levels);meshes.push(node);
    node.position.set(rect.x+bounds.minX*rect.width,rect.y+bounds.minY*rect.height);
    node.scale.set(texel*rect.width/1576,texel*rect.height/516);container.addChild(node);return node;
  }
  return {container,stats,
    supports(state){return !!getRegionalMap(state?.world?.definitionId);},
    async prepare(state,targetRenderer){
      const nextId=state?.world?.definitionId,record=getRegionalMap(nextId);
      if(id===nextId&&pending)return pending;
      if(id===nextId&&terrain)return;
      const request=++generation;clear();id=nextId;renderer=targetRenderer;
      const work=(async()=>{
      if(!record)return;
      const loaded=await prepareAssets();if(request!==generation)return;landmarks=loaded[2];
      // Let the loading screen paint before the one-time CPU bake.
      await new Promise(resolve=>setTimeout(resolve,0));if(request!==generation)return;
      const start=performance.now(),map=naturalRegionalMap(record.map),cooperation={};
      const stale=()=>request!==generation;
      // The bake and variant builds are single-threaded CPU work. They hand the
      // main thread back between phases so the loading screen keeps painting.
      const art=await runCooperative(bakePixelTerrainSteps(map,{texel:2,sites:false,retainPresentation:true,sampleBackground:surroundingsSampler(map),windowedAnimation:!!getView,
        worldBounds:getIllustratedWorldBounds(map)}),{stats:cooperation});
      // A bake always finishes; a request replaced meanwhile discards the result.
      if(stale()){destroyPixelTerrain(art);return;}
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
      presentation=createRegionalPresentation(terrain,map);
      presentationRoot=new PIXI.Container();container.addChild(presentationRoot);
      sky=new PIXI.Sprite(art.atmosphere.texture);container.addChild(sky);
      await yieldToUi();if(stale())return;
      // The three terrain variants are built here, not lazily by the first setState().
      const built=await runCooperative(prepareRegionalTilesSteps(presentation,landmarks,renderer),{stats:cooperation});
      if(stale()){built.destroy();return;}
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
        if(view)moved=atmosphere.setView(sourceView(fine,density*4),density*4*rect.width/1576*effectiveZoom)||moved;
        sky.visible=atmosphere.visible;
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
      for(const entry of animated)if(entry.node.visible)entry.cycle.update(renderer,seconds,force);
      terrain.atmosphere.update(renderer,seconds,{fog:true,clouds:true,shadows:true,wisps:true},force);
      const water=animated.filter(e=>e.node.visible);
      lastTime=seconds;lastPaint=now;Object.assign(stats,{frames:stats.frames+1,viewedSec:seconds,updateMs:performance.now()-start,
        animationPasses:water.reduce((sum,e)=>sum+e.cycle.stats.passes,0)+(sky.visible?atmosphere.stats.passes:0),
        animationPixels:water.reduce((sum,e)=>sum+e.cycle.stats.renderPixels,0)+(sky.visible?atmosphere.stats.renderPixels:0),
        waterWindows:water.map(e=>({...e.cycle.frame,levels:e.cycle.levels.length,backdrop:false})),
        atmosphereWindow:{...atmosphere.frame},backdropAnimating:false});
    },
    sitePoint(regionId){return presentation?.anchors.find(s=>s.regionId===regionId)?.point;},
    worldBounds(){return terrain?.bounds??null;},
    roadPoints(edge){return active?.roads.find(r=>r.id===[edge.regionAId,edge.regionBId].sort().join(':'))?.points;},
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
    destroy(){generation++;clear();container.destroy();},
  };
}
