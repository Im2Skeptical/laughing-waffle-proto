import {
  ensureRecipePriorityState,
  getEnabledRecipeIds,
  isRecipeSystem,
} from "./recipe-priority.js";
import { runEffect } from "./effects/index.js";
import { resolveCosts, canAffordCosts, applyCosts } from "./costs.js";
import { passiveTimingPasses } from "./passive-timing.js";

function normalizeTagRequirement(tagReq) {
  if (Array.isArray(tagReq)) return tagReq;
  if (typeof tagReq === "string" && tagReq.length > 0) return [tagReq];
  return [];
}

export function hasTieredUnits(pool) {
  if (!pool || typeof pool !== "object") return false;
  return (
    Math.max(0, Math.floor(pool.bronze ?? 0)) > 0 ||
    Math.max(0, Math.floor(pool.silver ?? 0)) > 0 ||
    Math.max(0, Math.floor(pool.gold ?? 0)) > 0 ||
    Math.max(0, Math.floor(pool.diamond ?? 0)) > 0
  );
}

export function resolveMaturedPoolBucket(pool, cropId) {
  if (!pool || typeof pool !== "object") return null;
  const hasTierKeys =
    Object.prototype.hasOwnProperty.call(pool, "bronze") ||
    Object.prototype.hasOwnProperty.call(pool, "silver") ||
    Object.prototype.hasOwnProperty.call(pool, "gold") ||
    Object.prototype.hasOwnProperty.call(pool, "diamond");
  if (hasTierKeys) return pool;
  if (typeof cropId !== "string" || cropId.length <= 0) return null;
  const bucket = pool[cropId];
  return bucket && typeof bucket === "object" ? bucket : null;
}

export function hasMaturedPoolForCrop(pool, cropId) {
  const bucket = resolveMaturedPoolBucket(pool, cropId);
  if (bucket) return hasTieredUnits(bucket);
  if (!pool || typeof pool !== "object") return false;
  for (const value of Object.values(pool)) {
    if (!value || typeof value !== "object") continue;
    if (hasTieredUnits(value)) return true;
  }
  return false;
}

export function resolveProcessTypesFromPriorityState(structure, systemId, key) {
  if (!structure || !systemId || !key) return [];
  const systemState = structure?.systemState?.[systemId];
  if (!systemState || typeof systemState !== "object") return [];
  const raw = systemState[key];
  if (!raw || typeof raw !== "object") return [];
  if (isRecipeSystem(systemId) && key === "recipePriority") {
    const priority = ensureRecipePriorityState(systemState, {
      systemId,
      state: null,
      includeLocked: true,
    });
    return getEnabledRecipeIds(priority);
  }
  const ordered = Array.isArray(raw.ordered) ? raw.ordered : [];
  const enabled =
    raw.enabled && typeof raw.enabled === "object" ? raw.enabled : {};
  const out = [];
  for (const entry of ordered) {
    const processType =
      typeof entry === "string" && entry.length > 0 ? entry : null;
    if (!processType) continue;
    if (enabled[processType] === false) continue;
    if (out.includes(processType)) continue;
    out.push(processType);
  }
  return out;
}

export function hasProcess(structure, systemId, type) {
  const sys = structure?.systemState?.[systemId];
  const processes = Array.isArray(sys?.processes) ? sys.processes : [];
  if (!type) return processes.length > 0;
  return processes.some((process) => process && process.type === type);
}

