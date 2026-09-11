export const PHONE_PORTRAIT_QUERY = '(hover: none) and (pointer: coarse) and (orientation: portrait)';
const DISPLAY_MODE_WAIT_MS = 1000;

export function usesTouchGameDisplay() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function getGameFullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLandscape(ms) {
  const query = window.matchMedia('(orientation: landscape)');
  if (!query.matches) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        query.removeEventListener('change', onChange);
        resolve();
      };
      const onChange = () => { if (query.matches) finish(); };
      query.addEventListener('change', onChange);
      setTimeout(finish, ms);
    });
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Call directly from the entry button's gesture, before doing any game work.
export async function requestGameDisplayMode() {
  if (!usesTouchGameDisplay()) return;
  const target = document.documentElement;
  try {
    if (!getGameFullscreenElement()) {
      const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
      if (request) {
        // Some mobile browsers never settle this promise even after the change.
        await Promise.race([
          Promise.resolve(request.call(target)).catch(() => {}),
          wait(DISPLAY_MODE_WAIT_MS),
        ]);
      }
    }
  } catch { /* Landscape browser play remains available when fullscreen is denied. */ }
  if (window.matchMedia('(pointer: coarse)').matches) {
    try {
      const lock = screen.orientation?.lock?.('landscape');
      // Android Chrome can rotate while leaving this promise pending forever.
      if (lock?.then) void lock.catch(() => {});
    } catch { /* The same menu supplies the manual-rotation fallback. */ }
  }
  await waitForLandscape(DISPLAY_MODE_WAIT_MS);
}
