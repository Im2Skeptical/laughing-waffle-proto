import { el } from './elements.js';

const WORKBENCHES = [
  {
    title: 'Illustrated cards', folder: 'card-chrome-prototype', label: 'Cards',
    description: 'Compare Scheduled and Charge cards, worker sockets, Stock counters and output layouts.',
    details: 'Editable values · size comparisons · transparent PNG export',
  },
  {
    title: 'Gamepiece tooltips', folder: 'tooltip-prototype', label: 'Tooltips',
    description: 'Try local card zoom and full inspection, with rules, icon reminders and nested keyword explanations.',
    details: 'Shop and settlement · tier previews · phone layouts',
  },
  {
    title: 'Vassals & founders', folder: 'vassal-chrome-prototype', label: 'Vassals',
    description: 'Browse the founder carousel, compare candidate text and assemble Warrior and Scholar portrait frames.',
    details: '4 / 6 / 8 founders · class frames · PNG export',
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
