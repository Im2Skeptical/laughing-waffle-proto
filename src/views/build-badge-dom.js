// Read the identity embedded in THIS page, never relabel an older loaded game
// with the identity of newer files on the preview server.
import { getArtworkManifest, changedArtworkCategories, reloadForArtwork } from './artwork-cache.js';

export function mountBuildBadge() {
  const loadedArtwork = getArtworkManifest();
  const info = JSON.parse(document.getElementById('game-build-info')?.textContent || 'null');
  const badge = document.createElement('div');
  badge.id = 'game-build-badge';
  badge.setAttribute('role', 'status');
  badge.dataset.testid = 'game-build-badge';
  const preview = info?.preview ? ` · Preview${info.previewLabel ? ` ${info.previewLabel}` : ''}` : '';
  const label = info ? `v${info.version}${preview}`
    : 'Unversioned preview · use npm start';
  badge.textContent = label;
  if (info) {
    badge.dataset.version = info.version;
    badge.dataset.build = info.build;
    badge.title = `Game v${info.version} | Build ${info.build} | Revision ${info.revision} | ${info.channel}`
      + ` | Branch ${info.branch ?? 'detached'}${info.dirty ? ' (modified)' : ''}`
      + (info.preview ? ' | Preview checkout' : ' | Integrated main build');
    badge.tabIndex = 0;
    badge.setAttribute('aria-label', badge.title);
  }
  document.body.append(badge);
  const placeBadge = () => {
    const controls = document.querySelector('[data-testid="utility-controls"]');
    const parent = controls && !document.body.classList.contains('game-menu-open')
      ? controls : document.body;
    if (badge.parentElement !== parent) parent.append(badge);
  };
  // The controls mount after the entry module; menu visibility changes later.
  new MutationObserver(placeBadge).observe(document.body, {
    childList: true, attributes: true, attributeFilter: ['class'],
  });
  placeBadge();
  if (!info) return;
  let checking = false;
  let stale = false;
  let changed = [];
  const categoryLabels = { cards: 'Cards', regions: 'Regions', chrome: 'Frames, icons & shared chrome' };
  const render = () => {
    badge.textContent = changed.length
      ? `${label} · Artwork updated: ${changed.map(key => categoryLabels[key] ?? key).join('; ')}`
      : stale ? `${label} · Updated build available; save then reload` : label;
    badge.dataset.stale = String(stale || changed.length > 0);
    badge.dataset.artworkUpdated = String(changed.length > 0);
    if (changed.length) {
      const reload = document.createElement('button');
      reload.textContent = 'Save & reload';
      reload.dataset.testid = 'artwork-reload';
      reload.addEventListener('click', async () => {
        reload.disabled = true;
        try {
          if (!await reloadForArtwork()) reload.textContent = 'Reload paused — finish loading or retry saving';
        } catch { reload.textContent = 'Save failed — keep this page open'; }
        finally { reload.disabled = false; }
      });
      badge.append(reload);
    }
  };
  const check = async () => {
    if (document.hidden || checking) return;
    checking = true;
    try {
      // Fresh manifests on both LAN and Pages. Never use the broad build
      // fingerprint as an artwork cache key or mutate the pinned manifest.
      const [buildResult, artResult] = await Promise.allSettled([
        fetch('./build-info.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('./artwork-manifest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      ]);
      if (buildResult.status === 'fulfilled' && buildResult.value) {
        const current = buildResult.value;
        stale = current.build !== info.build || current.preview !== info.preview || current.branch !== info.branch;
      }
      if (artResult.status === 'fulfilled' && artResult.value) changed = changedArtworkCategories(loadedArtwork, artResult.value);
      render();
    } catch { /* A stopped preview does not invalidate the loaded game. */ }
    finally { checking = false; }
  };
  setInterval(check, 30_000);
  document.addEventListener('visibilitychange', check);
}
