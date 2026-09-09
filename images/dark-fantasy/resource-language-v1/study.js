// Isolated art-review surface. This module never imports or mutates game state.
export const RESOURCES = Object.freeze([
  { id: 'year', label: 'Year', detail: 'One solar revolution', value: 2 },
  { id: 'moon', label: 'Moon', detail: 'Six lunar phases', value: 2 },
  { id: 'phase', label: 'Phase', detail: 'One lunar reckoning', value: 4 },
  { id: 'prestige', label: 'Prestige', detail: 'The Vassal’s influence', value: 18 },
  { id: 'money', label: 'Money', detail: 'Settlement currency', value: 35 },
  { id: 'food', label: 'Food', detail: 'The settlement’s provisions', value: 120 },
]);

export const PHASES = Object.freeze([
  { id: 'birth', label: 'Birth', short: 'Build & grow', rules: 'Building practices resolve. Births and maturation change the population, and annual elder aging is applied at the first following Birth phase.' },
  { id: 'food', label: 'Food', short: 'Gather & feed', rules: 'Forage gathers food before Administration routes meal-safe surplus. Villagers eat before Strangers. Shortages affect happiness and can cause starvation migration.' },
  { id: 'housing', label: 'Housing', short: 'Find shelter', rules: 'Housing is checked after starvation migrants are reserved. Overcrowding limits happiness and displaces Strangers before Villagers.' },
  { id: 'faith', label: 'Faith', short: 'Reckon & believe', rules: 'Food and housing evidence changes faith and can cause social displacement. The reckoning also adds civilization-wide Primordial pressure.' },
  { id: 'migration', label: 'Migration', short: 'Move & arrive', rules: 'People displaced by food, housing, or faith share one destination process. Housing is reserved across settlements before arrivals resolve.' },
  { id: 'death', label: 'Death', short: 'Loss & decay', rules: 'Arrival meals and hardship resolve, followed by natural elder mortality and food decay. Surviving arrivals join their destination’s Stranger cohort.' },
]);

// Pure duration arithmetic for this review. Production formatting is unchanged
// until the visual review is approved. Only use solar years when their duration
// is an integral number of lunar phases, so every displayed amount is exact.
export function durationParts(phaseCost, { phaseDurationSec = 1, seasonDurationSec = 8 } = {}) {
  let remaining = Math.max(0, Math.floor(Number(phaseCost) || 0));
  const phaseSeconds = Math.max(1, Math.floor(phaseDurationSec));
  const yearSeconds = Math.max(1, Math.floor(seasonDurationSec)) * 4;
  const phasesPerYear = yearSeconds / phaseSeconds;
  const years = Number.isInteger(phasesPerYear) ? Math.floor(remaining / phasesPerYear) : 0;
  if (years) remaining -= years * phasesPerYear;
  const moons = Math.floor(remaining / 6);
  const phases = remaining % 6;
  return { years, moons, phases };
}

export function phaseIndexAt(tSec, phaseDurationSec = 1) {
  return tSec <= 0 ? 0 : Math.floor(Math.max(0, Math.floor(tSec) - 1) / phaseDurationSec) % 6;
}

const SCENARIOS = {
  travel: {
    title: 'Travel', prestige: 12, sideTitle: 'Regional preview', sideText: 'A road changes where your Vassal acts next.', shop: false,
    cards: [
      { id: 'travel-r03', label: 'Travel to R03', phaseCost: 100, prestigeCost: 0, art: 6, detail: 'Move the Vassal to another player settlement. This example takes 100 phases.' },
      { id: 'travel-r06', label: 'Travel to R06', phaseCost: 199, prestigeCost: 0, art: 6, detail: 'Move the Vassal to another player settlement. This example takes 199 phases.' },
      { id: 'travel-r07', label: 'Travel to R07', phaseCost: 299, prestigeCost: 0, art: 6, detail: 'Move the Vassal to another player settlement. This example takes 299 phases.' },
    ],
  },
  practices: {
    title: 'Practice Reform', prestige: 28, sideTitle: 'Settlement · R03', sideText: 'Practices keep their seasonal, lunar, passive, or charged behavior.', shop: true,
    cards: [
      { id: 'forage', label: 'Forage', phaseCost: 216, prestigeCost: 10, art: 0, detail: 'Gather Food at the start of the Food phase, before Administration routes supplies. Base output and one worker slot are unchanged.' },
      { id: 'cultivate', label: 'Cultivate', phaseCost: 324, prestigeCost: 18, art: 1, detail: 'Produce Food each Summer from same-colour player territory. This practice remains seasonal.' },
      { id: 'administrate', label: 'Administrate', phaseCost: 432, prestigeCost: 20, art: 3, detail: 'Move meal-safe surplus before feeding, using the shared transport cap. This practice remains tied to the Food phase.' },
    ],
  },
  structures: {
    title: 'Public Works', prestige: 28, sideTitle: 'Settlement · R03', sideText: 'New structures occupy the region’s available structure slots.', shop: true,
    cards: [
      { id: 'granary', label: 'Granary', phaseCost: 324, prestigeCost: 18, art: 4, detail: 'Increase local stored-Food capacity. Existing capacity calculations and building limits are preserved.' },
      { id: 'mudHouses', label: 'Mud House', phaseCost: 324, prestigeCost: 18, art: 5, detail: 'Increase local Housing capacity. Existing capacity calculations and building limits are preserved.' },
      { id: 'hostel', label: 'Hostel', phaseCost: 324, prestigeCost: 18, art: 4, atlas: 'civic', atlasIndex: 4, detail: 'Reserve housing capacity for incoming migrants and Strangers. This structure keeps its current behavior.' },
    ],
  },
};

