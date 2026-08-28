import {
  validateGamepiecesDraft,
  validateGameSettingsDraft,
} from "./game-config.js";
import { validateMapLabDraft } from "./map-lab-draft.js";
import { validateVassalDebugDraft } from "./vassal-debug-draft.js";

export const DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION = 1;
export const DEBUG_PROFILE_LIBRARY_STORAGE_KEY = "civsurvivor.debugProfiles.v1";
export const DEBUG_PROFILE_BOOT_STORAGE_KEY = "civsurvivor.debugProfiles.boot.v1";
export const DEBUG_PROFILE_EXPORT_KIND = "civsurvivor.debugProfile";
export const DEBUG_PROFILE_EXPORT_SCHEMA_VERSION = 1;
export const DEBUG_PROFILE_PAGE_IDS = Object.freeze([
  "mapLab",
  "gameSettings",
  "gamepieces",
  "vassalLab",
]);

const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizedName = (value) => String(value ?? "").trim();
const nameKey = (value) => normalizedName(value).toLowerCase();

export function validateDebugProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return { ok: false, errors: ["profile: expected an object"] };
  }
  if (!DEBUG_PROFILE_PAGE_IDS.includes(profile.activePage)) {
    errors.push("activePage: invalid page");
  }
  for (const error of validateMapLabDraft(profile.mapLab).errors ?? []) {
    errors.push(`mapLab.${error}`);
  }
  for (const error of validateGameSettingsDraft(profile.gameSettings).errors ?? []) {
    errors.push(`gameSettings.${error}`);
  }
  for (const error of validateGamepiecesDraft(profile.gamepieces).errors ?? []) {
    errors.push(`gamepieces.${error}`);
  }
  // Vassal Lab is intentionally lazy: before the player opens that panel there
  // is no candidate override to capture. Null records that explicit no-override
  // state without forcing unrelated panels to manufacture a Vassal draft.
  if (profile.vassalLab !== null) {
    for (const error of validateVassalDebugDraft(profile.vassalLab).errors ?? []) {
      errors.push(`vassalLab.${error}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateDebugProfileExport(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["export: expected an object"] };
  }
  if (value.kind !== DEBUG_PROFILE_EXPORT_KIND) {
    errors.push(`kind: expected ${DEBUG_PROFILE_EXPORT_KIND}`);
  }
  if (value.schemaVersion !== DEBUG_PROFILE_EXPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${DEBUG_PROFILE_EXPORT_SCHEMA_VERSION}`);
  }
  const name = normalizedName(value.name);
  if (!name || name.length > 80) errors.push("name: invalid");
  for (const error of validateDebugProfile(value.profile).errors ?? []) {
    errors.push(`profile.${error}`);
  }
  return { ok: errors.length === 0, errors };
}

export function createDebugProfileExport(name, profile) {
  const value = {
    kind: DEBUG_PROFILE_EXPORT_KIND,
    schemaVersion: DEBUG_PROFILE_EXPORT_SCHEMA_VERSION,
    name: normalizedName(name),
    profile: clone(profile),
  };
  const validation = validateDebugProfileExport(value);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return value;
}

export function parseDebugProfileExportJson(text) {
  try {
    const value = JSON.parse(text);
    const validation = validateDebugProfileExport(value);
    return validation.ok ? { ok: true, value: clone(value) } : validation;
  } catch (error) {
    return { ok: false, errors: [`json: ${error.message}`] };
  }
}

export function serializeDebugProfileExport(name, profile) {
  return JSON.stringify(createDebugProfileExport(name, profile), null, 2);
}

export function createEmptyDebugProfileLibrary() {
  return {
    schemaVersion: DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION,
    nextId: 1,
    profiles: [],
  };
}

export function validateDebugProfileLibrary(library) {
  const errors = [];
  if (!library || typeof library !== "object" || Array.isArray(library)) {
    return { ok: false, errors: ["library: expected an object"] };
  }
  if (library.schemaVersion !== DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(library.nextId) || library.nextId < 1) {
    errors.push("nextId: expected a positive integer");
  }
  if (!Array.isArray(library.profiles)) {
    errors.push("profiles: expected an array");
    return { ok: false, errors };
  }
  const ids = new Set();
  const names = new Set();
  for (const [index, entry] of library.profiles.entries()) {
    const path = `profiles[${index}]`;
    if (!/^profile-\d+$/.test(entry?.id ?? "") || ids.has(entry.id)) {
      errors.push(`${path}.id: invalid or duplicate`);
    }
    ids.add(entry?.id);
    const name = normalizedName(entry?.name);
    if (!name || name.length > 80 || names.has(nameKey(name))) {
      errors.push(`${path}.name: invalid or duplicate`);
    }
    names.add(nameKey(name));
    for (const error of validateDebugProfile(entry?.profile).errors ?? []) {
      errors.push(`${path}.${error}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function parseDebugProfileLibraryJson(text) {
  try {
    const library = JSON.parse(text);
    const validation = validateDebugProfileLibrary(library);
    return validation.ok ? { ok: true, library: clone(library) } : validation;
  } catch (error) {
    return { ok: false, errors: [`json: ${error.message}`] };
  }
}

export function serializeDebugProfileLibrary(library) {
  const validation = validateDebugProfileLibrary(library);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return JSON.stringify(library);
}

export function findDebugProfileByName(library, name) {
  return library.profiles.find((entry) => nameKey(entry.name) === nameKey(name)) ?? null;
}

export function saveDebugProfile(library, name, profile, overwriteId = null) {
  const normalized = normalizedName(name);
  if (!normalized) return { ok: false, reason: "emptyName" };
  if (normalized.length > 80) return { ok: false, reason: "nameTooLong" };
  const validation = validateDebugProfile(profile);
  if (!validation.ok) return { ok: false, reason: "invalidProfile", errors: validation.errors };
  const duplicate = library.profiles.find((entry) => nameKey(entry.name) === nameKey(normalized));
  if (duplicate && duplicate.id !== overwriteId) {
    return {
      ok: false,
      reason: "duplicateName",
      existingProfileId: duplicate.id,
      existingProfileName: duplicate.name,
    };
  }
  const next = clone(library);
  const index = overwriteId == null
    ? -1
    : next.profiles.findIndex((entry) => entry.id === overwriteId);
  if (overwriteId != null && index < 0) return { ok: false, reason: "invalidProfileId" };
  const entry = {
    id: overwriteId ?? `profile-${next.nextId++}`,
    name: normalized,
    profile: clone(profile),
  };
  if (index >= 0) next.profiles[index] = entry;
  else next.profiles.push(entry);
  return { ok: true, library: next, entry };
}

export function deleteDebugProfile(library, profileId) {
  const index = library.profiles.findIndex((entry) => entry.id === profileId);
  if (index < 0) return { ok: false, reason: "invalidProfileId" };
  const next = clone(library);
  const [entry] = next.profiles.splice(index, 1);
  return { ok: true, library: next, entry };
}
