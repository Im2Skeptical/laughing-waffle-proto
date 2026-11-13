// Launch choices only; each world still uses its captured, serialized state.rng.
export const PERFORMANCE_START_SEEDS = Object.freeze([123, 1867, 99117, 424242, 2026]);

export function performanceStartFixturePath(seed) {
  if (!PERFORMANCE_START_SEEDS.includes(seed)) throw Error('Unknown prepared performance seed');
  return `images/dev-fixtures/performance-start-${seed}.json.gz`;
}

export function selectPerformanceStartSeed({ search = globalThis.location?.search ?? '',
  randomUint32 = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] } = {}) {
  const pinned = new URLSearchParams(search).get('seed');
  if (pinned !== null && PERFORMANCE_START_SEEDS.includes(Number(pinned))) return Number(pinned);
  // Rejection avoids modulo bias while choosing uniformly from the prepared pool.
  const limit = 2 ** 32 - (2 ** 32 % PERFORMANCE_START_SEEDS.length);
  let roll;
  do { roll = randomUint32(); } while (roll >= limit);
  return PERFORMANCE_START_SEEDS[roll % PERFORMANCE_START_SEEDS.length];
}
