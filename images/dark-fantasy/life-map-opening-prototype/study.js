import { createOpeningController } from './controller.js';
import { createOpeningExperiment, OPENING_KINDS } from './experiment.js';
import { VASSAL_HEIRLOOM_DEFS } from '../../../src/defs/gamepieces/vassal-heirloom-defs.js';
import { createOpeningGameScreen } from './game-screen.js';
import { createOpeningGraphEditor } from './graph-editor.js';
import { KIND_LABELS } from './graph-edit.js';

let storage = null;
try { storage = window.localStorage; } catch { /* Export works without browser storage. */ }
const controller = createOpeningController(storage);
const $ = id => document.getElementById(id);
let selectedId = 'relic', editorKey = '', toolbarKey = '', jsonKey = '', error = '', guide = null;
let gameScreen = null;
const graphEditor = createOpeningGraphEditor({ host: $('graph-editor'), controller, run,
  onSelect: id => { selectedId = id; editorKey = ''; render(); } });
const abilityNames = { intelligence: 'Prowess', effectiveness: 'Effectiveness', wisdom: 'Wisdom', cunning: 'Cunning' };
const guides = [
  { id: 'spend', label: 'Relic & invest', text: 'Take the Minor Seal, found the Warriors, buy a Practice, then drill. Watch the purchase discount, Retinue and Force.', entry: 'relic', relic: 0, buy: true },
  { id: 'save', label: 'Explore & save', text: 'Meet local guides, found the Warriors and retain Prestige. Compare military strength and production with the investment route.', entry: 'explore', buy: false },
  { id: 'chaos', label: 'Accept Chaos', text: 'Take the Hourglass without a death roll. Watch Chaos grow and compare the time discount over the following encounters.', entry: 'relic', relic: 2, buy: true },
];
function el(tag, text = '', className = '') { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; }
function button(text, action, className = '') { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', () => run(action)); return node; }
async function run(action) {
  error = ''; try { await action(); } catch (e) { error = e.message; } render();
}
function field(label, value, { type = 'text', min, max, options, id } = {}) {
  const wrap = el('label', label), input = document.createElement(options ? 'select' : 'input');
  if (options) options.forEach(([value, text]) => { const option = el('option', text); option.value = value; input.append(option); });
  else { input.type = type; if (min != null) input.min = min; if (max != null) input.max = max; if (type === 'number') input.step = 'any'; }
  input.value = value ?? ''; if (id) input.id = id; wrap.append(input); return { wrap, input };
}
function appendField(host, label, value, options) { const entry = field(label, value, options); host.append(entry.wrap); return entry.input; }
function format(value) { return typeof value === 'number' ? Math.round(value * 100) / 100 : value; }

function renderToolbar(snapshot) {
  const key = JSON.stringify([snapshot.draft.name, snapshot.draft.seed]);
  if (key !== toolbarKey) {
    toolbarKey = key; const host = $('toolbar'); host.replaceChildren();
    const name = field('Experiment name', snapshot.draft.name, { id: 'experiment-name' }); name.wrap.className = 'name';
    const seed = field('Seed', snapshot.draft.seed, { type: 'number', min: 0, max: 4294967295, id: 'seed' });
    name.input.addEventListener('change', () => run(() => controller.replaceDraft({ ...controller.getSnapshot().draft, name: name.input.value })));
    seed.input.addEventListener('change', () => run(() => controller.replaceDraft({ ...controller.getSnapshot().draft, seed: Number(seed.input.value) })));
    host.append(name.wrap, seed.wrap, button('Restart', () => controller.restart(), 'primary'), button('Next seed', () => controller.nextSeed()),
      button('Rewind decision', () => controller.rewind()), button('Save draft', () => controller.save()), button('Load saved', () => controller.load()),
      button('Export JSON', exportDraft), button('Restore built-in draft', () => controller.resetDraft()));
  }
  [...$('toolbar').querySelectorAll('button')].forEach(b => { b.disabled = snapshot.busy || b.textContent === 'Rewind decision' && !snapshot.canRewind || b.textContent === 'Load saved' && !snapshot.saved; });
  $('toolbar').querySelectorAll('input').forEach(input => { input.disabled = snapshot.busy; });
}
function exportDraft() {
  const url = URL.createObjectURL(new Blob([controller.exportDraft()], { type: 'application/json' }));
  const anchor = el('a'); anchor.href = url; anchor.download = 'protovassal-opening.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderSummary({ summary: s }) {
  const metrics = [['Age', s.age], ['Prestige', s.prestige], ['Force', s.force], ['Retinue', `${s.retinue}/${s.retinueCap}`],
    ['Prowess', s.prowess], ['Chaos', s.chaos], ['Time · seconds', s.tSec], ['Research', s.research]];
  $('summary').replaceChildren(...metrics.map(([label, value]) => { const box = el('div', '', 'metric'); box.append(el('span', label), el('strong', String(format(value)))); return box; }));
}
function renderOutcomes(snapshot) {
  const host = $('outcomes'); host.replaceChildren();
  if (!snapshot.session.outcomes.length) host.append(el('p', 'Results appear after each encounter resolves.', 'note'));
  for (const result of snapshot.session.outcomes) {
    const row = el('div', '', 'outcome'); row.append(el('strong', result.title));
    const keys = [['age', 'Age'], ['prestige', 'Prestige'], ['force', 'Force'], ['chaos', 'Chaos'], ['research', 'Research'], ['tSec', 'Time']];
    row.append(el('p', keys.map(([key, label]) => `${label} ${format(result.before[key])} → ${format(result.after[key])}`).join(' · '), 'delta'));
    if (result.before.location !== result.after.location) row.append(el('p', `${result.before.location} → ${result.after.location}`, 'note'));
    const stock = result.after.sites.map(site => `${site.name}: population ${site.population}, Food ${site.food}, Warriors ${site.warriors}`);
    row.append(el('p', stock.join(' · '), 'note')); host.append(row);
  }
  const settlements = $('settlements'); settlements.replaceChildren();
  for (const site of snapshot.summary.sites) {
    const row = el('div', '', 'settlement'); row.append(el('h3', site.name), el('p', `Population ${site.population}/${site.housing} housing · Warriors ${site.warriors} · Edible ${site.food} · Currency ${site.currency}`, 'note'));
    const slots = el('div', '', 'slots'); site.practices.forEach(p => slots.append(el('div', p ? `${p.label} · ${p.tier} · ${p.stock} Stock (${p.traits.join(', ')})` : 'Empty Practice slot', 'slot'))); row.append(slots); settlements.append(row);
  }
  settlements.append(el('p', `Relics: ${snapshot.summary.heirlooms.join(', ') || 'none'} · Effectiveness ${snapshot.summary.effectiveness} · Cunning ${snapshot.summary.cunning} · Wisdom ${snapshot.summary.wisdom}`));
}

function renderEditor(snapshot) {
  const doc = snapshot.draft;
  if (!doc.nodes.some(n => n.id === selectedId)) selectedId = doc.nodes[0].id;
  const key = JSON.stringify([selectedId, doc]);
  if (editorKey === key) { $('editor').querySelectorAll('input,select,button').forEach(n => { n.disabled = snapshot.busy; }); return; }
  editorKey = key;
  const host = $('editor'), spec = doc.nodes.find(n => n.id === selectedId); host.replaceChildren();
  host.append(el('h2', 'Edit an encounter'), el('p', 'Apply edits, then Restart. The current playthrough retains its original experiment.', 'note'));
  const chooser = appendField(host, 'Node', selectedId, { options: doc.nodes.map(n => [n.id, n.title]), id: 'edit-node' });
  chooser.addEventListener('change', () => { selectedId = chooser.value; editorKey = ''; render(); });
  if (spec.kind === 'customNote') {
    const title = appendField(host, 'Title', spec.title, { id: 'note-title' });
    const label = el('label', 'Intended player interaction'), intention = el('textarea'); intention.id = 'note-intention'; intention.rows = 7; intention.value = spec.description;
    intention.placeholder = 'Describe what the player sees, chooses, pays, gains, or changes at this node.'; label.append(intention); host.append(label);
    host.append(button('Save note', () => controller.editDraft({ ...doc, nodes: doc.nodes.map(n => n.id === spec.id ? { ...n, title: title.value, description: intention.value } : n) }), 'primary'));
    host.append(el('p', 'During play, enter this node to read the note and Confirm to leave. No time, rewards or dice rolls are applied.', 'note')); return;
  }
  const fields = {}, grid = el('div', '', 'editor-grid');
  fields.title = appendField(grid, 'Title', spec.title);
  fields.displayLabel = appendField(grid, 'Game-screen label (blank = node type)', spec.displayLabel);
  fields.kind = appendField(grid, 'Encounter type', spec.kind, { options: OPENING_KINDS.map(kind => [kind, KIND_LABELS[kind]]) });
  fields.phaseCost = appendField(grid, 'Override phases (blank = offer cost)', spec.phaseCost, { type: 'number', min: 0, max: 320 });
  if (spec.kind === 'supply') fields.stockOutput = appendField(grid, 'Stock output / auto', spec.stockOutput ?? 'auto');
  host.append(grid);
  const description = el('label', 'Description'), text = el('textarea'); text.rows = 3; text.value = spec.description; description.append(text); host.append(description);
  const lists = {};
  for (const list of ['options', 'cards', 'relics', 'pass']) {
    if (spec[list] == null) continue;
    const items = list === 'pass' ? [spec.pass] : spec[list], section = el('div'); section.append(el('h3', list === 'pass' ? 'Alternative to purchasing' : list));
    lists[list] = items.map((item, index) => {
      const group = el('div', '', 'offer-editor'), inputs = {}, row = el('div', '', 'editor-grid');
      const keys = list === 'cards' ? ['kind', 'definitionId', 'prestigeCost', 'phaseCost']
        : list === 'relics' ? ['definitionId', 'prestigeCost', 'phaseCost', 'chaos', ...(spec.kind === 'specialRelic' ? ['immediateDeathChance'] : [])]
          : ['id', 'label', 'phaseCost', 'prestigeCost', 'prestigeDelta', 'chaos', 'statId', 'statDelta'];
      for (const name of keys) {
        const numeric = ['phaseCost', 'prestigeCost', 'prestigeDelta', 'chaos', 'statDelta', 'immediateDeathChance'].includes(name);
        const options = name === 'kind' ? [['practice', 'Practice'], ['structure', 'Structure']]
          : name === 'statId' ? [['', 'No ability gain'], ...Object.entries(abilityNames)]
            : name === 'definitionId' && list === 'relics' ? Object.values(VASSAL_HEIRLOOM_DEFS).map(d => [d.id, d.label]) : null;
        inputs[name] = appendField(row, ({ definitionId: 'Card / relic ID', prestigeCost: 'Prestige cost', prestigeDelta: 'Prestige reward', phaseCost: 'Phases', chaos: 'Chaos penalty', statId: 'Ability', statDelta: 'Ability change', immediateDeathChance: 'Death probability' })[name] ?? name, item[name], { type: numeric ? 'number' : 'text', options });
      }
      group.append(row); section.append(group); return { item, inputs, index };
    });
    host.append(section);
  }
  host.append(button('Apply node edits', () => {
    const changed = structuredClone(spec); changed.title = fields.title.value; changed.kind = fields.kind.value; changed.description = text.value;
    if (fields.displayLabel.value.trim()) changed.displayLabel = fields.displayLabel.value.trim(); else delete changed.displayLabel;
    if (fields.phaseCost.value === '') delete changed.phaseCost; else changed.phaseCost = Number(fields.phaseCost.value);
    if (fields.stockOutput) changed.stockOutput = fields.stockOutput.value;
    for (const [list, rows] of Object.entries(lists)) {
      const items = rows.map(({ item, inputs }) => { const value = structuredClone(item); for (const [name, input] of Object.entries(inputs)) {
        if (input.value === '') delete value[name]; else value[name] = input.type === 'number' ? Number(input.value) : input.value;
      } return value; }); changed[list] = list === 'pass' ? items[0] : items;
    }
    controller.editDraft({ ...doc, nodes: doc.nodes.map(n => n.id === spec.id ? changed : n) });
  }, 'primary'));
  host.append(el('p', 'Use the graph above to move, duplicate or remove this node and edit its routes.', 'note'));
}

function renderGuides(snapshot) {
  const host = $('walkthroughs'); host.replaceChildren();
  for (const scenario of guides) {
    const tab = button(scenario.label, () => { guide = scenario; selectedId = scenario.entry; controller.replaceDraft(createOpeningExperiment()); controller.restart(); });
    tab.setAttribute('aria-pressed', guide?.id === scenario.id ? 'true' : 'false'); tab.disabled = snapshot.busy; host.append(tab);
  }
  if (guide) { const next = button('Next guided choice', guidedChoice); next.disabled = snapshot.busy || !snapshot.development && !snapshot.session.activeId && !snapshot.session.availableIds.length; host.append(next); }
  $('guide').textContent = guide ? `${guide.text} You can also make any available choice yourself.` : 'Guided experiments restart the built-in draft. Free play uses your current draft.';
}
async function guidedChoice() {
  const snapshot = controller.getSnapshot();
  if (snapshot.development) return controller.develop(snapshot.development.offeredStatIds.includes('intelligence') ? 'intelligence' : snapshot.development.offeredStatIds[0]);
  if (!snapshot.session.activeId) return controller.enter(snapshot.session.availableIds.includes(guide.entry) ? guide.entry : snapshot.session.availableIds[0]);
  const spec = snapshot.experiment.nodes.find(n => n.id === snapshot.session.activeId), decision = snapshot.decision;
  if (spec.kind === 'customNote') return controller.commit();
  if (spec.kind === 'shop' || spec.kind === 'supply') {
    if (spec.kind === 'shop' && guide.buy) {
      if (decision.purchases.length) return controller.commit(null, 'equip', false);
      const offer = decision.offers.find(o => o.canStage); if (offer) return controller.stage(offer.offerId);
    }
    return controller.commit(null, 'equip', true);
  }
  const option = spec.kind === 'relic' ? decision.options[guide.relic ?? 0]
    : decision.options.find(o => o.id === ({ world: 'guides', development: 'drill', martial: 'readiness', patronage: 'favor' })[spec.kind]) ?? decision.options.find(o => !o.blocked);
  if (!option) throw new Error('No guided action is available. Try free play or edit the draft.');
  return controller.commit(option.id, 'equip', false);
}
function render() {
  const snapshot = controller.getSnapshot();
  renderToolbar(snapshot); renderSummary(snapshot); renderOutcomes(snapshot); renderEditor(snapshot); renderGuides(snapshot);
  graphEditor.refresh(snapshot, selectedId);
  gameScreen?.refresh(snapshot);
  $('status').textContent = error || snapshot.message || 'Choose an entry node or a guided experiment.';
  $('status').className = error ? 'error' : '';
  const nextJsonKey = JSON.stringify(snapshot.draft);
  if (jsonKey !== nextJsonKey) { jsonKey = nextJsonKey; $('json').value = controller.exportDraft(); }
  $('apply-json').disabled = snapshot.busy; $('json').disabled = snapshot.busy; $('import').disabled = snapshot.busy;
}
$('apply-json').addEventListener('click', () => run(() => controller.replaceDraft(JSON.parse($('json').value))));
$('import').addEventListener('change', () => run(async () => { const file = $('import').files[0]; if (file) controller.replaceDraft(JSON.parse(await file.text())); $('import').value = ''; }));
controller.subscribe(render); render();
async function startGameScreen() {
try {
  gameScreen = await createOpeningGameScreen({ host: $('game-screen'), controller,
    onError: message => { error = message; render(); },
    onEdit: id => { if (id) selectedId = id; editorKey = ''; render(); $('graph-editor').scrollIntoView({ block: 'start', behavior: 'smooth' }); },
  });
  document.body.dataset.ready = 'true';
} catch (failure) { error = `Unable to open the game screen: ${failure.message}`; render(); }
}
void startGameScreen();
// Focused inspection hook for the collaborative browser; never includes full GameState.
window.openingWorkbench = { getSnapshot: () => { const { summary, busy, session, draft, draftIssue } = controller.getSnapshot(); return { summary, busy, availableIds: session.availableIds, activeId: session.activeId, visitedIds: session.visitedIds,
  draftGraph: { entryIds: draft.entryIds, issue: draftIssue, nodes: draft.nodes.map(({ id, kind, next, editorPosition }) => ({ id, kind, next, editorPosition })) }, game: gameScreen?.getSnapshot() }; },
  getEditorSnapshot: () => graphEditor.getSnapshot(),
  getEditorCellPoint: (column, row) => graphEditor.getCellClientPoint(column, row),
  getPoint: (kind, index) => gameScreen?.getPoint(kind, index),
  getClientPoint: (kind, index) => gameScreen?.getClientPoint(kind, index) };
