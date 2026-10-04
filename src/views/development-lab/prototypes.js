import { el } from './elements.js';

const WORKBENCHES = [
  {
    title: 'Illustrated cards', folder: 'card-chrome-prototype', label: 'Cards',
    description: 'Compare proposed cards with the current game and preview them in the regional settlement and Practice shop.',
    details: 'Source / prototype graphics · landscape fullscreen · PNG export',
  },
  {
    title: 'Vassals & founders', folder: 'vassal-chrome-prototype', label: 'Vassals',
    description: 'Browse the founder carousel, compare candidate text and assemble Warrior and Scholar portrait frames.',
    details: '4 / 6 / 8 founders · class frames · PNG export',
  },
  {
    title: 'Structures & tooltips', folder: 'structure-chrome-prototype', label: 'Structures',
    description: 'Explore Housing and Stock capacity faces in the construction strip and Structure offers, with Practice-style quick reads and inspection.',
    details: '3 card treatments · passive rules · symbol glossary',
  },
];

export function renderPrototypes(host) {
  const intro = el('section', '', 'lab-prototype-intro');
  intro.append(el('small', 'DESIGN STUDIES'), el('h2', 'Prototype workbenches'),
    el('p', 'Explore proposed visual treatments with editable examples. Changes stay in the workbench; player saves and live gameplay are untouched.'));
  host.append(intro);
  const grid = el('div', '', 'lab-prototype-grid');
  for (const [index, workbench] of WORKBENCHES.entries()) {
    const card = el('article', '', 'lab-panel lab-prototype-card');
    card.append(el('small', `0${index + 1} · ${workbench.label.toUpperCase()}`),
      el('h3', workbench.title), el('p', workbench.description),
      el('p', workbench.details, 'lab-prototype-details'));
    const link = el('a', `Open ${workbench.label} workbench →`, 'lab-prototype-open');
    link.href = new URL(`images/dark-fantasy/${workbench.folder}/`, document.baseURI).href;
    card.append(link); grid.append(card);
  }
  host.append(grid);
}
