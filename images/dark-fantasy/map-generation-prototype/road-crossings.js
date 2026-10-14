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

const bridgeImages = new WeakMap();
function bridgeImage(art) {
  if (bridgeImages.has(art)) return bridgeImages.get(art);
  const canvas = document.createElement('canvas'); canvas.width = art.rows[0].length; canvas.height = art.rows.length;
  const ctx = canvas.getContext('2d');
  art.rows.forEach((row, y) => [...row].forEach((code, x) => {
    if (!art.colours[code]) return;
    ctx.globalAlpha = art.opacity?.[y][x] ?? 1; ctx.fillStyle = art.colours[code]; ctx.fillRect(x, y, 1, 1);
  }));
  bridgeImages.set(art, canvas); return canvas;
}

export function paintBridge(span, detail, dot, stamp = null) {
  const { a, b } = span, dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (!length) return;
  if (stamp?.art) {
    const ctx = stamp.context, image = bridgeImage(stamp.art);
    // One coherent low span at world scale. No bright enlarged procedural piers.
    ctx.save(); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
    ctx.translate((a.x + b.x) / 2 - stamp.origin.x, (a.y + b.y) / 2 - stamp.origin.y);
    ctx.rotate(Math.atan2(dy, dx));
    const stampWidth = length + 2 * detail, stampHeight = Math.min(4 * detail, stampWidth * image.height / image.width);
    ctx.drawImage(image, -stampWidth / 2, -stampHeight / 2, stampWidth, stampHeight);
    ctx.restore(); return;
  }
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
