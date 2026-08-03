export const MOON_PHASE_DEFS = Object.freeze([
  Object.freeze({
    id: "birth",
    label: "Birth",
    glyph: "B",
    summary: "Buildings resolve and the population changes through births and maturation.",
  }),
  Object.freeze({
    id: "food",
    label: "Food",
    glyph: "F",
    summary: "Administration moves food, then eating records shortages and starvation migrants.",
  }),
  Object.freeze({
    id: "housing",
    label: "Housing",
    glyph: "H",
    summary: "Housing is checked after any starvation migrants have already been reserved.",
  }),
  Object.freeze({
    id: "faith",
    label: "Faith",
    glyph: "A",
    summary: "Happiness evidence changes faith and can create social displacement.",
  }),
  Object.freeze({
    id: "migration",
    label: "Migration",
    glyph: "M",
    summary: "All displaced people share one destination and arrival process.",
  }),
  Object.freeze({
    id: "death",
    label: "Death",
    glyph: "D",
    summary: "Arrival hardship, natural mortality, and perishability resolve.",
  }),
]);

export const MOON_PHASE_COUNT = MOON_PHASE_DEFS.length;
export const MOON_PHASE_INDEX_BY_ID = Object.freeze(
  Object.fromEntries(MOON_PHASE_DEFS.map((phase, index) => [phase.id, index]))
);
