// Art-directed weather episodes, not meteorological simulation. A seed and the
// viewed second fully determine births, shapes and movement (including reverse).
import { decorationRandom } from './generator.js';
import { noise } from './water-drift.js';
import { cloudWeatherTime } from './cloud-cover.js';

// Full billows and broad banks surround sparse cumulus weather patches.
// The shared cover mask keeps the small clouds inside large openings.
export const CLOUD_FAMILIES = [
  {id:'billows',asset:'cloud-banks-v2.png',columns:2,rows:2,frames:4,
    spacing:[600,440],chance:.85,cadence:1350,width:[360,520],aspect:1,
    speed:[.10,.22],heading:.16,alpha:.78,warp:.012,shear:.018,develop:.10,evolution:1300},
  {id:'open-banks',asset:'cloud-banks-v3.png',columns:4,rows:2,frames:8,
    spacing:[520,390],chance:.90,cadence:1100,width:[400,580],aspect:1,
    speed:[.13,.29],heading:.03,alpha:.78,warp:.017,shear:.035,develop:.14,evolution:950},
  {id:'sparse-cumulus',asset:'cloud-cumulus-v1.png',columns:4,rows:2,frames:8,
    spacing:[390,300],chance:.65,cadence:1250,width:[160,270],aspect:.95,sparse:true,
    speed:[.08,.19],heading:.24,alpha:.70,warp:.014,shear:.020,develop:.12,evolution:1250},
];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const hash=(seed,col,row,family)=>seed^Math.imul(col,73856093)^Math.imul(row,19349663)^Math.imul(family+1,83492791);

// Each cell uses every silhouette once before drawing a new shuffled bag.
// The first/second swap prevents an immediate repeat at bag boundaries without
// recursion, retained history, or changing the previous bag's last element.
export function cloudFrame(cellSeed,generation,count=8) {
  const bag=Math.floor(generation/count),index=((generation%count)+count)%count;
  const shuffled=n=>{
    const frames=Array.from({length:count},(_,i)=>i),salt=cellSeed^Math.imul(n,1013904223);
    for(let i=count-1;i>0;i--){const j=Math.floor(decorationRandom(salt,i+91)*(i+1));[frames[i],frames[j]]=[frames[j],frames[i]];}
    return frames;
  };
  const frames=shuffled(bag);
  if(frames[0]===shuffled(bag-1)[count-1])[frames[0],frames[1]]=[frames[1],frames[0]];
  return frames[index];
}

export function cloudBanks(world,seconds,seed) {
  seconds=cloudWeatherTime(seconds);
  const banks=[];
  for(const [family,profile] of CLOUD_FAMILIES.entries()) {
    const [sx,sy]=profile.spacing;
    // Lifetime <= 1.5*1.2*cadence; velocity <= maxSpeed. Include cell jitter,
    // meander and the rotated/stretched quad. This bound never grows with time.
    const reach=profile.cadence*1.8*profile.speed[1]+profile.width[1]+Math.max(sx,sy)*.4+100;
    const left=Math.floor((world[0]-reach)/sx),right=Math.ceil((world[0]+world[2]+reach)/sx);
    const top=Math.floor((world[1]-reach)/sy),bottom=Math.ceil((world[1]+world[3]+reach)/sy);
    for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++) {
      const cellSeed=hash(seed,col,row,family);
      const cadence=profile.cadence*(.8+.4*decorationRandom(cellSeed,0));
      const offset=cadence*decorationRandom(cellSeed,1);
      const epoch=Math.floor((seconds+offset)/cadence);
      // Only two overlapping generations can be alive. No immortal repeating
      // sprite: the next generation has its own shape, position and trajectory.
      for(let generation=epoch-1;generation<=epoch;generation++) {
        const episodeSeed=cellSeed^Math.imul(generation,1640531513);
        let sample=10;const rng=()=>decorationRandom(episodeSeed,sample++);
        const birth=generation*cadence-offset;
        // Cover is sampled per pixel in the material, not once at birth.
        // Shared large openings can cross many overlapping cloud banks.
        if(rng()>profile.chance)continue;
        const frame=cloudFrame(cellSeed,generation,profile.frames);
        const lifetime=cadence*(1.05+.45*rng());
        const age=seconds-birth,fraction=age/lifetime;
        if(fraction<=0||fraction>=1)continue;
        const life=smooth(0,.24,fraction)*(1-smooth(.72,1,fraction));
        const phase=rng()*79,variation=rng();
        const anchorX=col*sx+(rng()-.5)*sx*.72,anchorY=row*sy+(rng()-.5)*sy*.72;
        const speed=profile.speed[0]+rng()*(profile.speed[1]-profile.speed[0]);
        const angle=profile.heading+(rng()-.5)*.42+.16*noise(col*.2,row*.2,birth/3600);
        const meander=family===0?28:38;
        const x=anchorX+age*speed*Math.cos(angle)+meander*noise(phase,19,age/(lifetime*.7));
        const y=anchorY+age*speed*Math.sin(angle)+meander*noise(73,phase,age/(lifetime*.9));
        const mature=smooth(0,.55,fraction);
        const width=(profile.width[0]+rng()*(profile.width[1]-profile.width[0]))*
          (1-profile.develop+profile.develop*mature);
        const height=width*profile.aspect*(.86+rng()*.28);
        const rotation=(variation-.5)*.4;
        // Bounding circle contains rotation and deformation, so cropped and
        // full-map queries give identical clouds at their shared edges.
        const radius=Math.hypot(width,height)/2;
        if(x+radius<world[0]||x-radius>world[0]+world[2]||y+radius<world[1]||y-radius>world[1]+world[3])continue;
        banks.push({id:`${family}/${col}/${row}/${generation}`,family,frame,x,y,width,height,
          rotation,alpha:profile.alpha,life,phase,age:fraction,columns:profile.columns,rows:profile.rows,
          cover:true,sparse:!!profile.sparse,weatherTime:seconds,salt:(seed%997)*.0713,
          evolution:age/profile.evolution,
          warp:profile.warp,shear:profile.shear*(fraction-.35)});
      }
    }
  }
  // Stable cloud altitude order, independent of discovery/culling order.
  return banks.sort((a,b)=>a.family-b.family||a.id.localeCompare(b.id));
}
