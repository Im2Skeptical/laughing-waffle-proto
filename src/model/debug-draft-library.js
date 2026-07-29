export const DEBUG_DRAFT_LIBRARY_SCHEMA_VERSION = 1;
export const DEBUG_DRAFT_NAME_MAX_LENGTH = 80;

const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeName = (value) => String(value ?? "").trim();
const nameKey = (value) => normalizeName(value).toLowerCase();

export function createEmptyDebugDraftLibrary(kind) {
  return {
    schemaVersion: DEBUG_DRAFT_LIBRARY_SCHEMA_VERSION,
    kind,
    nextId: 1,
    presets: [],
  };
}

export function validateDebugDraftName(name) {
  const normalized = normalizeName(name);
  if (!normalized) return { ok: false, reason: "emptyName" };
  if (normalized.length > DEBUG_DRAFT_NAME_MAX_LENGTH) {
    return { ok: false, reason: "nameTooLong" };
  }
  return { ok: true, name: normalized };
}

export function validateDebugDraftLibrary(value, { kind, validateDraft }) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["library: expected a JSON object"] };
  }
  if (value.schemaVersion !== DEBUG_DRAFT_LIBRARY_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${DEBUG_DRAFT_LIBRARY_SCHEMA_VERSION}`);
  }
  if (value.kind !== kind) errors.push(`kind: expected ${kind}`);
  if (!Number.isInteger(value.nextId) || value.nextId < 1) {
    errors.push("nextId: expected a positive integer");
  }
  if (!Array.isArray(value.presets)) {
    errors.push("presets: expected an array");
    return { ok: false, errors };
  }
  const ids = new Set();
  const names = new Set();
  let greatestId = 0;
  value.presets.forEach((preset, index) => {
    const path = `presets[${index}]`;
    if (!/^local-\d+$/.test(preset?.id ?? "")) {
      errors.push(`${path}.id: expected local-N`);
    } else {
      greatestId = Math.max(greatestId, Number(preset.id.slice(6)));
      if (ids.has(preset.id)) errors.push(`${path}.id: duplicate ${preset.id}`);
      ids.add(preset.id);
    }
    const name = validateDebugDraftName(preset?.name);
    if (!name.ok) errors.push(`${path}.name: invalid`);
    else if (names.has(nameKey(name.name))) errors.push(`${path}.name: duplicate`);
    else names.add(nameKey(name.name));
    for (const error of validateDraft(preset?.draft).errors ?? []) {
      errors.push(`${path}.draft.${error}`);
    }
  });
  if (Number.isInteger(value.nextId) && value.nextId <= greatestId) {
    errors.push(`nextId: must exceed ${greatestId}`);
  }
  return { ok: errors.length === 0, errors };
}

export function parseDebugDraftLibraryJson(text, options) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`json: ${error.message}`] };
  }
  const validation = validateDebugDraftLibrary(value, options);
  return validation.ok ? { ok: true, library: clone(value), errors: [] } : validation;
}

export function serializeDebugDraftLibrary(library, options) {
  const validation = validateDebugDraftLibrary(library, options);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return JSON.stringify(library);
}

export function findDebugDraftPresetByName(library, name) {
  return library.presets.find((entry) => nameKey(entry.name) === nameKey(name)) ?? null;
}

export function saveDebugDraftPreset(
  library,
  { name, draft, presetId = null },
  { validateDraft, canonicalizeDraft }
) {
  const normalizedName = validateDebugDraftName(name);
  if (!normalizedName.ok) return normalizedName;
  const validation = validateDraft(draft);
  if (!validation.ok) return { ok: false, reason: "invalidDraft", errors: validation.errors };
  const next = clone(library);
  const existingIndex = presetId == null
    ? -1
    : next.presets.findIndex((entry) => entry.id === presetId);
  if (presetId != null && existingIndex < 0) return { ok: false, reason: "invalidPresetId" };
  const duplicate = findDebugDraftPresetByName(next, normalizedName.name);
  if (duplicate && duplicate.id !== presetId) {
    return {
      ok: false,
      reason: "duplicateName",
      existingPresetId: duplicate.id,
      existingPresetName: duplicate.name,
    };
  }
  const preset = {
    id: presetId ?? `local-${next.nextId++}`,
    name: normalizedName.name,
    draft: canonicalizeDraft(draft),
  };
  if (existingIndex >= 0) next.presets[existingIndex] = preset;
  else next.presets.push(preset);
  return { ok: true, library: next, preset };
}

export function deleteDebugDraftPreset(library, presetId) {
  const index = library.presets.findIndex((entry) => entry.id === presetId);
  if (index < 0) return { ok: false, reason: "invalidPresetId" };
  const next = clone(library);
  const [preset] = next.presets.splice(index, 1);
  return { ok: true, library: next, preset };
}
