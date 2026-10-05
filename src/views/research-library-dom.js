import { detailedSettlementPracticeDefs, settlementStructureDefs, VASSAL_INTERVENTION_PRACTICE_IDS } from '../defs/gamepieces/detailed-settlement-defs.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../model/game-config.js';
import { getResearchProgression } from '../model/research-progression.js';
import { getPracticeReading } from '../model/practice-reading.js';
import { getStructureReading } from '../model/structure-reading.js';

const title = value => value[0].toUpperCase() + value.slice(1);
const percent = value => `${Number((value * 100).toFixed(1))}%`;
const number = value => Number(value.toFixed(1)).toLocaleString();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(text, action, className) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function painting(card) {
  const image = el('img', 'research-card-art');
  image.src = new URL(`images/dark-fantasy/settlement-pieces-v4/${card.id}.webp`, document.baseURI).href;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  return image;
}

function catalog(state) {
  return [
    ...VASSAL_INTERVENTION_PRACTICE_IDS.map(id => ({ id, kind: 'practice', def: getDetailedPracticeDef(state, id) ?? detailedSettlementPracticeDefs[id] })),
    ...Object.keys(settlementStructureDefs).map(id => ({ id, kind: 'structure', def: getDetailedStructureDef(state, id) })),
  ].filter(card => card.def).map(card => {
    const { def } = card;
    const reading = card.kind === 'practice' ? getPracticeReading(def) : getStructureReading(def);
    const traits = [...new Set([...(def.tags ?? []), ...(def.stockTraits ?? []), ...['consume', 'require'].flatMap(kind => (def[kind] ?? []).flatMap(input => input.traits))])];
    return { ...card, reading, traits, tier: def.minimumQuality ?? 'bronze',
      search: [def.label, def.pool, card.kind, reading.type, ...traits, ...reading.requirements, ...reading.effects.map(effect => effect.text), reading.trigger ?? ''].join(' ').toLowerCase() };
  }).sort((a, b) => a.def.label.localeCompare(b.def.label));
}

