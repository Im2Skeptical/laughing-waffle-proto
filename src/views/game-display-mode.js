export const PHONE_PORTRAIT_QUERY = '(hover: none) and (pointer: coarse) and (orientation: portrait)';

export function getGameFullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

// Call directly from the entry button's gesture, before doing any game work.
export async function requestGameDisplayMode() {
  const target = document.documentElement;
  try {
    if (!getGameFullscreenElement()) {
      const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
      if (request) await request.call(target);
    }
  } catch { /* Landscape browser play remains available when fullscreen is denied. */ }
  if (window.matchMedia('(pointer: coarse)').matches) {
    try { await screen.orientation?.lock?.('landscape'); }
    catch { /* The same menu supplies the manual-rotation fallback. */ }
  }
  // Orientation promises can settle before viewport layout/media queries do.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
