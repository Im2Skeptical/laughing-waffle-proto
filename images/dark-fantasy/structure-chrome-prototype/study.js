// Three Pixi Structure treatments in the actual game-layout screenshot.
// URL variants A/B/C are isolated design studies, never live game renderers.
import { createStructureScreen, STRUCTURE_IDS, VARIANTS, describeStructure } from './screen-preview.js';

const $ = id => document.getElementById(id), params = new URL(location.href).searchParams;
const state = { variant: VARIANTS[params.get('variant')] ? params.get('variant') : 'A',
  card: STRUCTURE_IDS.includes(params.get('card')) ? params.get('card') : 'granary', quality: 0,
  context: params.get('context') === 'shop' ? 'shop' : 'settlement', requirements: 'met',
  staged: null, quickId: null, inspectId: null };
let screen, pinned = false, hoverTimer;
function sync() {
  const url = new URL(location.href);
  for (const key of ['variant', 'card', 'context']) url.searchParams.set(key, state[key]);
  history.replaceState(null, '', url);
  document.getElementById('structure').value = state.card; $('quality').value = state.quality;
  $('context').value = state.context; $('requirements').value = state.requirements;
  $('gate-control').hidden = !describeStructure(state.card, state).def.specialistGate;
  $('variant-label').textContent = `${state.variant} · ${VARIANTS[state.variant]}`;
  $('state').textContent = JSON.stringify(state, null, 2);
  $('status').textContent = state.inspectId ? `Inspecting ${describeStructure(state.inspectId, state).def.label} · drag or scroll the rules and glossary.`
    : state.staged ? `${describeStructure(state.staged, state).def.label} staged in this example. Reset to try another.`
      : `${VARIANTS[state.variant]} · static game reference, interactive Pixi Structures.`;
}
function close() { clearTimeout(hoverTimer); pinned = false; state.quickId = state.inspectId = null; screen.renderOverlay(state); sync(); }
function quick(id, pin = false) {
  clearTimeout(hoverTimer); if (state.inspectId || pinned && !pin) return;
  if (pin) { pinned = true; state.card = id; }
  state.quickId = id; screen.renderOverlay(state); sync();
}
function inspect(id = state.card) { clearTimeout(hoverTimer); pinned = false; state.quickId = null; state.inspectId = id; state.card = id; screen.renderOverlay(state); sync(); }
function out() { if (!pinned && !state.inspectId) hoverTimer = setTimeout(close, 180); }
function render() { clearTimeout(hoverTimer); pinned = false; state.quickId = state.inspectId = null; screen.render(state); sync(); }
function cycle(step) { const keys = Object.keys(VARIANTS); state.variant = keys[(keys.indexOf(state.variant) + step + keys.length) % keys.length]; render(); }

async function main() {
try {
  screen = await createStructureScreen($('screen-preview'), {
    quick, inspect, close, out, keep: () => clearTimeout(hoverTimer), cycle,
    stage: id => { state.staged = id; render(); },
  });
  $('structure').innerHTML = STRUCTURE_IDS.map(id => `<option value="${id}">${describeStructure(id, state).def.label}</option>`).join('');
  for (const key of ['structure', 'quality', 'context', 'requirements']) $(key).addEventListener('change', () => {
    if (key === 'structure') state.card = $('structure').value;
    else state[key] = key === 'quality' ? Number($(key).value) : $(key).value;
    state.staged = null; render();
  });
  $('previous').addEventListener('click', () => cycle(-1)); $('next').addEventListener('click', () => cycle(1));
  $('quick-read').addEventListener('click', () => quick(state.card, true)); $('inspect').addEventListener('click', () => inspect());
  $('reset').addEventListener('click', () => { state.quality = 0; state.requirements = 'met'; state.staged = null; render(); });
  $('export').addEventListener('click', () => {
    const link = document.createElement('a'); link.download = `structure-${state.variant}-${state.context}-${state.inspectId ? 'inspection' : state.quickId ? 'quick-read' : 'screen'}.png`;
    link.href = screen.exportPng(); link.click();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (state.quickId || state.inspectId)) { event.preventDefault(); close(); return; }
    if (event.target.closest('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
  }, true);
  window.structureWorkbench = {
    get state() { return { ...state }; }, get selected() { return describeStructure(state.card, state); },
    get scene() { return screen.scene; }, get display() { return { active: screen.display.active }; },
    quick: () => quick(state.card, true), inspect: () => inspect(), close, exportPng: () => screen.exportPng(),
  };
  render(); document.body.dataset.ready = 'true';
} catch (error) { $('status').textContent = `Preview failed: ${error.message}`; $('status').setAttribute('role', 'alert'); throw error; }
}
void main();
