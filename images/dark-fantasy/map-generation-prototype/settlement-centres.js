// View-only ground reservations. They are not region geometry or simulation land.
export function settlementCentreReservations(map,pixel,detail,urban=[]){
 const ranks=new Map(urban.map(site=>[site.regionId,site.rank])),unit=detail*.5;
 return map.regions.map(region=>{
  const rank=ranks.get(region.id),p=pixel(region.centre);
  return {regionId:region.id,...p,rx:(rank==='capital'?42:rank==='province'?32:28)*unit,
   ry:(rank==='capital'?52:rank==='province'?40:28)*unit};
 });
}

export function insideSettlementCentre(centres,x,y,regionId=null){
 return centres.some(p=>(regionId===null||p.regionId===regionId)&&((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2<1);
}

export function rasterizeSettlementCentres(centres,{map,width,height,regionIds}){
 const mask=new Uint8Array(width*height),indices=new Map(map.regions.map((r,i)=>[r.id,i]));
 for(const p of centres)for(let y=Math.max(0,Math.floor(p.y-p.ry));y<Math.min(height,p.y+p.ry);y++)
  for(let x=Math.max(0,Math.floor(p.x-p.rx));x<Math.min(width,p.x+p.rx);x++)
   if(regionIds[y*width+x]===indices.get(p.regionId)&&((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2<1)mask[y*width+x]=1;
 return mask;
}

export function rasterizeLandmarkFoundations(sites,width,height,margin){
 const mask=new Uint8Array(width*height);
 for(const site of sites)for(const b of site.buildings??[])if(b.monument)for(const p of b.roadContacts??[])
  for(let y=Math.max(0,Math.floor(p.y-margin));y<Math.min(height,p.y+margin+1);y++)
   for(let x=Math.max(0,Math.floor(p.x-margin));x<Math.min(width,p.x+margin+1);x++)
    if(Math.hypot(x-p.x,y-p.y)<=margin)mask[y*width+x]=1;
 return mask;
}
