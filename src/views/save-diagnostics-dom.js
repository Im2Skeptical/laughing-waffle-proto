import { downloadSaveText } from './save-recovery-dom.js';

export async function buildSaveDiagnosticReport(session) {
  return { ...await session.getSaveDiagnostics(), environment: {
    userAgent: navigator.userAgent, language: navigator.language,
    page: `${location.origin}${location.pathname}`, viewport: { width: innerWidth, height: innerHeight },
    screen: { width: screen.width, height: screen.height, pixelRatio: devicePixelRatio },
  } };
}

export function createSaveDiagnosticsDom({ getReport }) {
  const element = document.createElement('section');
  element.className = 'save-diagnostics';
  const heading = document.createElement('h2'); heading.textContent = 'Save diagnostics';
  const note = document.createElement('p');
  note.textContent = 'This report contains save errors, sizes and browser details. It contains no game state or stored values. Save string sizes are estimates. Browser usage and quota estimates cover the whole origin, not just game saves.';
  const output = document.createElement('textarea'); output.readOnly = true;
  output.setAttribute('aria-label', 'Save diagnostic report'); output.dataset.testid = 'save-diagnostic-report';
  const actions = document.createElement('div'); actions.className = 'game-save-actions';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const button = (label, testid, callback) => {
    const node = document.createElement('button'); node.type = 'button';
    node.textContent = label; node.dataset.testid = testid; node.addEventListener('click', callback); return node;
  };
  let reportVersion = 0;
  async function render() {
    const version = ++reportVersion;
    status.textContent = 'Reading storage diagnostics…';
    try {
      const report = await getReport();
      if (version !== reportVersion) return;
      output.value = JSON.stringify(report, null, 2);
      status.textContent = '';
    } catch { if (version === reportVersion) status.textContent = 'Could not read storage diagnostics. Try refreshing the report.'; }
  }
  actions.append(button('Refresh report', 'save-diagnostic-refresh', render),
    button('Download report', 'save-diagnostic-download', async () => {
      try { await render(); downloadSaveText(output.value, 'civilization-save-diagnostics.json'); status.textContent = 'Diagnostic report download started.'; }
      catch { status.textContent = 'Download unavailable. Select and copy the report below.'; }
    }), button('Copy report', 'save-diagnostic-copy', async () => {
      try { await navigator.clipboard.writeText(output.value); status.textContent = 'Report copied.'; }
      catch { output.focus(); output.select(); status.textContent = 'Select and copy the report below.'; }
    }));
  element.append(heading, note, actions, output, status);
  return { element, render };
}
