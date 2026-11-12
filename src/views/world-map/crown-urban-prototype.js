// Local art iteration: fixed Crown city fabric on the real game's terrain.
// This is presentation data only; capture changes neither plots nor architecture.
import {decorationRandom} from '../../model/regional-map/generator.js';

export const crownModularEnabled=()=>new URLSearchParams(globalThis.location?.search??'').get('crownArt')!=='baseline';

export function crownCityIdentities(state){
 if(!state.rulesetId||!state.civilization?.remnant)return [];
 const capital=state.civilization.remnant.capitalRegionId;
 // Prototype provenance: these seeded site names survive capture/replay. No new
 // save field is introduced just to try an art direction (see iteration notes).
 return state.world.sites.flatMap(site=>site.regionId===capital?[{regionId:site.regionId,rank:'capital'}]
  :site.name==='Remnant Province'?[{regionId:site.regionId,rank:'province'}]:[]);
}

const sizes={citadel:26,barracks:28,armoury:22,arcade:26,tower:16,wallNE:28,wallNW:28,corner:24,gate:22,ruinedGate:22,courtWing:30,colonnade:28,ruinedHall:28,brokenWall:24,ruinedHouses:24,house:12,pair:22,workshop:20,foundation:20,flag:8,
 blade:12,bladeLow:12,bladeBroken:12,ribBrace:22,galleryNE:28,galleryNW:24,rampartNE:28,rampartNW:22,galleryCorner:28,galleryT:30,linkedGate:26,court:30,ruinedGalleryNE:28,ruinedGalleryNW:24,terrace:30,ribRuin:24};

