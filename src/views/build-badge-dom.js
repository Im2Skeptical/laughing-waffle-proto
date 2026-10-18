// Read the identity embedded in THIS page, never relabel an older loaded game
// with the identity of newer files on the preview server.
export function mountBuildBadge() {
  const info = JSON.parse(document.getElementById('game-build-info')?.textContent || 'null');
  const badge = document.createElement('div');
  badge.id = 'game-build-badge';
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
  if (info?.channel !== 'local') return;
  let checking = false;
  const check = async () => {
    if (document.hidden || checking) return;
    checking = true;
    try {
      const response = await fetch('./build-info.json', { cache: 'no-store' });
      if (!response.ok) return;
      const current = await response.json();
      const stale = current.build !== info.build || current.preview !== info.preview
        || current.branch !== info.branch;
      badge.dataset.stale = String(stale);
      badge.textContent = stale ? `${label} · Updated build available; save then reload` : label;
    } catch { /* A stopped preview does not invalidate the loaded game. */ }
    finally { checking = false; }
  };
  setInterval(check, 30_000);
  document.addEventListener('visibilitychange', check);
}
