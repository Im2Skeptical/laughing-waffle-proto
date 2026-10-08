import { getGamepieceFace } from '../../model/gamepiece-presentation.js';

export function constructionCopy(def) {
  const {cycles, consume} = def.construction;
  const costs = multiplier => consume.map(cost => `${cost.amount * multiplier} [${cost.traits.join(' / ')}]`).join(' + ');
  return [
    `${cycles} successful Housing cycles.`,
    `Consume per cycle: ${costs(1)}.`,
    `Total construction cost: ${costs(cycles)}.`,
    'Each cost accepts any listed trait. All costs must be supplied together; missing Stock pauses construction. Structure bonuses start on completion.',
  ];
}

// Catalogue preview only: the slot is disposable and never enters the fixture.
export function getLabStructureFace(state, id, tier, {qualityBonus = 0, plan = false} = {}) {
  const slot = {qualityBonus, ...(plan ? {construction:{completedCycles:0}} : {})};
  const face = getGamepieceFace(state, 'structure', id, tier, {slot});
  if (plan) {
    const copy = constructionCopy(state.gameConfig.gamepieces.structures[id]);
    face.reading = {...face.reading, type:'Structure plan', effects:[{timing:'Construction', text:copy[0]}],
      trigger:copy[3], requirements:copy.slice(1,3), active:null};
  }
  return face;
}
