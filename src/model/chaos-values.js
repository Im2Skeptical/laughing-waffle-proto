// Chaos and Resistance share compact units. Keep simulation precision separate
// from player-facing rounding, so small incomes still accumulate deterministically.
export function roundChaos(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100000) / 100000);
}

export function formatChaosValue(value) {
  if (!Number.isFinite(value) || value === 0) return '0';
  return Number(Math.abs(value) < 0.01 ? value.toPrecision(1) : value.toFixed(2)).toString();
}