function icon(id, size = null) {
  return `<img class="icon" src="${id}.png" alt="" aria-hidden="true"${size ? ` style="--icon-size:${size}px"` : ''}>`;
}

function phaseBadge(id) { return `<span class="phase-badge">${icon(id)}</span>`; }

function durationText(cost) {
  const { years, moons, phases } = durationParts(cost);
  const text = [];
  if (years) text.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (moons) text.push(`${moons} ${moons === 1 ? 'moon' : 'moons'}`);
  if (phases || !text.length) text.push(`${phases} ${phases === 1 ? 'phase' : 'phases'}`);
  return text.join(', ');
}

function timeTokens(cost) {
  const values = durationParts(cost);
  const tokens = [['year', values.years], ['moon', values.moons], ['phase', values.phases]];
  return `<span class="time-tokens" aria-label="${durationText(cost)}">${tokens.filter(([, value]) => value > 0).map(([id, value]) => `<span class="unit-token">${value}${icon(id)}</span>`).join('') || `<span class="unit-token">0${icon('phase')}</span>`}</span>`;
}

function costFooter(spec, { state = 'available', action = 'Choose', disabled = false } = {}) {
  const label = `${action} ${spec.label || 'this choice'}: ${durationText(spec.phaseCost)}${spec.prestigeCost ? `, ${spec.prestigeCost} Prestige` : ''}`;
  const mark = state === 'selected' ? '✓' : state === 'staged' ? '✓' : state === 'unaffordable' ? '!' : '';
  return `<button type="button" class="cost-footer is-${state}${!spec.prestigeCost ? ' time-only' : ''}" data-cost-id="${spec.id || ''}" aria-label="${label}" title="${state === 'unaffordable' ? `Not enough Prestige — requires ${spec.prestigeCost}` : label}"${disabled ? ' disabled' : ''}${['selected', 'staged'].includes(state) ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${mark ? `<span class="cost-mark" aria-hidden="true">${mark}</span>` : ''}${timeTokens(spec.phaseCost)}${spec.prestigeCost ? `<span class="prestige-row">${spec.prestigeCost}${icon('prestige')}</span>` : ''}</button>`;
}

