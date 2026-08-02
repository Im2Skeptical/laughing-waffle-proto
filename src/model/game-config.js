import {
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";

export const GAME_CONFIG_SCHEMA_VERSION = 3;
export const GAME_SETTINGS_DRAFT_KIND = "gameSettings";
export const GAMEPIECES_DRAFT_KIND = "gamepieces";

const clone = (value) => JSON.parse(JSON.stringify(value));

export const GAME_SETTING_EDITOR_SECTIONS = Object.freeze([
  Object.freeze({
    id: "timing",
    label: "Timing",
    fields: Object.freeze([
      field("seasonDurationSec", "Season duration (seconds)", 8, 1, 120, 1, true),
      field("phaseDurationSec", "Moon phase duration (seconds)", 1, 1, 20, 1, true),
    ]),
  }),
  Object.freeze({
    id: "workers",
    label: "Workers",
    fields: Object.freeze([
      field("populationPerToken", "Population per worker token", 10, 1, 1000, 1, true),
      field("villagerEffectiveness", "Villager effectiveness", 1, 0, 100, 0.1),
      field("strangerEffectiveness", "Stranger effectiveness", 0.5, 0, 100, 0.1),
    ]),
  }),
  Object.freeze({
    id: "food",
    label: "Food and meals",
    fields: Object.freeze([
      field("childMealConsumption", "Food per child", 0.5, 0, 100, 0.05),
      field("adultMealConsumption", "Food per adult", 1, 0, 100, 0.05),
      field("elderMealConsumption", "Food per elder", 1, 0, 100, 0.05),
      field("storedFoodDecayRate", "Stored food decay", 0.1, 0, 1, 0.01),
      field("looseFoodDecayRate", "Loose food decay", 0.75, 0, 1, 0.01),
    ]),
  }),
  Object.freeze({
    id: "demographics",
    label: "Demographics",
    fields: Object.freeze([
      field("birthRateBronze", "Birth chance: Bronze", 0, 0, 1, 0.01),
      field("birthRateSilver", "Birth chance: Silver", 0.02, 0, 1, 0.005),
      field("birthRateGold", "Birth chance: Gold", 0.04, 0, 1, 0.005),
      field("birthRateDiamond", "Birth chance: Diamond", 0.08, 0, 1, 0.005),
      field("childToAdultRate", "Child-to-adult chance", 0.02, 0, 1, 0.005),
      field("adultToElderRate", "Adult-to-elder chance", 0.005, 0, 1, 0.005),
      field("newElderAge", "New elder age", 45, 1, 200, 1, true),
      field("elderMortalityThrough49", "Elder mortality through 49", 0.0025, 0, 1, 0.0025),
      field("elderMortality50To54", "Elder mortality 50-54", 0.005, 0, 1, 0.005),
      field("elderMortality55To59", "Elder mortality 55-59", 0.015, 0, 1, 0.005),
      field("elderMortality60To64", "Elder mortality 60-64", 0.04, 0, 1, 0.01),
      field("elderMortality65To69", "Elder mortality 65-69", 0.08, 0, 1, 0.01),
      field("elderMortality70To74", "Elder mortality 70-74", 0.16, 0, 1, 0.01),
      field("elderMortality75Plus", "Elder mortality 75+", 0.3, 0, 1, 0.01),
    ]),
  }),
  Object.freeze({
    id: "social",
    label: "Happiness, housing, and collapse",
    fields: Object.freeze([
      field("fullFeedStreakForIncrease", "Full meals for happiness increase", 3, 1, 100, 1, true),
      field("partialFeedMinimumRatio", "Partial-feed minimum ratio", 0.5, 0, 1, 0.01),
      field("partialFeedMemoryLength", "Improving partial meals required", 3, 1, 100, 1, true),
      field("missedFeedStreakForStarvation", "Missed meals before starvation", 3, 1, 100, 1, true),
      field("overHousingNegativeRatio", "Population/capacity for negative housing", 1.2, 1, 100, 0.05),
      field("faithStreakForShift", "Faith outcomes for tier shift", 3, 1, 100, 1, true),
      field("migrationHardshipDeathRate", "Unplaced migrant hardship mortality", 0.2, 0, 1, 0.01),
      field("bronzeCollapseLossRate", "Bronze collapse displacement", 0.25, 0, 1, 0.01),
    ]),
  }),
  Object.freeze({
    id: "chaos",
    label: "Chaos and civilization loss",
    fields: Object.freeze([
      field("baseChaosIncomePerSite", "Base chaos per settlement per moon", 2, 0, 100000, 0.25),
      field("chaosGrowthRate", "Chaos growth rate", 0.03, 0, 100, 0.01),
      field("chaosGrowthYears", "Years per chaos growth step", 12, 1, 10000, 1, true),
      field("goldMitigationAmount", "Gold mitigation amount", 1, 0, 10000, 1, true),
      field("goldMitigationPerPopulation", "Population per Gold mitigation", 25, 1, 10000, 1, true),
      field("diamondMitigationAmount", "Diamond mitigation amount", 1, 0, 10000, 1, true),
      field("diamondMitigationPerPopulation", "Population per Diamond mitigation", 10, 1, 10000, 1, true),
      field("chaosPerMonster", "Chaos per monster", 100, 1, 1000000, 1, true),
      field("monsterLossThreshold", "Monster loss threshold", 1000, 1, 10000000, 1, true),
    ]),
  }),
  Object.freeze({
    id: "order",
    label: "Elder Order and vassals",
    fields: Object.freeze([
      field("elderPrestigeBaseAge", "Elder prestige base age", 44, 0, 200, 1, true),
      field("resistancePerAdditionalElder", "Resistance per additional elder", 10, 0, 10000, 1, true),
      field("vassalStartingAgeMin", "Generated vassal starting age minimum", 6, 0, 200, 1, true),
      field("vassalStartingAgeMax", "Generated vassal starting age maximum", 12, 0, 200, 1, true),
      field("vassalDeathAgeMin", "Generated vassal death age minimum", 45, 1, 250, 1, true),
      field("vassalDeathAgeMax", "Generated vassal death age maximum", 85, 1, 250, 1, true),
      field("interventionRequirement01", "Intervention 1 resistance offset", 20, 0, 10000, 1, true),
      field("interventionRequirement02", "Intervention 2 resistance offset", 30, 0, 10000, 1, true),
      field("interventionRequirement03", "Intervention 3 resistance offset", 40, 0, 10000, 1, true),
    ]),
  }),
]);

function field(id, label, defaultValue, min, max, step, integer = false) {
  return Object.freeze({ id, label, defaultValue, min, max, step, integer });
}

const SETTING_FIELDS = GAME_SETTING_EDITOR_SECTIONS.flatMap((section) => section.fields);
const SETTING_FIELD_BY_ID = Object.freeze(
  Object.fromEntries(SETTING_FIELDS.map((entry) => [entry.id, entry]))
);

export function createAuthoredGameSettingsDraft() {
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    values: Object.fromEntries(
      SETTING_FIELDS.map((entry) => [entry.id, entry.defaultValue])
    ),
  };
}

