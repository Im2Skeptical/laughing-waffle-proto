import { decorationRandom } from '../../../src/model/regional-map/generator.js';

export function hinterlandBorderEdges(map) {
  return map.edges.filter(e=>e.regions.length===1&&!map.world.oceanSides.includes(e.worldSide));
}

// Canonical terrain pixels only: no camera, zoom or mutable simulation RNG.
export function composeHinterland({map,art,pixel,world,detail,legal,sampleBackground}) {
  const props=[], borders=[], random=n=>decorationRandom(map.seed^59137,n);
  const regions=new Map(map.regions.map(r=>[r.id,r]));
  const add=(x,y,family,indices,salt,barrier=false)=>{
    const variants=indices.flatMap(n=>[`${n}`,`${n}-mirror`])
      .map((suffix,i)=>({kind:`terrain-hinterland-${family}-${suffix}`,rank:random(salt+i*67)}))
      .sort((a,b)=>a.rank-b.rank);
    for(const {kind} of variants) {
      const glyph=art[kind];if(!glyph||Object.keys(glyph.cutRuns??{}).length)continue;
      const w=glyph.rows[0].length,h=glyph.rows.length;
      const point=world(Math.round(x),Math.round(y+h*.5)),p=pixel(point);
      const prop={kind,point,salt,family:`hinterland-${family}`,background:true,hinterland:true,
        barrier,composed:true,anchorHeight:.5,ridgeBoundary:barrier,range:barrier,
        left:Math.round(p.x-w/2),top:Math.round(p.y-h)};
      if(props.some(q=>q.kind.replace(/-mirror$/,'')===kind.replace(/-mirror$/,'')
        &&Math.hypot(q.left-prop.left,q.top-prop.top)<(barrier?38:60)*detail))continue;
      if(!legal(prop))continue;
      props.push(prop);return {prop,w,h};
    }
    return null;
  };
  // Staggered crests and a broad low shoulder form a massif before fading.
  // Ocean arcs are deliberately excluded; rivers remain real breaks.
  for(const [i,edge] of hinterlandBorderEdges(map).entries()) {
    const centre=pixel(regions.get(edge.regions[0]).centre),points=edge.points.map(pixel);
    let placed=0,attempts=0;
    for(const belt of [0,1,2]) {
      let travelled=0,next=random(i*997+belt*173)*7*detail;
      for(let j=1;j<points.length;j++) {
        const a=points[j-1],b=points[j],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
        while(length&&next<=travelled+length) {
          const t=(next-travelled)/length,x=a.x+dx*t,y=a.y+dy*t;
          const d=Math.hypot(x-centre.x,y-centre.y)||1,ux=(x-centre.x)/d,uy=(y-centre.y)/d;
          const salt=710001+i*9817+belt*271+attempts++*113;
          const indices=belt===2?[5,6,7,8,9,11]:belt?[0,1,2,3,4,5,6]:Math.abs(dy)<Math.abs(dx)*.5?[0,1,6,7,10]:dx*dy<0?[2,4,6,10]:[3,5,7,10];
          let accepted;
          for(const offset of (belt===2?[48,59,72,85]:belt?[26,36,46]:[8,15,23,31])) {
            accepted=add(x+ux*offset*detail,y+uy*offset*detail,
              belt?'mountains':'ridge-border',indices,salt,true);
            if(accepted)break;
          }
          if(accepted){placed++;accepted.prop.foothill=belt===2;next+=(Math.abs(dx/length)*accepted.w+Math.abs(dy/length)*accepted.h)*(.38+random(salt+5)*.16);}
          else next+=5*detail;
        }
        travelled+=length;
      }
    }
    borders.push({edgeId:edge.id,placed,attempts});
  }
  // Correlated patches leave broad quiet spaces between crags, woodland and
  // mire, rather than repeating one small stamp on a visible grid.
  const lo=pixel({x:-1,y:-1}),hi=pixel({x:2,y:2}),field=new Float32Array(4);
  for(let n=0;n<550;n++) {
    const salt=910001+n*193,x=lo.x+random(salt)*(hi.x-lo.x),y=lo.y+random(salt+1)*(hi.y-lo.y);
    sampleBackground(world(x,y),field);if(field[0]>.35)continue;
    const cluster=random(Math.floor(x/(65*detail))*857^Math.floor(y/(45*detail))*3187);
    if(cluster<.38||random(salt+2)>.48)continue;
    if(props.some(p=>Math.hypot(p.left-x,p.top-y)<(p.barrier?23:14)*detail))continue;
    const family=field[1]>.45?'mountains':field[2]>.3?'swamp':field[3]>.28?'forest':'plains';
    const indices=family==='mountains'?[2,5,6,7,8,9,10,11]:family==='forest'?[0,1,2,3,4,5,7]:family==='swamp'?[0,1,3,5,6,8,10,11]:[4,5,6,7,8,9,10,11];
    add(x,y,family,indices,salt);
  }
  return {props,stats:{borders,barrierPieces:props.filter(p=>p.barrier).length,
    foothillPieces:props.filter(p=>p.foothill).length,
    scatterPieces:props.filter(p=>!p.barrier).length,kinds:new Set(props.map(p=>p.kind.replace(/-mirror$/,''))).size}};
}

