// Presentation only: natural biomes and current control never rewrite mechanics.colour.
const BIOME_STYLES = Object.freeze({
  plains: { fill: 0x796e47, tile: 'red' },
  forest: { fill: 0x345944, tile: 'green' },
  islands: { fill: 0x3c536d, tile: 'blue' },
  swamp: { fill: 0x4a5948, tile: 'black' },
  mountains: { fill: 0x67635e, tile: 'black' },
});
const COLOUR_STYLES = Object.freeze({
  green: { fill: 0x345944, tile: 'green' }, red: { fill: 0x704940, tile: 'red' },
  blue: { fill: 0x3c536d, tile: 'blue' }, black: { fill: 0x4e4b57, tile: 'black' },
});
export function getRegionTerrainStyle(biome, colour) {
  return BIOME_STYLES[biome] ?? COLOUR_STYLES[colour] ?? BIOME_STYLES.forest;
}

export function getRegionNameColour(region) {
  if (region?.monster) return 0xff8d9d;
  if (region?.controller === 'player') return 0xffe6a2;
  if (region?.controller === 'external-a') return 0xf2b58c;
  return 0xd0d4ca;
}
