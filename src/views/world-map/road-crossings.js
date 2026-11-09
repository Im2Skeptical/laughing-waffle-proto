// View-local route decorations. Pose is a pure function of viewed time, so
// rewind restores the ferry and its wake without consuming simulation RNG.
export function ferryPose(points, seconds) {
  const lengths = points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
  const total = lengths.reduce((a,b)=>a+b,0);
  const phase = ((seconds/24)%2+2)%2, forward = phase < 1;
  let distance = total * (forward ? phase : 2-phase);
  for (let i=0;i<lengths.length;i++) {
    if (distance<=lengths[i] || i===lengths.length-1) {
      const a=points[i],b=points[i+1],t=lengths[i] ? distance/lengths[i] : 0;
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)+(forward?0:Math.PI)};
    }
    distance-=lengths[i];
  }
  return {...points[0],angle:0};
}

export function addFerryCrossing(parent, points) {
  const root=new PIXI.Container(); root.label='ferry-crossing'; root.eventMode='none';parent.addChild(root);
  const route=new PIXI.Graphics();root.addChild(route);
  for(let i=1;i<points.length;i++) if(i%4<2)route.lineStyle(.45,0xc2d7cc,.5).moveTo(points[i-1].x,points[i-1].y).lineTo(points[i].x,points[i].y);
  for(const [a,b] of [[points[0],points[1]],[points.at(-1),points.at(-2)]]) {
    const dock=new PIXI.Graphics();dock.position.set(a.x,a.y);dock.rotation=Math.atan2(b.y-a.y,b.x-a.x);
    dock.beginFill(0x171e1b,.8).drawRect(-8,-7,29,17).endFill();
    dock.lineStyle(2,0x554535).beginFill(0xb09a71).drawRect(-10,-5,28,10).endFill();
    for(let x=-7;x<18;x+=5)dock.lineStyle(1,0x66563d).moveTo(x,-5).lineTo(x,5);
    for(const x of [-8,15])for(const y of [-7,7])dock.beginFill(0xdbc49c).drawCircle(x,y,2).endFill();
    dock.scale.set(.2);dock.label='ferry-dock';root.addChild(dock);
  }
  const boat=new PIXI.Container();boat.label='ferry-boat';root.addChild(boat);
  const ink=new PIXI.Graphics();boat.addChild(ink);
  ink.beginFill(0x102b30,.6).drawEllipse(0,3,20,10).endFill();
  ink.lineStyle(1.5,0xd6e4d1,.7).moveTo(-15,-7).lineTo(-25,-12).moveTo(-15,7).lineTo(-25,12);
  ink.lineStyle(2,0x332c25).beginFill(0xb18a58).drawPolygon([-13,-8,8,-8,17,0,8,8,-13,8,-17,0]).endFill();
  ink.lineStyle(1,0x735234).moveTo(-10,-7).lineTo(-10,7).moveTo(-5,-7).lineTo(-5,7);
  ink.lineStyle(1.2,0x695b43).beginFill(0xf4e7c6).drawPolygon([-4,-7,11,0,-4,7]).endFill();
  // Same world scale as the fitted settlement pieces, including when zoomed
  // out. Boats are small map objects, rather than fixed-size screen markers.
  ink.scale.set(.18);
  return { root, sample(seconds){
    const pose=ferryPose(points,seconds);boat.position.set(pose.x,pose.y);boat.rotation=pose.angle;
  } };
}

export function landRoadSections(path, ferries) {
  const key=(a,b)=>`${a.x},${a.y}:${b.x},${b.y}`;
  const wet=new Set(ferries.flatMap(f=>f.points.slice(1).map((p,i)=>key(f.points[i],p))));
  const sections=[];
  let section=[];
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    if(wet.has(key(a,b))){if(section.length>1)sections.push(section);section=[];continue;}
    if(!section.length)section.push(a);
    section.push(b);
  }
  if(section.length>1)sections.push(section);
  return sections;
}

// A short carriageway across each ordinary frontier preserves road continuity.
// Selected territory ink is drawn afterwards by the caller.
export function roadBorderCrossings(path, segments) {
  const result=[];
  for(let i=1;i<path.length;i++)for(const {from:a,to:b} of segments) {
    const p=path[i-1],q=path[i],dx=q.x-p.x,dy=q.y-p.y,ex=b.x-a.x,ey=b.y-a.y;
    const cross=dx*ey-dy*ex;
    if(Math.abs(cross)<1e-8)continue;
    const t=((a.x-p.x)*ey-(a.y-p.y)*ex)/cross;
    const u=((a.x-p.x)*dy-(a.y-p.y)*dx)/cross;
    if(t<0||t>1||u<0||u>1)continue;
    const length=Math.hypot(dx,dy),x=p.x+dx*t,y=p.y+dy*t;
    if(result.some(r=>Math.hypot(r.x-x,r.y-y)<1))continue;
    result.push({x,y,dx:dx/length,dy:dy/length});
  }
  return result;
}
