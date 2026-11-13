// Pin URLs for the lifetime of the page, including deferred/progressive loads.
// A later manifest is for notices only; applying it requires a normal reload.
let pinned;
export function getArtworkManifest() {
  if (pinned === undefined) pinned = JSON.parse(globalThis.document?.getElementById('game-artwork-manifest')?.textContent || 'null');
  return pinned;
}

export function artworkUrl(file) {
  return getArtworkManifest()?.files?.[file]?.url ?? file;
}

export function changedArtworkCategories(loaded, current) {
  if (loaded?.schema !== 1 || current?.schema !== 1 || !current.categories) return [];
  return [...new Set([...Object.keys(loaded.categories), ...Object.keys(current.categories)])]
    .filter(category => loaded.categories[category] !== current.categories[category]);
}

// Registered by the game menu so saving/pausing stays in the session controller.
let beforeReload = null;
export function setArtworkReloadGuard(guard) { beforeReload = guard; }
export async function saveGameForArtworkReload({ session, pause, isCurrent }) {
  if (!isCurrent()) return { ok: false };
  pause();
  // Drain an older autosave, then capture the paused run. An entry intent
  // (including Continue) cancels this reload even if the menu reopens later.
  const saved = await session.save();
  if (!saved.ok || !isCurrent() || !session.isInMenu()) return { ok: false };
  const paused = await session.save();
  return isCurrent() && session.isInMenu() ? paused : { ok: false };
}
export async function reloadForArtwork(reload = () => location.reload()) {
  if (!beforeReload || !(await beforeReload())?.ok) return false;
  reload();
  return true;
}
