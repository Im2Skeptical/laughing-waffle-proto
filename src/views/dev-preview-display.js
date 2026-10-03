import { getGameFullscreenElement, requestGameDisplayMode } from './game-display-mode.js';

// A single control stays attached to the preview, including native fullscreen.
export function attachDevPreviewDisplay(target, { onChange = () => {} } = {}) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'dev-preview-fullscreen';
  target.classList.add('dev-preview-surface'); target.append(button);
  let active = false, requested = false, previousOverflow = '', generation = 0;
  const sync = () => {
    button.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
    button.setAttribute('aria-label', active ? 'Exit preview fullscreen' : 'Enter preview fullscreen');
    button.setAttribute('aria-pressed', String(active));
    target.classList.toggle('dev-preview-expanded', active);
    onChange(active);
  };
  async function exit() {
    if (!active) return;
    generation++; button.disabled = true;
    active = false; document.body.style.overflow = previousOverflow; sync();
    if (requested && getGameFullscreenElement()) {
      try { await (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document); } catch { /* CSS preview already exited. */ }
    }
    requested = false;
    try { screen.orientation?.unlock?.(); } catch { /* Optional browser API. */ }
    button.disabled = false; button.focus();
  }
  async function toggle() {
    if (active) return exit();
    previousOverflow = document.body.style.overflow;
    const entry = ++generation;
    const ownsRequest = !getGameFullscreenElement();
    button.disabled = true;
    active = true; document.body.style.overflow = 'hidden';
    requested = ownsRequest; sync();
    await requestGameDisplayMode({ forceFullscreen: true });
    if (entry !== generation && ownsRequest && getGameFullscreenElement()) {
      try { await (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document); } catch { /* An interrupted entry already restored the preview. */ }
      try { screen.orientation?.unlock?.(); } catch { /* Optional browser API. */ }
    }
    button.disabled = false;
  }
  const fullscreenChanged = () => { if (active && requested && !getGameFullscreenElement()) void exit(); };
  const keydown = event => { if (event.key === 'Escape' && active && !event.defaultPrevented) { event.preventDefault(); void exit(); } };
  button.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', fullscreenChanged);
  document.addEventListener('webkitfullscreenchange', fullscreenChanged);
  document.addEventListener('keydown', keydown);
  sync();
  return { get active() { return active; }, exit, destroy() {
    void exit(); button.remove(); target.classList.remove('dev-preview-surface');
    document.removeEventListener('fullscreenchange', fullscreenChanged);
    document.removeEventListener('webkitfullscreenchange', fullscreenChanged);
    document.removeEventListener('keydown', keydown);
  } };
}
