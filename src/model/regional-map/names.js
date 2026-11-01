const DIRECTIONS = ['East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest', 'North', 'Northeast'];
const ADJECTIVES = { East: 'Eastern', Southeast: 'Southeastern', South: 'Southern', Southwest: 'Southwestern', West: 'Western', Northwest: 'Northwestern', North: 'Northern', Northeast: 'Northeastern', Central: 'Central' };
const BIOMES = { plains: 'Plains', forest: 'Forest', mountains: 'Mountains', swamp: 'Swamp', islands: 'Islands' };
const biomeOf = region => region.biome === 'monster' ? region.terrainBiome : region.biome;
const compareIds = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const pointOf = region => region.centre ?? {x:.5,y:.5};
const geographicOrder = (a,b) => pointOf(a).y - pointOf(b).y || pointOf(a).x - pointOf(b).x || compareIds(a,b);

function directionOf({x,y}) {
  if (Math.hypot(x-.5,y-.5) < .17) return 'Central';
  return DIRECTIONS[(Math.round(Math.atan2(y-.5,x-.5)/(Math.PI/4))+8)%8];
}
function letter(index) {
  let label = '';
  for (let value = index+1; value > 0; value = Math.floor((value-1)/26)) label = String.fromCharCode(65+(value-1)%26)+label;
  return label;
}
// Rectangular minimum-cost matching. Each compass slot is available once per
// round, so nearby regions use different directions before needing suffixes.
function minimumCostSlots(costs) {
  const rows=costs.length,columns=costs[0].length;
  const rowCost=Array(rows+1).fill(0),columnCost=Array(columns+1).fill(0);
  const matched=Array(columns+1).fill(0),previous=Array(columns+1).fill(0);
  for (let row=1;row<=rows;row++) {
    matched[0]=row;
    const distance=Array(columns+1).fill(Infinity),used=Array(columns+1).fill(false);
    let column=0;
    do {
      used[column]=true;
      const currentRow=matched[column];
      let delta=Infinity,next=0;
      for (let candidate=1;candidate<=columns;candidate++) if (!used[candidate]) {
        const cost=costs[currentRow-1][candidate-1]-rowCost[currentRow]-columnCost[candidate];
        if (cost<distance[candidate]) {distance[candidate]=cost;previous[candidate]=column;}
        if (distance[candidate]<delta) {delta=distance[candidate];next=candidate;}
      }
      for (let candidate=0;candidate<=columns;candidate++) {
        if (used[candidate]) {rowCost[matched[candidate]]+=delta;columnCost[candidate]-=delta;}
        else distance[candidate]-=delta;
      }
      column=next;
    } while (matched[column]!==0);
    do {
      const prior=previous[column];matched[column]=matched[prior];column=prior;
    } while (column!==0);
  }
  const result=Array(rows);
  for (let column=1;column<=columns;column++) if (matched[column]) result[matched[column]-1]=column-1;
  return result;
}
function patchDirections(members) {
  if (members.length===1) return [directionOf(pointOf(members[0]))];
  const points=members.map(pointOf);
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  const span=Math.max(maxX-minX,maxY-minY);
  const anchors=[...DIRECTIONS.map((name,index)=>({name,x:Math.cos(index*Math.PI/4),y:Math.sin(index*Math.PI/4)})),{name:'Central',x:0,y:0}];
  const slots=Math.ceil(members.length/DIRECTIONS.length)*anchors.length;
  const costs=points.map(point=>{
    // Preserve patch aspect ratio. Local geometry dominates, while the world
    // position gives a weaker orientation cue (and breaks symmetric ties).
    const globalX=point.x*2-1,globalY=point.y*2-1;
    const localX=span>0?(point.x*2-minX-maxX)/span:globalX;
    const localY=span>0?(point.y*2-minY-maxY)/span:globalY;
    const x=.75*localX+.25*globalX,y=.75*localY+.25*globalY;
    return Array.from({length:slots},(_,slot)=>{
      const anchor=anchors[slot%anchors.length];
      const centralPenalty=anchor.name==='Central'&&Math.hypot(localX,localY)>.5?100:0;
      // Six exceeds any positional-cost difference in normalized coordinates.
      // Exhaust meaningful compass/central slots before reusing one.
      return (x-anchor.x)**2+(y-anchor.y)**2+Math.floor(slot/anchors.length)*6+centralPenalty;
    });
  });
  return minimumCostSlots(costs).map(slot=>anchors[slot%anchors.length].name);
}

// Names describe the captured geometry only. The map seed fixes that geometry;
// naming consumes no simulation or geography RNG and adds no save fields.
export function generateRegionNames(_seed, regions, {settlement=false}={}) {
  const ordered=[...regions].sort(compareIds),byId=new Map(ordered.map(r=>[r.id,r]));
  const visited=new Set(),byBase=new Map(),names=new Map();
  for (const root of ordered) {
    if (visited.has(root.id)) continue;
    const members=[root];visited.add(root.id);
    for (const region of members) for (const id of region.neighbours??[]) {
      const neighbour=byId.get(id);
      if (!neighbour||visited.has(id)||biomeOf(neighbour)!==biomeOf(root)) continue;
      visited.add(id);members.push(neighbour);
    }
    members.sort(compareIds);
    const directions=patchDirections(members);
    members.forEach((region,index)=>{
      const base=`${ADJECTIVES[directions[index]]} ${BIOMES[biomeOf(root)]??'Region'}`;
      if (!byBase.has(base)) byBase.set(base,[]);
      byBase.get(base).push(region);
    });
  }
  // One letter sequence per shared label also avoids collisions between
  // disconnected patches in the same compass sector. Order is geographic.
  for (const [base,members] of byBase) {
    members.sort(geographicOrder).forEach((region,index)=>names.set(region.id,
      `${base}${members.length>1?` ${letter(index)}`:''}${settlement?' Market':''}`));
  }
  return regions.map(region=>names.get(region.id));
}
