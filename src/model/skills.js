// skills.js
// Settlement baseline skill boundary.
//
// The old skill tree/editor data is no longer part of this prototype. This
// module keeps the existing runtime API shape so legacy callers can remain
// inert while the current settlement flow boots without no-op def stubs.

const PAWN_SKILL_MOD_DEFAULTS = Object.freeze({
  forageTierBonus: 0,
  forageStaminaCostDelta: 0,
  farmingStaminaCostDelta: 0,
  restStaminaBonusFlat: 0,
  restStaminaBonusMult: 1,
});

const GLOBAL_SKILL_MOD_DEFAULTS = Object.freeze({
  apCapBonus: 0,
  editableHistoryWindowBonusSec: 0,
  projectionHorizonBonusSec: 0,
  populationFoodMult: 1,
});

function makeSkillRuntime() {
  return {
    modifiers: {
      global: { ...GLOBAL_SKILL_MOD_DEFAULTS },
      pawnById: {},
    },
    unlocks: {
      recipes: [],
      hubStructures: [],
      envTags: [],
      hubTags: [],
      features: [],
      itemTags: [],
    },
  };
}

function getPawnRuntimeKey(pawnId) {
  if (pawnId == null) return null;
  const asNum = Number(pawnId);
  if (Number.isFinite(asNum)) return String(Math.floor(asNum));
  return String(pawnId);
}

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeNumberMap(raw, defaults) {
  const out = { ...defaults };
  const source = ensureObject(raw);
  for (const key of Object.keys(defaults)) {
    if (Number.isFinite(source[key])) out[key] = source[key];
  }
  return out;
}

function normalizeStringList(raw) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.filter((id) => typeof id === "string" && id.length))
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeSkillRuntimeShape(runtime) {
  const safe = ensureObject(runtime);
  const modifiers = ensureObject(safe.modifiers);
  const unlocks = ensureObject(safe.unlocks);
  const pawnById = {};

  for (const [pawnId, entry] of Object.entries(ensureObject(modifiers.pawnById))) {
    pawnById[pawnId] = normalizeNumberMap(entry, PAWN_SKILL_MOD_DEFAULTS);
  }

  return {
    modifiers: {
      global: normalizeNumberMap(modifiers.global, GLOBAL_SKILL_MOD_DEFAULTS),
      pawnById,
    },
    unlocks: {
      recipes: normalizeStringList(unlocks.recipes),
      hubStructures: normalizeStringList(unlocks.hubStructures),
      envTags: normalizeStringList(unlocks.envTags),
      hubTags: normalizeStringList(unlocks.hubTags),
      features: normalizeStringList(unlocks.features),
      itemTags: normalizeStringList(unlocks.itemTags),
    },
  };
}

function withRuntimeSkillState(state) {
  if (!state || typeof state !== "object") return makeSkillRuntime();
  state.skillRuntime = normalizeSkillRuntimeShape(state.skillRuntime);
  return state.skillRuntime;
}

function getRuntimePawnModifierEntry(runtime, pawnId, create = false) {
  const pawnKey = getPawnRuntimeKey(pawnId);
  if (!pawnKey) return null;
  if (!runtime.modifiers.pawnById[pawnKey]) {
    if (!create) return null;
    runtime.modifiers.pawnById[pawnKey] = { ...PAWN_SKILL_MOD_DEFAULTS };
  }
  return runtime.modifiers.pawnById[pawnKey];
}

function getGlobalDefault(key, fallback = 0) {
  return Object.prototype.hasOwnProperty.call(GLOBAL_SKILL_MOD_DEFAULTS, key)
    ? GLOBAL_SKILL_MOD_DEFAULTS[key]
    : fallback;
}

function getPawnDefault(key, fallback = 0) {
  return Object.prototype.hasOwnProperty.call(PAWN_SKILL_MOD_DEFAULTS, key)
    ? PAWN_SKILL_MOD_DEFAULTS[key]
    : fallback;
}

