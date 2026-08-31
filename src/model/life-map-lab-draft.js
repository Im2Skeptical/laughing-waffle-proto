import {
  canonicalizeVassalLifeMapGeneratorConfig,
  createAuthoredVassalLifeMapGeneratorConfig,
  validateVassalLifeMapGeneratorConfig,
} from "./vassal-life-map-generator.js";

export const LIFE_MAP_LAB_DRAFT_KIND = "vassal-life-map-generator";
export const LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION = 2;
export const LIFE_MAP_LAB_STORAGE_KEY = "civsurvivor.lifeMapLabDraft.v1";
export const LIFE_MAP_LAB_PRESETS_STORAGE_KEY = "civsurvivor.lifeMapLabPresets.v1";

export function createAuthoredLifeMapLabDraft() {
  return {
    schemaVersion: LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION,
    previewSeed: 1,
    generatorConfig: createAuthoredVassalLifeMapGeneratorConfig(),
  };
}

export function canonicalizeLifeMapLabDraft(value) {
  return {
    schemaVersion: LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION,
    previewSeed: Number.isFinite(value?.previewSeed) ? Math.floor(value.previewSeed) : 1,
    generatorConfig: canonicalizeVassalLifeMapGeneratorConfig(value?.generatorConfig),
  };
}

export function validateLifeMapLabDraft(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["draft: expected an object"] };
  }
  if (value.schemaVersion !== LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(value.previewSeed)
      || value.previewSeed < -2147483648 || value.previewSeed > 2147483647) {
    errors.push("previewSeed: expected a signed 32-bit integer");
  }
  const config = validateVassalLifeMapGeneratorConfig(value.generatorConfig);
  errors.push(...config.errors.map((error) => `generatorConfig.${error}`));
  return { ok: errors.length === 0, errors };
}

export function parseLifeMapLabDraftJson(text) {
  try {
    const value = JSON.parse(text);
    const validation = validateLifeMapLabDraft(value);
    return validation.ok
      ? { ok: true, draft: canonicalizeLifeMapLabDraft(value), errors: [] }
      : validation;
  } catch (error) {
    return { ok: false, errors: [`json: ${error.message}`] };
  }
}

export function serializeLifeMapLabDraft(value) {
  const validation = validateLifeMapLabDraft(value);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return JSON.stringify(canonicalizeLifeMapLabDraft(value), null, 2);
}
