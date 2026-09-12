// Physical dimensions are shared by faces, slots, inspection and drag targets.
export const PIECE_SIZE = Object.freeze({ practiceWidth: 170, practiceHeight: 238, cellWidth: 120, structureHeight: 160, gap: 12 });

export function pieceDimensions(kind = 'practice', footprint = 1) {
  return kind === 'structure'
    ? { width: PIECE_SIZE.cellWidth * footprint, height: PIECE_SIZE.structureHeight }
    : { width: PIECE_SIZE.practiceWidth, height: PIECE_SIZE.practiceHeight };
}

export function fitPiece(rect, kind, footprint = 1) {
  const size = pieceDimensions(kind, footprint);
  const scale = Math.min(rect.width / size.width, rect.height / size.height);
  return { ...size, scale, x: rect.x + (rect.width - size.width * scale) / 2, y: rect.y + (rect.height - size.height * scale) / 2 };
}

export function constructionGeometry(rect, capacity) {
  const scale = Math.min(rect.width / (Math.max(1, capacity) * PIECE_SIZE.cellWidth), rect.height / PIECE_SIZE.structureHeight);
  return { x: rect.x, y: rect.y, cell: PIECE_SIZE.cellWidth * scale, height: PIECE_SIZE.structureHeight * scale, width: capacity * PIECE_SIZE.cellWidth * scale };
}
