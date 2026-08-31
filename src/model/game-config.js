import {
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import {
  canonicalizeVassalLifeMapGeneratorConfig,
  createAuthoredVassalLifeMapGeneratorConfig,
  validateVassalLifeMapGeneratorConfig,
} from "./vassal-life-map-generator.js";

export const GAME_CONFIG_SCHEMA_VERSION = 10;
export const GAME_SETTINGS_DRAFT_KIND = "gameSettings";
export const GAMEPIECES_DRAFT_KIND = "gamepieces";

const clone = (value) => JSON.parse(JSON.stringify(value));

export const GAME_SETTING_EDITOR_SECTIONS = Object.freeze([
  Object.freeze({
    id: "clockwork",
    label: "Clockwork",
    description: "The seasonal and lunar clocks remain independent. A full moon turn contains all six lunar phases.",
    fields: Object.freeze([
      field("seasonDurationSec", "Season duration (seconds)", 8, 1, 120, 1, true),
      field("phaseDurationSec", "Moon phase duration (seconds)", 1, 1, 20, 1, true),
    ]),
  }),
  Object.freeze({
    id: "workers",
    label: "Shared population and workers",
    description: "These values are shared by practices regardless of their activation phase.",
    fields: Object.freeze([
      field("populationPerToken", "Population per worker token", 10, 1, 1000, 1, true),
      field("villagerEffectiveness", "Villager effectiveness", 1, 0, 100, 0.1),
      field("strangerEffectiveness", "Stranger effectiveness", 0.5, 0, 100, 0.1),
    ]),
  }),
  Object.freeze({
    id: "civilizationResearch",
    label: "Civilization Research",
    description: "Cumulative Research unlocks content and biases shop quality. Starting Research is a fresh-run debug control.",
    fields: Object.freeze([
      field("startingResearch", "Starting Research (debug)", 0, 0, 1000000, 1, true),
      field("researchSilverThreshold", "Silver unlock Research", 100, 0, 1000000, 1, true),
      field("researchGoldThreshold", "Gold unlock Research", 500, 0, 1000000, 1, true),
      field("researchDiamondThreshold", "Diamond unlock Research", 2000, 0, 1000000, 1, true),
      field("practiceReactionResolutionCap", "Practice reaction hard cap", 200, 20, 10000, 1, true),
    ]),
  }),
  Object.freeze({
    id: "birthPhase",
    label: "1. Birth phase",
    description: "Finishes construction, rolls births, matures children, and promotes adults into the Elder Order.",
    fields: Object.freeze([
      field("birthRateBronze", "Birth chance: Bronze", 0, 0, 1, 0.01),
      field("birthRateSilver", "Birth chance: Silver", 0, 0, 1, 0.005),
      field("birthRateGold", "Birth chance: Gold", 0.02, 0, 1, 0.005),
      field("birthRateDiamond", "Birth chance: Diamond", 0.04, 0, 1, 0.005),
      field("childToAdultRate", "Child-to-adult chance", 0.01, 0, 1, 0.005),
      field("adultToElderRate", "Adult-to-elder chance", 0.005, 0, 1, 0.005),
      field("newElderAge", "New elder age", 45, 1, 200, 1, true),
    ]),
  }),
  Object.freeze({
    id: "foodPhase",
    label: "2. Food phase",
    description: "Runs Administration, feeds the population, records meal evidence, and marks the unfed share for migration when starvation triggers.",
    fields: Object.freeze([
      field("childMealConsumption", "Food per child", 0.5, 0, 100, 0.05),
      field("adultMealConsumption", "Food per adult", 1, 0, 100, 0.05),
      field("elderMealConsumption", "Food per elder", 1, 0, 100, 0.05),
      field("fullFeedStreakForIncrease", "Full meals for happiness increase", 12, 1, 100, 1, true),
      field("partialFeedMinimumRatio", "Immediate happiness-loss feed ratio", 0.5, 0, 1, 0.01),
      field("partialFeedMemoryLength", "Improving partial meals required", 12, 1, 100, 1, true),
      field("missedFeedStreakForStarvation", "Missed meals before starvation", 3, 1, 100, 1, true),
    ]),
  }),
  Object.freeze({
    id: "housingPhase",
    label: "3. Housing phase",
    description: "Caps happiness when overcrowded and adds the unhoused overflow to the shared migrant population.",
    fields: Object.freeze([
      field("overHousingNegativeRatio", "Population/capacity for negative housing", 1.2, 1, 100, 0.05),
    ]),
  }),
  Object.freeze({
    id: "faithPhase",
    label: "4. Faith phase",
    description: "Applies happiness evidence, shifts faith, displaces collapsed Bronze populations, and resolves chaos.",
    fields: Object.freeze([
      field("faithStreakForShift", "Faith outcomes for tier shift", 3, 1, 100, 1, true),
      field("bronzeCollapseLossRate", "Bronze collapse displacement", 0.25, 0, 1, 0.01),
      field("prematureDeathChaosWeight", "Chaos per premature death", 5, 0, 100000, 0.05),
      field("externalEmigrationChaosWeight", "Chaos per external emigrant", 1, 0, 100000, 0.05),
      field("oldAgeDeathChaosWeight", "Chaos per old-age death", 0, 0, 100000, 0.05),
      field("internalMigrationChaosWeight", "Chaos per internal migrant", 0, 0, 100000, 0.05),
      field("primordialBasePressure", "Primordial base pressure", 100, 0, 1000000000, 0.05),
      field("primordialGrowthFactor", "Primordial growth factor", 1.03, 1, 100, 0.001),
      field("primordialGrowthCadenceYears", "Primordial growth cadence (years)", 12, 1, 100000, 1, true),
      field("bronzeChaosResistancePopulation", "Bronze people per Chaos resistance", 10, 1, 100000, 1, true),
      field("silverChaosResistancePopulation", "Silver people per Chaos resistance", 5, 1, 100000, 1, true),
      field("goldChaosResistancePopulation", "Gold people per Chaos resistance", 2, 1, 100000, 1, true),
      field("diamondChaosResistancePopulation", "Diamond people per Chaos resistance", 1, 1, 100000, 1, true),
      field("chaosPerMonster", "Chaos per monster", 10, 1, 1000000, 1, true),
      field("monsterLossThreshold", "Monster loss threshold", 100, 1, 10000000, 1, true),
    ]),
  }),
  Object.freeze({
    id: "migrationPhase",
    label: "5. Migration phase",
    description: "All migration causes share one bucket. Destinations are chosen from current food need and available housing; there are no independent numeric tunables for this phase.",
    fields: Object.freeze([]),
  }),
  Object.freeze({
    id: "greenAscendancy",
    label: "Green Ascendancy",
    description: "An external escalation clock. Forced tier is for debug only and never depends on Chaos.",
    fields: Object.freeze([
      booleanField("greenAutomaticTier", "Automatic Green tier", true),
      field("greenForcedTier", "Forced Green tier (0-3)", 0, 0, 3, 1, true),
      field("greenCadenceYears", "Years per Green tier", 100, 1, 100000, 1, true),
      field("greenStoredDecayReductionI", "Green I stored-food decay reduction (%)", 25, 0, 100, 1),
      field("greenStoredDecayReductionII", "Green II stored-food decay reduction (%)", 50, 0, 100, 1),
      field("greenStoredDecayReductionIII", "Green III stored-food decay reduction (%)", 75, 0, 100, 1),
      field("greenElderMortalityReductionI", "Green I elder mortality reduction (%)", 20, 0, 100, 1),
      field("greenElderMortalityReductionII", "Green II elder mortality reduction (%)", 40, 0, 100, 1),
      field("greenElderMortalityReductionIII", "Green III elder mortality reduction (%)", 60, 0, 100, 1),
      field("greenMigrationSuccessI", "Green I migration success (%)", 90, 0, 100, 1),
      field("greenMigrationSuccessII", "Green II migration success (%)", 75, 0, 100, 1),
      field("greenMigrationSuccessIII", "Green III migration success (%)", 60, 0, 100, 1),
    ]),
  }),
  Object.freeze({
    id: "deathPhase",
    label: "6. Death phase",
    description: "Resolves arrival meals, hardship among unplaced migrants, elder mortality, and food rot.",
    fields: Object.freeze([
      field("migrationHardshipDeathRate", "Unplaced migrant hardship mortality", 0.8, 0, 1, 0.01),
      field("elderMortalityThrough49", "Elder mortality through 49", 0.0025, 0, 1, 0.0025),
      field("elderMortality50To54", "Elder mortality 50-54", 0.005, 0, 1, 0.005),
      field("elderMortality55To59", "Elder mortality 55-59", 0.015, 0, 1, 0.005),
      field("elderMortality60To64", "Elder mortality 60-64", 0.04, 0, 1, 0.01),
      field("elderMortality65To69", "Elder mortality 65-69", 0.08, 0, 1, 0.01),
      field("elderMortality70To74", "Elder mortality 70-74", 0.16, 0, 1, 0.01),
      field("elderMortality75Plus", "Elder mortality 75+", 0.3, 0, 1, 0.01),
      field("storedFoodDecayRate", "Stored food decay", 0.1, 0, 1, 0.01),
      field("looseFoodDecayRate", "Loose food decay", 0.75, 0, 1, 0.01),
    ]),
  }),
  Object.freeze({
    id: "order",
    label: "Elder Order",
    description: "Elder cohort simulation remains independent of the Vassal Life Map.",
    fields: Object.freeze([
      field("elderPrestigeBaseAge", "Elder prestige base age", 44, 0, 200, 1, true),
      field("resistancePerAdditionalElder", "Resistance per additional elder", 2, 0, 10000, 1, true),
    ]),
  }),
]);

function field(id, label, defaultValue, min, max, step, integer = false) {
  return Object.freeze({ id, label, defaultValue, min, max, step, integer, type: "number" });
}

function booleanField(id, label, defaultValue) {
  return Object.freeze({ id, label, defaultValue, type: "boolean" });
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
        entry.type === "boolean"
          ? (typeof source[entry.id] === "boolean" ? source[entry.id] : entry.defaultValue)
          : (Number.isFinite(source[entry.id]) ? Number(source[entry.id]) : entry.defaultValue),
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
    if (entry.type === "boolean") {
      if (typeof current !== "boolean") errors.push(`${entry.id}: expected a boolean`);
      continue;
    }
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
  return { ok: errors.length === 0, errors };
}

export function createAuthoredGamepiecesDraft() {
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    structures: clone(settlementStructureDefs),
    practices: clone(detailedSettlementPracticeDefs),
  };
}