export function planCrownUrbanSites(anchors,{map,pixel,world,width,height,land,waterIndices,regionIds,detail,identities,roads=[],moduleSizes={}}){
 const sites=structuredClone(anchors),unit=detail*.5;
 const dry=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&!!land[Math.floor(y)*width+Math.floor(x)]&&!waterIndices[Math.floor(y)*width+Math.floor(x)];
 const regionAt=(x,y)=>dry(x,y)?map.regions[regionIds[Math.floor(y)*width+Math.floor(x)]]?.id:null;
 const distanceToSegment=(x,y,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
 };
 const corridors=roads.flatMap(path=>path.slice(1).map((b,i)=>[path[i],b]));
 const occupied=[];
 // Preserve all ordinary town plots and their readout/approach neighbourhoods.
 const identityIds=new Set(identities.map(i=>i.regionId));
 for(const site of sites)if(!identityIds.has(site.regionId))for(const b of site.buildings)occupied.push({x:b.x,y:b.y,w:b.w,h:b.h});
 for(const identity of identities){
  const site=sites.find(s=>s.regionId===identity.regionId);if(!site)continue;
  const region=map.regions.find(r=>r.id===identity.regionId),outline=region.outline.map(pixel);
  const limits={minX:Math.min(...outline.map(p=>p.x)),maxX:Math.max(...outline.map(p=>p.x)),minY:Math.min(...outline.map(p=>p.y)),maxY:Math.max(...outline.map(p=>p.y))};
  site.urban={rank:identity.rank,classId:'warrior',composition:'connected citadel and wards',links:[],spines:[]};
  site.groundRegionIds=[identity.regionId];site.originalBuildings=site.buildings;site.buildings=[];site.streets=[];site.enclosure=[];
  const rand=n=>decorationRandom(map.seed,Number(identity.regionId.slice(1))*13007+n*673);
  const maxRadius=Math.max(limits.maxX-limits.minX,limits.maxY-limits.minY);
  const add=(x,y,role,core=false,group=null,joinedTo=null)=>{
   const w=sizes[role]*.5*unit,h=w*.55;
   const imported=moduleSizes[role],spriteHeight=imported?w*imported.height/imported.width:w;
   const renderBounds={minX:x-w/2,maxX:x+w/2,minY:y-spriteHeight+h*.25,maxY:y+h*.25};
   // The actual building footprint must be dry. Spill is confined to a narrow
   // dry fringe beside the capital and never intrudes into another town's core.
   const own=regionAt(x,y)===identity.regionId;
   const spill=identity.rank==='capital'&&!own&&[-8,0,8].some(dx=>[-8,0,8].some(dy=>regionAt(x+dx*unit,y+dy*unit)===identity.regionId));
   if(!own&&!spill)return false;
   for(const dx of [-.5,0,.5])for(const dy of [-.5,0,.5])if(!dry(x+dx*w,y+dy*h))return false;
   for(let py=Math.floor(renderBounds.minY);py<=renderBounds.maxY;py++)for(let px=Math.floor(renderBounds.minX);px<=renderBounds.maxX;px++)if(!dry(px,py))return false;
   if(corridors.some(([a,b])=>distanceToSegment(x,y,a,b)<w*.45+2*unit))return false;
   if(occupied.some(b=>!(group&&b.group===group)&&Math.abs(b.x-x)<(b.w+w)*.45&&Math.abs(b.y-y)<(b.h+h)*.48))return false;
   // Keep the current floating readout surroundings quiet without moving it.
   if(!core&&Math.abs(x-site.x)<22*unit&&y>site.y+16*unit&&y<site.y+23*unit)return false;
   if(sites.some(other=>other!==site&&Math.hypot((x-other.x),(y-other.y)*1.4)<30*unit))return false;
   const b={x,y,w,h,role,point:world(x,y),biome:site.biome,urban:true,core,group,index:site.buildings.length,renderBounds,landRegionId:regionAt(x,y)};
   site.buildings.push(b);occupied.push(b);
   if(joinedTo)site.urban.links.push([joinedTo.index,b.index]);
   if(!site.groundRegionIds.includes(b.landRegionId))site.groundRegionIds.push(b.landRegionId);
   return b;
  };
  // A large silhouette assembled from ordinary-scale joined parts. The two
  // gallery directions follow the atlas projection; ports overlap at the ends.
  // Three parallel arms rise from one binding gallery in the capital. Provinces
  // use two shorter arms, giving their court a simpler, subordinate silhouette.
  const at=(u,v)=>({x:site.x+(u+v*.85)*unit,y:site.y-6*unit+(u-v)*.35*unit});
  const coreGroup=`${identity.regionId}:citadel`;
  const part=(u,v,role,previous=null)=>{const p=at(u,v);return add(p.x,p.y,role,true,coreGroup,previous);};
  const root=part(0,0,'galleryT');
  const bar=new Map([[0,root]]);
  const armCount=identity.rank==='capital'?3:2;
  if(root){
   for(const direction of [-1,1]){
    let previous=root;
    for(let u=12;u<=24;u+=12){
     const next=part(u*direction,0,'galleryNW',previous);if(!next)break;
     bar.set(u*direction,next);previous=next;
    }
   }
   const offsets=armCount===3?[-12,0,12]:[-12,12];
   for(const [i,u]of offsets.entries()){
    let previous=bar.get(u);if(!previous)continue;
    let end=0;
    const length=identity.rank==='capital'?42:28;
    for(let v=14;v<=length;v+=14){
     const next=part(u,v,'galleryNE',previous);if(!next)break;
     previous=next;end=v;
    }
    // Bind the three nearby tower feet with one gallery band. Height comes from
    // the narrow blade assets; their doors and neighbouring wings keep scale.
    if(end===length&&armCount===3)part(u,end,'galleryT',previous);
    // The tower foot binds into its arm rather than floating past unsafe land.
    const tower=part(u,end+3,i===1&&armCount===3?'blade':'bladeLow',previous);
    if(tower)site.urban.spines.push(tower.index);
   }
   part(0,-10,'linkedGate',root);
  }

  // Distinct courtyard compounds organise the fabric into wards, with attached
  // galleries instead of a uniformly scattered set of complete little towns.
  let ward=0;
  for(let y=limits.minY+15*unit;y<limits.maxY;y+=25*unit)for(let x=limits.minX+12*unit;x<limits.maxX;x+=30*unit){
   const p={x:x+(rand(7000+ward)-.5)*7*unit,y:y+(rand(8000+ward)-.5)*5*unit};
   const group=`${identity.regionId}:ward:${ward++}`;
   const hall=add(p.x,p.y,'court',false,group);if(!hall)continue;
   add(p.x-11*unit,p.y-4*unit,'galleryNW',false,group,hall);
   add(p.x+12*unit,p.y-4*unit,rand(9000+ward)>.65?'ruinedGalleryNE':'galleryNE',false,group,hall);
  }
  let n=0;
  const pad=identity.rank==='capital'?8*unit:0;
  for(let y=limits.minY-pad;y<=limits.maxY+pad;y+=6*unit)for(let x=limits.minX-pad;x<=limits.maxX+pad;x+=7*unit){
   const px=x+(rand(n++)-.5)*3*unit+Math.sin((y-site.y)/(19*unit))*2*unit,py=y+(rand(n++)-.5)*2*unit;
   const edge=[[-9,0],[9,0],[0,-8],[0,8]].some(([dx,dy])=>regionAt(px+dx*unit,py+dy*unit)!==identity.regionId);
   const distance=Math.hypot(px-site.x,(py-site.y)*1.1)/maxRadius;
   const ruined=edge?rand(n++)>.45:distance>.5&&rand(n++)>.6;
   const variants=ruined?['ruinedHouses','ruinedGalleryNE','ribRuin','brokenWall']:['house','house','pair','terrace','workshop'];
   let role=variants[Math.floor(rand(n++)*variants.length)];
   if(edge&&rand(n++)>.65)role=rand(n++)>.5?'rampartNE':'rampartNW';
   add(px,py,role);
  }
  // Local lanes join nearby plots through existing dry ground. They are ground
  // detail only, never new simulation connections or bridges.
  for(const b of site.buildings){
   const neighbours=site.buildings.filter(a=>a!==b&&Math.hypot(a.x-b.x,a.y-b.y)<16*unit).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y));
   const other=neighbours[0];if(!other)continue;
   const a={x:b.x,y:b.y+b.h*.4},c={x:other.x,y:other.y+other.h*.4},steps=Math.ceil(Math.hypot(c.x-a.x,c.y-a.y));
   if(Array.from({length:steps+1},(_,i)=>dry(a.x+(c.x-a.x)*i/(steps||1),a.y+(c.y-a.y)*i/(steps||1))).every(Boolean))site.streets.push([a,c]);
  }
  site.groundBounds={minX:limits.minX-pad-12*unit,maxX:limits.maxX+pad+12*unit,minY:limits.minY-pad-16*unit,maxY:limits.maxY+pad+12*unit};
 }
 return sites;
}
