export const WATER_BODY={ocean:1,lake:2,river:3,peat:4};
export const WATER_RAMPS=[
  {name:'river flow',start:16,length:8,stepsPerSecond:3},
  {name:'peat ripples',start:48,length:8,stepsPerSecond:.6},
  {name:'lake ripples',start:112,length:16,stepsPerSecond:1.5},
  {name:'ocean swell',start:128,length:32,stepsPerSecond:3},
  {name:'breaking surf',start:160,length:32,stepsPerSecond:5},
  {name:'fine ocean ripples',start:208,length:32,stepsPerSecond:4},
  {name:'lake shore glints',start:240,length:16,stepsPerSecond:1},
];

// Open-sea connectivity, not proximity to an island or a biome label. Narrow
// inlets remain marine; completely enclosed basins receive freshwater graphics.
export function classifyWaterBodies(land,width,height) {
  const bodies=new Uint8Array(land.length),queue=new Int32Array(land.length);
  for(let i=0;i<land.length;i++)if(!land[i])bodies[i]=WATER_BODY.lake;
  let head=0,tail=0;
  const visit=i=>{if(bodies[i]===WATER_BODY.lake){bodies[i]=WATER_BODY.ocean;queue[tail++]=i;}};
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
  for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
  while(head<tail){const i=queue[head++],x=i%width;
    if(x)visit(i-1);if(x<width-1)visit(i+1);
    if(i>=width)visit(i-width);if(i<land.length-width)visit(i+width);
  }
  return bodies;
}

// During the ground pass, coastal dry pixels inherit their nearest water type.
// The exported field is cleared back to water-only after rivers/pools are drawn.
export function extendWaterEnvironment(bodies,land,dryDistance,width,height) {
  for(let pass=0;pass<2;pass++)for(let n=0;n<land.length;n++) {
    const i=pass?land.length-1-n:n;if(!land[i])continue;
    const x=i%width;let best=dryDistance[i];
    for(const j of [x?i-1:i,x<width-1?i+1:i,i>=width?i-width:i,i<land.length-width?i+width:i])
      if(bodies[j]&&dryDistance[j]<best){best=dryDistance[j];bodies[i]=bodies[j];}
  }
}

export function waterColourAt(index,base,strength,bank,mixColour,seconds=0) {
  if(!seconds)return base?mixColour(base,bank[index],strength/255):bank[index];
  const ramp=WATER_RAMPS.find(r=>index>=r.start&&index<r.start+r.length);
  const offset=ramp?Math.floor(seconds*ramp.stepsPerSecond):0;
  const phase=ramp?ramp.start+((index-ramp.start+offset)%ramp.length+ramp.length)%ramp.length:index;
  return base?mixColour(base,bank[phase],strength/255):bank[phase];
}
