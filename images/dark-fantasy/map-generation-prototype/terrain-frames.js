// Source-sheet extraction is independent of Pixi and the camera.
export function findTerrainFrames(data, width, height, columns, rows) {
  const cw = width / columns, ch = height / rows;
  const gutter = (nominal, span, horizontal, start, end) => {
    let best = Math.round(nominal), score = Infinity;
    const limit = horizontal ? height : width;
    for (let p = Math.max(1, Math.floor(nominal - span * .34)); p < Math.min(limit - 1, nominal + span * .34); p++) {
      let cost = Math.abs(p - nominal) / span;
      for (let q = start; q < end; q++) {
        const index = horizontal ? p * width + q : q * width + p;
        const alpha = Math.max(data[index * 4 + 3], data[(index - (horizontal ? width : 1)) * 4 + 3]);
        cost += alpha > 120 ? 1 : alpha > 45 ? .08 : 0;
      }
      if (cost < score) { score = cost; best = p; }
    }
    return best;
  };
  // The generated sheets keep their row/column order, but not exact gutters.
  // Find row gaps first, then let each row have its own unequal cell widths.
  const ys = [0, ...Array.from({ length: rows - 1 }, (_, n) => gutter((n + 1) * ch, ch, true, 0, width)), height];
  const frames = [];
  for (let row = 0; row < rows; row++) {
    const xs = [0, ...Array.from({ length: columns - 1 }, (_, n) => gutter((n + 1) * cw, cw, false, ys[row], ys[row + 1])), width];
    for (let col = 0; col < columns; col++) frames.push({ left: xs[col], right: xs[col + 1], top: ys[row], bottom: ys[row + 1] });
  }
  return frames;
}

export function terrainFrameCutRuns(data, width, frame) {
  const { left, right, top, bottom } = frame, runs = {};
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const vertical = side === 'left' || side === 'right';
    let run = 0, longest = 0;
    for (let n = vertical ? top : left; n < (vertical ? bottom : right); n++) {
      const x = vertical ? side === 'left' ? left : right - 1 : n;
      const y = vertical ? n : side === 'top' ? top : bottom - 1;
      run = data[(y * width + x) * 4 + 3] > 180 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    if (longest > 24) runs[side] = longest;
  }
  return runs;
}
