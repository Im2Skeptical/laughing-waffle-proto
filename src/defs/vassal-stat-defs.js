// Attribute identity is distinct from its stable serialized stat slot.
export const VASSAL_STAT_DEFS = Object.freeze({
  cunning: Object.freeze({ id: 'cunning', statId: 'cunning', label: 'Cunning', iconId: 'prestige' }),
  intelligence: Object.freeze({ id: 'intelligence', statId: 'intelligence', label: 'Intelligence', iconId: 'stock-instrument' }),
  wisdom: Object.freeze({ id: 'wisdom', statId: 'wisdom', label: 'Wisdom', iconId: 'faith' }),
  effectiveness: Object.freeze({ id: 'effectiveness', statId: 'effectiveness', label: 'Effectiveness', iconId: 'phase' }),
  ingenuity: Object.freeze({ id: 'ingenuity', statId: 'cunning', label: 'Ingenuity', iconId: 'stock-knowledge' }),
  prowess: Object.freeze({ id: 'prowess', statId: 'intelligence', label: 'Prowess', iconId: 'stock-arms' }),
});

export const VASSAL_CLASS_STAT_REPLACEMENTS = Object.freeze({
  scholar: Object.freeze({ cunning: 'ingenuity' }),
  warrior: Object.freeze({ intelligence: 'prowess' }),
});
