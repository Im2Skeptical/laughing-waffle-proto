// Three Structure face treatments on an isolated dev workbench, switchable via
// ?variant=A/B/C. Which communicates passive capacity at construction-strip size?
// Presentation only: definitions are read; simulation and player saves are absent.
import { settlementStructureDefs } from '../../../src/defs/gamepieces/detailed-settlement-defs.js';

const ids = ['mudHouses', 'timberHouse', 'longhouse', 'granary', 'storehouse', 'archive', 'barracks'];
const variants = { A: 'Illustrated plaque', B: 'Capacity ledger', C: 'Inset seal' };
const flavours = {
  mudHouses: 'A little earth between the hearth and the storm.',
  timberHouse: 'The forest becomes a roof; the roof becomes a home.',
  longhouse: 'Many fires, one roof. No neighbour winters alone.',
  granary: 'What summer leaves behind, winter will ask for.',
  storehouse: 'Every beam kept dry is a promise of tomorrow.',
  archive: 'A realm remembers only what someone chooses to keep.',
  barracks: 'Even in peace, the watch keeps its place.',
};
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const titleCase = value => value[0].toUpperCase() + value.slice(1);
const fmt = value => Number(value.toFixed(2)).toString();
const params = new URL(location.href).searchParams;
const state = { variant: variants[params.get('variant')] ? params.get('variant') : 'A',
  card: ids.includes(params.get('card')) ? params.get('card') : 'granary', quality: 0,
  context: params.get('context') === 'shop' ? 'shop' : 'settlement', requirements: 'met', staged: null };
let hoverId = null, pinned = false, hoverTimer, lastFocus;

