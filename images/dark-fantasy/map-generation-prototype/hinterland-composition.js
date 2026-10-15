import { decorationRandom } from './generator.js';

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
  // Two staggered crests make a mountain wall rather than a line of icons.
  // Ocean arcs are deliberately excluded; rivers remain real breaks.
  for(const [i,edge] of hinterlandBorderEdges(map).entries()) {
    const centre=pixel(regions.get(edge.regions[0]).centre),points=edge.points.map(pixel);
    let placed=0,attempts=0;
    for(const belt of [0,1]) {
      let travelled=0,next=random(i*997+belt*173)*7*detail;
      for(let j=1;j<points.length;j++) {
        const a=points[j-1],b=points[j],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
        while(length&&next<=travelled+length) {
          const t=(next-travelled)/length,x=a.x+dx*t,y=a.y+dy*t;
          const d=Math.hypot(x-centre.x,y-centre.y)||1,ux=(x-centre.x)/d,uy=(y-centre.y)/d;
          const salt=710001+i*9817+belt*271+attempts++*113;
          const indices=belt?[0,1,2,3,4,5,6]:Math.abs(dy)<Math.abs(dx)*.5?[0,1,6,7,10]:dx*dy<0?[2,4,6,10]:[3,5,7,10];
          let accepted;
          for(const offset of (belt?[28,38,48]:[8,15,23,31])) {
            accepted=add(x+ux*offset*detail,y+uy*offset*detail,
              belt?'mountains':'ridge-border',indices,salt,true);
            if(accepted)break;
          }
          if(accepted){placed++;next+=(Math.abs(dx/length)*accepted.w+Math.abs(dy/length)*accepted.h)*(.38+random(salt+5)*.16);}
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
    if(cluster<.38||random(salt+2)>.7)continue;
    if(props.some(p=>Math.hypot(p.left-x,p.top-y)<(p.barrier?23:14)*detail))continue;
    const family=field[1]>.45?'mountains':field[2]>.3?'swamp':field[3]>.28?'forest':'plains';
    const indices=family==='mountains'?[2,5,6,7,8,9,10,11]:family==='forest'?[0,1,2,3,4,5,7]:family==='swamp'?[0,1,3,5,6,8,10,11]:[4,5,6,7,8,9,10,11];
    add(x,y,family,indices,salt);
  }
  return {props,stats:{borders,barrierPieces:props.filter(p=>p.barrier).length,
    scatterPieces:props.filter(p=>!p.barrier).length,kinds:new Set(props.map(p=>p.kind.replace(/-mirror$/,''))).size}};
}