function requirementsPassBase(
  requires,
  seasonKey,
  subject,
  hasPawn,
  isTagUnlocked = null,
  isTagHidden = null
) {
  if (!requires || typeof requires !== "object") return true;

  if (Array.isArray(requires.season) && requires.season.length > 0) {
    if (!seasonKey || !requires.season.includes(seasonKey)) return false;
  }

  if (typeof requires.hasPawn === "boolean" && requires.hasPawn !== hasPawn) {
    return false;
  }

  if (typeof requires.hasSelectedCrop === "boolean") {
    const selectedCropId = subject?.systemState?.growth?.selectedCropId;
    const hasSelected =
      typeof selectedCropId === "string" && selectedCropId.length > 0;
    if (requires.hasSelectedCrop !== hasSelected) return false;
  }

  if (Array.isArray(requires.selectedCropIdIn) && requires.selectedCropIdIn.length > 0) {
    const selectedCropId = subject?.systemState?.growth?.selectedCropId;
    if (
      typeof selectedCropId !== "string" ||
      !requires.selectedCropIdIn.includes(selectedCropId)
    ) {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(requires, "hasEquipment")) {
    return false;
  }

  if (typeof requires.hasMaturedPool === "boolean") {
    const pool = subject?.systemState?.growth?.maturedPool;
    const selectedCropId = subject?.systemState?.growth?.selectedCropId ?? null;
    const hasPool = hasMaturedPoolForCrop(pool, selectedCropId);
    if (requires.hasMaturedPool !== hasPool) return false;
  }

  const requiredTags = normalizeTagRequirement(requires.hasTag);
  if (requiredTags.length > 0) {
    const subjectTags = Array.isArray(subject?.tags) ? subject.tags : [];
    for (const tag of requiredTags) {
      if (!subjectTags.includes(tag)) return false;
      if (isTagUnlocked && !isTagUnlocked(tag)) return false;
      if (isTagHidden && isTagHidden(subject, tag)) return false;
    }
  }

  return true;
}

export function envRequirementsPass(
  requires,
  seasonKey,
  tile,
  hasPawn,
  isTagUnlocked = null,
  isTagHidden = null
) {
  return requirementsPassBase(
    requires,
    seasonKey,
    tile,
    hasPawn,
    isTagUnlocked,
    isTagHidden
  );
}

export function hubRequirementsPass(
  requires,
  seasonKey,
  structure,
  hasPawn,
  isTagUnlocked = null
) {
  if (
    !requirementsPassBase(
      requires,
      seasonKey,
      structure,
      hasPawn,
      isTagUnlocked
    )
  ) {
    return false;
  }
  if (!requires || typeof requires !== "object") return true;

  const processSystem =
    typeof requires.processSystem === "string" ? requires.processSystem : null;
  const processTypePriorityKey =
    typeof requires.processTypeFromSystemPriorityKey === "string"
      ? requires.processTypeFromSystemPriorityKey
      : null;
  const processTypeKey =
    typeof requires.processTypeFromSystemKey === "string"
      ? requires.processTypeFromSystemKey
      : "selectedRecipeId";
  const selectedProcessTypes = processTypePriorityKey
    ? resolveProcessTypesFromPriorityState(
        structure,
        processSystem,
        processTypePriorityKey
      )
    : [];
  const selectedProcessType =
    selectedProcessTypes.length > 0
      ? selectedProcessTypes[0]
      : processSystem && structure?.systemState?.[processSystem]
        ? structure.systemState[processSystem][processTypeKey]
        : null;
  const hasSelectedRecipe =
    typeof selectedProcessType === "string" && selectedProcessType.length > 0;

  if (
    typeof requires.hasSelectedRecipe === "boolean" &&
    requires.hasSelectedRecipe !== hasSelectedRecipe
  ) {
    return false;
  }

  if (requires.hasSelectedProcessType === true) {
    if (!hasSelectedRecipe) return false;
    if (selectedProcessTypes.length > 0) {
      let hasAny = false;
      for (const type of selectedProcessTypes) {
        if (hasProcess(structure, processSystem, type)) {
          hasAny = true;
          break;
        }
      }
      if (!hasAny) return false;
    } else if (!hasProcess(structure, processSystem, selectedProcessType)) {
      return false;
    }
  }

  if (requires.noSelectedProcessType === true) {
    if (selectedProcessTypes.length > 0) {
      for (const type of selectedProcessTypes) {
        if (hasProcess(structure, processSystem, type)) return false;
      }
    } else if (
      hasSelectedRecipe &&
      hasProcess(structure, processSystem, selectedProcessType)
    ) {
      return false;
    }
  }

  if (processSystem) {
    if (requires.hasProcessType) {
      const types = Array.isArray(requires.hasProcessType)
        ? requires.hasProcessType
        : [requires.hasProcessType];
      for (const type of types) {
        if (!hasProcess(structure, processSystem, type)) return false;
      }
    }
    if (requires.noProcessType) {
      const types = Array.isArray(requires.noProcessType)
        ? requires.noProcessType
        : [requires.noProcessType];
      for (const type of types) {
        if (hasProcess(structure, processSystem, type)) return false;
      }
    }
  }

  return true;
}

export function runSubjectTagPassives({
  state,
  tSec,
  tags,
  seasonKey,
  subject,
  hasPawn,
  baseContext,
  getTagDef,
  isTagDisabled,
  buildPassiveKey,
  requirementsPass,
}) {
  for (const tagId of tags) {
    const tagDef = getTagDef(tagId);
    if (!tagDef) continue;
    const tagDisabled = isTagDisabled(tagId);
    const passives = Array.isArray(tagDef.passives) ? tagDef.passives : [];
    for (let passiveIndex = 0; passiveIndex < passives.length; passiveIndex += 1) {
      const passive = passives[passiveIndex];
      if (!passive || typeof passive !== "object") continue;
      const passiveKey = buildPassiveKey(tagId, passive, passiveIndex);
      if (tagDisabled) {
        passiveTimingPasses(passive.timing, state, tSec, {
          passiveKey,
          isActive: false,
        });
        continue;
      }
      const requirementsOk =
        !passive.requires ||
        requirementsPass(passive.requires, seasonKey, subject, hasPawn);
      if (!requirementsOk) {
        passiveTimingPasses(passive.timing, state, tSec, {
          passiveKey,
          isActive: false,
        });
        continue;
      }
      if (
        !passiveTimingPasses(passive.timing, state, tSec, {
          passiveKey,
          isActive: true,
        })
      ) {
        continue;
      }
      if (passive.effect) {
        runEffect(state, passive.effect, { ...baseContext });
      }
    }
  }
}

export function runSubjectTagActorIntents({
  state,
  tags,
  seasonKey,
  subject,
  actors,
  ensureActor,
  getRepeatLimit,
  buildActorContext,
  getTagDef,
  isTagDisabled,
  requirementsPass,
  resolveIntentExecutions,
}) {
  for (const actor of actors) {
    if (!actor) continue;
    if (ensureActor) ensureActor(actor);
    const repeatLimit = Math.max(1, getRepeatLimit(actor));
    for (let iteration = 0; iteration < repeatLimit; iteration += 1) {
      const actorContext = buildActorContext(actor, iteration);
      let executed = false;
      for (const tagId of tags) {
        if (isTagDisabled(tagId)) continue;
        const tagDef = getTagDef(tagId);
        if (!tagDef) continue;
        const intents = Array.isArray(tagDef.intents) ? tagDef.intents : [];
        for (const intent of intents) {
          if (!intent || typeof intent !== "object") continue;
          if (iteration > 0 && intent.repeatByActorWorkUnits !== true) continue;
          if (
            intent.requires &&
            !requirementsPass(intent.requires, seasonKey, subject, true)
          ) {
            continue;
          }
          const executions = resolveIntentExecutions(intent, actorContext, actor);
          for (const execution of executions) {
            if (!execution || typeof execution !== "object") continue;
            if (execution.enabled === false) continue;
            const executionContext =
              execution.context && typeof execution.context === "object"
                ? execution.context
                : actorContext;
            let resolvedIntentCost = null;
            let intentContext = null;
            if (intent.cost) {
              intentContext = {
                ...executionContext,
                intentId: intent.id ?? null,
              };
              const resolved = resolveCosts(intent.cost, intentContext);
              if (!resolved) continue;
              if (!canAffordCosts(resolved, intentContext)) continue;
              resolvedIntentCost = resolved;
            }
            let effectSucceeded = true;
            if (execution.effect) {
              effectSucceeded = runEffect(state, execution.effect, {
                ...executionContext,
              });
            }
            if (!effectSucceeded) continue;
            if (resolvedIntentCost && intentContext) {
              applyCosts(resolvedIntentCost, intentContext);
            }
            executed = true;
            break;
          }
          if (executed) break;
        }
        if (executed) break;
      }
      if (!executed) break;
    }
  }
}
