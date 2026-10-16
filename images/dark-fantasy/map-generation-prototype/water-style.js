export const WATER_BODY={ocean:1,lake:2,river:3,peat:4};
export const WATER_RAMPS=[
  {name:'river flow',start:16,length:8,stepsPerSecond:3},
  {name:'peat ripples',start:48,length:8,stepsPerSecond:.6},
  {name:'lake ripples',start:112,length:16,stepsPerSecond:1.5},
  {name:'ocean swell',start:128,length:32,stepsPerSecond:3},
  {name:'breaking surf',start:160,length:32,stepsPerSecond:5},
  {name:'offshore whitecaps',start:192,length:16,stepsPerSecond:2},
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

export const WATER_VARIANTS=8;
export const STUDY_YEAR_SECONDS=32; // Default live calendar: four 8-second seasons.

// Analytic multi-year modulation. A sample never depends on the previous frame,
// scrub direction, frame count, or wall time. Different banks/regions drift apart.
export function waterCycleProfile(ramp,seconds,variant=0) {
  const salt=ramp.start*.137+variant*1.618;
  const medium=seconds*Math.PI*2/(STUDY_YEAR_SECONDS*7.3+variant*17+ramp.start*.2);
  const slow=seconds*Math.PI*2/(STUDY_YEAR_SECONDS*29.7+variant*67+ramp.start*1.3);
  const a=Math.sin(salt+medium)-Math.sin(salt);
  const b=Math.sin(salt*.7+slow)-Math.sin(salt*.7);
  return {phase:seconds*ramp.stepsPerSecond*(1+Math.sin(salt)*.12)+ramp.length*(a*.45+b*.7),
    envelope:1-.42*a*a/4-.26*b*b/4};
}

export function waterPaletteColour(index,bank,mixColour,seconds=0,variation=0) {
  const ramp=WATER_RAMPS.find(r=>index>=r.start&&index<r.start+r.length);
  if(!ramp)return bank[index]||0;
  const sample=variant=>{
    const timing=waterCycleProfile(ramp,seconds,variant),offset=Math.floor(timing.phase);
    const phase=ramp.start+((index-ramp.start+offset)%ramp.length+ramp.length)%ramp.length;
    const next=ramp.start+(phase-ramp.start+1)%ramp.length;
    const colour=mixColour(bank[phase],bank[next],timing.phase-offset);
    return mixColour(bank[ramp.start+Math.floor(ramp.length*.85)],colour,timing.envelope);
  };
  const v=Math.max(0,Math.min(WATER_VARIANTS-1,variation)),lo=Math.floor(v),hi=Math.min(WATER_VARIANTS-1,lo+1);
  return lo===v?sample(lo):mixColour(sample(lo),sample(hi),v-lo);
}

// Integer variant rows used by the GPU palette. Share each analytic phase
// across its whole ramp rather than evaluating it once for every colour.
export function writeWaterPalette(bytes,bank,mixColour,seconds) {
  const put=(index,row,colour)=>{
    const p=(row*256+index)*4;
    bytes[p]=colour>>16&255;bytes[p+1]=colour>>8&255;bytes[p+2]=colour&255;bytes[p+3]=255;
  };
  for(let i=0;i<256;i++)put(i,0,bank[i]||0);
  for(let row=1;row<=WATER_VARIANTS;row++) {
    bytes.copyWithin(row*1024,0,1024);
    for(const ramp of WATER_RAMPS) {
      const timing=waterCycleProfile(ramp,seconds,row-1),offset=Math.floor(timing.phase);
      for(let i=0;i<ramp.length;i++) {
        const phase=ramp.start+((i+offset)%ramp.length+ramp.length)%ramp.length;
        const next=ramp.start+(phase-ramp.start+1)%ramp.length;
        const colour=mixColour(bank[phase],bank[next],timing.phase-offset);
        put(ramp.start+i,row,mixColour(bank[ramp.start+Math.floor(ramp.length*.85)],colour,timing.envelope));
      }
    }
  }
}

export function waterColourAt(index,base,strength,bank,mixColour,seconds=0,variation=0) {
  const colour=waterPaletteColour(index,bank,mixColour,seconds,variation);
  return base?mixColour(base,colour,strength/255):colour;
}
