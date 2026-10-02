// THROWAWAY: three selection layouts on the existing app route, via ?variant=A|B|C.
// Question: how much stage should a founder take, and how does a successor stay in civilization context?
// All data below is illustrative. UI actions only change this module's memory; no runner, storage or RNG.
import { VASSAL_FOUNDING_OPTIONS, VASSAL_SIGNATURE_NODE_VARIANTS } from '../defs/gamepieces/vassal-life-map-defs.js';
import { classMark, portraitArt, civilizationMap } from './vassal-selection-prototype-art.js';
import { prototypeStyle } from './vassal-selection-prototype-style.js';

const VARIANTS = ['A', 'B', 'C'];
const TITLES = { A: 'Ceremonial stage', B: 'Council & civilization', C: 'Expanding map drawer' };
const CLASSES = {
  warrior: { label: 'Warrior', founder: 'Warlord', promise: 'Protect. Gather strength. Expand.',
    meaning: 'Train Warriors for local Support. Grow a Retinue through Prestige, and lead campaigns into neighbouring settlements.',
    founderEffect: 'Train up to 10 existing adults as Warriors over 6 phases. No conquest is required.',
    caveat: 'Warriors still need food. A class choice alone does not stop Monsters; supplied defense matters.',
    play: 'A direct path to strength: training, Support, Retinue and campaigns.' },
  scholar: { label: 'Scholar', founder: 'Philosopher', promise: 'Learn. Improve. Discover.',
    meaning: 'Train Scholars, improve Practices and Structures through Ingenuity, and use Discovery to reach more advanced purchases.',
    founderEffect: 'Train up to 2 existing adults as Scholars over 6 phases. Found a Lyceum if 2 construction cells are free.',
    caveat: 'Scholar staffing and Ingenuity help your economy, but do not directly defend a settlement.',
    play: 'A path through staffing, institutions, quality improvements and Discovery.' },
  common: { label: 'Unclassed', promise: 'Build. Travel. Adapt.',
    meaning: 'A flexible successor with shared Life Map opportunities: reform Practices, build Structures, travel and handle crises.',
    caveat: 'Does not introduce a new specialist class.', play: 'Shared opportunities, without specialist class actions.' },
};
const ESCAPE = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
const escape = value => String(value).replace(/[&<>"']/g, char => ESCAPE[char]);
const button = (label, action, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;

export function mountVassalSelectionPrototype() {
  const params = new URLSearchParams(location.search);
  const state = {
    variant: VARIANTS.includes(params.get('variant')) ? params.get('variant') : 'A',
    moment: params.get('moment') === 'successor' ? 'successor' : 'founder',
    guided: params.get('guided') !== 'false', lineage: params.get('lineage') === 'scholar' ? 'scholar' : 'warrior',
    scenario: params.get('scenario') === 'food' ? 'food' : 'threat', selected: 0, region: 'capital',
    expanded: params.get('moment') !== 'successor', details: false, overlay: null, confirmed: null,
    art: { identity:0, kit:0, palette:0, age:'young', founder:true, plain:false, labels:true },
  };
  document.body.classList.remove('game-menu-open');
  const root = document.createElement('main');
  root.id = 'vassal-selection-prototype';
  document.getElementById('app').replaceChildren(root);
  const style = document.createElement('style');
  style.textContent = prototypeStyle;
  document.head.append(style);
  document.title = 'Vassal selection · design prototype';

  const candidates = () => state.moment === 'founder'
    ? [
      { id:0, classId:'warrior', name:'The Warlord', identity:0, location:'Hearth', age:19, prestige:22, stat:2, signature:'monsterHunt' },
      { id:1, classId:'scholar', name:'The Philosopher', identity:1, location:'Hearth', age:18, prestige:21, stat:2, signature:'legacyPlus' },
    ]
    : [
      { id:0, classId:state.lineage, name:'Aren', identity:2, location:'Hearth', age:20, prestige:24, stat:2, signature:'monsterHunt' },
      { id:1, classId:'common', name:'Mira', identity:1, location:'Riverwatch', age:18, prestige:22, stat:1, signature:'settlement' },
      { id:2, classId:state.lineage, name:'Tovan', identity:3, location:'Riverwatch', age:22, prestige:19, stat:1, signature:'legacyPlus' },
    ];
  const current = () => candidates()[state.selected] ?? candidates()[0];
  const locked = candidate => state.moment === 'founder' && state.guided && candidate.classId === 'scholar';
  const art = candidate => portraitArt({ classId:candidate.classId, identity:candidate.identity, founder:state.moment === 'founder' });
  const signature = candidate => VASSAL_SIGNATURE_NODE_VARIANTS[candidate.signature] ?? VASSAL_SIGNATURE_NODE_VARIANTS.settlement;
  const classLabel = candidate => state.moment === 'founder' ? `${CLASSES[candidate.classId].founder} → ${CLASSES[candidate.classId].label}s` : CLASSES[candidate.classId].label;
  const need = () => state.scenario === 'threat'
    ? 'Monsters border Riverwatch. Training Warriors can add Support, but defense still needs a supplied response Practice.'
    : 'Hearth needs 3 Food for its next meal and holds 2. Neither founder grants Food immediately; inspect your production first.';
  const foundingOption = candidate => VASSAL_FOUNDING_OPTIONS[candidate.classId === 'warrior' ? 'warlordFounding' : 'philosopherFounding'];

  function syncUrl() {
    const url = new URL(location.href);
    for (const key of ['variant','moment','lineage','scenario']) url.searchParams.set(key, state[key]);
    url.searchParams.set('guided', String(state.guided));
    history.replaceState(null, '', url);
  }

  function resources() {
    return `<section class="vp-resources" aria-label="Illustrative civilization summary">
      <span class="vp-kicker">Civilization · paused</span>
      <span class="vp-resource"><b>2</b> settlements</span>
      <span class="vp-resource"><b>150</b> people</span>
      <span class="vp-resource ${state.scenario === 'food' ? 'vp-warning' : ''}"><b>${state.scenario === 'food' ? '2 / 3' : '7'}</b> ${state.scenario === 'food' ? 'Hearth Food / next meal' : 'Food Stock'}</span>
      <span class="vp-resource"><b>12</b> Currency</span>
      <span class="vp-resource vp-warning"><b>1</b> border threat</span>
      <span class="vp-kicker">Example data</span>
    </section>`;
  }

  function introduction() {
    return `<header class="vp-intro"><span class="vp-kicker">${state.moment === 'founder' ? 'The first life · a founding moment' : 'The next life · continue your lineage'}</span>
      <h1>${state.moment === 'founder' ? 'Give your civilization its first tradition.' : 'Who will carry your civilization forward?'}</h1>
      <p>${state.moment === 'founder' ? 'Your founder establishes a specialist class. Their successors inherit the tradition you begin.' : `Your ${CLASSES[state.lineage].label} tradition is established. Compare people, starting settlements and signature opportunities.`}</p></header>`;
  }

  function cards() {
    return `<div class="vp-cards ${state.moment === 'successor' ? 'vp-successors' : ''}">${candidates().map(candidate => {
      const info = CLASSES[candidate.classId];
      return `<article class="vp-card vp-panel vp-${candidate.classId} ${state.selected === candidate.id ? 'vp-selected' : ''} ${locked(candidate) ? 'vp-locked' : ''}">
        <div class="vp-card-top"><span class="vp-class">${classMark(candidate.classId)} ${classLabel(candidate)}</span>
          <span class="vp-tag ${locked(candidate) ? 'vp-lock' : ''}">${locked(candidate) ? '⌑ Preview · locked' : state.moment === 'founder' && state.guided ? 'Start here' : `Age ${candidate.age}`}</span></div>
        <div class="vp-card-body">${art(candidate)}<div><h2>${candidate.name}</h2><h3>${info.promise}</h3><p>${state.moment === 'founder' ? info.meaning : `${candidate.location} · ${candidate.prestige} Prestige. ${info.play}`}</p></div></div>
        <p class="vp-impact">${state.moment === 'founder' ? info.founderEffect : `Signature: ${signature(candidate).label}`}</p>
        ${button(locked(candidate) ? 'Explore the Scholar path' : state.selected === candidate.id ? 'Selected · read the details' : `Inspect ${candidate.name}`, `select:${candidate.id}`, `class="vp-inspect" aria-pressed="${state.selected === candidate.id}"`)}
      </article>`;
    }).join('')}</div>`;
  }

  function rows() {
    return `<div class="vp-rows" aria-label="Vassal candidates">${candidates().map(candidate => button(
      `${art(candidate)}<span class="vp-row-info"><strong>${candidate.name}</strong><small>${classLabel(candidate)} · ${candidate.location}</small></span>${locked(candidate) ? '<span class="vp-tag vp-lock">Locked</span>' : classMark(candidate.classId)}`,
      `select:${candidate.id}`, `class="vp-row" aria-pressed="${state.selected === candidate.id}" aria-label="Inspect ${candidate.name}${locked(candidate) ? ', locked preview' : ''}"`
    )).join('')}</div>`;
  }

  function confirmation(candidate) {
    return `<div class="vp-confirm"><small>${locked(candidate) ? 'Guided-first-run proposal: explore this class now; choose it on a later run.' : state.moment === 'founder' ? 'Selection leads to a compulsory founding node. Training completes after 6 phases.' : 'You are choosing one person. Review their starting settlement and signature before continuing.'}</small>
      ${button(locked(candidate) ? 'Available on a later run' : state.moment === 'founder' ? `Begin with the ${CLASSES[candidate.classId].founder}` : `Choose ${candidate.name}`, 'confirm', `class="vp-primary" ${locked(candidate) ? 'disabled' : ''}`)}</div>`;
  }

  function detail(candidate = current(), withHero = false) {
    const info = CLASSES[candidate.classId];
    return `<section class="vp-detail vp-${candidate.classId}" aria-label="Selected vassal details">
      ${withHero ? `<div class="vp-dossier-hero">${art(candidate)}<div><span class="vp-class">${classMark(candidate.classId)} ${classLabel(candidate)}</span><h2>${candidate.name}</h2><p>${info.promise}</p><div class="vp-stats"><span>${candidate.location}</span><span>Age <b>${candidate.age}</b></span><span>Prestige <b>${candidate.prestige}</b></span></div></div></div>` : `<span class="vp-class">${classMark(candidate.classId)} ${candidate.name} · ${locked(candidate) ? 'Preview only' : 'Selected'}</span>`}
      <div class="vp-detail-grid"><div><h3>${state.moment === 'founder' ? 'Your first action' : 'What this person offers'}</h3><p>${state.moment === 'founder' ? info.founderEffect : `${info.meaning} Signature: ${signature(candidate).label}. ${signature(candidate).description}`}</p></div>
        <div><h3>What to consider</h3><p>${info.caveat} ${state.moment === 'founder' && candidate.classId === 'scholar' ? 'Hearth has 3 free construction cells in this example.' : ''}</p></div></div>
      <p class="vp-effect">${need()}</p>
      ${state.moment === 'successor' ? `<div class="vp-stats"><span>${candidate.classId === 'scholar' ? 'Ingenuity' : candidate.classId === 'warrior' ? 'Prowess' : 'Cunning'} <b>${candidate.stat}</b></span><span>Wisdom <b>1</b></span><span>Effectiveness <b>2</b></span><span>Prestige <b>${candidate.prestige}</b></span></div>` : ''}
      ${confirmation(candidate)}</section>`;
  }

  function civilization() {
    const capital = state.region === 'capital';
    return `<aside class="vp-civilization vp-panel" aria-label="Civilization context"><span class="vp-kicker">Keep the world in view</span><h2>Your civilization</h2>
      ${civilizationMap(state.region, true)}
      <div class="vp-region-buttons">${button('Hearth · capital', 'region:capital', `aria-pressed="${capital}"`)}${button('Riverwatch', 'region:river', `aria-pressed="${!capital}"`)}</div>
      <div class="vp-region-summary"><p><b>${capital ? '90' : '60'}</b>people</p><p><b>${capital ? state.scenario === 'food' ? '2' : '4' : '3'}</b>Food Stock</p><p><b>${capital ? '3' : '2'}</b>free build cells</p></div>
      <p class="vp-need">${capital ? state.scenario === 'food' ? 'A short meal: 2 Food held, 3 needed. Improve supply before committing time.' : 'Your capital has room for a Lyceum. All 5 Practice slots are occupied.' : 'Monsters on the border. Local Support is 0; inspect defense and supply.'}</p>
    </aside>`;
  }

  function VariantA() {
    return `${introduction()}${cards()}<div class="vp-inline-actions">${button('Inspect civilization', 'context')}${button(state.details ? 'Hide decision details' : 'Compare consequences', 'details')}</div>
      ${state.details ? `<div class="vp-ceremony-detail vp-panel">${detail()}</div>` : `<div class="vp-ceremony-detail vp-panel vp-detail">${confirmation(current())}</div>`}`;
  }

  function VariantB() {
    return `${introduction()}<div class="vp-split">${civilization()}<section class="vp-dossier vp-panel"><div class="vp-dossier-head"><span class="vp-kicker">${state.moment === 'founder' ? 'Founding council' : 'Candidates'}</span><span class="vp-tag">${locked(current()) ? 'Preview only' : 'Compare, then choose'}</span></div>${detail(current(), true)}${rows()}</section></div>`;
  }

  function VariantC() {
    return `<div class="vp-drawer-world">${civilizationMap(state.region, true)}${civilization()}</div>
      <section class="vp-drawer vp-panel ${state.expanded ? 'vp-expanded' : ''}"><div class="vp-drawer-title"><div><span class="vp-kicker">${state.moment === 'founder' ? 'A founding moment' : 'The next life'}</span><h2>${state.moment === 'founder' ? 'Choose your founding tradition' : 'Choose your next vassal'}</h2></div>${button(state.expanded ? 'Collapse to map ↓' : 'Expand decision ↑', 'expand')}</div>
        <div class="vp-drawer-columns">${rows()}${state.expanded ? detail(current(), true) : ''}</div>
        ${!state.expanded ? '<p class="vp-muted" style="font-size:12px;margin-top:12px">Select a portrait to open class details and the explicit confirmation.</p>' : ''}</section>`;
  }

  function artStudy() {
    const options = (key, values) => `<label>${key === 'kit' ? 'Clothing' : key === 'identity' ? 'Identity' : key === 'palette' ? 'Fabric palette' : 'Age'}<select data-art="${key}">${values.map(([value,label]) => `<option value="${value}" ${String(state.art[key]) === String(value) ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
    return `<span class="vp-kicker">Character & frame study</span><h2>Same person. Different calling.</h2><p class="vp-muted" style="margin-top:8px">Recognise the class through silhouette, clothing, tools and frame shape. Face and age vary independently.</p>
      <div class="vp-art-controls">${options('identity', [[0,'Aren'],[1,'Mira'],[2,'Sela'],[3,'Tovan']])}${options('kit', [[0,'Set I'],[1,'Set II'],[2,'Set III']])}${options('palette', [[0,'Palette I'],[1,'Palette II'],[2,'Palette III']])}${options('age', [['young','Young'],['middle','Middle'],['elder','Elder']])}</div>
      <div class="vp-art-gallery">${['warrior','scholar','common'].map(classId => `<figure>${portraitArt({...state.art, classId})}<figcaption>${state.art.labels ? `${CLASSES[classId].label} · ${classId === 'warrior' ? 'shield / sword / armour' : classId === 'scholar' ? 'arch / book / quill' : 'plain frame / tunic'}` : 'Which class do you see?'}</figcaption></figure>`).join('')}</div>
      <div class="vp-inline-actions">${button(state.art.founder ? 'Founder frames' : 'Regular frames', 'art-founder', `aria-pressed="${state.art.founder}"`)}${button(state.art.labels ? 'Hide class labels' : 'Show class labels', 'art-labels')}${button(state.art.plain ? 'Restore class frames' : 'Compare clothing alone', 'art-plain')}</div>
      <p class="vp-muted" style="font-size:12px;margin-top:16px">4 identities × 3 clothing sets × 3 palettes × 3 ages = 108 combinations per class. This vector study is an art-direction reference; a painted layer system can use the same descriptors.</p>`;
  }

  function overlay() {
    if (!state.overlay) return '';
    let content;
    if (state.overlay === 'art') content = artStudy();
    else if (state.overlay === 'context') content = civilization();
    else {
      const candidate = state.confirmed;
      content = `<div class="vp-success">${art(candidate)}<span class="vp-kicker">Choice previewed</span><h2>${state.moment === 'founder' ? `A ${CLASSES[candidate.classId].label} tradition begins.` : `${candidate.name} takes up the mantle.`}</h2>
        <p>${state.moment === 'founder' ? `${foundingOption(candidate).description} This is your next node, not an immediate selection reward.` : `${candidate.name} starts in ${candidate.location}. Their signature opportunity is ${signature(candidate).label}.`}</p>
        ${state.moment === 'founder' ? button('Preview the successor selection', 'next', 'class="vp-primary"') : button('Choose again', 'close', 'class="vp-primary"')}
        <p style="font-size:11px">Prototype only · no game or save was changed.</p></div>`;
    }
    return `<div class="vp-overlay" role="dialog" aria-modal="true" aria-label="${state.overlay === 'art' ? 'Character and frame study' : state.overlay === 'context' ? 'Civilization context' : 'Selection preview'}"><div class="vp-overlay-panel vp-panel"><div class="vp-overlay-header"><span class="vp-kicker">Design prototype</span>${button('Close ×', 'close', 'aria-label="Close preview"')}</div>${content}</div></div>`;
  }

  function render(focusAction = null) {
    const snapshot = { variant:state.variant, moment:state.moment, onboarding:state.guided ? 'guided first run' : 'open founder choice', establishedClass:state.moment === 'successor' ? state.lineage : null, scenario:state.scenario, viewedSettlement:state.region, selectedCandidate:current().name, locked:locked(current()), expanded:state.expanded, details:state.details, overlay:state.overlay, art:state.art };
    root.innerHTML = `<header class="vp-header"><div><div class="vp-brand">CIVILIZATION SURVIVOR</div><span class="vp-kicker">Vassal selection · design study</span></div><div class="vp-header-tools">
      ${button('Founder', 'moment:founder', `aria-pressed="${state.moment === 'founder'}"`)}${button('Successor', 'moment:successor', `aria-pressed="${state.moment === 'successor'}"`)}
      ${state.moment === 'founder' ? button(state.guided ? 'Guided first run' : 'Open choice', 'guided', `aria-pressed="${state.guided}"`) : button(`${CLASSES[state.lineage].label} lineage`, 'lineage')}
      ${button(state.scenario === 'threat' ? 'Scenario: threat' : 'Scenario: food', 'scenario')}${button('Art & frames', 'art')}
      </div></header>${resources()}<div class="vp-scene"><div class="vp-map-backdrop" aria-hidden="true">${civilizationMap(state.region, state.scenario === 'threat')}</div>${({ A:VariantA, B:VariantB, C:VariantC })[state.variant]()}
      <div class="vp-state"><span>Illustrative state · ${escape(snapshot.selectedCandidate)} ${snapshot.locked ? '(locked preview)' : 'selected'} · ${state.scenario} scenario · ${state.moment}</span>
      ${state.moment === 'founder' && state.guided ? '<p>Guided onboarding proposal: Warlord first; Philosopher selectable on a later run. Cross-class access within a run is still undecided.</p>' : ''}
      <details><summary>Prototype state & assumptions</summary><pre>${escape(JSON.stringify(snapshot, null, 2))}</pre><p>All values are example data. Successors are Unclassed or the established class. Founder identity never recurs. No unlock progression is implemented.</p></details></div></div>
      <nav class="vp-switcher" aria-label="Prototype variant switcher">${button('←', 'previous', 'aria-label="Previous layout"')}<span class="vp-switch-label"><small>Layout ${state.variant} of A · B · C</small>${TITLES[state.variant]}</span>${button('→', 'next-variant', 'aria-label="Next layout"')}</nav>${overlay()}`;
    if (state.overlay) (Array.from(root.querySelectorAll('.vp-overlay [data-action]')).find(node => node.dataset.action === focusAction) ?? root.querySelector('.vp-overlay button'))?.focus({preventScroll:true});
    else if (focusAction) Array.from(root.querySelectorAll('[data-action]')).find(node => node.dataset.action === focusAction)?.focus({preventScroll:true});
  }

  function cycle(direction) {
    state.variant = VARIANTS[(VARIANTS.indexOf(state.variant) + direction + VARIANTS.length) % VARIANTS.length];
    syncUrl(); render(direction > 0 ? 'next-variant' : 'previous'); root.scrollTop = 0;
  }

  let returnFocus = null;
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action, [verb, arg] = action.split(':');
    if (verb === 'previous' || verb === 'next-variant') { cycle(verb === 'previous' ? -1 : 1); return; }
    if (verb === 'moment') { state.moment = arg; state.selected = 0; state.details = false; state.expanded = arg === 'founder'; }
    if (verb === 'select') { state.selected = Number(arg); state.details = true; state.expanded = true; }
    if (verb === 'guided') state.guided = !state.guided;
    if (verb === 'lineage') state.lineage = state.lineage === 'warrior' ? 'scholar' : 'warrior';
    if (verb === 'scenario') state.scenario = state.scenario === 'threat' ? 'food' : 'threat';
    if (verb === 'region') state.region = arg;
    if (verb === 'expand') state.expanded = !state.expanded;
    if (verb === 'details') state.details = !state.details;
    if (verb === 'art-founder') state.art.founder = !state.art.founder;
    if (verb === 'art-labels') state.art.labels = !state.art.labels;
    if (verb === 'art-plain') state.art.plain = !state.art.plain;
    if (verb === 'context' || verb === 'art') { state.overlay = verb; returnFocus = action; }
    if (verb === 'confirm' && !locked(current())) { state.confirmed = {...current()}; state.overlay = 'confirmed'; returnFocus = action; }
    if (verb === 'close') state.overlay = null;
    if (verb === 'next') { state.lineage = state.confirmed.classId; state.moment = 'successor'; state.selected = 0; state.overlay = null; state.details = false; state.expanded = false; }
    syncUrl(); render(verb === 'close' ? returnFocus : action);
  });
  root.addEventListener('change', event => {
    const key = event.target.dataset.art;
    if (!key) return;
    state.art[key] = key === 'age' ? event.target.value : Number(event.target.value);
    render(); root.querySelector(`[data-art="${key}"]`)?.focus();
  });
  document.addEventListener('keydown', event => {
    if (state.overlay) {
      if (event.key === 'Escape') { state.overlay = null; render(returnFocus); }
      if (event.key === 'Tab') {
        const nodes = Array.from(root.querySelectorAll('.vp-overlay button:not(:disabled), .vp-overlay select'));
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); cycle(event.key === 'ArrowRight' ? 1 : -1); }
  });
  syncUrl(); render();
}
