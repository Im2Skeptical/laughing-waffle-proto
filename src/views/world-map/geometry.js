// A redraw-local index preserves editable definitions and avoids a linear
// vertex search for every point of every jagged regional outline.
export function createMapPolygonReader(definition) {
  const vertices=new Map();
  for(const vertex of definition?.geometry?.vertices??[])if(!vertices.has(vertex?.id))vertices.set(vertex?.id,vertex);
  return region => (region?.polygonVertexIds??[]).map(id=>vertices.get(id)).filter(Boolean);
}