function addModifier(entry, key, amount, defaults) {
  if (typeof key !== "string" || !Number.isFinite(amount)) return false;
  const current = Number.isFinite(entry[key]) ? entry[key] : defaults[key] ?? 0;
  const next = current + amount;
  entry[key] = next;
  return next !== current;
}

function multiplyModifier(entry, key, factor, defaults) {
  if (typeof key !== "string" || !Number.isFinite(factor)) return false;
  const current = Number.isFinite(entry[key]) ? entry[key] : defaults[key] ?? 1;
  const next = current * factor;
  entry[key] = next;
  return next !== current;
}

function grantUnlock(state, key, id) {
  if (typeof id !== "string" || !id.length) return false;
  const runtime = withRuntimeSkillState(state);
  const list = Array.isArray(runtime.unlocks[key]) ? runtime.unlocks[key] : [];
  if (list.includes(id)) return false;
  list.push(id);
  list.sort((a, b) => a.localeCompare(b));
  runtime.unlocks[key] = list;
  return true;
}

function revokeUnlock(state, key, id) {
  if (typeof id !== "string" || !id.length) return false;
  const runtime = withRuntimeSkillState(state);
  const list = Array.isArray(runtime.unlocks[key]) ? runtime.unlocks[key] : [];
  const next = list.filter((entry) => entry !== id);
  if (next.length === list.length) return false;
  runtime.unlocks[key] = next;
  return true;
}

export function ensureSkillRuntimeState(state) {
  return withRuntimeSkillState(state);
}

export function addGlobalSkillModifier(state, key, amount) {
  const runtime = withRuntimeSkillState(state);
  return addModifier(runtime.modifiers.global, key, amount, GLOBAL_SKILL_MOD_DEFAULTS);
}

export function multiplyGlobalSkillModifier(state, key, factor) {
  const runtime = withRuntimeSkillState(state);
  return multiplyModifier(
    runtime.modifiers.global,
    key,
    factor,
    GLOBAL_SKILL_MOD_DEFAULTS
  );
}

export function addPawnSkillModifier(state, pawnId, key, amount) {
  const runtime = withRuntimeSkillState(state);
  const entry = getRuntimePawnModifierEntry(runtime, pawnId, true);
  return entry
    ? addModifier(entry, key, amount, PAWN_SKILL_MOD_DEFAULTS)
    : false;
}

export function multiplyPawnSkillModifier(state, pawnId, key, factor) {
  const runtime = withRuntimeSkillState(state);
  const entry = getRuntimePawnModifierEntry(runtime, pawnId, true);
  return entry
    ? multiplyModifier(entry, key, factor, PAWN_SKILL_MOD_DEFAULTS)
    : false;
}

export function grantSkillRecipeUnlock(state, recipeId) {
  return grantUnlock(state, "recipes", recipeId);
}

export function revokeSkillRecipeUnlock(state, recipeId) {
  return revokeUnlock(state, "recipes", recipeId);
}

export function grantSkillHubStructureUnlock(state, hubStructureId) {
  return grantUnlock(state, "hubStructures", hubStructureId);
}

export function revokeSkillHubStructureUnlock(state, hubStructureId) {
  return revokeUnlock(state, "hubStructures", hubStructureId);
}

export function grantSkillEnvTagUnlock(state, tagId) {
  return grantUnlock(state, "envTags", tagId);
}

export function revokeSkillEnvTagUnlock(state, tagId) {
  return revokeUnlock(state, "envTags", tagId);
}

export function grantSkillHubTagUnlock(state, tagId) {
  return grantUnlock(state, "hubTags", tagId);
}

export function revokeSkillHubTagUnlock(state, tagId) {
  return revokeUnlock(state, "hubTags", tagId);
}

export function grantSkillItemTagUnlock(state, tagId) {
  return grantUnlock(state, "itemTags", tagId);
}

