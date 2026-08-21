export const VASSAL_DEBUG_DRAFT_KIND = "vassal-candidate";
export const VASSAL_DEBUG_DRAFT_SCHEMA_VERSION = 5;
export const VASSAL_DEBUG_PRESETS_STORAGE_KEY = "civsurvivor.debugVassalPresets.v5";

const clone = (value) => JSON.parse(JSON.stringify(value));

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateVassalDebugDraft(draft) {
  const errors = [];
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return { ok: false, errors: ["draft: expected an object"] };
  }
  if (draft.schemaVersion !== VASSAL_DEBUG_DRAFT_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${VASSAL_DEBUG_DRAFT_SCHEMA_VERSION}`);
  }
  if (typeof draft.locationRegionId !== "string" || !draft.locationRegionId) {
    errors.push("locationRegionId: expected a non-empty string");
  }
  for (const key of [
    "age", "prestige", "cunning", "wisdom", "effectiveness", "intelligence",
  ]) {
    if (!isFiniteNumber(draft[key])) errors.push(`${key}: expected a finite number`);
  }
  if (!Number.isInteger(draft.candidateSlot)
      || draft.candidateSlot < 1 || draft.candidateSlot > 3) {
    errors.push("candidateSlot: expected 1, 2, or 3");
  }
  return { ok: errors.length === 0, errors };
}

export function canonicalizeVassalDebugDraft(draft) {
  const validation = validateVassalDebugDraft(draft);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return clone({
    schemaVersion: VASSAL_DEBUG_DRAFT_SCHEMA_VERSION,
    locationRegionId: draft.locationRegionId,
    age: Math.max(0, Math.floor(draft.age)),
    prestige: Math.max(0, Math.floor(draft.prestige)),
    cunning: Math.max(0, Math.floor(draft.cunning)),
    wisdom: Math.max(0, Math.floor(draft.wisdom)),
    effectiveness: Math.max(0, Math.floor(draft.effectiveness)),
    intelligence: Math.max(0, Math.floor(draft.intelligence)),
    candidateSlot: draft.candidateSlot,
  });
}