export function mountStudy() {
  let viewedSecond = 2;
  let currentScenario = 'travel';
  let selectedId = 'travel-r03';
  let purchases = [];
  let completed = false;
  const wheels = new Set();
  const $ = selector => document.querySelector(selector);
  const status = message => { $('#context-status').textContent = message; };

  $('#resource-grid').innerHTML = RESOURCES.map(resource => `<article class="resource-tile"><div class="resource-art">${icon(resource.id)}</div><h3>${resource.label}</h3><p>${resource.detail}</p><div class="scale-tests"><div class="scale-test">${icon(resource.id, 24)}<span>24 px</span></div><div class="scale-test">${icon(resource.id, 18)}<span>18 px</span></div></div></article>`).join('');
  $('#phase-grid').innerHTML = PHASES.map(phase => `<article class="phase-tile">${phaseBadge(phase.id)}<strong>${phase.label}</strong><small>${phase.short}</small></article>`).join('');
  $('#monochrome').addEventListener('change', event => document.body.classList.toggle('mono', event.target.checked));

  function renderReference(index) {
    const phase = PHASES[index];
    $('#phase-reference-tabs').innerHTML = PHASES.map((entry, i) => `<button type="button" id="phase-tab-${entry.id}" role="tab" aria-selected="${i === index}" aria-controls="phase-reference-content" data-reference-phase="${i}">${icon(entry.id)}${entry.label}</button>`).join('');
    $('#phase-reference-content').setAttribute('aria-labelledby', `phase-tab-${phase.id}`);
    $('#phase-reference-content').innerHTML = `${phaseBadge(phase.id)}<div><h3>${phase.label}</h3><p>${phase.rules}</p></div>`;
  }

  function openReference() {
    renderReference(phaseIndexAt(viewedSecond));
    $('#phase-dialog').showModal();
  }

  $('#phase-reference-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-reference-phase]');
    if (!button) return;
    renderReference(Number(button.dataset.referencePhase));
    $(`#phase-tab-${PHASES[Number(button.dataset.referencePhase)].id}`).focus();
  });
  $('#phase-reference-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const selected = $('#phase-reference-tabs [aria-selected="true"]');
    let index = Number(selected.dataset.referencePhase);
    index = event.key === 'Home' ? 0 : event.key === 'End' ? 5 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 6) % 6;
    event.preventDefault();
    renderReference(index);
    $(`#phase-tab-${PHASES[index].id}`).focus();
  });

  function createWheel(mount) {
    const wheel = document.createElement('div');
    wheel.className = 'wheel';
    wheel.innerHTML = `<div class="solar-rotor"><img class="wheel-art" src="solar-wheel.png" alt="Solar year wheel"></div><div class="moon-rotor"><img class="wheel-art" src="moon-wheel.png" alt="Six-phase moon wheel">${PHASES.map((phase, i) => `<span class="wheel-engraving" style="transform:rotate(${-90 - i * 60}deg) translateX(185%) rotate(90deg)">${icon(phase.id)}</span>`).join('')}</div><button class="wheel-centre" type="button" aria-label="Open the six-phase reference">${icon('food')}</button><span class="wheel-pointer"></span>`;
    let drag = null;
    let suppressClick = false;
    wheel.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const bounds = wheel.getBoundingClientRect();
      const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const dx = event.clientX - centre.x, dy = event.clientY - centre.y;
      if (Math.hypot(dx, dy) > bounds.width / 2) return;
      drag = { pointerId: event.pointerId, centre, x: event.clientX, y: event.clientY, angle: Math.atan2(dy, dx), second: viewedSecond, angleSum: 0, moved: false, duration: Math.hypot(dx, dy) > bounds.width * .335 ? 32 : 6 };
      suppressClick = false;
    });
    wheel.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const angle = Math.atan2(event.clientY - drag.centre.y, event.clientX - drag.centre.x);
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      if (!drag.moved) wheel.setPointerCapture(event.pointerId);
      let delta = angle - drag.angle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      drag.angleSum += delta;
      drag.angle = angle;
      drag.moved = true;
      suppressClick = true;
      setViewedSecond(drag.second + drag.angleSum / (2 * Math.PI) * drag.duration);
    });
    wheel.addEventListener('pointerleave', () => { if (drag && !drag.moved) drag = null; });
    for (const eventName of ['pointerup', 'pointercancel']) wheel.addEventListener(eventName, event => {
      if (wheel.hasPointerCapture(event.pointerId)) wheel.releasePointerCapture(event.pointerId);
      drag = null;
    });
    wheel.querySelector('.wheel-centre').addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      openReference();
    });
    mount.replaceChildren(wheel);
    wheels.add(wheel);
    return wheel;
  }

  function setViewedSecond(value) {
    viewedSecond = Math.max(0, Math.min(96, Math.round(value)));
    const phase = PHASES[phaseIndexAt(viewedSecond)];
    const season = ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(viewedSecond / 8) % 4];
    const year = Math.floor(viewedSecond / 32) + 1;
    $('#time-range').value = String(viewedSecond);
    $('#time-output').textContent = `${viewedSecond} seconds`;
    $('#season-readout').innerHTML = `${icon('year')}Year ${year} · ${season}`;
    $('#phase-readout').innerHTML = `${icon(phase.id)}${phase.label}`;
    const stageDate = $('#game-stage .stage-date');
    if (stageDate) stageDate.textContent = `YEAR ${year} · ${season}`;
    for (const wheel of wheels) {
      if (!wheel.isConnected) { wheels.delete(wheel); continue; }
      wheel.querySelector('.solar-rotor').style.transform = `rotate(${viewedSecond / 32 * 360}deg)`;
      wheel.querySelector('.moon-rotor').style.transform = `rotate(${Math.max(0, viewedSecond - 1) / 6 * 360}deg)`;
      const centre = wheel.querySelector('.wheel-centre');
      centre.innerHTML = icon(phase.id);
      centre.setAttribute('aria-label', `${phase.label} phase — open all six phases`);
    }
  }

  createWheel($('#hero-wheel'));
  $('#time-range').addEventListener('input', event => setViewedSecond(Number(event.target.value)));
  $('#previous-phase').addEventListener('click', () => setViewedSecond(viewedSecond - 1));
  $('#next-phase').addEventListener('click', () => setViewedSecond(viewedSecond + 1));

  const example = { id: 'sample', label: 'the example', phaseCost: 80, prestigeCost: 18 };
  const states = [
    { id: 'available', label: 'Available', description: 'The full framed area is the action.' },
    { id: 'selected', label: 'Selected', description: 'A check and border identify your choice.' },
    { id: 'staged', label: 'Staged', description: 'Reserved in the draft; paid on confirmation.' },
    { id: 'unaffordable', label: 'Not enough Prestige', description: 'The marked amount explains the shortfall.' },
  ];
  $('#cost-states').innerHTML = states.map(state => `<article class="cost-state"><p class="state-title">${state.label}</p>${costFooter(example, { state: state.id, disabled: state.id === 'unaffordable' || state.id === 'staged' })}<p class="state-description">${state.description}</p></article>`).join('');
  $('#cost-states').addEventListener('click', event => {
    const button = event.target.closest('.cost-footer');
    if (!button || button.disabled) return;
    const selected = !button.classList.contains('is-selected');
    button.outerHTML = costFooter(example, { state: selected ? 'selected' : 'available' });
  });
  $('#resource-examples').innerHTML = `<span class="resource-value" aria-label="35 Money">35${icon('money')}<small>stored</small></span><span class="resource-value" aria-label="120 Food">120${icon('food')}<small>stored</small></span><span class="resource-value" aria-label="5 Food produced">+5${icon('food')}<small>output</small></span>`;
  $('#duration-example').innerHTML = timeTokens(80);

  function renderStage() {
    const scenario = SCENARIOS[currentScenario];
    const stagedCards = purchases.map(id => scenario.cards.find(card => card.id === id));
    const spent = stagedCards.reduce((sum, card) => sum + card.prestigeCost, 0);
    const available = scenario.prestige - spent;
    const canConfirm = !completed && (scenario.shop ? purchases.length > 0 : Boolean(selectedId));
    $('#game-stage').innerHTML = `<div class="stage-backdrop"></div><div class="stage-topbar"><span>VASSAL CHRONICLE</span><span class="stage-date">YEAR 1 · Spring</span><span>DESIGN PREVIEW</span></div><div class="stage-modal"><div class="stage-heading"><h3>${scenario.title}</h3><span class="stage-prestige">${scenario.prestige}${spent ? ` → ${available}` : ''}${icon('prestige')}</span></div><div class="stage-cards">${scenario.cards.map(card => {
      const staged = purchases.includes(card.id);
      const selected = !scenario.shop && card.id === selectedId;
      const unaffordable = !staged && card.prestigeCost > available;
      const state = staged ? 'staged' : selected ? 'selected' : unaffordable ? 'unaffordable' : 'available';
      const index = card.atlasIndex ?? card.art;
      const position = `${index % 4 / 3 * 100}% ${Math.floor(index / 4) / 2 * 100}%`;
      return `<article class="study-card is-${state}"><div class="art-crop" style="background-position:${position}${card.atlas ? ';background-image:url(../chronicle-civic.png)' : ''}"></div><button class="art-action" type="button" data-inspect="${card.id}" aria-label="Inspect ${card.label}"><strong>${card.label}</strong><span aria-hidden="true">ⓘ</span></button>${costFooter(card, { state, action: scenario.shop ? 'Stage' : 'Choose', disabled: unaffordable || staged || completed })}</article>`;
    }).join('')}</div><aside class="stage-side"><h4>${scenario.sideTitle}</h4><div class="side-art"></div><p>${scenario.sideText}</p></aside><div class="stage-bottom"><div class="draft-summary">${scenario.shop ? (stagedCards.length ? stagedCards.map((card, index) => `<span class="draft-pill">${index + 1}. ${card.label}<button type="button" data-earlier="${card.id}" aria-label="Move ${card.label} earlier"${index === 0 || completed ? ' disabled' : ''}>←</button><button type="button" data-undo="${card.id}" aria-label="Undo ${card.label}"${completed ? ' disabled' : ''}>×</button></span>`).join('') : 'Choose a cost box to stage a purchase.') : (selectedId ? `${durationText(scenario.cards.find(card => card.id === selectedId).phaseCost)} · Time on confirmation` : 'Choose a journey.')}</div><button type="button" class="stage-confirm"${canConfirm ? '' : ' disabled'}>${completed ? 'PREVIEW COMPLETE' : 'CONFIRM & RESOLVE'}</button></div></div><div class="stage-dock"><button type="button" data-preview-navigation="Settlement"><strong>⌂</strong>Settlement</button><button type="button" data-preview-navigation="Map"><strong>◇</strong>Map</button></div><div class="stage-graph" aria-label="Existing Chronicle graph frame"></div><div class="stage-lever" aria-hidden="true"></div><div class="stage-wheel"></div>`;
    createWheel($('#game-stage .stage-wheel'));
    setViewedSecond(viewedSecond);
  }

  $('#game-stage').addEventListener('click', event => {
    const scenario = SCENARIOS[currentScenario];
    const cost = event.target.closest('[data-cost-id]');
    if (cost && !cost.disabled && !completed) {
      if (scenario.shop) purchases.push(cost.dataset.costId);
      else selectedId = cost.dataset.costId;
      renderStage();
      status(scenario.shop ? 'Purchase staged. Use × to undo or ← to change the draft order. Confirmation remains separate.' : 'Choice selected. Its cost remains visible; confirmation is still separate.');
      return;
    }
    const undo = event.target.closest('[data-undo]');
    if (undo && !undo.disabled) { purchases = purchases.filter(id => id !== undo.dataset.undo); renderStage(); status('Purchase removed from this example’s draft.'); return; }
    const earlier = event.target.closest('[data-earlier]');
    if (earlier && !earlier.disabled) { const index = purchases.indexOf(earlier.dataset.earlier); [purchases[index - 1], purchases[index]] = [purchases[index], purchases[index - 1]]; renderStage(); status('Draft order changed.'); return; }
    const inspect = event.target.closest('[data-inspect]');
    if (inspect) {
      const card = scenario.cards.find(entry => entry.id === inspect.dataset.inspect);
      $('#inspection-title').textContent = card.label;
      $('#inspection-content').innerHTML = `<p>${card.detail}</p>${costFooter(card, { disabled: true })}<p>These amounts use the proposed calendar labels. The actual game’s prices and behavior have not changed.</p>`;
      $('#inspection-dialog').showModal();
      return;
    }
    if (event.target.closest('.stage-confirm:not(:disabled)')) { completed = true; renderStage(); status('Confirmed in the design preview. No game state was changed. Switch examples to start another review.'); return; }
    const navigation = event.target.closest('[data-preview-navigation]');
    if (navigation) status(`${navigation.dataset.previewNavigation} is shown for layout context. This board is separate from the running game.`);
  });

  for (const button of document.querySelectorAll('[data-scenario]')) button.addEventListener('click', () => {
    currentScenario = button.dataset.scenario;
    selectedId = currentScenario === 'travel' ? 'travel-r03' : null;
    purchases = [];
    completed = false;
    for (const sibling of document.querySelectorAll('[data-scenario]')) sibling.setAttribute('aria-pressed', String(sibling === button));
    renderStage();
    status('Tap a cost footer to preview selection. These are isolated design examples.');
  });
  for (const button of document.querySelectorAll('[data-viewport]')) button.addEventListener('click', () => {
    $('#review-viewport').className = `review-viewport ${button.dataset.viewport}`;
    for (const sibling of document.querySelectorAll('[data-viewport]')) sibling.setAttribute('aria-pressed', String(sibling === button));
  });
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.querySelector('.close-button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  }
  const params = new URLSearchParams(location.search);
  // Keep section navigation within the current document even when the local
  // server canonicalizes the directory URL without its trailing slash.
  for (const anchor of document.querySelectorAll('a[href^="#"]')) {
    anchor.href = location.pathname + location.search + anchor.getAttribute('href');
  }
  if (params.get('screen') === 'phone' || params.get('screen') === 'desktop') {
    document.body.classList.add('screen-only');
    $('#review-viewport').className = `review-viewport ${params.get('screen')}`;
  }
  if (SCENARIOS[params.get('scenario')]) {
    currentScenario = params.get('scenario');
    selectedId = currentScenario === 'travel' ? 'travel-r03' : null;
    for (const button of document.querySelectorAll('[data-scenario]')) button.setAttribute('aria-pressed', String(button.dataset.scenario === currentScenario));
  }
  renderStage();
  document.documentElement.dataset.studyReady = 'true';
}

if (typeof document !== 'undefined') mountStudy();