function copyEditableLeaves(template, source) {
  if (Array.isArray(template)) {
    return template.map((entry, index) => copyEditableLeaves(entry, source?.[index]));
  }
  if (template && typeof template === "object") {
    return Object.fromEntries(
      Object.entries(template).map(([key, entry]) => [
        key,
        copyEditableLeaves(entry, source?.[key]),
      ])
    );
  }
  if (typeof template === "number") {
    return Number.isFinite(source) ? Number(source) : template;
  }
  if (typeof template === "boolean") {
    return typeof source === "boolean" ? source : template;
  }
  return template;
}

export function canonicalizeGamepiecesDraft(value) {
  const authored = createAuthoredGamepiecesDraft();
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    structures: copyEditableLeaves(authored.structures, value?.structures),
    practices: copyEditableLeaves(authored.practices, value?.practices),
  };
}

function collectNumericLeafPaths(value, prefix = [], result = []) {
  if (typeof value === "number") {
    result.push({ path: prefix, type: "number" });
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

function collectDeclaredEditorFields(definition) {
  return (definition?.editor?.fields ?? []).map((entry) => ({
    path: Array.isArray(entry?.path) ? entry.path : [],
    type: entry?.type,
    label: entry?.label,
  })).filter((entry) =>
    entry.path.length > 0
    && entry.type === "boolean"
    && typeof entry.label === "string"
    && entry.label.length > 0
  );
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
        fields: [
          ...collectNumericLeafPaths(definition),
          ...collectDeclaredEditorFields(definition),
        ].map(({ path, type, label }) => ({
          path: [kind, id, ...path],
          id: path.join("."),
          type,
          label: label ?? path
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
      if (entry.type === "boolean") {
        if (typeof current !== "boolean") {
          errors.push(`${entry.path.join(".")}: expected a boolean`);
        }
        continue;
      }
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
    lifeMapGenerator: createAuthoredVassalLifeMapGeneratorConfig(),
  };
}

export function canonicalizeGameConfig(value) {
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    settings: canonicalizeGameSettingsDraft(value?.settings),
    gamepieces: canonicalizeGamepiecesDraft(value?.gamepieces),
    lifeMapGenerator: canonicalizeVassalLifeMapGeneratorConfig(value?.lifeMapGenerator),
  };
}

export function validateGameConfig(value) {
  const settings = validateGameSettingsDraft(value?.settings);
  const gamepieces = validateGamepiecesDraft(value?.gamepieces);
  const lifeMapGenerator = validateVassalLifeMapGeneratorConfig(value?.lifeMapGenerator);
  const errors = [
    ...settings.errors.map((error) => `settings.${error}`),
    ...gamepieces.errors.map((error) => `gamepieces.${error}`),
    ...lifeMapGenerator.errors.map((error) => `lifeMapGenerator.${error}`),
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

export function getBooleanGameSetting(state, id) {
  const fallback = SETTING_FIELD_BY_ID[id]?.defaultValue;
  const value = state?.gameConfig?.settings?.values?.[id];
  return typeof value === "boolean" ? value : fallback === true;
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
