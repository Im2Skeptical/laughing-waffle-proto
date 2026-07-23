import {
  canonicalizeMapLabDraft,
  validateMapLabDraft,
} from "./map-lab-draft.js";

export const MAP_LAB_SCENARIO_LIBRARY_SCHEMA_VERSION = 1;
export const MAP_LAB_SCENARIO_LIBRARY_STORAGE_KEY = "civsurvivor.mapLabScenarios.v1";
export const MAP_LAB_SCENARIO_NAME_MAX_LENGTH = 80;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedName(name) {
  return String(name ?? "").trim();
}

function nameKey(name) {
  return normalizedName(name).toLowerCase();
}

export function createEmptyMapLabScenarioLibrary() {
  return {
    schemaVersion: MAP_LAB_SCENARIO_LIBRARY_SCHEMA_VERSION,
    nextId: 1,
    scenarios: [],
  };
}

export function canonicalizeMapLabScenarioLibrary(value) {
  return {
    schemaVersion: MAP_LAB_SCENARIO_LIBRARY_SCHEMA_VERSION,
    nextId: value.nextId,
    scenarios: value.scenarios.map((scenario) => ({
      id: scenario.id,
      name: normalizedName(scenario.name),
      draft: canonicalizeMapLabDraft(scenario.draft),
    })),
  };
}

export function validateMapLabScenarioName(name) {
  const trimmed = normalizedName(name);
  if (!trimmed) return { ok: false, reason: "emptyName" };
  if (trimmed.length > MAP_LAB_SCENARIO_NAME_MAX_LENGTH) {
    return { ok: false, reason: "nameTooLong" };
  }
  return { ok: true, name: trimmed };
}

export function validateMapLabScenarioLibrary(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["library: expected a JSON object"] };
  }
  if (value.schemaVersion !== MAP_LAB_SCENARIO_LIBRARY_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${MAP_LAB_SCENARIO_LIBRARY_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(value.nextId) || value.nextId < 1) {
    errors.push("nextId: expected a positive integer");
  }
  if (!Array.isArray(value.scenarios)) {
    errors.push("scenarios: expected an array");
    return { ok: false, errors };
  }

  const ids = new Set();
  const names = new Set();
  let greatestId = 0;
  value.scenarios.forEach((scenario, index) => {
    const path = `scenarios[${index}]`;
    if (!/^local-\d+$/.test(scenario?.id ?? "")) {
      errors.push(`${path}.id: expected local-N`);
    } else {
      const numericId = Number(scenario.id.slice("local-".length));
      greatestId = Math.max(greatestId, numericId);
      if (ids.has(scenario.id)) errors.push(`${path}.id: duplicate ${scenario.id}`);
      ids.add(scenario.id);
    }
    const nameValidation = validateMapLabScenarioName(scenario?.name);
    if (!nameValidation.ok) {
      errors.push(`${path}.name: ${nameValidation.reason === "nameTooLong" ? `maximum ${MAP_LAB_SCENARIO_NAME_MAX_LENGTH} characters` : "required"}`);
    } else {
      const key = nameKey(nameValidation.name);
      if (names.has(key)) errors.push(`${path}.name: duplicate ${nameValidation.name}`);
      names.add(key);
    }
    const draftValidation = validateMapLabDraft(scenario?.draft);
    for (const error of draftValidation.errors) errors.push(`${path}.draft.${error}`);
  });
  if (Number.isInteger(value.nextId) && value.nextId <= greatestId) {
    errors.push(`nextId: must be greater than existing scenario ID ${greatestId}`);
  }
  return { ok: errors.length === 0, errors };
}

export function parseMapLabScenarioLibraryJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`json: ${error.message}`] };
  }
  const validation = validateMapLabScenarioLibrary(raw);
  return validation.ok
    ? { ok: true, library: canonicalizeMapLabScenarioLibrary(raw), errors: [] }
    : validation;
}

export function serializeMapLabScenarioLibrary(library) {
  const validation = validateMapLabScenarioLibrary(library);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return JSON.stringify(canonicalizeMapLabScenarioLibrary(library));
}

export function findMapLabScenarioByName(library, name) {
  const key = nameKey(name);
  return library.scenarios.find((scenario) => nameKey(scenario.name) === key) ?? null;
}

export function saveMapLabScenario(library, { name, draft, scenarioId = null } = {}) {
  const nameValidation = validateMapLabScenarioName(name);
  if (!nameValidation.ok) return nameValidation;
  const draftValidation = validateMapLabDraft(draft);
  if (!draftValidation.ok) {
    return { ok: false, reason: "invalidDraft", errors: draftValidation.errors };
  }
  const next = clone(library);
  const existingIndex = scenarioId == null
    ? -1
    : next.scenarios.findIndex((scenario) => scenario.id === scenarioId);
  if (scenarioId != null && existingIndex < 0) {
    return { ok: false, reason: "invalidScenarioId" };
  }
  const duplicate = findMapLabScenarioByName(next, nameValidation.name);
  if (duplicate && duplicate.id !== scenarioId) {
    return {
      ok: false,
      reason: "duplicateName",
      existingScenarioId: duplicate.id,
      existingScenarioName: duplicate.name,
    };
  }

  const scenario = {
    id: scenarioId ?? `local-${next.nextId++}`,
    name: nameValidation.name,
    draft: canonicalizeMapLabDraft(draft),
  };
  if (existingIndex >= 0) next.scenarios[existingIndex] = scenario;
  else next.scenarios.push(scenario);
  return {
    ok: true,
    library: canonicalizeMapLabScenarioLibrary(next),
    scenario,
  };
}

export function deleteMapLabScenario(library, scenarioId) {
  const index = library.scenarios.findIndex((scenario) => scenario.id === scenarioId);
  if (index < 0) return { ok: false, reason: "invalidScenarioId" };
  const next = clone(library);
  const [scenario] = next.scenarios.splice(index, 1);
  return {
    ok: true,
    library: canonicalizeMapLabScenarioLibrary(next),
    scenario,
  };
}
