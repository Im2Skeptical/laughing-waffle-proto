import { runSync } from '../../../images/dark-fantasy/map-generation-prototype/cooperative.js';
import { destroyPixelTerrain, pixelSpriteTextures, reliefSpriteTextures, pixelSpriteFits } from '../../../images/dark-fantasy/map-generation-prototype/pixel-terrain.js';

// Three reusable terrain appearances: wilderness, village ground and occupied
// terrain. Player/market buildings are selected from the approved biome atlas. A spread selects regional pieces; it never composes art.
export function prepareRegionalTiles(presentation, landmarks, renderer) { return runSync(prepareRegionalTilesSteps(presentation, landmarks, renderer)); }

// The same work, yielding between the three terrain builds and their uploads.
export function* prepareRegionalTilesSteps(presentation, landmarks, renderer) {
  const {crop,map}=presentation,started=performance.now();
  const textures=[],grounds=[],bones=[],monsterCounts=new Map(),roadCache=new Map();
  const connections=[];
  let monsterArt,sites,buildings;
  function sceneFor(art){
    const scene=new PIXI.Container(),density=art.stats.texel;
    scene.addChild(new PIXI.Sprite(art.groundTexture));
    const road=new PIXI.Sprite(art.roadTexture);
    road.position.set((art.borderBounds.minX-art.bounds.minX)*1576/density-crop.x,
      (art.borderBounds.minY-art.bounds.minY)*516/density-crop.y);scene.addChild(road);
    const relief=reliefSpriteTextures(art,false,false),glyphs=pixelSpriteTextures(density);
    const props=art.props.filter(p=>!p.kind.startsWith('ruin')&&pixelSpriteFits(art,p,false,false));
    for(const item of props.sort((a,b)=>a.point.y-b.point.y)){
      const texture=relief.get(item)??glyphs[item.kind];
      const node=new PIXI.Sprite(texture);
      const x=(item.point.x-art.bounds.minX)*1576/density-crop.x,y=(item.point.y-art.bounds.minY)*516/density-crop.y;
      node.position.set(Math.round(x-node.width/2),Math.round(y-node.height));
      if(item.context==='bone-boundary'){
        bones.push({texture,x:node.x,y:node.y,edgeId:item.edgeId});node.destroy();
      }else scene.addChild(node);
    }
    const border=new PIXI.Sprite(art.borderTexture);border.position.copyFrom(road.position);scene.addChild(border);
    return scene;
  }
  function flatten(art){
    const scene=sceneFor(art),texture=PIXI.RenderTexture.create({width:crop.width,height:crop.height,resolution:1,scaleMode:PIXI.SCALE_MODES.LINEAR});
    renderer.render(scene,{renderTexture:texture,clear:true});scene.destroy({children:true});textures.push(texture);grounds.push(art.groundTexture);
  }
  const empty=yield* presentation.buildSteps({monsters:[],sites:[],connections});
  const routedRoads=empty.rasterRoads;
  flatten(empty);destroyPixelTerrain(empty);
  yield;
  const towns=yield* presentation.buildSteps({monsters:[],sites:presentation.anchors.map(a=>({regionId:a.regionId,kind:'player'})),connections,routedRoads});
  sites=towns.settlementPlans.map(s=>({regionId:s.regionId,biome:s.biome,buildings:s.buildings.length,point:s.point}));
  buildings=towns.settlementPlans.flatMap(s=>s.buildings.map(b=>({...b,regionId:s.regionId}))).sort((a,b)=>a.point.y-b.point.y);
  flatten(towns);destroyPixelTerrain(towns);
  yield;
  monsterArt=yield* presentation.buildSteps({monsters:map.regions.map(r=>r.id),sites:[],connections,routedRoads,isolatedMonsterBorders:true});
  for(const prop of monsterArt.props)if(prop.monster)monsterCounts.set(prop.regionId,(monsterCounts.get(prop.regionId)??0)+1);
  flatten(monsterArt);
  yield;
  const density=monsterArt.stats.texel,bounds=monsterArt.bounds;
  return {buildMs:performance.now()-started,sites,
    compose(spec){
      const scene=new PIXI.Container(),occupied=new Set(spec.monsters),kinds=new Map(spec.sites.map(s=>[s.regionId,s.kind]));
      const roadKey=JSON.stringify(spec.connections);
      if(!roadCache.has(roadKey)){
        roadCache.set(roadKey,presentation.roads(spec.connections));
        while(roadCache.size>4){const key=roadCache.keys().next().value,old=roadCache.get(key);old.roadTexture.destroy(true);old.maskTexture.destroy(true);roadCache.delete(key);}
      }
      const road=roadCache.get(roadKey);
      const regionMode=region=>occupied.has(region.id)?2:kinds.has(region.id)?1:0;
      const regionMask=region=>new PIXI.Graphics().beginFill(0xffffff).drawPolygon(region.outline.flatMap(p=>[
        (p.x-bounds.minX)*1576/density-crop.x,(p.y-bounds.minY)*516/density-crop.y])).endFill();
      for(const region of map.regions){
        const mode=regionMode(region),node=new PIXI.Sprite(textures[mode]),mask=regionMask(region);
        scene.addChild(node,mask);node.mask=mask;
      }
      for(const bone of bones){
        const edge=map.edges.find(e=>e.id===bone.edgeId);
        if(!edge||edge.regions.filter(id=>occupied.has(id)).length!==1)continue;
        const node=new PIXI.Sprite(bone.texture);node.position.set(bone.x,bone.y);scene.addChild(node);
      }
      // Clear illustration pixels along the exact prototype road corridor,
      // revealing the prepared biome ground beneath. New roads need routing
      // and paint only, not another landscape composition.
      if(spec.connections.length){
        const groundLayer=new PIXI.Container(),clearance=new PIXI.Sprite(road.maskTexture);
        for(const region of map.regions){
          const ground=new PIXI.Sprite(grounds[regionMode(region)]),mask=regionMask(region);
          groundLayer.addChild(ground,mask);ground.mask=mask;
        }
        groundLayer.mask=clearance;scene.addChild(groundLayer,clearance);
        const node=new PIXI.Sprite(road.roadTexture);
        node.position.set((road.borderBounds.minX-bounds.minX)*1576/density-crop.x,
          (road.borderBounds.minY-bounds.minY)*516/density-crop.y);scene.addChild(node);
      }
      for(const b of buildings){
        if(occupied.has(b.regionId)||!kinds.has(b.regionId))continue;
        const role=['hall','market'].includes(b.role)?kinds.get(b.regionId)==='player'?'hall':'market':b.role;
        const texture=landmarks.biomes[b.biome][role],node=new PIXI.Sprite(texture);
        node.scale.set(b.w/texture.width);
        node.position.set((b.point.x-bounds.minX)*1576/density-crop.x-node.width/2,
          (b.point.y-bounds.minY)*516/density-crop.y-node.height+b.h*.25);scene.addChild(node);
      }
      const biomes=map.regions.map(r=>({id:r.id,underlying:r.biome,biome:occupied.has(r.id)?'monster':r.biome}));
      return {scene,biomes,roads:road.roads,sites:sites.filter(s=>kinds.has(s.regionId)&&!occupied.has(s.regionId)).map(s=>({...s,kind:kinds.get(s.regionId)})),
        monsterPieces:spec.monsters.reduce((n,id)=>n+(monsterCounts.get(id)??0),0)};
    },
    destroy(){textures.forEach(t=>t.destroy(true));for(const t of new Set(grounds))t.destroy(true);destroyPixelTerrain(monsterArt);
      for(const road of roadCache.values()){road.roadTexture.destroy(true);road.maskTexture.destroy(true);}},
  };
}
