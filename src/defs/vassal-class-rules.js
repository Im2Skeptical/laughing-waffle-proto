// Class effects and extensible, actor-driven Commission goals.
export const VASSAL_CLASS_RULES = Object.freeze({
  warrior: { riskSuccessPerPoint: 0.15, riskPrestige: 15, prestigePerRetinue: 10 },
  scholar: { qualityChancePerPoint: 0.05, discoveryResearchPerPoint: 1, delveYears: 10 },
});

export const VASSAL_COMMISSION_DEFS = Object.freeze([
  { id: 'practice', difficulty: 'easy', label: 'Install a Practice', description: 'Learn and install any new Practice through a shop node.', event: 'practiceInstalled', prestige: 20 },
  { id: 'structure', difficulty: 'easy', label: 'Start a Structure', description: 'Set up construction of any Structure through a shop node. No need to finish building.', event: 'structureStarted', prestige: 20 },
  { id: 'stat', difficulty: 'easy', label: 'Increase {stat}', description: 'Permanently increase {stat} after accepting this Commission.', event: 'statIncreased', prestige: 20, parameter: 'statId' },
  { id: 'relic', difficulty: 'easy', label: 'Acquire a Relic', description: 'Find and keep any Relic through a Relic node.', event: 'relicAcquired', prestige: 20 },
  { id: 'node', difficulty: 'easy', label: 'Visit {node}', description: 'Enter a {node} node on your Life Map. Visiting is enough.', event: 'nodeEntered', prestige: 20, parameter: 'nodeFamily' },
  { id: 'route', difficulty: 'medium', label: 'Build a route', description: 'Build any new route through a Vassal node. Any endpoints count.', event: 'routeBuilt', prestige: 40 },
  { id: 'travel', difficulty: 'medium', label: 'Move to {location}', description: 'Move your Vassal to {location} through a node action.', event: 'locationMoved', prestige: 40, parameter: 'regionId' },
  { id: 'prestige', difficulty: 'medium', label: 'Gain 30 Prestige', description: 'Earn 30 Prestige after accepting. Spending does not reduce progress.', event: 'prestigeGained', prestige: 40, amount: 30 },
  { id: 'practiceTag', difficulty: 'hard', label: 'Install a Practice: {tag}', description: 'Learn and install a new Practice with the {tag} tag.', event: 'practiceInstalled', prestige: 60, parameter: 'tag' },
  { id: 'structureTag', difficulty: 'hard', label: 'Start a Structure: {tag}', description: 'Set up construction of a Structure with the {tag} tag. No need to finish building.', event: 'structureStarted', prestige: 60, parameter: 'tag' },
  { id: 'relicRarity', difficulty: 'hard', label: 'Acquire a Gold Relic', description: 'Find and keep a Gold or Diamond Relic through a Relic node.', event: 'relicAcquired', prestige: 60, minimumQuality: 'gold' },
]);