// Native scrolling and keyboard controls are local presentation state only.
export function createResearchLibraryDom({ getState, onOpen, onClose, parent = document.body }) {
  const panel = el('section', 'research-library');
  panel.dataset.testid = 'research-library';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'research-library-title');
  panel.tabIndex = -1;
  panel.hidden = true;
  parent.append(panel);
  let state, progression, cards = [], focusBefore = null, selectedButton = null;
  let sections, results, detail, closeControl, resetControl;
  const controls = {};

  const closeDetail = () => {
    detail.hidden = true;
    detail.replaceChildren();
    panel.firstElementChild.inert = false;
    selectedButton?.focus();
  };
  const close = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    panel.replaceChildren();
    document.body.classList.remove('research-library-open');
    onClose?.();
    focusBefore?.focus?.();
  };

  function inspect(card, source) {
    selectedButton = source;
    const { def, reading } = card;
    const tier = progression.tiers.find(t => t.id === card.tier);
    detail.replaceChildren();
    const sheet = el('article', 'research-detail-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', def.label);
    sheet.style.setProperty('--tier-colour', `var(--${card.tier})`);
    const back = button('← Back to library', closeDetail, 'research-back');
    const visual = el('div', 'research-detail-visual');
    visual.append(painting(card));
    const copy = el('div', 'research-detail-copy');
    copy.append(el('p', 'research-eyebrow', `${title(card.tier)} · ${title(def.pool)} · ${title(card.kind)}`), el('h2', '', def.label));
    copy.append(el('p', 'research-detail-availability', tier.unlocked ? 'Unlocked by Research' : `Unlocks at ${number(tier.threshold)} Research · ${number(Math.max(0, tier.threshold - progression.research))} to go`));
    const costs = [`${def.vassalPrestigeCost ?? 0} Prestige`, `${def.vassalPhaseCost ?? 0} phases`];
    if (card.kind === 'structure') costs.push(`${def.footprint ?? 1} construction ${(def.footprint ?? 1) === 1 ? 'cell' : 'cells'}`, ...(def.localCurrencyCost ? [`${def.localCurrencyCost} Currency`] : []));
    copy.append(el('p', 'research-detail-cost', costs.join(' · ')));
    if (def.stockTraits?.length) copy.append(el('p', 'research-detail-traits', `Stock traits: ${def.stockTraits.join(' · ')}`));
    if (def.tags?.length) copy.append(el('p', 'research-detail-traits', `Tags: ${def.tags.join(' · ')}`));
    copy.append(el('h3', '', card.kind === 'structure' ? 'While active' : reading.type === 'Charge' ? 'Charge & discharge' : 'Scheduled effects'));
    if (reading.trigger) copy.append(el('p', '', reading.trigger));
    const effects = el('ul');
    for (const effect of reading.effects) effects.append(el('li', '', `${effect.timing ? `${effect.timing}: ` : ''}${effect.text}`));
    copy.append(effects);
    if (reading.requirements.length) {
      copy.append(el('h3', '', 'Requirements'));
      const requirements = el('ul');
      for (const line of reading.requirements) requirements.append(el('li', '', line));
      copy.append(requirements);
    }
    if (card.kind === 'practice') copy.append(el('p', 'research-footnote', 'Effects shown at base values. Workers, quality and local modifiers affect the result in play.'));
    sheet.append(back, visual, copy);
    detail.append(sheet);
    panel.firstElementChild.inert = true;
    detail.hidden = false;
    back.focus();
  }

  function filter(label, id, options) {
    const wrapper = el('label', 'research-filter');
    wrapper.append(el('span', '', label));
    const select = el('select');
    select.dataset.testid = `research-filter-${id}`;
    for (const [value, text] of options) {
      const option = el('option', '', text);
      option.value = value;
      select.append(option);
    }
    select.addEventListener('change', renderCards);
    controls[id] = select;
    wrapper.append(select);
    return wrapper;
  }

  function matches(card) {
    const c = controls;
    const unlocked = progression.tiers.find(t => t.id === card.tier).unlocked;
    return (!c.search.value.trim() || c.search.value.toLowerCase().trim().split(/\s+/).every(term => card.search.includes(term)))
      && (!c.pool.value || card.def.pool === c.pool.value)
      && (!c.kind.value || card.kind === c.kind.value || (card.kind === 'practice' && card.reading.type.toLowerCase() === c.kind.value))
      && (!c.availability.value || (c.availability.value === 'unlocked' ? unlocked : !unlocked))
      && (!c.trait.value || card.traits.includes(c.trait.value));
  }

  function renderCards() {
    sections.replaceChildren();
    const visible = cards.filter(matches);
    results.textContent = `${visible.length} of ${cards.length} cards`;
    const filtered = Object.values(controls).some(control => control.value.trim());
    resetControl.disabled = !filtered;
    for (const tier of progression.tiers) {
      const group = visible.filter(card => card.tier === tier.id);
      const total = cards.filter(card => card.tier === tier.id).length;
      const section = el('section', `research-tier-section${tier.unlocked ? '' : ' is-locked'}`);
      section.id = `research-tier-${tier.id}`;
      section.dataset.tier = tier.id;
      section.style.setProperty('--tier-colour', `var(--${tier.id})`);
      const heading = el('header', 'research-tier-heading');
      const name = el('div');
      name.append(el('p', 'research-eyebrow', `Tier ${tier.index + 1} · ${tier.unlocked ? 'Unlocked' : 'Locked'}`), el('h2', '', title(tier.id)));
      const available = el('div', 'research-tier-unlock');
      available.append(el('strong', '', tier.threshold ? `${number(tier.threshold)} Research` : 'Available from the start'), el('span', '', `${group.length} / ${total} cards · ${tier.unlocked ? 'Research requirement met' : `${number(Math.max(0, tier.threshold - progression.research))} Research to go`}`));
      const odds = el('div', 'research-tier-chance');
      odds.append(el('strong', '', percent(tier.chance)), el('span', '', 'Practice quality chance'));
      heading.append(name, available, odds);
      section.append(heading);
      if (!group.length) section.append(el('p', 'research-empty', 'No cards in this tier match your filters.'));
      const grid = el('div', 'research-card-grid');
      for (const card of group) {
        const { def, reading } = card;
        const tile = button('', () => inspect(card, tile), 'research-card');
        tile.dataset.cardId = card.id;
        tile.dataset.kind = card.kind;
        tile.setAttribute('aria-label', `Inspect ${def.label}, ${title(card.tier)} ${title(card.kind)}${tier.unlocked ? '' : ', locked'}`);
        const art = el('div', 'research-card-image');
        art.append(painting(card), el('span', 'research-card-pool', title(def.pool)));
        const body = el('div', 'research-card-body');
        body.append(el('span', 'research-card-type', card.kind === 'practice' ? `${reading.type} Practice` : 'Structure'), el('h3', '', def.label));
        const lines = reading.effects.map(effect => effect.text);
        body.append(el('p', 'research-card-rule', lines.join(' · ') || reading.trigger || def.ui?.rule || ''));
        const traits = def.stockTraits?.length ? `Stock · ${def.stockTraits.join(' / ')}` : (def.tags ?? []).slice(0, 3).join(' · ');
        if (traits) body.append(el('p', 'research-card-traits', traits));
        const footer = el('div', 'research-card-footer');
        footer.append(el('span', '', `${def.vassalPrestigeCost ?? 0} Prestige`), el('span', '', tier.unlocked ? 'Inspect ↗' : 'Locked ◇'));
        tile.append(art, body, footer);
        grid.append(tile);
      }
      section.append(grid);
      sections.append(section);
    }
  }

  function open() {
    if (!panel.hidden) return;
    state = getState?.();
    if (!state) return;
    focusBefore = document.activeElement;
    progression = getResearchProgression(state);
    cards = catalog(state);
    onOpen?.();
    panel.replaceChildren();
    const shell = el('div', 'research-shell');
    const top = el('header', 'research-top');
    const intro = el('div');
    intro.append(el('p', 'research-eyebrow', 'Civilization progression'));
    const heading = el('h1', '', 'Card Library');
    heading.id = 'research-library-title';
    intro.append(heading, el('p', 'research-subtitle', 'Build knowledge. Open new possibilities.'));
    const score = el('div', 'research-score');
    score.append(el('span', 'research-score-icon', '✧'), el('div'));
    score.lastChild.append(el('span', 'research-eyebrow', 'Current Research'), el('strong', '', number(progression.research)));
    closeControl = button('Return to game ×', close, 'research-close');
    closeControl.dataset.testid = 'research-close';
    top.append(intro, score, closeControl);
    const next = progression.nextMilestone;
    const journey = el('div', 'research-journey');
    journey.append(el('span', '', next ? `Next milestone · ${next.label}` : 'All tiers unlocked'), el('strong', '', next ? `${number(Math.max(0, next.research - progression.research))} Research to go` : 'Your full card pool awaits'));
    const track = el('div', 'research-progress-track');
    const fill = el('div');
    fill.style.width = `${next ? Math.min(100, progression.research / Math.max(1, next.research) * 100) : 100}%`;
    track.append(fill);
    journey.append(track);
    const tiers = el('nav', 'research-tier-rail');
    tiers.setAttribute('aria-label', 'Card tiers and quality chances');
    for (const tier of progression.tiers) {
      const tile = button('', () => panel.querySelector(`#research-tier-${tier.id}`).scrollIntoView({ block: 'start' }), `research-tier-stat${tier.unlocked ? '' : ' is-locked'}`);
      tile.style.setProperty('--tier-colour', `var(--${tier.id})`);
      tile.dataset.tier = tier.id;
      tile.append(el('span', 'research-eyebrow', `Tier ${tier.index + 1} · ${tier.unlocked ? 'Unlocked' : 'Locked'}`), el('h2', '', title(tier.id)), el('strong', 'research-odds', percent(tier.chance)), el('span', 'research-odds-label', 'Practice quality chance'), el('span', 'research-tier-threshold', tier.threshold ? `${number(tier.threshold)} Research` : 'Starting tier'));
      tiers.append(tile);
    }
    const explanation = el('details', 'research-odds-help');
    explanation.append(el('summary', '', 'How Research shapes your cards'));
    explanation.append(el('p', '', 'Cards below are grouped by their minimum unlock tier. The percentages show the quality rolled for a newly learned Practice at your current Research, before Scholar Ingenuity. Unlocked card definitions are drawn equally within the eligible shop pool; their unlock tier does not set their rolled quality. Structures retain their printed tier.'));
    explanation.append(el('p', '', 'Shop rooms and your Vassal’s class restrict the pool. Ingenuity can raise quality; installed Practices upgrade one tier; Discovery can temporarily open the next unlock tier. Browsing and filters do not change your chances.'));
    const toolbar = el('div', 'research-toolbar');
    const searchLabel = el('label', 'research-filter research-search');
    searchLabel.append(el('span', '', 'Search the library'));
    const search = el('input');
    search.type = 'search';
    search.placeholder = 'Name, effect or resource…';
    search.dataset.testid = 'research-search';
    search.addEventListener('input', renderCards);
    controls.search = search;
    searchLabel.append(search);
    const traits = [...new Set(cards.flatMap(card => card.traits))].sort();
    toolbar.append(searchLabel,
      filter('Class', 'pool', [['', 'All classes'], ['common', 'Common'], ['scholar', 'Scholar'], ['warrior', 'Warrior']]),
      filter('Card type', 'kind', [['', 'All cards'], ['practice', 'Practices'], ['structure', 'Structures'], ['cycle', 'Cycle Practices'], ['charge', 'Charge Practices']]),
      filter('Research access', 'availability', [['', 'All tiers'], ['unlocked', 'Unlocked'], ['locked', 'Locked']]),
      filter('Trait', 'trait', [['', 'All traits'], ...traits.map(trait => [trait, trait])]));
    const resultBar = el('div', 'research-result-bar');
    results = el('p');
    results.setAttribute('role', 'status');
    resetControl = button('Clear filters', () => {
      for (const control of Object.values(controls)) control.value = '';
      renderCards();
      controls.search.focus();
    }, 'research-reset');
    resultBar.append(results, el('span', 'research-footnote', 'Select a card to read its effects and requirements.'), resetControl);
    sections = el('main', 'research-sections');
    detail = el('div', 'research-detail');
    detail.hidden = true;
    shell.append(top, journey, tiers, explanation, toolbar, resultBar, sections);
    panel.append(shell, detail);
    renderCards();
    panel.hidden = false;
    panel.scrollTop = 0;
    document.body.classList.add('research-library-open');
    closeControl.focus();
  }

  document.addEventListener('keydown', event => {
    if (panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      detail.hidden ? close() : closeDetail();
    }
    if (event.key === 'Tab') {
      const surface = detail.hidden ? panel : detail;
      const focusables = [...surface.querySelectorAll('button:not(:disabled), input, select, summary')].filter(node => node.getClientRects().length);
      const first = focusables[0], last = focusables.at(-1);
      if (!surface.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    event.stopPropagation();
  }, true);
  return { open, close, isOpen: () => !panel.hidden };
}
