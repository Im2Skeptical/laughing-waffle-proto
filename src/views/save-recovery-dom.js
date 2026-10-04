export function downloadSaveText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
}

export function createSaveRecoveryDom({ session, onRetry, onExport, onOpenMenu }) {
  const statusButton = document.createElement('button');
  statusButton.type = 'button'; statusButton.dataset.testid = 'game-save-status';
  statusButton.addEventListener('click', onOpenMenu);
  const section = document.createElement('section');
  section.className = 'game-save-recovery';
  const status = document.createElement('p');
  status.dataset.testid = 'game-save-summary'; status.setAttribute('role', 'status');
  const warning = document.createElement('p'); warning.setAttribute('role', 'alert'); warning.hidden = true;
  const controls = document.createElement('div'); controls.className = 'game-save-actions';
  const action = (label, testid, callback) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = label; button.dataset.testid = testid;
    button.addEventListener('click', callback); return button;
  };
  const retry = action('Retry save', 'game-save-retry', onRetry);
  const exportButton = action('Export current game', 'game-save-export', onExport);
  controls.append(retry, exportButton); section.append(status, warning, controls);
  const banner = document.createElement('section'); banner.className = 'game-save-error';
  banner.hidden = true;
  const error = document.createElement('p'); error.setAttribute('role', 'alert');
  const bannerActions = document.createElement('div'); bannerActions.className = 'game-save-actions';
  bannerActions.append(action('Retry save', 'game-save-banner-retry', onRetry),
    action('Export current game', 'game-save-banner-export', onExport),
    action('Save & menu', 'game-save-banner-menu', onOpenMenu));
  banner.append(error, bannerActions);
  function sync() {
    const snapshot = session.getSaveStatus();
    statusButton.hidden = !session.canResume() || snapshot.activeSlot === null;
    const label = { idle: 'No browser save', saving: 'Saving…', saved: 'Saved', failed: 'Save failed' }[snapshot.phase];
    const last = snapshot.lastSuccessfulSave;
    const saved = last?.savedAt ? `Last saved ${new Date(last.savedAt).toLocaleString()} · game second ${last.tSec}.` : 'No successful browser save yet.';
    statusButton.textContent = label;
    statusButton.title = `${label}. ${saved}`;
    statusButton.dataset.phase = snapshot.phase;
    status.textContent = `${snapshot.activeSlot === null ? 'This run has no browser save slot.' : `${label}. ${saved}`} ${snapshot.phase === 'failed' ? 'Your current game is still in this page’s memory.' : ''}`;
    section.hidden = !session.canResume();
    retry.hidden = snapshot.activeSlot === null;
    warning.hidden = snapshot.phase !== 'failed';
    bannerActions.hidden = snapshot.phase !== 'failed';
    banner.hidden = error.textContent === '' || session.isInMenu();
  }
  return { element: section, statusButton, banner, sync,
    showError(text) { error.textContent = text; warning.textContent = text; sync(); },
    clearError() { error.textContent = ''; warning.textContent = ''; sync(); } };
}