// Merge the support fields first, then colour each pixel once. Overlapping
// mountains share one continuous scree bed rather than stacking bright discs.
export function paintHinterlandMass({props,art,width,height,colours,land,waterIndices,regionIds,detail,seed,noise,mixColour}) {
  const pieces=props.filter(p=>p.hinterland);
  if(!pieces.length)return {paintedPixels:0};
  const supports=pieces.map(p=>{
    const glyph=art[p.kind],w=glyph.rows[0].length,h=glyph.rows.length;
    return {x:p.left+w*.5,y:p.top+h*.73,rx:w*(p.barrier?1.0:.8)+9*detail,
      ry:h*(p.barrier?.72:.55)+9*detail,strength:p.barrier?1:.5};
  });
  const left=Math.max(0,Math.floor(Math.min(...supports.map(p=>p.x-p.rx*1.4))));
  const top=Math.max(0,Math.floor(Math.min(...supports.map(p=>p.y-p.ry*1.4))));
  const right=Math.min(width,Math.ceil(Math.max(...supports.map(p=>p.x+p.rx*1.4))));
  const bottom=Math.min(height,Math.ceil(Math.max(...supports.map(p=>p.y+p.ry*1.4))));
  const span=right-left,field=new Float32Array(span*(bottom-top));
  for(const p of supports)for(let y=Math.max(top,Math.floor(p.y-p.ry*1.4));y<Math.min(bottom,p.y+p.ry*1.4);y++)
    for(let x=Math.max(left,Math.floor(p.x-p.rx*1.4));x<Math.min(right,p.x+p.rx*1.4);x++) {
      const distance=Math.hypot((x-p.x)/p.rx,(y-p.y)/p.ry);
      const strength=Math.max(0,Math.min(1,(1.4-distance)/.85))*p.strength,index=(y-top)*span+x-left;
      field[index]=Math.max(field[index],strength);
    }
  let paintedPixels=0;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++) {
    const i=y*width+x,weight=field[(y-top)*span+x-left];
    if(!weight||!land[i]||waterIndices[i]||regionIds[i]>=0)continue;
    const broad=noise(seed^31471,x,y,31*detail),fine=noise(seed^88103,x,y,3*detail);
    const strata=noise(seed^57319,x+y*.65,y*.48,8*detail);
    const tone=44+broad*8+strata*6+(fine-.5)*9;
    const colour=(Math.round(tone-3)<<16)|(Math.round(tone+1)<<8)|Math.round(tone+6);
    // Fade the same grain with the mass; no independent high-contrast halo.
    const blend=Math.min(.78,weight*.72)*(.84+strata*.16);
    colours[i]=mixColour(colours[i],colour,blend);paintedPixels++;
  }
  return {paintedPixels};
}