export function canonicalizeGameSettingsDraft(value) {
  const source = value?.values ?? {};
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    values: Object.fromEntries(
      SETTING_FIELDS.map((entry) => [
        entry.id,
        Number.isFinite(source[entry.id]) ? Number(source[entry.id]) : entry.defaultValue,
      ])
    ),
  };
}

export function validateGameSettingsDraft(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["draft: expected a JSON object"] };
  }
  if (value.schemaVersion !== GAME_CONFIG_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${GAME_CONFIG_SCHEMA_VERSION}`);
  }
  if (!value.values || typeof value.values !== "object" || Array.isArray(value.values)) {
    errors.push("values: expected an object");
    return { ok: false, errors };
  }
  for (const entry of SETTING_FIELDS) {
    const current = value.values[entry.id];
    if (!Number.isFinite(current)) {
      errors.push(`${entry.id}: expected a finite number`);
      continue;
    }
    if (current < entry.min || current > entry.max) {
      errors.push(`${entry.id}: expected ${entry.min} to ${entry.max}`);
    }
    if (entry.integer && !Number.isInteger(current)) {
      errors.push(`${entry.id}: expected an integer`);
    }
  }
  if (value.values.vassalStartingAgeMin > value.values.vassalStartingAgeMax) {
    errors.push("vassalStartingAgeMin: must not exceed maximum");
  }
  if (value.values.vassalDeathAgeMin > value.values.vassalDeathAgeMax) {
    errors.push("vassalDeathAgeMin: must not exceed maximum");
  }
  return { ok: errors.length === 0, errors };
}

export function createAuthoredGamepiecesDraft() {
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    structures: clone(settlementStructureDefs),
    practices: clone(detailedSettlementPracticeDefs),
  };
}

function copyNumericLeaves(template, source) {
  if (Array.isArray(template)) {
    return template.map((entry, index) => copyNumericLeaves(entry, source?.[index]));
  }
  if (template && typeof template === "object") {
    return Object.fromEntries(
      Object.entries(template).map(([key, entry]) => [
        key,
        copyNumericLeaves(entry, source?.[key]),
      ])
    );
  }
  return typeof template === "number" && Number.isFinite(source)
    ? Number(source)
    : template;
}

export function canonicalizeGamepiecesDraft(value) {
  const authored = createAuthoredGamepiecesDraft();
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    structures: copyNumericLeaves(authored.structures, value?.structures),
    practices: copyNumericLeaves(authored.practices, value?.practices),
  };
}

function collectNumericLeafPaths(value, prefix = [], result = []) {
  if (typeof value === "number") {
    result.push(prefix);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectNumericLeafPaths(entry, [...prefix, index], result));
    return result;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      collectNumericLeafPaths(entry, [...prefix, key], result);
    }
  }
  return result;
}

export function getGamepieceEditorGroups(draft) {
  const safe = canonicalizeGamepiecesDraft(draft);
  const groups = [];
  for (const [kind, entries] of [
    ["structures", safe.structures],
    ["practices", safe.practices],
  ]) {
    for (const [id, definition] of Object.entries(entries)) {
      groups.push({
        kind,
        id,
        label: definition.label ?? id,
        fields: collectNumericLeafPaths(definition).map((path) => ({
          path: [kind, id, ...path],
          id: path.join("."),
          label: path
            .map((part) => typeof part === "number" ? `Effect ${part + 1}` : splitCamel(part))
            .join(" / "),
          value: getAtPath(safe, [kind, id, ...path]),
        })),
      });
    }
  }
  return groups;
}

function splitCamel(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function getAtPath(value, path) {
  return path.reduce((current, key) => current?.[key], value);
}

export function setAtPath(value, path, nextValue) {
  const next = clone(value);
  let target = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    target = target[path[index]];
  }
  target[path[path.length - 1]] = nextValue;
  return next;
}

export function validateGamepiecesDraft(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["draft: expected a JSON object"] };
  }
  if (value.schemaVersion !== GAME_CONFIG_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${GAME_CONFIG_SCHEMA_VERSION}`);
  }
  const authored = createAuthoredGamepiecesDraft();
  for (const kind of ["structures", "practices"]) {
    if (!value[kind] || typeof value[kind] !== "object" || Array.isArray(value[kind])) {
      errors.push(`${kind}: expected an object`);
      continue;
    }
    for (const id of Object.keys(authored[kind])) {
      if (!value[kind][id]) errors.push(`${kind}.${id}: required`);
    }
  }
  for (const group of getGamepieceEditorGroups(value)) {
    for (const entry of group.fields) {
      const current = getAtPath(value, entry.path);
      if (!Number.isFinite(current)) {
        errors.push(`${entry.path.join(".")}: expected a finite number`);
        continue;
      }
      const key = String(entry.path.at(-1));
      if (current < 0) errors.push(`${entry.path.join(".")}: expected zero or greater`);
      if ((key === "workerCapacity" || key === "chargePeriodMoons") && !Number.isInteger(current)) {
        errors.push(`${entry.path.join(".")}: expected an integer`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function createAuthoredGameConfig() {
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    settings: createAuthoredGameSettingsDraft(),
    gamepieces: createAuthoredGamepiecesDraft(),
  };
}

export function canonicalizeGameConfig(value) {
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    settings: canonicalizeGameSettingsDraft(value?.settings),
    gamepieces: canonicalizeGamepiecesDraft(value?.gamepieces),
  };
}

export function validateGameConfig(value) {
  const settings = validateGameSettingsDraft(value?.settings);
  const gamepieces = validateGamepiecesDraft(value?.gamepieces);
  const errors = [
    ...settings.errors.map((error) => `settings.${error}`),
    ...gamepieces.errors.map((error) => `gamepieces.${error}`),
  ];
  if (value?.schemaVersion !== GAME_CONFIG_SCHEMA_VERSION) {
    errors.unshift(`schemaVersion: expected ${GAME_CONFIG_SCHEMA_VERSION}`);
  }
  return { ok: errors.length === 0, errors };
}

export function getGameSetting(state, id) {
  const fallback = SETTING_FIELD_BY_ID[id]?.defaultValue;
  const value = state?.gameConfig?.settings?.values?.[id];
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function getDetailedStructureDef(state, id) {
  return state?.gameConfig?.gamepieces?.structures?.[id] ?? settlementStructureDefs[id] ?? null;
}

export function getDetailedPracticeDef(state, id) {
  return state?.gameConfig?.gamepieces?.practices?.[id]
    ?? detailedSettlementPracticeDefs[id]
    ?? null;
}

export function parseDebugDraftJson(text, kind) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`json: ${error.message}`] };
  }
  const validation = kind === GAME_SETTINGS_DRAFT_KIND
    ? validateGameSettingsDraft(value)
    : validateGamepiecesDraft(value);
  if (!validation.ok) return validation;
  return {
    ok: true,
    draft: kind === GAME_SETTINGS_DRAFT_KIND
      ? canonicalizeGameSettingsDraft(value)
      : canonicalizeGamepiecesDraft(value),
    errors: [],
  };
}

export function serializeDebugDraft(draft, kind) {
  const validation = kind === GAME_SETTINGS_DRAFT_KIND
    ? validateGameSettingsDraft(draft)
    : validateGamepiecesDraft(draft);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  const canonical = kind === GAME_SETTINGS_DRAFT_KIND
    ? canonicalizeGameSettingsDraft(draft)
    : canonicalizeGamepiecesDraft(draft);
  return JSON.stringify(canonical, null, 2);
}
