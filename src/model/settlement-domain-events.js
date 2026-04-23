function isMissingValue(value) {
  return value == null || value === "";
}

function transformAssignmentValue(transform, value, context) {
  switch (transform) {
    case "floorNonNegative":
      if (!Number.isFinite(value)) return null;
      return Math.max(0, Math.floor(value));
    case "vassalCouncilMemberId": {
      const vassalId =
        typeof context?.target?.vassalId === "string" &&
        context.target.vassalId.length > 0
          ? context.target.vassalId
          : null;
      return vassalId ? `vassal-${vassalId}` : null;
    }
    default:
      return value;
  }
}

function resolveAssignmentValue(rule, context) {
  if (!rule || typeof rule !== "object") return null;
  let value;
  if (Object.prototype.hasOwnProperty.call(rule, "value")) {
    value = rule.value;
  } else if (typeof rule.fromEvent === "string" && rule.fromEvent.length > 0) {
    value = context?.event?.[rule.fromEvent];
  } else {
    value = null;
  }
  if (
    isMissingValue(value) &&
    typeof rule.fallbackTargetField === "string" &&
    rule.fallbackTargetField.length > 0
  ) {
    value = context?.target?.[rule.fallbackTargetField];
  }
  if (typeof rule.transform === "string" && rule.transform.length > 0) {
    value = transformAssignmentValue(rule.transform, value, context);
  }
  return value;
}

export function applyDeclarativeAssignments(target, assignments, context = {}) {
  if (!target || typeof target !== "object") return false;
  let changed = false;
  for (const rule of Array.isArray(assignments) ? assignments : []) {
    if (!rule || typeof rule !== "object") continue;
    const field = typeof rule.field === "string" && rule.field.length > 0 ? rule.field : null;
    if (!field) continue;
    if (rule.onlyIfTargetMissing === true && !isMissingValue(target[field])) {
      continue;
    }
    const nextValue = resolveAssignmentValue(rule, {
      ...context,
      target,
    });
    if (isMissingValue(nextValue) && rule.allowNullish !== true) continue;
    if (rule.onlyIfDifferent === true && target[field] === nextValue) continue;
    if (target[field] === nextValue) continue;
    target[field] = nextValue;
    changed = true;
  }
  return changed;
}
