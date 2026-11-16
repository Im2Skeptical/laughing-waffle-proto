import { RELIC } from './chronicle-skin.js';
import { createClassPortraitArt } from './vassal-class-art.js';
import { addPaintedPanel } from './painted-frames.js';
import { addInteractionFeedback } from './interaction-feedback.js';
import { FOUNDER_CLASSES } from './protovassal-class-data.js';
import { PANEL } from './vassal-node-decision/constants.js';

// A first read of the leadership decision, before attributes and abilities.
export function createProtovassalIntroduction({ candidates, selected, onDetails }) {
  const root = new PIXI.Container();
  root.controls = {};
  root.candidateRoots = [];
  function text(parent, copy, x, y, size, options = {}) {
    const label = new PIXI.Text(copy, { fontFamily: 'Georgia', fontSize: size, fill: RELIC.bone, ...options });
    label.position.set(x, y); parent.addChild(label); return label;
  }
  const title = text(root, 'Who will lead your people?', PANEL.width / 2, 54, 64, { fontWeight: 'bold' });
  title.anchor.set(.5, 0);
  const slots = 4, width = 520, height = 520, gap = 28;
  const left = (PANEL.width - slots * width - (slots - 1) * gap) / 2;
  for (let index = 0; index < slots; index++) {
    const candidate = candidates[index], data = candidate && FOUNDER_CLASSES[candidate.founderClassId];
    const card = new PIXI.Container(); card.position.set(left + index * (width + gap), 148);
    card.hitArea = new PIXI.Rectangle(0, 0, width, height); card.eventMode = 'static';
    root.addChild(card);
    addPaintedPanel(card, 'panel', width, height, { tint: data?.frameTint ?? 0x85877d, fill: data?.deep ?? 0x242721 });
    const portrait = createClassPortraitArt(candidate?.founderClassId ?? 'mystery', { size: 200, founder: !!candidate });
    if (portrait) { portrait.position.set((width - 200) / 2, 42); portrait.alpha = candidate ? 1 : .65; card.addChild(portrait); }
    const centered = (copy, y, size, options = {}) => {
      const label = text(card, copy, width / 2, y, size, { align: 'center', ...options });
      label.anchor.set(.5, 0); return label;
    };
    if (!candidate) {
      centered('?', 74, 114, { fill: RELIC.ash });
      centered('LOCKED', 268, 36, { fill: RELIC.ash, fontWeight: 'bold', letterSpacing: 2 });
      card.cursor = 'default'; root.controls[`locked:${index}`] = card;
      continue;
    }
    centered(data.name, 268, 36, { fontWeight: 'bold', letterSpacing: 2 });
    centered(`UNLOCKS ${data.unlocks.toUpperCase()}`, 315, 20, { fill: data.accent, fontWeight: 'bold', letterSpacing: 3 });
    centered(data.playstyle, 354, 28, { wordWrap: true, wordWrapWidth: width - 80, lineHeight: 34 });
    centered('EXPLORE LEADER  ›', 462, 22, { fill: data.accent, fontWeight: 'bold', letterSpacing: 2 });
    // Arrow keys can highlight a portrait before Enter opens its details.
    if (candidate === selected) {
      const focus = new PIXI.Graphics().lineStyle(2, data.accent, .6).drawRoundedRect(18, 18, width - 36, height - 36, 6);
      card.addChild(focus);
    }
    addInteractionFeedback(card, { x: 0, y: 0, width, height }, { onActivate: () => onDetails(candidate) });
    card.portraitStage = 'youth';
    root.controls[`leader:${candidate.founderClassId}`] = card;
    root.candidateRoots[candidate.candidateIndex] = card;
  }
  return root;
}
