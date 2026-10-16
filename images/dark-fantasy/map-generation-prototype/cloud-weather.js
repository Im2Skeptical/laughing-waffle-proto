// Art-directed weather episodes, not meteorological simulation. A seed and the
// viewed second fully determine births, shapes and movement (including reverse).
import { decorationRandom } from './generator.js';
import { noise } from './water-drift.js';

export const CLOUD_FAMILIES = [
  {id:'cumulus',asset:'cloud-cumulus-v1.png',spacing:[510,390],chance:.62,
    cadence:640,width:[170,280],aspect:.88,speed:[.07,.15],heading:.18,
    alpha:.76,warp:.035,shear:.025,develop:.28},
  {id:'stratocumulus',asset:'cloud-stratocumulus-v1.png',spacing:[720,520],chance:.48,
    cadence:1450,width:[310,480],aspect:.78,speed:[.10,.20],heading:.06,
    alpha:.69,warp:.018,shear:.055,develop:.12},
  {id:'cirrus',asset:'cloud-cirrus-v1.png',spacing:[880,580],chance:.55,
    cadence:2150,width:[360,610],aspect:.58,speed:[.22,.35],heading:-.16,
    alpha:.38,warp:.014,shear:.14,develop:.08},
];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const hash=(seed,col,row,family)=>seed^Math.imul(col,73856093)^Math.imul(row,19349663)^Math.imul(family+1,83492791);

// Each cell uses every silhouette once before drawing a new shuffled bag.
// The first/second swap prevents an immediate repeat at bag boundaries without
// recursion, retained history, or changing the previous bag's last element.
export function cloudFrame(cellSeed,generation) {
  const bag=Math.floor(generation/8),index=((generation%8)+8)%8;
  const shuffled=n=>{
    const frames=[0,1,2,3,4,5,6,7],salt=cellSeed^Math.imul(n,1013904223);
    for(let i=7;i>0;i--){const j=Math.floor(decorationRandom(salt,i+91)*(i+1));[frames[i],frames[j]]=[frames[j],frames[i]];}
    return frames;
  };
  const frames=shuffled(bag);
  if(frames[0]===shuffled(bag-1)[7])[frames[0],frames[1]]=[frames[1],frames[0]];
  return frames[index];
}

export function cloudBanks(world,seconds,seed) {
  const banks=[];
  for(const [family,profile] of CLOUD_FAMILIES.entries()) {
    const [sx,sy]=profile.spacing;
    // Lifetime <= 1.3*1.2*cadence; velocity <= maxSpeed. Include cell jitter,
    // meander and the rotated/stretched quad. This bound never grows with time.
    const reach=profile.cadence*1.56*profile.speed[1]+profile.width[1]+Math.max(sx,sy)*.4+100;
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
        if(rng()>profile.chance)continue;
        const frame=cloudFrame(cellSeed,generation),fragments=family===0&&frame>=4;
        const birth=generation*cadence-offset,lifetime=cadence*(.85+.45*rng())*(fragments?.85:1);
        const age=seconds-birth,fraction=age/lifetime;
        if(fraction<=0||fraction>=1)continue;
        const life=smooth(0,fragments?.18:.24,fraction)*(1-smooth(fragments?.52:.64,1,fraction));
        const phase=rng()*79,variation=rng();
        const anchorX=col*sx+(rng()-.5)*sx*.72,anchorY=row*sy+(rng()-.5)*sy*.72;
        const speed=profile.speed[0]+rng()*(profile.speed[1]-profile.speed[0]);
        const angle=profile.heading+(rng()-.5)*.42+.16*noise(col*.2,row*.2,birth/3600);
        const meander=(family===0?24:family===1?36:18);
        const x=anchorX+age*speed*Math.cos(angle)+meander*noise(phase,19,age/(lifetime*.7));
        const y=anchorY+age*speed*Math.sin(angle)+meander*noise(73,phase,age/(lifetime*.9));
        const mature=smooth(0,.55,fraction);
        const width=(profile.width[0]+rng()*(profile.width[1]-profile.width[0]))*
          (1-profile.develop+profile.develop*mature)*(family===2?.9+.23*fraction:1);
        const height=width*profile.aspect*(.86+rng()*.28)*(family===2?1-.14*fraction:1);
        const rotation=family===2?angle+(variation-.5)*.18:(variation-.5)*.5;
        // Bounding circle contains rotation and deformation, so cropped and
        // full-map queries give identical clouds at their shared edges.
        const radius=Math.hypot(width,height)/2;
        if(x+radius<world[0]||x-radius>world[0]+world[2]||y+radius<world[1]||y-radius>world[1]+world[3])continue;
        banks.push({id:`${family}/${col}/${row}/${generation}`,family,frame,x,y,width,height,
          rotation,alpha:profile.alpha*(fragments?.9:1),life,phase,age:fraction,
          evolution:age/(family===0?380:family===1?1100:1900),
          warp:profile.warp*(fragments?1.3:1),shear:profile.shear*(fraction-.35)});
      }
    }
  }
  // Stable cloud altitude order, independent of discovery/culling order.
  return banks.sort((a,b)=>a.family-b.family||a.id.localeCompare(b.id));
}
