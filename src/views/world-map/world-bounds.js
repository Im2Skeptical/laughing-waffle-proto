// View-only extent: one fixed illustrated apron around all playable outlines.
// Snap to whole atmosphere texels so time sampling stays in world coordinates.
export function getIllustratedWorldBounds(map) {
  const points=map.regions.flatMap(region=>region.outline),padding=320,step=16;
  const axis=(values,scale)=>({
    min:Math.floor((Math.min(...values)*scale-padding)/step)*step/scale,
    max:Math.ceil((Math.max(...values)*scale+padding)/step)*step/scale,
  });
  const x=axis(points.map(p=>p.x),1576),y=axis(points.map(p=>p.y),516);
  return {minX:x.min,minY:y.min,maxX:x.max,maxY:y.max};
}
