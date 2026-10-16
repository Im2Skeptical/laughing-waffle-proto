// Stored atlas pixels; unit is design pixels per stored pixel on the 2424x1080 canvas.
export const FRAME_PREFIX = 'class-picker-frames-v1/';

// Fixed corners and repeating carved edges keep the wide modal's ornament crisp.
export const WINDOW_FRAME = Object.freeze({
  unit: 1, corner: 64,
  pieces: Object.freeze({
    cornerTl: 'window-corner-tl', cornerTr: 'window-corner-tr', cornerBl: 'window-corner-bl', cornerBr: 'window-corner-br',
    edgeTop: 'window-edge-top', edgeBottom: 'window-edge-bottom', edgeLeft: 'window-edge-left', edgeRight: 'window-edge-right',
  }),
  // Where the rim's inner edge sits inside the window rectangle (design px).
  inset: 34,
});

// One master carving supplies all rectangular surfaces. Selection and locking
// change the metal tint, retaining the same silhouette and slice geometry.
const panel = unit => Object.freeze({ unit, fillInset: 5 });
export const PANEL_FRAMES = Object.freeze({
  panel: panel(0.4), banner: panel(1), tab: panel(0.4),
  tabSelected: panel(0.4), tabLocked: panel(0.4),
});

export const SOCKET_FRAME = Object.freeze({ file: 'socket', size: [128, 128] });

// Every frame name that must exist in the atlas.
export const FRAME_FILES = Object.freeze([
  ...Object.values(WINDOW_FRAME.pieces),
  SOCKET_FRAME.file,
]);
