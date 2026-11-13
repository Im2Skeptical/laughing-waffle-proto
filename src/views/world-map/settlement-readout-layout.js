// View-only experiment: every town discloses its full crest at one shared zoom.
import {REGIONAL_READOUT_SCREEN_SCALE} from './constants.js';

function inside(point,polygon){
 let hit=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
 }
 return hit;
}
function segmentEntersRect(a,b,r){
 let low=0,high=1;
 for(const [p,q] of [[a.x-b.x,a.x-r.x],[b.x-a.x,r.x+r.width-a.x],[a.y-b.y,a.y-r.y],[b.y-a.y,r.y+r.height-a.y]]){
  if(Math.abs(p)<1e-10){if(q<0)return false;continue;}
  const t=q/p;if(p<0)low=Math.max(low,t);else high=Math.min(high,t);if(low>high)return false;
 }
 return true;
}
export function readoutRectInsideRegion(r,polygon){
 if(!polygon?.length)return false;
 if(![{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}].every(p=>inside(p,polygon)))return false;
 return !polygon.some((a,i)=>segmentEntersRect(a,polygon[(i+1)%polygon.length],r));
}
export function expandedCrestRect(bounds,zoom,{capital=false,unrest=false}={}){
 const scale=REGIONAL_READOUT_SCREEN_SCALE/zoom,top=capital?-76:unrest?-52:-44;
 return {x:(bounds.min.x+bounds.max.x)/2-94*scale,y:bounds.max.y+2*scale,width:188*scale,height:(64-top)*scale};
}
export function expandedCrestFootprints(bounds,zoom,{capital=false,unrest=false,thresholdShare=.5,zeroForceShare=.7}={}){
 const scale=REGIONAL_READOUT_SCREEN_SCALE/zoom,top=capital?-76:unrest?-52:-44;
 const cx=(bounds.min.x+bounds.max.x)/2,cy=bounds.max.y+(6-top)*scale;
 const shieldX=-66+132*(thresholdShare??.5);
 // Follow the painted taper rather than charging every region for the empty
 // lower corners of one large rectangle. Padding covers strokes/text overshoot.
 const pieces=[[-80,-40,160,75],[-74,33,148,12],[-60,43,120,10],[-30,51,60,9]];
 if(capital)pieces.push([shieldX-20,-76,40,37]);
 if(!unrest)pieces.push([shieldX-25,-46,50,54]);
 else pieces.push([-60,-58,120,34]);
 if(!unrest&&zeroForceShare!==null)pieces.push([-66+132*zeroForceShare-8,-45,16,45]);
 return pieces.map(([x,y,width,height])=>({x:cx+x*scale,y:cy+y*scale,width:width*scale,height:height*scale}));
}
export function expandedCrestFits(bounds,polygon,zoom,options={}){
 return expandedCrestFootprints(bounds,zoom,options).every(r=>readoutRectInsideRegion(r,polygon));
}
export function expandedCrestFitZoom(bounds,polygon,options={}){
 const fits=z=>expandedCrestFits(bounds,polygon,z,options);
 if(!fits(2.5))return Infinity;
 let low=.25,high=2.5;
 for(let i=0;i<16;i++){const mid=(low+high)/2;if(fits(mid))high=mid;else low=mid;}
 return high;
}
export function sharedCrestDisclosure(zoom,requirements,wasExpanded=false){
 const minimum=Math.max(.9,...requirements);
 // Collapse at the actual safe fit; a small higher expansion threshold prevents
 // wheel/pinch jitter from repeatedly swapping the entire map's readouts.
 const expand=Math.min(2.5,minimum+.04);
 return {expanded:Number.isFinite(minimum)&&zoom>=(wasExpanded?minimum:expand),minimum,expand};
}
