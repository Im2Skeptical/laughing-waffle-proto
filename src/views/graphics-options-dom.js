import { DEFAULT_GRAPHICS_OPTIONS, getGraphicsOptions, setGraphicsOptions } from './graphics-options.js';

export function createGraphicsOptionsDom() {
  const element = document.createElement('section');
  element.dataset.testid = 'graphics-options';
  element.style.cssText = 'max-width:640px;margin:12px auto;padding:12px;border:1px solid #82745a;border-radius:6px;color:#f6efe3;background:#252c33;text-align:left;box-sizing:border-box';
  const title = document.createElement('strong'); title.textContent = 'Graphics experiments';
  const note = document.createElement('p');
  note.textContent = 'Applies immediately. Close tools and scrub the same stretch of time to compare. Remembered in this browser; all effects are on by default.';
  note.style.cssText = 'font-size:13px;line-height:1.4;margin:8px 0';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:4px 12px';
  const inputs = new Map();
  for (const [key, label] of [
    ['fog', 'Fog'], ['clouds', 'Clouds'], ['shadows', 'Cloud shadows'],
    ['wisps', 'Atmospheric wisps'], ['water', 'Water animation'],
  ]) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer;margin:0;font-size:15px';
    const input = document.createElement('input'); input.type = 'checkbox';
    input.dataset.testid = `graphics-${key}`;
    input.style.cssText = 'width:22px;height:22px;min-height:22px;margin:0;flex:none;accent-color:#d7b450';
    input.addEventListener('change', () => { setGraphicsOptions({ [key]: input.checked }); render(); });
    inputs.set(key, input); row.append(input, document.createTextNode(label)); grid.append(row);
  }
  const help = document.createElement('p');
  help.textContent = 'Clouds and shadows share a pass: turn both off to skip it. All four atmosphere effects off skips the atmosphere renderer. Water off keeps a still surface, including when panning. These switches need illustrated artwork to be visible.';
  help.style.cssText = 'font-size:13px;line-height:1.4;margin:8px 0';
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
  for (const [label, values, testid] of [
    ['All effects off', Object.fromEntries(Object.keys(DEFAULT_GRAPHICS_OPTIONS).map(key => [key, false])), 'graphics-all-off'],
    ['Restore defaults', DEFAULT_GRAPHICS_OPTIONS, 'graphics-reset'],
  ]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.dataset.testid = testid;
    button.style.cssText = 'min-height:44px;padding:8px 12px;border:1px solid #d7b450;border-radius:4px;background:#384755;color:#f6efe3;font:14px system-ui;cursor:pointer';
    button.addEventListener('click', () => { setGraphicsOptions(values); render(); }); actions.append(button);
  }
  element.append(title, note, grid, help, actions);
  function render() { const options = getGraphicsOptions(); for (const [key, input] of inputs) input.checked = options[key]; }
  render();
  return { element, render };
}