export function revokeSkillItemTagUnlock(state, tagId) {
  return revokeUnlock(state, "itemTags", tagId);
}

export function grantSkillFeatureUnlock(state, featureId) {
  return grantUnlock(state, "features", featureId);
}

export function revokeSkillFeatureUnlock(state, featureId) {
  return revokeUnlock(state, "features", featureId);
}

export function getGlobalSkillModifier(state, key, fallback = 0) {
  const runtime = withRuntimeSkillState(state);
  const value = runtime.modifiers.global?.[key];
  return Number.isFinite(value) ? value : getGlobalDefault(key, fallback);
}

export function getPawnSkillModifier(state, pawnId, key, fallback = 0) {
  const runtime = withRuntimeSkillState(state);
  const entry = getRuntimePawnModifierEntry(runtime, pawnId, false);
  const value = entry?.[key];
  return Number.isFinite(value) ? value : getPawnDefault(key, fallback);
}

export function getSkillTrees() {
  return {};
}

export function getSkillNodes() {
  return {};
}

export function getSkillTreeDefs() {
  return {};
}

export function getSkillNodeDef() {
  return null;
}

export function getSkillTreeDef() {
  return null;
}

export function getDefaultSkillPointsForPawnDefId() {
  return 0;
}

export function getSkillNodeUnlockEffects(nodeDef) {
  const effects = nodeDef?.onUnlock;
  if (!effects) return [];
  if (Array.isArray(effects)) return effects.filter((entry) => entry && typeof entry === "object");
  return typeof effects === "object" ? [effects] : [];
}

export function getUnlockedSkillSet() {
  return new Set();
}

export function hasUnlockedSkillNode() {
  return false;
}

export function getLeaderInventorySectionCapabilities() {
  return {
    equipment: false,
    systems: false,
    prestige: false,
    workers: false,
    skills: false,
    build: false,
  };
}

export function evaluateSkillNodeUnlock() {
  return { ok: false, reason: "skillsRemoved" };
}

export function getUnlockableSkillNodes() {
  return [];
}

export function computePawnSkillMods(state, pawnId) {
  const runtime = withRuntimeSkillState(state);
  return {
    ...PAWN_SKILL_MOD_DEFAULTS,
    ...(getRuntimePawnModifierEntry(runtime, pawnId, false) ?? {}),
  };
}

export function computeGlobalSkillMods(state) {
  const runtime = withRuntimeSkillState(state);
  return {
    ...GLOBAL_SKILL_MOD_DEFAULTS,
    ...runtime.modifiers.global,
    unlockedRecipes: new Set(runtime.unlocks.recipes),
    unlockedHubStructures: new Set(runtime.unlocks.hubStructures),
    unlockedEnvTags: new Set(runtime.unlocks.envTags),
    unlockedHubTags: new Set(runtime.unlocks.hubTags),
    unlockedFeatures: new Set(runtime.unlocks.features),
    unlockedItemTags: new Set(runtime.unlocks.itemTags),
  };
}

export function computeAvailableRecipesAndBuildings() {
  return {
    recipeIds: new Set(),
    hubStructureIds: new Set(),
  };
}

export function hasEnvTagUnlock() {
  return false;
}

export function hasHubTagUnlock() {
  return false;
}

export function hasItemTagUnlock() {
  return false;
}

export function hasSkillFeatureUnlock() {
  return false;
}

export function getSkillTreeLayout(treeId) {
  return {
    treeId,
    positionsByNodeId: {},
    depthByNodeId: {},
    orderedNodeIds: [],
    edges: [],
  };
}

export function getDeterministicSkillCommitOrder(_treeId, nodeIds) {
  if (!Array.isArray(nodeIds)) return [];
  return Array.from(
    new Set(nodeIds.filter((id) => typeof id === "string" && id.length))
  ).sort((a, b) => a.localeCompare(b));
}

export function validateSkillDefs() {
  return { ok: true, errors: [], warnings: [] };
}
