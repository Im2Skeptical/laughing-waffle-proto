import { el } from './elements.js';

const WORKBENCHES = [
  {
    title: 'Regional map generation', folder: 'map-generation-prototype', label: 'Map',
    description: 'Explore twenty generated regions and compare pixel landscapes with an engraved dark-fantasy atlas, parchment colours and slate water.',
    details: '3 geography views · 3 pixel styles · landscape fullscreen · PNG export',
  },
  {
    title: 'Protovassal opening', folder: 'life-map-opening-prototype', label: 'Opening',
    description: 'Edit and play an authored Warrior opening, compare branches and inspect their real simulation outcomes.',
    details: 'Editable encounters · rewind / restart · saved experiments',
  },
  {
    title: 'Vassals & founders', folder: 'vassal-chrome-prototype', label: 'Vassals',
    description: 'Browse the founder carousel, compare candidate text and assemble Warrior and Scholar portrait frames.',
    details: '4 / 6 / 8 founders · class frames · PNG export',
  },
];

export function renderPrototypes(host) {
  const intro = el('div', '', 'lab-page-head lab-prototype-intro'), text = el('div');
  text.append(el('h2', 'Prototype workbenches'), el('p', 'Gameplay experiments and visual studies. Edits stay in each workbench.', 'lab-subtitle'));
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
