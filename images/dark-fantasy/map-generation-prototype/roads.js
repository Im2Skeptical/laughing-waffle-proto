// Disposable presentation routes between sample sites. No gameplay connections.
// Search the already-baked land lattice; the generator and its RNG stay untouched.
export function routeSampleRoads(sites, { width, height, regionIds, land, waterIndices, materialAt, bounds }) {
  const step = 2, minX = Math.max(0, bounds.minX), minY = Math.max(0, bounds.minY);
  const cols = Math.ceil((Math.min(width, bounds.maxX) - minX) / step), rows = Math.ceil((Math.min(height, bounds.maxY) - minY) / step);
  const size = cols * rows, costs = new Float32Array(size);
  const pixel = n => ({ x: minX + n % cols * step, y: minY + Math.floor(n / cols) * step });
  const dry = (x, y) => x >= 0 && y >= 0 && x < width && y < height && regionIds[y * width + x] >= 0 && land[y * width + x];
  for (let n = 0; n < size; n++) {
    const p = pixel(n), i = p.y * width + p.x;
    if (dry(p.x, p.y)) costs[n] = waterIndices[i] >= 16 && waterIndices[i] <= 23 ? 14
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
      paths.push(path); connected.add(pair.b); joined = true; break;
    }
    if (!joined) break;
  }
  return paths;
}
