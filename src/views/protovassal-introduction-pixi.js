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
  const subtitle = text(root, 'Choose a leader to explore their playstyle.', PANEL.width / 2, 140, 30, { fill: RELIC.ash });
  subtitle.anchor.set(.5, 0);
  const width = 1000, height = 430, gap = 64;
  const left = (PANEL.width - candidates.length * width - (candidates.length - 1) * gap) / 2;
  candidates.forEach((candidate, index) => {
    const data = FOUNDER_CLASSES[candidate.founderClassId];
    const card = new PIXI.Container(); card.position.set(left + index * (width + gap), 210);
    card.hitArea = new PIXI.Rectangle(0, 0, width, height); card.eventMode = 'static';
    root.addChild(card);
    addPaintedPanel(card, 'panel', width, height, { tint: data.frameTint, fill: data.deep });
    const portrait = createClassPortraitArt(candidate.founderClassId, { size: 300, founder: true });
    if (portrait) { portrait.position.set(48, 58); card.addChild(portrait); }
    const x = 390, copyWidth = width - x - 52;
    text(card, data.name, x, 62, 44, { fontWeight: 'bold', letterSpacing: 2 });
    text(card, `UNLOCKS ${data.unlocks.toUpperCase()}`, x, 123, 22, { fill: data.accent, fontWeight: 'bold', letterSpacing: 3 });
    text(card, data.playstyle, x, 179, 32, { wordWrap: true, wordWrapWidth: copyWidth, lineHeight: 42 });
    text(card, 'EXPLORE LEADER  ›', x, 349, 26, { fill: data.accent, fontWeight: 'bold', letterSpacing: 2 });
    // Arrow keys can highlight a portrait before Enter opens its details.
    if (candidate === selected) {
      const focus = new PIXI.Graphics().lineStyle(2, data.accent, .6).drawRoundedRect(18, 18, width - 36, height - 36, 6);
      card.addChild(focus);
    }
    addInteractionFeedback(card, { x: 0, y: 0, width, height }, { onActivate: () => onDetails(candidate) });
    card.portraitStage = 'youth';
    root.controls[`leader:${candidate.founderClassId}`] = card;
    root.candidateRoots[candidate.candidateIndex] = card;
  });
  return root;
}
