// Environment sources use the same scoped modifier language as Structures.
export const BIOME_MULTIPLIER_RULES = Object.freeze([
  {biome:'plains',kind:'outputMultiplier',query:{traitsAny:['Grain']},amountPerRegion:1},
  {biome:'mountains',kind:'outputMultiplier',query:{traitsAny:['Stone']},amountPerRegion:1},
  {biome:'forest',kind:'outputMultiplier',query:{traitsAny:['Construction']},amountPerRegion:1},
]);
