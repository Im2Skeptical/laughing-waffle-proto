// Local art iteration: fixed Crown city fabric on the real game's terrain.
// This is presentation data only; capture changes neither plots nor architecture.
import {decorationRandom} from '../../model/regional-map/generator.js';

export const crownBiomeRole=(role,biome)=>['citadelRear','citadelPalace','provinceHall'].includes(role)?`${role}-${biome}`:role;

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
 blade:12,bladeLow:12,bladeBroken:12,ribBrace:22,galleryNE:28,galleryNW:24,rampartNE:28,rampartNW:22,galleryCorner:28,galleryT:30,linkedGate:26,court:30,ruinedGalleryNE:28,ruinedGalleryNW:24,terrace:30,ribRuin:24,
 citadelGate:64,citadelLeft:48,citadelRight:48,citadelRear:64,citadelMiddle:64,citadelPalace:44,citadelCrown:40,citadelOuter:48,
 provinceHall:40,provinceGate:28,provinceCourt:36,provinceWing:28};

export function planCrownUrbanSites(anchors,{map,pixel,world,width,height,land,waterIndices,regionIds,detail,identities,roads=[],moduleSizes}){
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
  const capital=identity.rank==='capital';
  const exposed=map.edges.filter(e=>e.regions.includes(identity.regionId)&&!e.regions.some(id=>id!==identity.regionId&&identityIds.has(id)))
   .flatMap(e=>e.points.slice(1).map((b,i)=>[pixel(e.points[i]),pixel(b)]));
  site.urban={rank:identity.rank,classId:'warrior',composition:capital?'diagonal terraced citadel':'governor hall and gate court city',links:[],spines:[]};
  site.groundRegionIds=[identity.regionId];site.originalBuildings=site.buildings;site.buildings=[];site.streets=[];site.enclosure=[];
  const rand=n=>decorationRandom(map.seed,Number(identity.regionId.slice(1))*13007+n*673);
  const maxRadius=Math.max(limits.maxX-limits.minX,limits.maxY-limits.minY);
  const envelope=(x,y)=>regionAt(x,y)===identity.regionId||capital&&[-4,0,4].some(dx=>[-4,0,4].some(dy=>regionAt(x+dx*unit,y+dy*unit)===identity.regionId));
  const add=(x,y,role,core=false,group=null,joinedTo=null,monument=false,depthY=null)=>{
   const w=sizes[role]*.5*unit,h=w*.55;
   const artRole=crownBiomeRole(role,site.biome),imported=moduleSizes[artRole],spriteHeight=w*imported.height/imported.width;
   const renderBounds={minX:x-w/2,maxX:x+w/2,minY:y-spriteHeight+h*.25,maxY:y+h*.25};
   // A tall facade projects over ground behind it. Only foundation contacts
   // meet the world road layer; upper tiers rest on the lower architecture.
   const elevated=monument&&['citadelMiddle','citadelPalace','citadelCrown'].includes(role);
   const contactPlacement=monument||core&&['blade','bladeLow','bladeBroken'].includes(role);
   const roadContacts=contactPlacement&&!elevated?imported.groundContacts.map(([px,py])=>({x:renderBounds.minX+(px+.5)*w/imported.width,y:renderBounds.minY+(py+.5)*w/imported.width})):null;
   // The actual building footprint must be dry. Spill is confined to a narrow
   // dry fringe beside the capital and never intrudes into another town's core.
   const own=regionAt(x,y)===identity.regionId;
   const spill=capital&&!own&&identityIds.has(regionAt(x,y))&&envelope(x,y);
   if(!own&&!spill)return false;
   for(const dx of [-.5,0,.5])for(const dy of [-.5,0,.5])if(!dry(x+dx*w,y+dy*h))return false;
   for(let py=Math.floor(y-h/2);py<=y+h/2;py++)for(let px=Math.floor(x-w/2);px<=x+w/2;px++)if(monument?regionAt(px,py)!==identity.regionId:!envelope(px,py))return false;
   for(let py=Math.floor(renderBounds.minY);py<=renderBounds.maxY;py++)for(let px=Math.floor(renderBounds.minX);px<=renderBounds.maxX;px++)if(!dry(px,py)||!capital&&regionAt(px,py)!==identity.regionId)return false;
   if(corridors.some(([a,b])=>distanceToSegment(x,y,a,b)<w*.45+2*unit))return false;
   if(!core&&exposed.some(([a,b])=>distanceToSegment(x,y,a,b)<w*.5+((capital?10:18)+rand(Math.round(x*31+y*17))*6)*unit))return false;
   if(occupied.some(b=>!(group&&b.group===group)&&Math.abs(b.x-x)<(b.w+w)*.45&&Math.abs(b.y-y)<(b.h+h)*.48))return false;
   const centre=site.urban.monument?.bounds;
   if(!core&&centre&&x+w/2>centre.minX-2*unit&&x-w/2<centre.maxX+2*unit&&y+h/2>centre.minY-2*unit&&y-h/2<centre.maxY+2*unit)return false;
   // Keep the current floating readout surroundings quiet without moving it.
   if(!core&&Math.abs(x-site.x)<22*unit&&y>site.y+16*unit&&y<site.y+23*unit)return false;
   if(!monument&&sites.some(other=>other!==site&&Math.hypot((x-other.x),(y-other.y)*1.4)<30*unit))return false;
   const b={x,y,w,h,role,artRole,point:Math.abs(x-site.x)<1e-8&&Math.abs(y-site.y)<1e-8?{...site.point}:world(x,y),biome:site.biome,urban:true,core,group,index:site.buildings.length,renderBounds,roadContacts,landRegionId:regionAt(x,y),monument,depthY};
   site.buildings.push(b);occupied.push(b);
   if(joinedTo)site.urban.links.push([joinedTo.index,b.index]);
   if(!site.groundRegionIds.includes(b.landRegionId))site.groundRegionIds.push(b.landRegionId);
   return b;
  };
  // Fit complete landmark assemblies before ordinary districts. Every section
  // must pass its foundation/water constraints; failed attempts roll back whole.
  const placeMonument=(layouts,centreRole,focusRole=centreRole)=>{
   for(const [layout,parts]of layouts){
   const [,u,v]=parts.find(([role])=>role===centreRole),attempts=[{dx:-u,dy:-v}];
   for(const {dx,dy}of attempts){
    const cx=site.x+dx*unit,cy=site.y+dy*unit,start=site.buildings.length,occupiedStart=occupied.length,linkStart=site.urban.links.length,groundIds=site.groundRegionIds.slice();
    let previous=null,ok=true;
    for(const [order,[role,u,v]]of parts.entries()){
     const b=add(cx+u*unit,cy+v*unit,role,true,`${identity.regionId}:monument`,previous,true,world(cx,cy+18*unit).y+order*.000001);
     if(!b){ok=false;break;}previous=b;
    }
    const placed=site.buildings.slice(start),focus=placed.find(b=>b.role===focusRole);
    if(ok){
     const bounds={minX:Math.min(...placed.map(b=>b.renderBounds.minX)),maxX:Math.max(...placed.map(b=>b.renderBounds.maxX)),minY:Math.min(...placed.map(b=>b.renderBounds.minY)),maxY:Math.max(...placed.map(b=>b.renderBounds.maxY))};
     const lo=world(bounds.minX,bounds.minY),hi=world(bounds.maxX,bounds.maxY);
     site.urban.monument={layout,parts:placed.map(b=>b.index),bounds,worldBounds:{minX:lo.x,minY:lo.y,maxX:hi.x,maxY:hi.y},centreRole,centrePoint:placed.find(b=>b.role===centreRole).point};
     site.urban.spines.push(focus.index);
     return;
    }
    site.buildings.length=start;occupied.length=occupiedStart;site.urban.links.length=linkStart;site.groundRegionIds=groundIds;
   }
   }
  };
  if(capital){
   // Upper tiers recede diagonally, keeping the existing architectural extent.
   const full=[['citadelRear',-6,-2],['citadelLeft',-18,0],['citadelRight',16,4],['citadelGate',-2,18],['citadelMiddle',-3,5],['citadelPalace',-6,-4],['citadelCrown',-9,-16]];
   const terraced=full.map(([role,x,y])=>[role,role==='citadelLeft'?-12:role==='citadelRight'?12:x,['citadelLeft','citadelRight'].includes(role)?0:y]);
   const compact=full.filter(([role])=>!['citadelLeft','citadelRight'].includes(role));
   placeMonument([['full',full],['terraced',terraced],['compact',compact]],'citadelPalace','citadelCrown');
  }else{
   // Lower governor's hall and gate court; no capital crown or border spill.
   const court=[['provinceWing',10,-4],['provinceHall',-5,-6],['provinceCourt',0,9],['provinceGate',-6,18]];
   placeMonument([['governor court',court],['governor court without side wing',court.filter(([role])=>role!=='provinceWing')]],'provinceHall');
  }

  // A former village gate can end inside the larger landmark's foundations.
  // Move only that visual approach outward on the same bearing; the landmark
  // and its regional centre stay fixed, and gameplay connections stay intact.
  const contacts=site.buildings.filter(b=>b.monument).flatMap(b=>b.roadContacts??[]);
  if(contacts.some(p=>Math.hypot(p.x-site.entrance.x,p.y-site.entrance.y)<5*unit)){
   const vx=site.entrance.x-site.x,vy=site.entrance.y-site.y,length=Math.hypot(vx,vy)||1;
   for(let reach=length;reach<=length+40*unit;reach+=2*unit){
    const p={x:site.x+vx/length*reach,y:site.y+vy/length*reach};
    if(regionAt(p.x,p.y)!==identity.regionId||contacts.some(c=>Math.hypot(c.x-p.x,c.y-p.y)<5*unit))continue;
    site.entrance=p;break;
   }
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
  const pad=capital?4*unit:0;
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
