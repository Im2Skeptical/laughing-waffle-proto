import { composePlayableTerrain } from '../../../images/dark-fantasy/map-generation-prototype/playable-terrain.js';
import { createSurfaceSampler } from '../../../images/dark-fantasy/map-generation-prototype/terrain-surfaces.js';
import { planSettlementSites, layOutSettlements } from '../../../images/dark-fantasy/map-generation-prototype/settlement-sites.js';

// The study's monster regions are examples, not permanent live-world biomes.
// Keep their authored underlying terrain and never modify the shared definition.
export function naturalRegionalMap(map) {
  return {...map, regions:map.regions.map(r=>({...r, biome:r.biome==='monster'?r.terrainBiome:r.biome}))};
}

export function regionalPresentationSpec(state, display = {}) {
  const monsters = display.actors === false ? [] : state.world.regions.filter(r=>r.monster).map(r=>r.id).sort();
  const sites = display.scenery === false ? [] : state.world.sites.filter(s=>
    !monsters.includes(s.regionId) && (s.detailedState || s.neutral)).map(s=>({regionId:s.regionId,kind:s.neutral?'neutral':'player'}))
    .sort((a,b)=>a.regionId.localeCompare(b.regionId));
  const connections = display.connections === false ? [] : state.world.connections.map(e=>({regionAId:e.regionAId,regionBId:e.regionBId}))
    .sort((a,b)=>connectionKey(a).localeCompare(connectionKey(b)));
  return {monsters,sites,connections};
}
export const connectionKey = e => [e.regionAId,e.regionBId].sort().join(':');

// Reuse the geographical raster. Occupation changes only dry material,
// illustrations and roads; islands, rivers and animated water stay intact.
export function createRegionalPresentation(terrain, baseMap) {
  const source=terrain.presentationSource;
  const {width,height,land,regionIds,pixel,world,detail,materialIds,mixColour,noise}=source;
  const anchors=planSettlementSites({...source,map:baseMap,waterIndices:terrain.waterIndices,perRegion:true});
  layOutSettlements(anchors,{detail,world,seed:baseMap.seed,dry:(x,y,id)=>{
    const i=Math.floor(y)*width+Math.floor(x);
    return x>=0&&y>=0&&x<width&&y<height&&land[i]&&!terrain.waterIndices[i]&&baseMap.regions[regionIds[i]]?.id===id;
  }});
  const extent=baseMap.regions.flatMap(r=>r.outline).map(pixel);
  const x=Math.max(0,Math.floor(Math.min(...extent.map(p=>p.x)))-80);
  const y=Math.max(0,Math.floor(Math.min(...extent.map(p=>p.y)))-80);
  const crop={x,y,width:Math.min(width-x,Math.ceil(Math.max(...extent.map(p=>p.x)))+80-x),
    height:Math.min(height-y,Math.ceil(Math.max(...extent.map(p=>p.y)))+80-y)};
  const peakMask=new Uint8Array(width*height);
  return {anchors,crop,map:baseMap,
    roads(connections){
      const names=Object.fromEntries(Object.entries(materialIds).map(([k,v])=>[v,k])),materials=terrain.materials;
      const materialAt=(x,y)=>names[materials.data[(y-materials.y)*materials.width+x-materials.x]];
      const result=composePlayableTerrain({...source,map:baseMap,materialAt,surfaces:createSurfaceSampler({...source,map:baseMap}),
        waterIndices:terrain.waterIndices,waterBase:null,sites:[],anchors,connections,roadsOnly:true,interactions:{mountainPass:0}});
      const {roadClearance:mask}=result,canvas=document.createElement('canvas');canvas.width=crop.width;canvas.height=crop.height;
      const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(crop.width,crop.height);
      for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(mask.data[y*mask.width+x]){
        const i=((mask.y+y-crop.y)*crop.width+mask.x+x-crop.x)*4;
        pixels.data.fill(255,i,i+4);
      }
      ctx.putImageData(pixels,0,0);
      return {...result,maskTexture:PIXI.Texture.from(canvas),roads:result.roads.map(path=>({id:path.connectionId,points:path.map(p=>world(p.x,p.y))}))};
    },
    build(spec){
      const occupied=new Set(spec.monsters);
      const map={...baseMap,regions:baseMap.regions.map(r=>({...r,terrainBiome:r.biome,biome:occupied.has(r.id)?'monster':r.biome}))};
      const colours=source.colours.slice(),materials={...terrain.materials,data:terrain.materials.data.slice()};
      const surfaces=createSurfaceSampler({...source,map});
      surfaces.registerPaths('river',map.features.filter(f=>f.type==='river').map(f=>f.points.map(pixel)));
      for(let py=crop.y;py<crop.y+crop.height;py++)for(let px=crop.x;px<crop.x+crop.width;px++){
        const i=py*width+px,r=map.regions[regionIds[i]];
        if(!r||!land[i]||terrain.waterIndices[i]||r.biome!=='monster')continue;
        const shade=noise(map.seed,px,py,60)*.55+noise(map.seed^7531,px,py,16)*.45;
        colours[i]=mixColour(source.groundBank.monster[Math.min(3,Math.floor(shade*4))],surfaces.ground('monster',px,py),.72);
        materials.data[(py-materials.y)*materials.width+px-materials.x]=materialIds.monster;
      }
      const names=Object.fromEntries(Object.entries(materialIds).map(([k,v])=>[v,k]));
      const materialAt=(px,py)=>names[materials.data[(py-materials.y)*materials.width+px-materials.x]];
      const art=composePlayableTerrain({...source,map,colours,materials,materialAt,surfaces,
        waterIndices:terrain.waterIndices,waterBase:null,sites:spec.sites,anchors,connections:spec.connections,routedRoads:spec.routedRoads,
        background:{props:[],stats:{}},peakMask,isolatedMonsterBorders:spec.isolatedMonsterBorders,interactions:{mountainPass:0}});
      for(const site of art.settlementPlans)for(const b of site.buildings)
        if(b.role==='hall'||b.role==='market')b.role=site.kind==='player'?'hall':'market';
      const canvas=document.createElement('canvas');canvas.width=crop.width;canvas.height=crop.height;
      const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(crop.width,crop.height);
      for(let py=0;py<crop.height;py++)for(let px=0;px<crop.width;px++){
        const i=(py+crop.y)*width+px+crop.x,j=(py*crop.width+px)*4;
        if(regionIds[i]<0||!land[i]||terrain.waterIndices[i])continue;
        const c=colours[i];pixels.data[j]=c>>16&255;pixels.data[j+1]=c>>8&255;pixels.data[j+2]=c&255;pixels.data[j+3]=255;
      }
      ctx.putImageData(pixels,0,0);
      const groundTexture=PIXI.Texture.from(canvas);
      return {...art,groundTexture,materials,bounds:terrain.bounds,waterIndices:terrain.waterIndices,
        geography:terrain.geography,divisionClearance:art.divisions.clearance,stats:terrain.stats,
        rasterRoads:art.roads,roads:art.roads.map(path=>({id:path.connectionId,points:path.map(p=>world(p.x,p.y))})),
        biomes:map.regions.map(r=>({id:r.id,biome:r.biome,underlying:r.terrainBiome}))};
    },
  };
}
