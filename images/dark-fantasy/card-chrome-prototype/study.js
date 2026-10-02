import { getGamepieceFace } from '../../../src/model/gamepiece-presentation.js';
import { assembleCard, loadCardAssets } from './renderer.js';

const ids = ['forage', 'logging', 'smelting', 'alchemy', 'anatomicalStudy', 'warCouncil'];
const presets = [
  { id: 'scheduled-simple', card: 'forage', title: 'Scheduled · simple', capacity: 1, workers: 0, triggers: '1', tags: '2', stock: 1, stockCapacity: 2, output: 2 },
  { id: 'scheduled-complex', card: 'logging', title: 'Scheduled · complex', capacity: 3, workers: 3, triggers: '3', tags: '3', stock: 12, stockCapacity: 20, output: 2, costs: true },
  { id: 'charge-simple', card: 'smelting', title: 'Charge · simple', capacity: 1, workers: 1, triggers: '1', tags: '2', stock: 1, stockCapacity: 2, output: 2, threshold: 3, charge: 2 },
  { id: 'charge-complex', card: 'alchemy', title: 'Charge · complex', capacity: 3, workers: 3, triggers: '3', tags: '3', stock: 12, stockCapacity: 20, output: 2, threshold: 5, charge: 2 },
];
const $ = id => document.getElementById(id);
const fields = ['capacity', 'workers', 'tags', 'stock', 'stockCapacity', 'triggers', 'threshold', 'charge', 'costs', 'output'];
const numberFields = new Set(['capacity', 'workers', 'stock', 'stockCapacity', 'threshold', 'charge', 'output']);
const apps = [];
let state, hero, activeVariant, assetsReady = false;
const definitions = Object.fromEntries(ids.map(id => [id, getGamepieceFace({ tSec: 0 }, 'practice', id)]));

function defaults(id) {
  const f = definitions[id];
  return { card: id, capacity: f.workerCapacity, workers: 0, tags: 'authored', stock: Math.min(1, f.stockCapacity), stockCapacity: f.stockCapacity,
    triggers: 'authored', threshold: f.chargeThreshold ?? 3, charge: 0, costs: false, output: f.production[0]?.value ?? 0, next: 0 };
}

function faceFor(s) {
  const f = structuredClone(definitions[s.card]);
  f.workerCapacity = s.capacity; f.workers = Math.min(s.workers, s.capacity);
  f.workerMultiplier = 1 + f.workers * f.workerBonus;
  f.stockCapacity = s.stockCapacity; f.stock = Math.min(s.stock, s.stockCapacity);
  if (s.tags !== 'authored') {
    const count = Number(s.tags);
    f.stockTraits = [...new Set([...f.stockTraits, 'Timber', 'Edible', 'Plant'])].slice(0, count);
    if (!count) { f.stockCapacity = 0; f.stock = 0; }
  }
  f.production[0].value = s.output;
  if (f.mode === 'charge') {
    f.chargeThreshold = s.threshold; f.charge = Math.min(s.charge, s.threshold);
    f.chargeGain = (definitions[s.card].chargeGain ?? 1) * f.workerMultiplier;
    if (s.triggers !== 'authored') {
      const candidates = [...f.chargeTriggers, ...['Plant', 'Currency', 'Timber'].map(trait => ({ event: 'stockGenerated', trait }))];
      f.chargeTriggers = candidates.filter((t, i, all) => all.findIndex(other => other.trait === t.trait && other.icon === t.icon) === i).slice(0, Number(s.triggers));
    }
    f.inputs = [];
  } else {
    if (s.triggers !== 'authored') {
      const seasons = ['spring', 'summer', 'autumn'];
      f.production = seasons.slice(0, Number(s.triggers)).map((season, i) => ({ ...f.production[i % f.production.length], season, value: i === 0 ? s.output : f.production[i % f.production.length].value }));
    }
    const nextRow = f.production[s.next % f.production.length];
    f.nextTrigger = nextRow.season ? { season: nextRow.season } : null;
    if (s.costs) f.inputs = [{ kind: 'consume', amount: 1, traits: ['Currency'] }, { kind: 'consume', amount: 1, traits: ['Timber'] }];
  }
  return f;
}

function makeApp(host, width, height) {
  const app = new PIXI.Application({ width, height, backgroundAlpha: 0, antialias: true, autoStart: false, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preserveDrawingBuffer: true });
  host.appendChild(app.view); apps.push(app); return app;
}

function draw(app, face, width) {
  for (const child of app.stage.removeChildren()) child.destroy({ children: true });
  const scale = width / 300;
  app.renderer.resize(Math.ceil(width + 34 * scale), Math.ceil(502 * scale));
  const card = assembleCard(face);
  card.scale.set(scale); card.position.set(15 * scale, 43 * scale);
  app.stage.addChild(card); app.render();
}

function syncControls() {
  $('card').value = state.card;
  fields.forEach(key => {
    if (key === 'costs') $(key).checked = state[key]; else $(key).value = String(state[key]);
  });
  $('workers').max = state.capacity; $('stock').max = state.stockCapacity; $('charge').max = state.threshold;
}

