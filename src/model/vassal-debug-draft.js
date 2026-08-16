export const VASSAL_DEBUG_DRAFT_KIND = "vassal-candidate";
export const VASSAL_DEBUG_PRESETS_STORAGE_KEY = "civsurvivor.debugVassalPresets.v2";

const clone = (value) => JSON.parse(JSON.stringify(value));

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntervention(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.kind === "practice") return typeof value.practiceId === "string";
  if (value.kind === "structure") return typeof value.structureId === "string";
  if (value.kind === "expandSettlement") {
    return value.regionId == null || typeof value.regionId === "string";
  }
  if (value.kind === "globalStructure") return typeof value.structureId === "string";
  return value.kind === "connection" && ["add", "remove"].includes(value.mode);
}

export function validateVassalDebugDraft(draft) {
  const errors = [];
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return { ok: false, errors: ["draft: expected an object"] };
  }
  if (typeof draft.targetRegionId !== "string") errors.push("targetRegionId: expected a string");
  for (const key of ["initialAge", "deathAge", "traitPrestigeModifier", "resistanceSnapshot"]) {
    if (!isFiniteNumber(draft[key])) errors.push(`${key}: expected a finite number`);
  }
  for (const key of ["traitId", "professionId"]) {
    if (typeof draft[key] !== "string") errors.push(`${key}: expected a string`);
  }
  if (!Array.isArray(draft.interventions) || draft.interventions.length !== 3
      || draft.interventions.some((entry) => !isIntervention(entry))) {
    errors.push("interventions: expected three valid interventions");
  }
  if (!Array.isArray(draft.requiredPrestige) || draft.requiredPrestige.length !== 3
      || draft.requiredPrestige.some((value) => !isFiniteNumber(value))) {
    errors.push("requiredPrestige: expected three finite numbers");
  }
  return { ok: errors.length === 0, errors };
}

export function canonicalizeVassalDebugDraft(draft) {
  const validation = validateVassalDebugDraft(draft);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return clone(draft);
}
