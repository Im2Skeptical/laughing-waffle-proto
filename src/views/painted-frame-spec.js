// Geometry of the painted class-picker frames (images/dark-fantasy/class-picker-frames-v1).
// Pure data so scripts/class-picker-frames-test.mjs can check it against the packed
// atlas and layout.json. All sizes below are STORED atlas pixels unless noted; `unit`
// is design pixels (the 2424x1080 canvas) per stored pixel at the size we draw.
export const FRAME_PREFIX = 'class-picker-frames-v1/';

// The window is assembled, not nine-sliced: its stone edges are carved with runes and
// cracks that would smear if stretched ~5x, so corners are fixed, edges tile and a gem
// sits on the top and bottom centres. `source` is the keyed source image (source px);
// `scale` is design px per source px; stored art is half that size (build.py STORE).
export const WINDOW_FRAME = Object.freeze({
  unit: 0.72, scale: 0.36,
  source: Object.freeze({ width: 1185, height: 581, corner: [362, 214], top: [22, 96], bottom: [488, 553], left: [20, 92], right: [1093, 1165] }),
  pieces: Object.freeze({
    cornerTl: 'window-corner-tl', cornerTr: 'window-corner-tr', cornerBl: 'window-corner-bl', cornerBr: 'window-corner-br',
    edgeTop: 'window-edge-top', edgeBottom: 'window-edge-bottom', edgeLeft: 'window-edge-left', edgeRight: 'window-edge-right',
    gemTop: 'window-gem-top', gemBottom: 'window-gem-bottom',
  }),
  // Where the rim's inner edge sits inside the window rectangle (design px).
  inset: 34,
});

// Nine-slice frames: stored size, slice insets [left, top, right, bottom] in stored px
// and the drawn unit (design px per stored px).
export const NINE_SLICE_FRAMES = Object.freeze({
  panel: Object.freeze({ file: 'panel', size: [55, 55], insets: [16, 16, 16, 16], unit: 0.57, fillInset: 5 }),
  banner: Object.freeze({ file: 'banner', size: [407, 631], insets: [58, 56, 58, 153], unit: 0.945, fillInset: 0 }),
  tab: Object.freeze({ file: 'tab', size: [212, 149], insets: [50, 50, 50, 50], unit: 0.7, fillInset: 14 }),
  tabSelected: Object.freeze({ file: 'tab-selected', size: [226, 161], insets: [56, 56, 56, 56], unit: 0.7, fillInset: 16 }),
  tabLocked: Object.freeze({ file: 'tab-locked', size: [210, 144], insets: [50, 50, 50, 50], unit: 0.7, fillInset: 14 }),
});

export const SOCKET_FRAME = Object.freeze({ file: 'socket', size: [128, 128] });

// Every frame name that must exist in the atlas.
export const FRAME_FILES = Object.freeze([
  ...Object.values(WINDOW_FRAME.pieces),
  ...Object.values(NINE_SLICE_FRAMES).map(frame => frame.file),
  SOCKET_FRAME.file,
]);
