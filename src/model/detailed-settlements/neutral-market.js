// Neutral inventories are authored markets, independent of player gamepieces.
export const NEUTRAL_MARKETS = Object.freeze([
  [{ id: 'food', label: 'Provisions', traits: ['Edible'], price: 1, capacity: 12, replenishment: 3 }],
  [{ id: 'food', label: 'Provisions', traits: ['Edible'], price: 1, capacity: 12, replenishment: 3 },
    { id: 'timber', label: 'Timber', traits: ['Timber', 'Fuel', 'Construction'], price: 1, capacity: 10, replenishment: 2 }],
  [{ id: 'food', label: 'Provisions', traits: ['Edible'], price: 1, capacity: 12, replenishment: 3 },
    { id: 'stone', label: 'Stone', traits: ['Stone', 'Construction'], price: 2, capacity: 10, replenishment: 2 },
    { id: 'ore', label: 'Ore', traits: ['Ore'], price: 2, capacity: 8, replenishment: 2 },
    { id: 'metal', label: 'Metal', traits: ['Metal'], price: 3, capacity: 6, replenishment: 1 }],
  [{ id: 'food', label: 'Provisions', traits: ['Edible'], price: 1, capacity: 18, replenishment: 4 },
    { id: 'timber', label: 'Timber', traits: ['Timber', 'Fuel', 'Construction'], price: 1, capacity: 12, replenishment: 3 },
    { id: 'stone', label: 'Stone', traits: ['Stone', 'Construction'], price: 2, capacity: 12, replenishment: 2 },
    { id: 'ore', label: 'Ore', traits: ['Ore'], price: 2, capacity: 10, replenishment: 2 }],
]);

export function replenishNeutralMarkets(state) {
  for (const site of state.world.sites) {
    if (!site.neutral || site.simulationMode !== 'detailed') continue;
    for (const stock of site.neutral.stocks) {
      stock.stock = Math.min(stock.capacity, stock.stock + stock.replenishment);
    }
  }
}

export function validateNeutralMarket(site) {
  const neutral = site.neutral;
  if (!neutral) return [];
  const errors = [];
  if (!Number.isInteger(neutral.currencyStock) || neutral.currencyStock < 0
      || !Number.isInteger(neutral.housing) || neutral.housing < 0
      || !Array.isArray(neutral.stocks) || !neutral.stocks.length) errors.push(`site ${site.id} has invalid neutral market`);
  const ids = new Set();
  for (const stock of Array.isArray(neutral.stocks) ? neutral.stocks : []) {
    if (!stock || typeof stock.id !== 'string' || ids.has(stock.id)
        || typeof stock.label !== 'string' || !Array.isArray(stock.traits) || !stock.traits.length
        || stock.traits.some(trait=>typeof trait !== 'string')
        || !Number.isInteger(stock.stock) || stock.stock < 0 || stock.stock > stock.capacity
        || !Number.isInteger(stock.capacity) || stock.capacity < 1
        || !Number.isInteger(stock.price) || stock.price < 1
        || !Number.isInteger(stock.replenishment) || stock.replenishment < 0) errors.push(`site ${site.id} has invalid neutral Stock`);
    ids.add(stock?.id);
  }
  if (site.detailedState?.practiceSlots?.some(Boolean) || site.detailedState?.structureSlots?.some(Boolean)) errors.push(`site ${site.id} neutral market cannot install gamepieces`);
  return errors;
}
