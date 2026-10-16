// Read the identity embedded in THIS page, never relabel an older loaded game
// with the identity of newer files on the preview server.
export function mountBuildBadge() {
  const info = JSON.parse(document.getElementById('game-build-info')?.textContent || 'null');
  const badge = document.createElement('div');
  badge.id = 'game-build-badge';
  badge.dataset.testid = 'game-build-badge';
  const label = info ? `${info.channel === 'local' ? 'Local' : 'Pages'} · v${info.version} · ${info.build}`
    : 'Unversioned preview · use npm start';
  badge.textContent = label;
  if (info) {
    badge.dataset.version = info.version;
    badge.dataset.build = info.build;
    badge.title = `Game v${info.version} | Build ${info.build} | Revision ${info.revision} | ${info.channel}`;
  }
  document.body.append(badge);
  if (info?.channel !== 'local') return;
  let checking = false;
  const check = async () => {
    if (document.hidden || checking) return;
    checking = true;
    try {
      const response = await fetch('./build-info.json', { cache: 'no-store' });
      if (!response.ok) return;
      const current = await response.json();
      const stale = current.build !== info.build;
      badge.dataset.stale = String(stale);
      badge.textContent = stale ? `${label} · Updated build available; save then reload` : label;
    } catch { /* A stopped preview does not invalidate the loaded game. */ }
    finally { checking = false; }
  };
  setInterval(check, 30_000);
  document.addEventListener('visibilitychange', check);
}
