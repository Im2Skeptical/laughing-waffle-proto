// Class effects and extensible, actor-driven Commission goals.
export const VASSAL_CLASS_RULES = Object.freeze({
  warrior: { riskSuccessPerPoint: 0.15, riskPrestige: 15, prestigePerRetinue: 10 },
  scholar: { qualityChancePerPoint: 0.05, discoveryResearchPerPoint: 1, delveYears: 10 },
});

export const VASSAL_COMMISSION_DEFS = Object.freeze([
  { id: 'practice', label: 'Install a Practice', description: 'Learn and install a new Practice through a shop node.', event: 'practiceInstalled', prestige: 20 },
  { id: 'structure', label: 'Finish a Structure', description: 'Commission a Structure through a shop node and see it completed.', event: 'structureFinished', prestige: 40 },
  { id: 'relic', label: 'Acquire a Relic', description: 'Find and keep a Relic through a Relic node.', event: 'relicAcquired', prestige: 60 },
]);
