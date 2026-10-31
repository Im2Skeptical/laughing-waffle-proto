import { addKeywordPrototypeControls } from '../keywords-classes-prototype-controls.js';
import { el } from './elements.js';

const WORKBENCHES = [
  {
    title:'Chaos-god enemy set', label:'Enemy art', href:'#/dev/prototypes?study=full-map-content&look=chaos&samples=1',
    description:'Review the full enemy set with settled class colours, patron-shaped institutions and stronger composition/value hierarchy.',
    details:'88 paintings · frontier / province / capital · real card inspection',
  },
  {
    title:'Full-map content', label:'Cards', href:'#/dev/prototypes?study=full-map-content',
    description:'Review 20 player, 30 neutral and 80 decaying enemy institutions using the real Zoo card faces.',
    details:'130 dedicated paintings · full rules · keep / retier / cut · export notes',
  },
  {
    title:'Enemy palette and decay', label:'Art', href:'#/dev/prototypes?study=full-map-content&look=palettes&samples=1&merchant=g1&priest=y1',
    description:'Explore green Merchants and yellow Priests beside earlier schemes and Warrior/Scholar references.',
    details:'6 new pairs · 24 palette paintings · real faces · fixed compositions',
  },
  {
    title:'Patrons and forbidden engines', label:'Patrons', href:'#/dev/prototypes?study=full-map-content&look=patrons&samples=1',
    description:'Compare Merchant green accent trials against all four classes, with accepted yellow/pink Priests and eight proposed capital cards.',
    details:'3 accent pairs · 16 / 24 / 64px seals · real card inspection',
  },
  {
    title: 'Regional map generation', folder: 'map-generation-prototype', label: 'Map',
    description: 'Explore twenty generated regions in the approved base structure and the current engraved dark-fantasy atlas.',
    details: 'Base structure · Atlas rendering · landscape fullscreen · PNG export',
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
  addKeywordPrototypeControls(host);
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
    link.href = workbench.href ?? new URL(`images/dark-fantasy/${workbench.folder}/`, document.baseURI).href;
    card.append(link); grid.append(card);
  }
  host.append(grid);
}
