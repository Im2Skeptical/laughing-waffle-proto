// A construction strip is a sparse array of placement origins. Covered cells
// remain null; occupancy is always derived, never a second serialized truth.
// These pure operations are shared by simulation, draft projection and tools.
export function occupiedCells(slots) {
  const cells = Array.from({ length: slots.length }, () => null);
  for (const placement of slots.filter(Boolean)) {
    for (let cell = placement.origin; cell < placement.origin + placement.width; cell += 1) {
      if (cell >= 0 && cell < cells.length) cells[cell] = placement;
    }
  }
  return cells;
}

export function validateStructureLayout(slots, capacity = slots?.length) {
  const errors = [];
  if (!Array.isArray(slots) || slots.length !== capacity) return { ok: false, errors: ['capacityMismatch'] };
  const ids = new Set(), cells = new Set();
  slots.forEach((placement, index) => {
    if (!placement) return;
    if (typeof placement.placementId !== 'string' || !placement.placementId || ids.has(placement.placementId)) errors.push('invalidPlacementIdentity');
    ids.add(placement.placementId);
    if (placement.origin !== index || !Number.isInteger(placement.width) || placement.width < 1 || placement.width > 3 || index + placement.width > capacity) {
      errors.push('invalidFootprint');
      return;
    }
    for (let cell = index; cell < index + placement.width; cell += 1) {
      if (cells.has(cell)) errors.push('overlap');
      cells.add(cell);
    }
  });
  return { ok: !errors.length, errors };
}

// Used only when authoring a new strip, never to migrate loaded saves.
export function normalizeStructureLayout(entries, capacity, definitionFor, identityPrefix = 'initial') {
  const slots = Array.from({ length: capacity }, () => null);
  for (let index = 0; index < (entries ?? []).length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const origin = entry.origin ?? index;
    const width = entry.width ?? definitionFor(entry.structureId)?.footprint ?? 1;
    const placement = { ...entry, tier: entry.tier ?? 'bronze', origin, width,
      placementId: entry.placementId ?? `${identityPrefix}:${index}` };
    const result = applyBuild(slots, placement);
    if (!result.ok) throw new Error(`Invalid authored construction at ${origin}: ${result.reason}`);
    slots.splice(0, slots.length, ...result.slots);
  }
  return slots;
}

export function canPlace(slots, width, origin, { allowDemolition = false, stagedIds = [] } = {}) {
  if (!Number.isInteger(width) || width < 1 || width > 3 || !Number.isInteger(origin) || origin < 0 || origin + width > slots.length) return { ok: false, reason: 'outsideConstructionStrip' };
  const overlaps = [...new Set(occupiedCells(slots).slice(origin, origin + width).filter(Boolean))];
  if (overlaps.some(p => stagedIds.includes(p.placementId))) return { ok: false, reason: 'stagedStructureOverlap' };
  if (overlaps.length && !allowDemolition) return { ok: false, reason: 'structureOccupied' };
  return { ok: true, demolished: overlaps };
}

export function findStructurePlacement(slots, width, options = {}) {
  // A free span anywhere always wins over demolition at an earlier origin.
  for (const allowDemolition of [false, true]) {
    if (allowDemolition && options.allowDemolition !== true) break;
    for (let origin = 0; origin <= slots.length - width; origin += 1) {
      const result = canPlace(slots, width, origin, { ...options, allowDemolition });
      if (result.ok) return { ...result, origin };
    }
  }
  return { ok: false, reason: 'noCompatibleSpan' };
}

export function applyDemolish(slots, placementIds) {
  return slots.map(p => p && !placementIds.includes(p.placementId) ? { ...p } : null);
}

export function applyBuild(slots, placement, options = {}) {
  const result = canPlace(slots, placement.width, placement.origin, options);
  if (!result.ok) return result;
  if (!placement.placementId || slots.some(p => p?.placementId === placement.placementId)) return { ok: false, reason: 'duplicatePlacementIdentity' };
  const next = applyDemolish(slots, result.demolished.map(p => p.placementId));
  next[placement.origin] = { ...placement };
  return { ok: true, slots: next, demolished: result.demolished };
}

export function applyStructureUpgrade(slots, targetId, replacement, stagedIds = []) {
  const target = slots.find(p => p?.placementId === targetId);
  if (!target || stagedIds.includes(targetId) || target.structureId !== replacement.structureId || target.width !== replacement.width || replacement.previousTier !== target.tier) return { ok: false, reason: 'incompatibleUpgrade' };
  const next = slots.map(p => p ? { ...p } : null);
  next[target.origin] = { ...target, tier: replacement.tier };
  return { ok: true, slots: next, demolished: [], upgraded: target };
}

// Recompute from confirmed placements on every edit; undo therefore restores
// all covered structures without compensating actions or destructive mutation.
export function projectStructureDraft(confirmed, actions) {
  let slots = confirmed.map(p => p ? { ...p } : null);
  const stagedIds = [], demolished = [], upgrades = [];
  for (const action of actions) {
    if (!action || typeof action !== 'object') return { ok: false, reason: 'invalidStructureAction' };
    const result = action.mode === 'upgrade'
      ? applyStructureUpgrade(slots, action.targetPlacementId, action, stagedIds)
      : applyBuild(slots, action, { allowDemolition: true, stagedIds });
    if (!result.ok) return result;
    slots = result.slots;
    stagedIds.push(action.mode === 'upgrade' ? action.targetPlacementId : action.placementId);
    demolished.push(...result.demolished);
    if (result.upgraded) upgrades.push(result.upgraded);
  }
  return { ok: true, slots, stagedIds, demolished, upgrades };
}
