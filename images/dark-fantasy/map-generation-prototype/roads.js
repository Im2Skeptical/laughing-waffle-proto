// Broad route bends are planned over complete spans, never per-pixel jitter.
export function windRoad(path, { scale = 1, clear, wet, inTown }) {
  if (path.length < 3) return path;
  const distance = [0];
  for (let i=1;i<path.length;i++) distance.push(distance[i-1]+Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y));
  const total=distance.at(-1), result=path.map(p=>({...p}));
  const protectedLength=16*scale;
  // Alternate broad bows, with zero displacement AND slope at each span end.
  // Validate the entire bow at once so obstacles cannot produce jagged fragments.
  const spanLength=65*scale;
  const spans=Math.max(1,Math.round((total-2*protectedLength)/spanLength));
  if(total<protectedLength*3) return result;
  for(let span=0;span<spans;span++) {
    const start=protectedLength+(total-2*protectedLength)*span/spans;
    const end=protectedLength+(total-2*protectedLength)*(span+1)/spans;
    const indices=distance.map((d,i)=>d>=start&&d<=end?i:-1).filter(i=>i>0&&i<path.length-1);
    if(indices.length<3||indices.some(i=>wet(path[i]))) continue;
    const a=path[indices[0]],b=path[indices.at(-1)],length=Math.hypot(b.x-a.x,b.y-a.y)||1;
    const sign=((span+Math.floor(path[0].x/17+path[0].y/13))%2)?1:-1;
    for(const amount of [1,.65,.35]) {
      const candidate=result.map(p=>({...p}));
      for(const i of indices) {
        const t=(distance[i]-start)/(end-start);
        const offset=sign*Math.sin(Math.PI*t)**2*Math.min(10*scale,(end-start)*.16)*amount;
        candidate[i]={x:path[i].x-(b.y-a.y)/length*offset,y:path[i].y+(b.x-a.x)/length*offset};
      }
      const first=indices[0],last=indices.at(-1);
      let valid=true;
      for(let i=first;i<=last+1;i++) if(wet(candidate[i])||inTown(candidate[i])||!clear(candidate[i-1],candidate[i])) {valid=false;break;}
      if(valid){for(const i of indices) result[i]=candidate[i];break;}
    }
  }
  return result;
}