function update(message = '') {
  if (!assetsReady) return;
  const face = faceFor(state);
  const requestedWidth = Number($('size').value);
  const width = Math.min(requestedWidth, ($('hero').clientWidth - 4) * 300 / 334);
  draw(hero, face, width);
  $('size-label').textContent = `${Math.round(width)} px`;
  $('card-title').textContent = face.label;
  $('mode').textContent = `${face.mode} · ${activeVariant ? 'layout preset' : 'real card + preview edits'}`;
  $('hero').setAttribute('aria-label', `${face.label}, ${face.mode}, ${face.stock} of ${face.stockCapacity} Stock, ${face.workers} of ${face.workerCapacity} workers, multiplier ${face.workerMultiplier}, ${face.mode === 'charge' ? `${face.charge} of ${face.chargeThreshold} Charge` : `next ${face.nextTrigger?.season ?? face.source?.cadence}`}`);
  const charge = face.mode === 'charge';
  $('charge-controls').hidden = !charge; $('cost-control').hidden = charge;
  $('advance').textContent = charge ? `Trigger +${face.chargeGain} Charge` : 'Advance to next trigger';
  const symbols = charge ? face.chargeTriggers.map(t => `${t.trait ?? t.icon} (${t.event})`).join(' · ') : face.production.map(r => r.season ?? face.source?.cadence ?? 'scheduled').join(' · ');
  $('rules').textContent = charge
    ? `Triggers: ${symbols}. Workers multiply incoming Charge ×${face.workerMultiplier}; base output stays ${state.output}. No Stock costs. The button previews meter fill and one Discharge.`
    : `Triggers: ${symbols}. The medallion shows the next relevant trigger. Workers multiply Stock output ×${face.workerMultiplier}; the face shows base amounts.`;
  if (message) $('event-status').textContent = message;
  document.querySelectorAll('[data-variant]').forEach(el => {
    const selected = el.dataset.variant === activeVariant;
    el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected));
  });
}

function selectPreset(preset) {
  state = { ...defaults(preset.card), ...preset, next: 0 };
  activeVariant = preset.id;
  const url = new URL(location.href); url.searchParams.set('variant', preset.id); history.replaceState(null, '', url);
  syncControls(); update('Layout example loaded. Edit any property to stress-test the assembly.');
}

function readControls() {
  fields.forEach(key => {
    const el = $(key);
    if (numberFields.has(key)) {
      state[key] = Math.max(Number(el.min), Math.min(Number(el.max), Math.floor(Number(el.value) || 0)));
    } else state[key] = key === 'costs' ? el.checked : el.value;
  });
  state.workers = Math.min(state.workers, state.capacity);
  state.stock = Math.min(state.stock, state.stockCapacity);
  state.charge = Math.min(state.charge, state.threshold);
  activeVariant = null; syncControls(); update('Preview properties updated.');
}

async function main() {
  ids.forEach(id => { const option = document.createElement('option'); option.value = id; option.textContent = `${definitions[id].label} · ${definitions[id].mode}`; $('card').appendChild(option); });
  await loadCardAssets(ids);
  hero = makeApp($('hero'), 334, 502); assetsReady = true;
  for (const preset of presets) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'sample'; button.dataset.variant = preset.id;
    button.setAttribute('aria-label', `Inspect ${preset.title}`);
    $('gallery').appendChild(button);
    draw(makeApp(button, 190, 285), faceFor({ ...defaults(preset.card), ...preset, next: 0 }), 170);
    const title = document.createElement('strong'); title.textContent = preset.title; button.appendChild(title);
    const desc = document.createElement('span'); desc.textContent = `${preset.triggers} trigger${preset.triggers === '1' ? '' : 's'} · ${preset.workers}/${preset.capacity} workers · ×${1 + preset.workers}`; button.appendChild(desc);
    const note = document.createElement('small'); note.textContent = preset.threshold ? `${preset.charge}/${preset.threshold} Charge · output ${preset.output}` : `${preset.tags} Stock tags · ${preset.costs ? 'with costs' : 'no costs'}`; button.appendChild(note);
    button.addEventListener('click', () => selectPreset(preset));
  }
  const variant = new URL(location.href).searchParams.get('variant');
  selectPreset(presets.find(p => p.id === variant) ?? presets[1]);
  $('controls').addEventListener('submit', e => e.preventDefault());
  fields.forEach(key => $(key).addEventListener('change', readControls));
  $('card').addEventListener('change', () => { state = defaults($('card').value); activeVariant = null; syncControls(); update('Loaded the authored card definition.'); });
  $('size').addEventListener('input', () => update());
  $('checker').addEventListener('change', () => $('hero').classList.toggle('checker', $('checker').checked));
  $('reset').addEventListener('click', () => { state = defaults(state.card); activeVariant = null; syncControls(); update('Restored the authored card definition.'); });
  $('advance').addEventListener('click', () => {
    const face = faceFor(state);
    if (face.mode === 'charge') {
      const total = state.charge + face.chargeGain;
      // A visual meter demonstration, not a replacement for the simulation's event resolver.
      const discharged = total >= state.threshold;
      state.charge = discharged ? Math.min(total - state.threshold, state.threshold) : total;
      syncControls(); update(discharged ? `Discharge preview: base output ${state.output}. ${state.charge} Charge remains.` : `Gained ${face.chargeGain} Charge. ${state.charge}/${state.threshold} filled.`);
    } else { state.next++; update(`Next trigger: ${faceFor(state).nextTrigger?.season ?? face.source?.cadence}.`); }
  });
  $('export').addEventListener('click', () => {
    const link = document.createElement('a'); link.download = `${state.card}-${faceFor(state).mode}-card.png`;
    link.href = hero.view.toDataURL('image/png'); link.click();
  });
  new ResizeObserver(() => update()).observe($('hero'));
  window.cardWorkbench = { get face() { return faceFor(state); }, get state() { return { ...state }; }, selectPreset: id => selectPreset(presets.find(p => p.id === id) ?? presets[0]), get canvasCount() { return apps.length; } };
  document.body.dataset.ready = 'true';
}

main().catch(error => { $('error').hidden = false; $('error').textContent = `The workbench could not load: ${error.message}. Serve the project root with npm run preview:cards.`; console.error(error); });