// Small, scalable face symbols. The outlined plus marks capacity, not production.
function icon(kind, size = 36) {
  const shapes = {
    housing: '<path d="M5 22 24 6l19 16M10 19v23h28V19"/><path d="M16 36c0-5 3-7 8-7s8 2 8 7"/><circle cx="24" cy="23" r="4"/>',
    stock: '<path d="m7 15 17-7 17 7v23l-17 7-17-7V15Zm0 0 17 7 17-7M24 22v23M14 12l17 7"/><path d="M12 25v9m5-7v9"/>',
    support: '<path d="M10 9h28v17c0 10-14 18-14 18S10 36 10 26V9Z"/><path d="M24 16v18m-7-11h14"/>',
    candidate: '<path d="m24 7 5 11 12 1-9 8 3 13-11-7-11 7 3-13-9-8 12-1Z"/>',
    footprint: '<rect x="6" y="15" width="11" height="18"/><rect x="19" y="15" width="11" height="18"/><rect x="32" y="15" width="11" height="18"/>',
  };
  return `<svg class="effect-icon ${kind}" width="${size}" height="${size}" viewBox="0 0 52 52" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind] ?? shapes.candidate}${['housing', 'stock'].includes(kind) ? '<rect x="33" y="32" width="18" height="18" rx="3" class="capacity-marker"/><path d="M37 41h10m-5-5v10"/>' : ''}</svg>`;
}
function data(id) {
  const def = settlementStructureDefs[id], factor = 1 + state.quality * .25;
  const capacities = (def.modifiers ?? []).filter(m => m.kind === 'capacity');
  const effects = [];
  if (def.housing) effects.push({ kind: 'housing', amount: Math.floor(def.housing * factor), label: 'Housing capacity', scope: 'in this settlement', text: `Adds ${Math.floor(def.housing * factor)} Housing capacity to this settlement.` });
  for (const modifier of capacities) {
    const traits = modifier.query?.traitsAny ?? [], tags = modifier.query?.tagsAny ?? [];
    effects.push({ kind: 'stock', amount: modifier.amount * factor, label: 'Stock capacity', scope: traits.length ? traits.join(' / ') : tags.length ? tags.join(' / ') : 'all Practices',
      text: `Each local Practice ${traits.length ? `whose Stock has ${traits.join(' or ')}` : tags.length ? `tagged ${tags.join(' or ')}` : ''} gains +${fmt(modifier.amount * factor)} Stock capacity.` });
  }
  for (const modifier of (def.modifiers ?? []).filter(m => m.kind === 'support')) effects.push({ kind: 'support', amount: modifier.amount * factor * 100, unit: '%', label: 'Martial Support', scope: 'local Support multiplier', text: `Adds ${fmt(modifier.amount * factor * 100)}% to the local Martial Support multiplier.` });
  const tier = ['bronze', 'silver', 'gold', 'diamond'][Math.min(3, ['bronze', 'silver', 'gold', 'diamond'].indexOf(def.minimumQuality ?? 'bronze') + state.quality)];
  return { def, effects, tier, factor, active: !def.specialistGate || state.requirements === 'met' };
}
function effectBadge(effect, large = false) {
  return `<span class="effect-badge ${effect.kind}${large ? ' large' : ''}">${icon(effect.kind, large ? 48 : 31)}<span><strong>+${fmt(effect.amount)}${effect.unit ?? ''}</strong>${large ? `<small>${esc(effect.label)}</small>` : ''}</span></span>`;
}
function card(id, { preview = false, index = null } = {}) {
  const { def, effects, tier, active } = data(id);
  return `<button type="button" class="structure-card treatment-${state.variant} quality-${tier}${active ? '' : ' inactive'}${id === state.card && !preview ? ' selected' : ''}" data-card="${id}" data-footprint="${def.footprint}" style="--footprint:${def.footprint}" aria-label="${esc(def.label)}${preview ? ' preview' : ', quick read'}" ${!preview ? `aria-pressed="${id === state.card}"` : ''}>
    <img src="images/dark-fantasy/settlement-pieces-v4/${id}.webp" alt="" class="painting">
    <span class="card-frame"></span><span class="card-title">${esc(def.label)}</span>
    <span class="quality-gem" title="${titleCase(tier)} quality" aria-hidden="true">◆</span>
    ${state.variant === 'B' ? `<span class="ledger-label">${effects[0]?.kind === 'housing' ? 'HOUSING' : effects[0]?.kind === 'stock' ? 'STOCK CAPACITY' : 'SUPPORT'}</span>` : ''}
    <span class="card-effects">${effects.map(effect => effectBadge(effect)).join('')}</span>
    ${state.variant === 'B' ? `<span class="ledger-scope">${esc(effects[0]?.scope ?? 'Local effect')}</span>` : ''}
    <span class="footprint-cells" aria-hidden="true">${Array.from({ length: def.footprint }, () => '<i></i>').join('')}</span>
    ${!active ? '<span class="inactive-label">INACTIVE</span>' : ''}
    ${index !== null ? `<span class="slot-index">${index + 1}${def.footprint > 1 ? `–${index + def.footprint}` : ''}</span>` : ''}
  </button>`;
}
function reading(id, { inspect = true } = {}) {
  const { def, effects, active } = data(id);
  const history = (def.modifiers ?? []).filter(m => m.kind === 'historyCandidate');
  return `<article class="quick-read${active ? '' : ' is-inactive'}" data-reading="${id}">
    <div class="tags">${[titleCase(def.pool), 'Structure', ...(def.tags ?? [])].map(tag => `<span${tag === 'Knowledge' ? ' class="knowledge"' : ''}>${esc(tag)}</span>`).join('')}</div>
    ${inspect ? `<button class="reading-title" type="button" data-inspect="${id}" aria-label="Inspect ${esc(def.label)}"><h3>${esc(def.label)}</h3><span aria-hidden="true">↗</span></button>` : `<div class="reading-title"><h3>${esc(def.label)}</h3></div>`}
    <div class="rules-block"><span class="eyebrow">${def.specialistGate ? 'WHILE ACTIVE' : 'WHILE BUILT'}</span>
      ${effects.map(effect => `<p class="rule-line"><span class="rule-arrow">›</span>${esc(effect.text)}</p>`).join('')}
      ${def.candidateBonus && def.pool !== 'common' ? `<p class="rule-line secondary"><span class="rule-arrow">›</span>+${def.candidateBonus} to future ${esc(def.pool)} candidates from this settlement, within the institutional bonus cap.</p>` : ''}
      ${history.map(m => `<p class="rule-line secondary"><span class="rule-arrow">›</span>Additional candidate bonus from civilization age and stocked Record Practices, capped at +${m.cap}.</p>`).join('')}
    </div>
    ${def.specialistGate ? `<div class="requirements ${active ? '' : 'unmet'}"><b>Requires ${def.specialistGate} local Scholar${def.specialistGate > 1 ? 's' : ''}.</b>${active ? '<span>Requirement met · bonuses active.</span>' : '<span>Inactive: not enough Scholars. The Structure remains built, but its bonuses do not apply.</span>'}</div>` : ''}
    <div class="flavour">${esc(flavours[id])}</div>
  </article>`;
}
function glossary(id) {
  const { def, effects, tier } = data(id);
  return `<aside class="glossary"><p class="eyebrow">THE SYMBOLS ON THIS CARD</p>${effects.map(effect => `<div class="glossary-entry">${icon(effect.kind, 44)}<div><h4>${esc(effect.label)}</h4><p>${effect.kind === 'housing' ? 'The roof and sheltered person mean room for population. The plus and numeral show the added capacity, not people arriving.' : effect.kind === 'stock' ? `The crate and plus mean room for more Stock on each matching Practice. ${esc(effect.scope)} names the scope in the rules. This Structure does not hold or produce Stock.` : 'The shield identifies an ongoing contribution to Martial Support.'}</p></div></div>`).join('')}
    <div class="glossary-entry">${icon('footprint', 44)}<div><h4>Construction footprint</h4><p>${def.footprint} horizontal cell${def.footprint > 1 ? 's' : ''}. The small squares count the space it occupies. Structures use the regional construction strip, separate from the five Practice slots.</p></div></div>
    <div class="glossary-entry"><span class="glossary-gem quality-${tier}">◆</span><div><h4>${titleCase(tier)} quality</h4><p>The jewel and frame show quality.${state.quality ? ` This example has ${state.quality * 25}% uplift to numeric bonuses.` : ' Values here are the authored base bonuses.'}</p></div></div>
    <div class="glossary-entry"><span class="stack-mark">+</span><div><h4>Ongoing bonuses</h4><p>Numeric bonuses from duplicate Structures add. Capacity remains in effect while the Structure is active; there is no scheduled Activation or Charge.</p></div></div></aside>`;
}
function syncUrl() {
  const url = new URL(location.href);
  for (const key of ['variant', 'card', 'context']) url.searchParams.set(key, state[key]);
  history.replaceState(null, '', url);
}
function renderScene() {
  if (state.context === 'shop') {
    const offers = [...new Set([state.card, 'longhouse', 'archive', 'granary'])].slice(0, 3);
    $('scene-content').innerHTML = `<div class="shop-heading"><div><span class="eyebrow">BUILD A STRUCTURE</span><p>Choose a lasting addition to the settlement.</p></div><span class="preview-tag">Example offers</span></div><div class="offers">${offers.map(id => {
      const def = settlementStructureDefs[id];
      return `<article class="offer">${card(id)}<div class="offer-caption"><b>${esc(def.label)}</b><span>${def.footprint} construction cell${def.footprint > 1 ? 's' : ''}</span></div><button class="build-button" type="button" data-stage="${id}"${state.staged ? ' disabled' : ''}>${state.staged === id ? 'Staged' : 'Stage build'} <span>${def.vassalPrestigeCost} Prestige · ${def.vassalPhaseCost} phases</span></button></article>`;
    }).join('')}</div><p class="stage-message" role="status">${state.staged ? `${esc(settlementStructureDefs[state.staged].label)} staged in this example. Reset to try another offer.` : 'Select a card to read; Stage build previews the decision.'}</p>`;
    return;
  }
  const stripIds = [...new Set([state.card, 'mudHouses', 'granary', 'longhouse', 'archive'])];
  let used = 0, cards = '';
  for (const id of stripIds) {
    const footprint = settlementStructureDefs[id].footprint;
    if (used + footprint > 8) continue;
    cards += card(id, { index: used }); used += footprint;
  }
  $('scene-content').innerHTML = `<div class="settlement-body"><div class="settlement-summary"><p class="eyebrow">REGIONAL SETTLEMENT</p><h3>Hearth &amp; home</h3><p>Buildings make room for the life and work beneath their roofs.</p><div class="population">${icon('housing', 42)}<span><b>86</b> people</span></div><span class="preview-tag">Example tableau</span></div><div class="tableau"><div class="row-heading"><span>PRACTICES</span><small>5 / 5 slots</small></div><div class="practice-row">${['forage', 'logging', 'smelting', 'alchemy', 'anatomicalStudy'].map((id, i) => `<div class="practice-reference"><img src="images/dark-fantasy/settlement-pieces-v4/${id}.webp" alt=""><span>${['Foraging', 'Logging', 'Smelting', 'Alchemy', 'Anatomical Study'][i]}</span></div>`).join('')}</div><div class="row-heading"><span>STRUCTURES</span><small>${used} / 8 construction cells</small></div><div class="construction-strip">${cards}${Array.from({ length: 8 - used }, (_, i) => `<div class="empty-cell"><span>+</span><small>${used + i + 1}</small></div>`).join('')}</div></div></div>`;
}
function render() {
  closeHover();
  document.body.dataset.variant = state.variant;
  $('structure').value = state.card; $('quality').value = state.quality;
  $('context').value = state.context; $('requirements').value = state.requirements;
  $('gate-control').hidden = !settlementStructureDefs[state.card].specialistGate;
  $('scene-title').textContent = state.context === 'shop' ? 'Build something that lasts' : 'A place to endure';
  $('variant-label').textContent = `${state.variant} · ${variants[state.variant]}`;
  renderScene(); $('reading').innerHTML = reading(state.card);
  $('selected-face').innerHTML = card(state.card, { preview: true });
  $('symbol-samples').innerHTML = [{ kind: 'housing', amount: 30, label: 'Housing capacity' }, { kind: 'stock', amount: 3, label: 'Stock capacity' }].map(e => `<div class="symbol-sample">${effectBadge(e, true)}<p>${e.kind === 'housing' ? 'Settlement-wide Housing' : 'Capacity on matching Practices'}</p></div>`).join('');
  $('state').textContent = JSON.stringify({ ...state, selected: data(state.card), question: 'Which face reads best at construction-strip size?' }, null, 2);
  syncUrl(); document.body.dataset.ready = 'true';
}
function closeHover() { clearTimeout(hoverTimer); hoverId = null; pinned = false; $('hover-reading').hidden = true; }
function showHover(id, target, pin = false) {
  if ($('inspection').open) return;
  clearTimeout(hoverTimer); hoverId = id; pinned = pin;
  const host = $('hover-reading'); host.innerHTML = `${reading(id)}<button class="dismiss-read" type="button" data-dismiss aria-label="Close quick read">×</button>`; host.hidden = false;
  const rect = target.getBoundingClientRect(), width = Math.min(360, innerWidth - 24);
  host.style.width = `${width}px`;
  host.style.left = `${Math.min(innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2))}px`;
  const height = Math.min(host.scrollHeight, innerHeight - 24);
  host.style.top = `${Math.max(12, Math.min(innerHeight - height - 12, rect.bottom + 10))}px`;
}
function delayedClose() { if (!pinned) hoverTimer = setTimeout(closeHover, 160); }
function inspect(id, origin) {
  closeHover(); lastFocus = origin;
  $('inspection-content').innerHTML = `<div class="inspection-card"><span class="eyebrow">${data(id).tier.toUpperCase()} · STRUCTURE</span>${card(id, { preview: true })}<p>${settlementStructureDefs[id].footprint} construction cell${settlementStructureDefs[id].footprint > 1 ? 's' : ''}</p></div><div class="inspection-rules">${reading(id, { inspect: false })}</div>${glossary(id)}`;
  $('inspection').showModal();
}
function cycle(step) {
  const keys = Object.keys(variants); state.variant = keys[(keys.indexOf(state.variant) + step + keys.length) % keys.length]; render();
  if ($('inspection').open) $('inspection').close();
}
$('structure').innerHTML = ids.map(id => `<option value="${id}">${esc(settlementStructureDefs[id].label)}</option>`).join('');
for (const key of ['structure', 'quality', 'context', 'requirements']) $(key).addEventListener('change', () => {
  if (key === 'structure') state.card = $('structure').value;
  else state[key] = key === 'quality' ? Number($(key).value) : $(key).value;
  state.staged = null; render();
});
$('reset').addEventListener('click', () => { state.quality = 0; state.requirements = 'met'; state.staged = null; render(); });
$('previous').addEventListener('click', () => cycle(-1)); $('next').addEventListener('click', () => cycle(1));
$('close-inspection').addEventListener('click', () => $('inspection').close());
$('inspection').addEventListener('close', () => {
  document.querySelector(`[data-inspect="${state.card}"]`)?.focus();
  if (lastFocus?.isConnected) lastFocus.focus();
});
document.addEventListener('click', event => {
  const inspection = event.target.closest('[data-inspect]');
  if (inspection) { inspect(inspection.dataset.inspect, inspection); return; }
  if (event.target.closest('[data-dismiss]')) { closeHover(); return; }
  const stage = event.target.closest('[data-stage]');
  if (stage) { state.staged = stage.dataset.stage; render(); return; }
  const target = event.target.closest('[data-card]');
  if (target && !target.closest('#inspection')) {
    state.card = target.dataset.card; render();
    const replacement = document.querySelector(`#scene-content [data-card="${state.card}"]`) ?? $('selected-face').firstElementChild;
    replacement.focus({ preventScroll: true });
    showHover(state.card, replacement, true); return;
  }
  if (!event.target.closest('#hover-reading')) closeHover();
});
document.addEventListener('pointerover', event => {
  const target = event.target.closest('#scene-content [data-card]');
  if (target && event.pointerType !== 'touch' && !pinned) showHover(target.dataset.card, target);
  if (event.target.closest('#hover-reading')) clearTimeout(hoverTimer);
});
document.addEventListener('pointerout', event => {
  if (event.target.closest('#scene-content [data-card], #hover-reading') && !event.relatedTarget?.closest('#hover-reading')) delayedClose();
});
document.addEventListener('focusin', event => {
  const target = event.target.closest('#scene-content [data-card]');
  if (target && !pinned) showHover(target.dataset.card, target);
});
document.addEventListener('focusout', event => {
  if (event.target.closest('#scene-content [data-card], #hover-reading') && !event.relatedTarget?.closest('#hover-reading')) delayedClose();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && hoverId) { closeHover(); return; }
  if (event.target.closest('input, textarea, select, [contenteditable]') || $('inspection').open) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
});
window.addEventListener('resize', closeHover); window.addEventListener('scroll', () => { if (!pinned) closeHover(); }, { passive: true });
window.structureWorkbench = { get state() { return { ...state }; }, get selected() { return data(state.card); } };
render();
