import { downloadSaveText } from './save-recovery-dom.js';

export function buildSaveDiagnosticReport(session) {
  return { ...session.getSaveDiagnostics(), environment: {
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
  note.textContent = 'This report contains save errors, sizes and browser details. It contains no game state or stored values. Storage size is a UTF-16 estimate; it is not a measurement of the browser’s quota.';
  const output = document.createElement('textarea'); output.readOnly = true;
  output.setAttribute('aria-label', 'Save diagnostic report'); output.dataset.testid = 'save-diagnostic-report';
  const actions = document.createElement('div'); actions.className = 'game-save-actions';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const button = (label, testid, callback) => {
    const node = document.createElement('button'); node.type = 'button';
    node.textContent = label; node.dataset.testid = testid; node.addEventListener('click', callback); return node;
  };
  function render() {
    output.value = JSON.stringify(getReport(), null, 2);
    status.textContent = '';
  }
  actions.append(button('Refresh report', 'save-diagnostic-refresh', render),
    button('Download report', 'save-diagnostic-download', () => {
      try { render(); downloadSaveText(output.value, 'civilization-save-diagnostics.json'); status.textContent = 'Diagnostic report download started.'; }
      catch { status.textContent = 'Download unavailable. Select and copy the report below.'; }
    }), button('Copy report', 'save-diagnostic-copy', async () => {
      try { await navigator.clipboard.writeText(output.value); status.textContent = 'Report copied.'; }
      catch { output.focus(); output.select(); status.textContent = 'Select and copy the report below.'; }
    }));
  element.append(heading, note, actions, output, status);
  return { element, render };
}
