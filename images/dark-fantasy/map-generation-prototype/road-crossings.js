// Detect complete wet runs, including their dry approaches. Rendering consumes
// one span per crossing, rather than drawing isolated planks on wet pixels.
export function bridgeSpans(samples, waterAt, detail) {
  const spans = [];
  const wet = p => { const v = waterAt(p); return v >= 16 && v <= 23; };
  for (let n = 0; n < samples.length; n++) {
    if (!wet(samples[n])) continue;
    const first = n; while (n + 1 < samples.length && wet(samples[n + 1])) n++;
    const last = n;
    let start = Math.max(0, first - 1), end = Math.min(samples.length - 1, last + 1);
    let distance = 0;
    while (start > 0 && distance < 4 * detail) {
      distance += Math.hypot(samples[start].x - samples[start - 1].x, samples[start].y - samples[start - 1].y); start--;
    }
    distance = 0;
    while (end < samples.length - 1 && distance < 4 * detail) {
      distance += Math.hypot(samples[end].x - samples[end + 1].x, samples[end].y - samples[end + 1].y); end++;
    }
    spans.push({ start, end, firstWet: first, lastWet: last, a: samples[start], b: samples[end] });
  }
  return spans;
}

export function paintBridge(span, detail, dot) {
  const { a, b } = span, dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (!length) return;
  const nx = -dy / length, ny = dx / length, half = 2 * detail, steps = Math.ceil(length);
  const at = (t, side, colour, shadow = 0) => dot(Math.round(a.x + dx * t + nx * side), Math.round(a.y + dy * t + ny * side + shadow), 0, colour);
  // Cast shadow, continuous dark structure, timber deck and cross-grain planks.
  for (let n = 0; n <= steps; n++) for (let side = -half; side <= half; side++) at(n / steps, side, '#34372f', 2 * detail);
  for (let n = 0; n <= steps; n++) for (let side = -half; side <= half; side++) {
    const rail = Math.abs(side) === half;
    at(n / steps, side, rail ? side < 0 ? '#d3c09c' : '#574734'
      : n % (3 * detail) === 0 ? '#817057' : '#b2a07b');
  }
  // Stone abutments on dry banks; posts and their shadows bind deck to terrain.
  for (const t of [0, 1]) for (let side = -half - detail; side <= half + detail; side++) {
    at(t, side, '#655e4b', detail); at(t, side, '#c3b79a');
  }
  for (let n = 0; n <= steps; n += 5 * detail) for (const side of [-half, half]) {
    at(n / steps, side, '#3c342b'); at(n / steps, side, '#d9c7a2', -detail);
  }
}
