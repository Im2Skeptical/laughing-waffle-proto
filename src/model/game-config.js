import {
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import { MOON_PHASE_DEFS } from '../defs/gamesettings/moon-phase-defs.js';
import {
  canonicalizeVassalLifeMapGeneratorConfig,
  createAuthoredVassalLifeMapGeneratorConfig,
  validateVassalLifeMapGeneratorConfig,
} from "./vassal-life-map-generator.js";

export const GAME_CONFIG_SCHEMA_VERSION = 16;
export const GAME_SETTINGS_DRAFT_KIND = "gameSettings";
export const GAMEPIECES_DRAFT_KIND = "gamepieces";

const clone = (value) => JSON.parse(JSON.stringify(value));
const scheduleTypes=[...MOON_PHASE_DEFS.map(phase=>phase.id),'season','passive','crisis'];
const seasonKeys=['spring','summer','autumn','winter'];

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
      field("researchSilverFullThreshold", "Silver full-rate Research", 300, 0, 1000000, 1, true),
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
    description: "Consumes hosted Edible Stock after Practice activation, feeds the population, records meal evidence, and marks the unfed share for migration when starvation triggers.",
    fields: Object.freeze([
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
    description: "Resolves arrival meals, hardship among unplaced migrants, elder mortality, and spatial pressure.",
    fields: Object.freeze([
      field("migrationHardshipDeathRate", "Unplaced migrant hardship mortality", 0.8, 0, 1, 0.01),
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

function normalizeTags(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.filter((tag) => typeof tag === "string")
    .map((tag) => tag.trim()).filter(Boolean))];
}

function copyEditableLeaves(template, source, path = []) {
  if (['tags','stockTraits','traits','traitsAny','tagsAny'].includes(path.at(-1))) return normalizeTags(source, template);
  if(path.at(-1)==='activation'&&template.type!=='charge'&&source&&scheduleTypes.includes(source.type)) {
    const activation={...clone(template),type:source.type};
    delete activation.also;delete activation.seasonKeys;delete activation.stage;
    if(source.also?.length)activation.also=[...new Set(source.also.filter(type=>scheduleTypes.includes(type)&&type!==source.type))];
    if(source.seasonKeys?.length)activation.seasonKeys=[...new Set(source.seasonKeys.filter(key=>seasonKeys.includes(key)))];
    if(['preRouting','postRouting'].includes(source.stage))activation.stage=source.stage;
    return activation;
  }
  if(path.at(-1)==='source'&&source)return {...copyEditableLeaves(template,source,path.slice(0,-1)),
    icon:scheduleTypes.includes(source.icon)?source.icon:template.icon,cadence:typeof source.cadence==='string'?source.cadence:template.cadence};
  if (Array.isArray(template)) {
    return template.map((entry, index) => copyEditableLeaves(entry, source?.[index], [...path, index]));
  }
  if (template && typeof template === "object") {
    return Object.fromEntries(
      Object.entries(template).map(([key, entry]) => [
        key,
        copyEditableLeaves(entry, source?.[key], [...path, key]),
      ])
    );
  }
  if (typeof template === "number") {
    return Number.isFinite(source) ? Number(source) : template;
  }
  if (typeof template === "boolean") {
    return typeof source === "boolean" ? source : template;
  }
  if(typeof template==='string'&&typeof source==='string'&&path.some(key=>['label','ui','minimumQuality','triggerText','dischargeText','authoredEffect','authoredHook'].includes(key)))return source;
  return template;
}

export function canonicalizeGamepiecesDraft(value) {
  const authored = createAuthoredGamepiecesDraft();
  const practices=copyEditableLeaves(authored.practices,value?.practices);
  for(const [id,def] of Object.entries(practices)) {
    const source=value?.practices?.[id];
    if(!source)continue;
    const seasonal=[def.activation.type,...(def.activation.also??[])].includes('season');
    def.effects.forEach((effect,index)=>{
      const amounts=source.effects?.[index]?.seasonAmounts;
      if(!seasonal)delete effect.seasonAmounts;
      else if(amounts&&typeof effect.amount==='number')effect.seasonAmounts=Object.fromEntries(Object.entries(amounts).filter(([key,amount])=>seasonKeys.includes(key)&&Number.isFinite(amount)));
    });
  }
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    structures: copyEditableLeaves(authored.structures, value?.structures),
    practices,
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
          { path: ["tags"], type: "tags", label: "Tags" },
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
    if (kind==='practices') for (const [id,def] of Object.entries(value.practices)) {
      if (!['scheduled','charge'].includes(def.mode) || def.lane!==def.mode || (def.mode==='charge')!==(def.activation?.type==='charge')) errors.push(`practices.${id}: invalid mode`);
      if (def.mode==='charge' && (!Number.isInteger(def.charge?.threshold) || def.charge.threshold<1 || !Number.isInteger(def.charge?.gain) || def.charge.gain<1 || !def.charge.trigger?.any?.length)) errors.push(`practices.${id}: invalid Charge grammar`);
      if (def.mode==='charge' && ((def.consume??[]).length || (def.require??[]).length)) errors.push(`practices.${id}: Charge cannot consume or require Stock`);
      if(def.mode==='scheduled'&&(!scheduleTypes.includes(def.activation?.type)
        ||(def.activation.also!==undefined&&(!Array.isArray(def.activation.also)||def.activation.also.some(type=>!scheduleTypes.includes(type))))
        ||(def.activation.seasonKeys!==undefined&&(!Array.isArray(def.activation.seasonKeys)||!def.activation.seasonKeys.length||def.activation.seasonKeys.some(key=>!seasonKeys.includes(key))))))errors.push(`practices.${id}: invalid schedule`);
      for(const effect of def.effects??[])if(effect.seasonAmounts&&Object.entries(effect.seasonAmounts).some(([key,amount])=>!seasonKeys.includes(key)||!Number.isFinite(amount)||amount<0))errors.push(`practices.${id}: invalid seasonal amounts`);
      for (const cost of [...(def.consume??[]),...(def.require??[])]) if (!Number.isInteger(cost.amount)||cost.amount<0||!cost.traits?.length||cost.traits.includes('Charge')) errors.push(`practices.${id}: invalid Stock input`);
    }
  }
  for (const group of getGamepieceEditorGroups(value)) {
    for (const entry of group.fields) {
      const current = getAtPath(value, entry.path);
      if (entry.type === "tags") {
        if (!Array.isArray(current) || current.some((tag) => typeof tag !== "string" || !tag.trim())) {
          errors.push(`${entry.path.join(".")}: expected non-empty tag strings`);
        }
        continue;
      }
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
      if (key === "footprint" && (current < 1 || current > 3)) errors.push(`${entry.path.join(".")}: expected 1–3 cells`);
      if (current < 0) errors.push(`${entry.path.join(".")}: expected zero or greater`);
      if ((["workerCapacity", "workerCapacityPerQuality", "chargePeriodMoons", "footprint", "durationResolutions", "maximumResolutions"].includes(key)) && !Number.isInteger(current)) {
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
