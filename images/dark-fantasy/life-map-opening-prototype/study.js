import { createOpeningController } from './controller.js';
import { createOpeningExperiment, OPENING_KINDS } from './experiment.js';
import { VASSAL_HEIRLOOM_DEFS } from '../../../src/defs/gamepieces/vassal-heirloom-defs.js';

let storage = null;
try { storage = window.localStorage; } catch { /* Export works without browser storage. */ }
const controller = createOpeningController(storage);
const $ = id => document.getElementById(id);
let selectedId = 'relic', editorKey = '', toolbarKey = '', jsonKey = '', error = '', guide = null;
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
function renderGraph(snapshot) {
  const { experiment, availableIds, activeId, visitedIds } = snapshot.session, depthById = {};
  const visit = (id, depth) => { if ((depthById[id] ?? -1) >= depth) return; depthById[id] = depth; experiment.nodes.find(n => n.id === id).next.forEach(next => visit(next, depth + 1)); };
  experiment.entryIds.forEach(id => visit(id, 0));
  const host = $('graph'); host.replaceChildren();
  for (let depth = 0; depth <= Math.max(...Object.values(depthById)); depth++) {
    const row = el('div', '', 'graph-row');
    for (const node of experiment.nodes.filter(n => depthById[n.id] === depth)) {
      const available = availableIds.includes(node.id), current = activeId === node.id, visited = visitedIds.includes(node.id);
      const card = el('div', '', `graph-node ${available ? 'available' : ''} ${current ? 'current' : ''} ${visited ? 'visited' : ''}`);
      card.dataset.nodeId = node.id;
      const enter = button(node.title, () => { selectedId = node.id; editorKey = ''; controller.enter(node.id); }, 'node-enter');
      const kindLabel = node.kind === 'specialRelic' ? 'Special relic expedition' : node.kind;
      enter.append(el('small', `${kindLabel} · ${current ? 'active' : visited ? 'completed' : available ? 'available' : 'future'}`));
      const authored = [...(node.options ?? []), ...(node.relics ?? [])];
      const danger = Math.max(0, ...authored.map(o => o.immediateDeathChance ?? (node.kind === 'specialRelic' ? .35 : 0)));
      const chaos = Math.max(0, ...authored.map(o => o.chaos ?? 0));
      if (danger) enter.append(el('small', `Direct death risk up to ${Math.round(danger * 100)}%`, 'warning'));
      if (chaos) enter.append(el('small', `Optional Chaos cost up to ${chaos}`));
      enter.disabled = snapshot.busy || !available || !!snapshot.development;
      const edit = button('✎', () => { selectedId = node.id; editorKey = ''; render(); }, 'node-edit'); edit.setAttribute('aria-label', `Edit ${node.title}`); edit.disabled = snapshot.busy;
      card.append(enter, edit); row.append(card);
    }
    host.append(row);
  }
  $('graph-status').textContent = `${visitedIds.length} encounters completed${snapshot.draftChanged ? ' · draft changes await restart' : ''}`;
  requestAnimationFrame(drawConnections);
}
function drawConnections() {
  const host = $('graph'), bounds = host.getBoundingClientRect();
  host.querySelector('svg')?.remove();
  if (!bounds.width || !bounds.height) return;
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`); svg.classList.add('graph-connections'); svg.setAttribute('aria-hidden', 'true');
  for (const node of controller.getSnapshot().experiment.nodes) for (const next of node.next) {
    const source = [...host.querySelectorAll('.graph-node')].find(n => n.dataset.nodeId === node.id)?.getBoundingClientRect();
    const target = [...host.querySelectorAll('.graph-node')].find(n => n.dataset.nodeId === next)?.getBoundingClientRect();
    if (!source || !target) continue;
    const x1 = source.x + source.width / 2 - bounds.x, y1 = source.bottom - bounds.y;
    const x2 = target.x + target.width / 2 - bounds.x, y2 = target.top - bounds.y, middle = (y1 + y2) / 2;
    const path = document.createElementNS(ns, 'path'); path.setAttribute('d', `M${x1},${y1} C${x1},${middle} ${x2},${middle} ${x2},${y2}`);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#697f7d'); path.setAttribute('stroke-width', '1.5'); svg.append(path);
  }
  host.prepend(svg);
}
function choiceCost(option) {
  return `${option.cost ?? option.prestigeCost ?? 0} Prestige · ${option.phases ?? option.phaseCost ?? 0} phases`
    + ((option.prestigeDelta ?? 0) ? ` · ${option.prestigeDelta > 0 ? '+' : ''}${option.prestigeDelta} Prestige` : '')
    + (option.statId ? ` · ${option.statDelta > 0 ? '+' : ''}${option.statDelta} ${abilityNames[option.statId]}` : '')
    + ((option.effects ?? []).some(e => e.op === 'addChaos') ? ` · +${option.effects.filter(e => e.op === 'addChaos').reduce((sum, e) => sum + e.amount, 0)} Chaos` : '')
    + ((option.effects ?? []).some(e => e.op === 'addMonsterPressure') ? ` · +${format(option.effects.filter(e => e.op === 'addMonsterPressure').reduce((sum, e) => sum + e.amount, 0))} Monster Pressure` : '');
}
function renderDecision(snapshot) {
  const host = $('decision'); host.replaceChildren();
  if (snapshot.busy) { host.append(el('h2', 'Resolving the world…')); const p = document.createElement('progress'); p.max = 100; p.value = snapshot.progress; host.append(p); return; }
  if (snapshot.development) {
    host.append(el('h2', 'An earned development choice'), el('p', 'Routine progress earned an ability increase. This is the current live-game level-up rule.', 'note'));
    const actions = el('div', '', 'actions'); snapshot.development.offeredStatIds.forEach(id => actions.append(button(`+1 ${abilityNames[id]}`, () => controller.develop(id)))); host.append(actions); return;
  }
  const spec = snapshot.experiment.nodes.find(n => n.id === snapshot.session.activeId), decision = snapshot.decision;
  if (!spec) {
    const ended = snapshot.summary.dead || snapshot.summary.complete;
    host.append(el('h2', ended ? 'The run ended' : snapshot.session.availableIds.length ? 'Choose the next opportunity' : 'Opening complete'),
      el('p', ended ? 'The real simulation ended this run. Rewind to investigate or restart.'
        : snapshot.session.availableIds.length ? 'Highlighted nodes are available. Compare routes or follow a guided experiment.'
          : 'Compare the outcomes below, rewind a choice, or edit the opening and restart.', 'note'));
    return;
  }
  host.append(el('h2', spec.title), el('p', spec.description, 'note'));
  if (spec.kind === 'world' || spec.kind === 'martial' || spec.kind === 'development') {
    host.append(el('p', `At ${snapshot.summary.location}: Force ${snapshot.summary.force} = Prowess ${snapshot.summary.prowess} + Retinue ${snapshot.summary.retinue} + local Support ${snapshot.summary.support}.`, 'note'));
    host.append(el('p', snapshot.summary.threats.length ? snapshot.summary.threats.map(t => `${t.kind} at ${t.name}: Defence ${t.defense}`).join(' · ') : 'No adjacent military target at this settlement.', 'note'));
  }
  const choices = el('div', '', 'choices');
  if (decision.nodeState.contentMode === 'shop') {
    if (spec.kind === 'supply') host.append(el('p', `Stock focus: ${decision.node.stockOutput}`, 'badge'));
    if (!decision.offers.length) choices.append(el('p', 'No eligible offers. This is an empty-node case to investigate; the alternative below still provides a benefit.', 'warning'));
    for (const offer of decision.offers) {
      const card = el('article', '', 'choice'); card.append(el('h3', offer.label), el('p', `${offer.prestigeCost} Prestige · ${offer.phaseCost} phases${offer.currencyCost ? ` · ${offer.currencyCost} Currency Stock` : ''}`, 'cost'));
      const read = el('details'); read.append(el('summary', 'Practice / Structure rules'));
      const def = offer.intervention.kind === 'practice' ? snapshot.session.state.gameConfig.gamepieces.practices[offer.intervention.practiceId]
        : snapshot.session.state.gameConfig.gamepieces.structures[offer.intervention.structureId];
      read.append(el('p', def?.description ?? offer.presentation?.description ?? ''));
      if (def?.stockTraits?.length) read.append(el('p', `Stock traits: ${def.stockTraits.join(', ')} · capacity ${def.stockCapacity}`));
      if (def?.effects?.length) read.append(el('p', `Effects: ${def.effects.map(effect => `${effect.op}${effect.amount != null ? ` ${effect.amount}` : ''}`).join(' · ')}`));
      if (def?.consume?.length) read.append(el('p', `Consumes: ${def.consume.map(input => `${input.amount ?? 1} ${input.traits.join(' or ')}`).join(', ')}`));
      if (def?.require?.length) read.append(el('p', `Requires: ${def.require.map(input => `${input.amount ?? 1} ${input.traits.join(' or ')}`).join(', ')}`));
      if (def?.footprint) read.append(el('p', `Footprint: ${def.footprint} construction cells. Normal construction recipes and time still apply.`));
      card.append(read);
      if (!offer.canStage) card.append(el('p', offer.stageBlockedReason, 'warning'));
      const stage = button('Stage purchase', () => controller.stage(offer.offerId)); stage.disabled = !offer.canStage; card.append(stage); choices.append(card);
    }
    for (const purchase of decision.purchases) {
      const card = el('article', '', 'choice'); card.append(el('h3', `${purchase.label} · staged`), button('Undo purchase', () => controller.undo(purchase.offerId))); choices.append(card);
    }
    if (decision.settlement?.displacedPractices?.length) choices.append(el('p', `Displaces: ${decision.settlement.displacedPractices.map(p => p?.label ?? 'Practice').join(', ')}`, 'warning'));
    const confirm = button(`Confirm purchases · ${decision.stagedPrestigeCost} Prestige`, () => controller.commit(null, 'equip', false), 'primary'); confirm.disabled = !decision.purchases.length; choices.append(confirm);
    if (spec.pass) { const pass = button(`${spec.pass.label} · ${spec.pass.phaseCost ?? 0} phases · +${spec.pass.prestigeDelta ?? 0} Prestige`, () => controller.commit(null, 'equip', true)); pass.disabled = decision.purchases.length > 0; choices.append(pass); }
  } else {
    if (!decision.options.length) choices.append(el('p', 'No legal choices. Edit the encounter or rewind.', 'warning'));
    for (const option of decision.options) {
      const card = el('article', '', 'choice'); card.append(el('h3', option.label), el('p', choiceCost(option), 'cost'));
      if (option.description) card.append(el('p', option.description, 'note'));
      card.append(el('p', `Projected age ${option.projectedAge} · direct death risk ${Math.round((option.immediateDeathChance ?? 0) * 100)}%`, 'note'));
      if (option.blocked) card.append(el('p', option.blocked, 'warning'));
      const actions = el('div', '', 'actions');
      if (['relic', 'specialRelic'].includes(spec.kind)) {
        for (const destination of ['equip', 'carry', 'decline']) { const action = button(`${destination[0].toUpperCase()}${destination.slice(1)}`, () => controller.commit(option.id, destination, false)); action.disabled = !!option.blocked; actions.append(action); }
      } else { const action = button('Choose this action', () => controller.commit(option.id, 'equip', false), 'primary'); action.disabled = !!option.blocked; actions.append(action); }
      card.append(actions); choices.append(card);
    }
  }
  host.append(choices);
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
  const fields = {}, grid = el('div', '', 'editor-grid');
  fields.title = appendField(grid, 'Title', spec.title);
  fields.kind = appendField(grid, 'Encounter type', spec.kind, { options: OPENING_KINDS.map(kind => [kind, kind]) });
  fields.phaseCost = appendField(grid, 'Override phases (blank = offer cost)', spec.phaseCost, { type: 'number', min: 0, max: 320 });
  if (spec.kind === 'supply') fields.stockOutput = appendField(grid, 'Stock output / auto', spec.stockOutput ?? 'auto');
  host.append(grid);
  const description = el('label', 'Description'), text = el('textarea'); text.rows = 3; text.value = spec.description; description.append(text); host.append(description);
  host.append(el('p', 'Next encounters', 'note'));
  const next = el('div', '', 'link-checks'), links = [];
  doc.nodes.filter(n => n.id !== spec.id).forEach(node => {
    const label = el('label', node.title), check = document.createElement('input'); check.type = 'checkbox'; check.checked = spec.next.includes(node.id); check.value = node.id; label.prepend(check); links.push(check); next.append(label);
  }); host.append(next);
  const entry = el('label', 'Entry opportunity'), entryCheck = document.createElement('input'); entryCheck.type = 'checkbox'; entryCheck.checked = doc.entryIds.includes(spec.id); entryCheck.style.width = '18px'; entryCheck.style.minHeight = '18px'; entry.prepend(entryCheck); host.append(entry);
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
    if (fields.phaseCost.value === '') delete changed.phaseCost; else changed.phaseCost = Number(fields.phaseCost.value);
    if (fields.stockOutput) changed.stockOutput = fields.stockOutput.value;
    changed.next = links.filter(c => c.checked).map(c => c.value);
    for (const [list, rows] of Object.entries(lists)) {
      const items = rows.map(({ item, inputs }) => { const value = structuredClone(item); for (const [name, input] of Object.entries(inputs)) {
        if (input.value === '') delete value[name]; else value[name] = input.type === 'number' ? Number(input.value) : input.value;
      } return value; }); changed[list] = list === 'pass' ? items[0] : items;
    }
    const nextDoc = { ...doc, nodes: doc.nodes.map(n => n.id === spec.id ? changed : n),
      entryIds: entryCheck.checked ? [...new Set([...doc.entryIds, spec.id])] : doc.entryIds.filter(id => id !== spec.id) };
    controller.replaceDraft(nextDoc);
  }, 'primary'));
  host.append(el('p', 'Use Experiment JSON to add/remove nodes or offers and compare larger graph variations.', 'note'));
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
  renderToolbar(snapshot); renderSummary(snapshot); renderGraph(snapshot); renderDecision(snapshot); renderOutcomes(snapshot); renderEditor(snapshot); renderGuides(snapshot);
  $('status').textContent = error || snapshot.message || 'Choose an entry node or a guided experiment.';
  $('status').className = error ? 'error' : '';
  const nextJsonKey = JSON.stringify(snapshot.draft);
  if (jsonKey !== nextJsonKey) { jsonKey = nextJsonKey; $('json').value = controller.exportDraft(); }
  $('apply-json').disabled = snapshot.busy; $('json').disabled = snapshot.busy; $('import').disabled = snapshot.busy;
}
$('apply-json').addEventListener('click', () => run(() => controller.replaceDraft(JSON.parse($('json').value))));
$('import').addEventListener('change', () => run(async () => { const file = $('import').files[0]; if (file) controller.replaceDraft(JSON.parse(await file.text())); $('import').value = ''; }));
controller.subscribe(render); render(); document.body.dataset.ready = 'true';
window.addEventListener('resize', drawConnections);
// Focused inspection hook for the collaborative browser; never includes full GameState.
window.openingWorkbench = { getSnapshot: () => { const { summary, busy, session } = controller.getSnapshot(); return { summary, busy, availableIds: session.availableIds, activeId: session.activeId, visitedIds: session.visitedIds }; } };
