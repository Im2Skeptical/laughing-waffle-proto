import { TIME_STATE_GRAPH_BG_ALPHA } from "../layout-pixi.js";
import { MUCHA_UI_COLORS } from "../ui-helpers/mucha-ui-palette.js";

export const TIMEGRAPH_THEME = Object.freeze({
  panelHeaderBg: MUCHA_UI_COLORS.surfaces.header,
  panelBodyBg: 0xe8cea0,
  panelBorder: 0x765438,
  textPrimary: 0x412e20,
  textMuted: 0x735b40,
  buttonBg: 0xdabd86,
  buttonBgActive: 0xb39461,
  legendStroke: MUCHA_UI_COLORS.surfaces.borderSoft,
  legendStrokeHover: MUCHA_UI_COLORS.ink.primary,
  gridMajor: 0x806847,
  gridMinor: 0x967e5b,
  actionMarker: MUCHA_UI_COLORS.accents.sage,
  eventMarkerNormal: MUCHA_UI_COLORS.intent.softPop,
  eventMarkerCritical: MUCHA_UI_COLORS.intent.dangerPop,
  forecastMarker: 0x5a6541,
  scrubMarker: 0x483624,
  scrubLiveMarker: MUCHA_UI_COLORS.accents.gold,
});

export const ITEM_UNAVAILABLE_ZONE_ALPHA = Math.min(
  1,
  TIME_STATE_GRAPH_BG_ALPHA * 3.5
);
export const FORECAST_PENDING_ZONE_ALPHA = Math.min(
  1,
  TIME_STATE_GRAPH_BG_ALPHA * 4.5
);
export const FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC = 480;
export const FORECAST_REVEAL_TARGET_DURATION_SEC = 0.6;
export const FORECAST_REVEAL_PLOT_THROTTLE_MS = 16;
export const FORECAST_REVEAL_PREVIEW_REFRESH_MS = 120;
export const FORECAST_REVEAL_MARKER_ALPHA = 0.92;
export const TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC = 0.22;
export const TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC = 480;
export const TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC = 9600;
export const PLOT_SNAPSHOT_BOUNDS_QUANTUM_SEC = 32;
export const PLOT_REFRESH_OVERSCAN_POINTS = 1;
export const PROJECTION_REPLACEMENT_FLASH_ALPHA = 0.22;
export const PROJECTION_REPLACEMENT_DIM_ALPHA = 0.07;
export const PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA = 0.88;
export const PROJECTION_REPLACEMENT_DIM_LINE_ALPHA = 0.24;
export const PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS = 32;
export const GRAPH_BOOT_FADE_FRAME_MS = 32;
export const SERIES_SCALE_MAX_FLASH_DURATION_MS = 520;
export const SERIES_SCALE_MAX_FLASH_FRAME_MS = 32;
export const SERIES_SCALE_MAX_FLASH_COLOR = 0xffffff;
export const SERIES_SCALE_MAX_FLASH_WIDTH_BONUS = 2.5;

export const PLOT_THROTTLE_MS = 80;
export const MAX_PLOT_POINTS = 150000;
export const RESTORE_THROTTLE_MS = 33;
export const ACTION_SNAP_THRESHOLD_SEC = 0.75;
export const MAX_ACTION_MARKERS_DENSITY = 2;
export const FORECAST_PREVIEW_MARKER_COLOR = TIMEGRAPH_THEME.forecastMarker;
export const SERIES_LINE_WIDTH_DEFAULT = 2.8;
export const SERIES_LINE_WIDTH_HOVERED = 3;
export const SERIES_LINE_WIDTH_DIMMED = 1.5;
export const SERIES_LINE_ALPHA_DEFAULT = 1;
export const SERIES_LINE_ALPHA_HOVERED = 1;
export const SERIES_LINE_ALPHA_DIMMED = 0.22;
