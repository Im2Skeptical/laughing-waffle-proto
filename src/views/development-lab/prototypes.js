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
    description: 'Try Structure cards and Practice-style tooltips on a Pixi game-screen reference, including the construction strip and build offers.',
    details: '3 Pixi treatments · mobile landscape fullscreen · screen PNG export',
  },
  {
    title: 'Practice inspector', folder: 'keyword-inspection-prototype', label: 'Inspector',
    description: 'Study an enlarged Practice with readable rules, a simple right-hand symbol key and clickable definitions.',
    details: 'Full Pixi inspector · symbol / name rows · recursive links / Back / Close',
  },
];

export function renderPrototypes(host) {
  const intro = el('div', '', 'lab-page-head lab-prototype-intro'), text = el('div');
  text.append(el('h2', 'Prototype workbenches'), el('p', 'Visual design studies. Edits stay in each workbench.', 'lab-subtitle'));
  intro.append(text); host.append(intro);
  const grid = el('div', '', 'lab-prototype-grid');
  for (const [index, workbench] of WORKBENCHES.entries()) {
    const card = el('article', '', 'lab-panel lab-prototype-card');
    const chips = el('div', '', 'lab-chips');
    for (const detail of workbench.details.split(' · ')) chips.append(el('span', detail, 'lab-badge'));
    card.append(el('span', `0${index + 1} · ${workbench.label}`, 'lab-eyebrow'),
      el('h3', workbench.title), el('p', workbench.description, 'lab-clamp'), chips);
    const link = el('a', `Open ${workbench.label} workbench →`, 'lab-prototype-open lab-primary');
    link.href = new URL(`images/dark-fantasy/${workbench.folder}/`, document.baseURI).href;
    card.append(link); grid.append(card);
  }
  host.append(grid);
}