// Disposable presentation routes between sample sites. No gameplay connections.
// Search the already-baked land lattice; the generator and its RNG stay untouched.
export function routeSampleRoads(sites, { width, height, regionIds, land, waterIndices, materialAt, bounds, scale = 1, exclusions = [] }) {
  const step = 2, minX = Math.max(0, bounds.minX), minY = Math.max(0, bounds.minY);
  const cols = Math.ceil((Math.min(width, bounds.maxX) - minX) / step), rows = Math.ceil((Math.min(height, bounds.maxY) - minY) / step);
  const size = cols * rows, costs = new Float32Array(size);
  const pixel = n => ({ x: minX + n % cols * step, y: minY + Math.floor(n / cols) * step });
  const dry = (x, y) => x >= 0 && y >= 0 && x < width && y < height && regionIds[y * width + x] >= 0 && land[y * width + x];
  const inTown = p => exclusions.some(s => ((p.x-s.x)/s.rx)**2 + ((p.y-s.y)/s.ry)**2 < .65);
  for (let n = 0; n < size; n++) {
    const p = pixel(n), i = p.y * width + p.x;
    if (dry(p.x, p.y) && !inTown(p)) costs[n] = waterIndices[i] >= 16 && waterIndices[i] <= 23 ? 14
      : ({ forest: 1.6, swamp: 2.1, mountains: 2.8 })[materialAt(p.x, p.y)] ?? 1;
  }
  const nearest = p => {
    let best = -1, distance = Infinity;
    for (let n = 0; n < size; n++) if (costs[n]) {
      const q = pixel(n), d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < distance) { best = n; distance = d; }
    }
    return best;
  };
  const search = (start, end) => {
    if (start < 0 || end < 0) return null;
    const heap = [], score = new Float32Array(size).fill(Infinity), parent = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size), goal = pixel(end);
    const push = entry => {
      let i = heap.length; heap.push(entry);
      while (i) { const j = (i - 1) >> 1; if (heap[j].f <= entry.f) break; heap[i] = heap[j]; i = j; }
      heap[i] = entry;
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let j = i * 2 + 1; if (j + 1 < heap.length && heap[j + 1].f < heap[j].f) j++;
          if (last.f <= heap[j].f) break; heap[i] = heap[j]; i = j;
        }
        heap[i] = last;
      }
      return top;
    };
    const heuristic = n => { const p = pixel(n); return Math.hypot(p.x - goal.x, p.y - goal.y) / step; };
    score[start] = 0; push({ n: start, f: heuristic(start) });
    while (heap.length) {
      const { n } = pop(); if (closed[n]) continue;
      if (n === end) {
        const path = []; for (let q = end; q !== -1; q = parent[q]) path.push(pixel(q));
        return path.reverse();
      }
      closed[n] = 1; const p = pixel(n), col = n % cols, row = Math.floor(n / cols);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || col + dx < 0 || row + dy < 0 || col + dx >= cols || row + dy >= rows) continue;
        const q = n + dy * cols + dx; if (!costs[q] || closed[q]) continue;
        // Both intermediate pixels and diagonal corners must remain on land.
        if (!dry(p.x + dx, p.y + dy) || (dx && dy && (!dry(p.x + step * dx, p.y) || !dry(p.x, p.y + step * dy)))) continue;
        const next = score[n] + (dx && dy ? Math.SQRT2 : 1) * (costs[n] + costs[q]) / 2;
        if (next >= score[q]) continue;
        score[q] = next; parent[q] = n; push({ n: q, f: next + heuristic(q) });
      }
    }
    return null;
  };
  const paths = [], connected = new Set(sites.length ? [0] : []), anchors = sites.map(nearest);
  // Connect the reachable sites by short routes; disconnected islands get no
  // invented causeway. All returned path samples belong to playable dry land.
  while (connected.size < sites.length) {
    const pairs = [];
    for (const a of connected) for (let b = 0; b < sites.length; b++) if (!connected.has(b)) {
      pairs.push({ a, b, d: Math.hypot(sites[a].x - sites[b].x, sites[a].y - sites[b].y) });
    }
    pairs.sort((a, b) => a.d - b.d); let joined = false;
    for (const pair of pairs) {
      const path = search(anchors[pair.a], anchors[pair.b]); if (!path) continue;
      path[0] = { ...sites[pair.a] }; path[path.length - 1] = { ...sites[pair.b] };
      paths.push(path); connected.add(pair.b); joined = true; break;
    }
    if (!joined) break;
  }
  return paths.map(path => {
    if (path.length < 3) return path;
    const wet = p => waterIndices[Math.round(p.y) * width + Math.round(p.x)] >= 16 && waterIndices[Math.round(p.y) * width + Math.round(p.x)] <= 23;
    const clear = (a, b) => {
      const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let n = 0; n <= count; n++) if (inTown({x:a.x + (b.x-a.x)*n/count,y:a.y+(b.y-a.y)*n/count}) || !dry(Math.round(a.x + (b.x - a.x) * n / count), Math.round(a.y + (b.y - a.y) * n / count))) return false;
      return true;
    };
    let shaped = path.map(p => ({ ...p }));
    // Relax lattice corners, keeping bridge samples fixed and checking every
    // replacement segment against real land. Narrow isthmuses stay intact.
    for (let pass = 0; pass < 16; pass++) {
      const next = shaped.map(p => ({ ...p }));
      for (let n = 1; n < shaped.length - 1; n++) {
        if (wet(path[n])) continue;
        const a = shaped[n - 1], p = shaped[n], b = shaped[n + 1];
        const q = { x: (a.x + p.x * 2 + b.x) / 4, y: (a.y + p.y * 2 + b.y) / 4 };
        if (!wet(q) && !inTown(q) && clear(a, q) && clear(q, b)) next[n] = q;
      }
      shaped = next;
    }
    shaped = windRoad(shaped, {scale,clear,wet,inTown});
    return shaped.map((p,i) => i === 0 || i === shaped.length-1 ? p : ({ x: Math.round(p.x), y: Math.round(p.y) }));
  });
}
