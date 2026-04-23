// src/controllers/actionmanagers/action-costs.js
// Pure AP cost estimation helpers for planner intents.

import {
  estimatePlannerIntentApCost,
  getCurrencyGroupInfoForIntent,
  getHubPlanAnchorCost,
  getItemQuantity,
  getIntentPlanGroup,
  getPlannerIntentId,
  getTilePlanAnchorCost,
} from "./action-plan-registry.js";

export function estimateIntentApCost(intent, { stateStart } = {}) {
  return estimatePlannerIntentApCost(intent, { stateStart });
}

export function computeIntentCostSummary(intents, ctx = {}) {
  const list = Array.isArray(intents) ? intents : [];
  const byId = {};
  let total = 0;

  const currencyGroups = new Map();
  const tilePlanGroups = new Map();
  const tilePlanIntentIds = new Set();
  const hubPlanGroups = new Map();
  const hubPlanIntentIds = new Set();

  for (const intent of list) {
    if (!intent) continue;
    const info = getCurrencyGroupInfoForIntent(intent);
    if (!info) continue;
    let group = currencyGroups.get(info.key);
    if (!group) {
      group = { net: 0, firstIntent: intent, intentIds: [] };
      currencyGroups.set(info.key, group);
    }
    group.net += info.dir * getItemQuantity(intent.item);
    if (!group.firstIntent) group.firstIntent = intent;
    const key = intent?.id ?? intent?.subjectKey ?? null;
    if (key != null) group.intentIds.push(key);
  }

  for (const intent of list) {
      const planGroup = getIntentPlanGroup(intent);
      if (planGroup?.scope === "tile") {
        const tilePlanKey = `tilePlan:${planGroup.key}`;
        const intentId = getPlannerIntentId(intent);
        if (intentId != null) tilePlanIntentIds.add(intentId);
        const cost = estimateIntentApCost(intent, ctx);
      if (cost > 0 && intentId != null) {
        let group = tilePlanGroups.get(tilePlanKey);
        if (!group) {
          group = { intentIds: [], anchorId: null };
          tilePlanGroups.set(tilePlanKey, group);
        }
        if (!group.intentIds.includes(intentId)) {
          group.intentIds.push(intentId);
        }
        if (!group.anchorId) group.anchorId = intentId;
      }
    }
  }

  for (const intent of list) {
      const planGroup = getIntentPlanGroup(intent);
      if (planGroup?.scope === "hub") {
        const hubPlanKey = `hubPlan:${planGroup.key}`;
        const intentId = getPlannerIntentId(intent);
        if (intentId != null) hubPlanIntentIds.add(intentId);
        const cost = estimateIntentApCost(intent, ctx);
      if (cost > 0 && intentId != null) {
        let group = hubPlanGroups.get(hubPlanKey);
        if (!group) {
          group = { intentIds: [], anchorId: null };
          hubPlanGroups.set(hubPlanKey, group);
        }
        if (!group.intentIds.includes(intentId)) {
          group.intentIds.push(intentId);
        }
        if (!group.anchorId) group.anchorId = intentId;
      }
    }
  }

  for (const intent of list) {
    const cost = estimateIntentApCost(intent, ctx);
    const key = getPlannerIntentId(intent);
    if (key == null) continue;
    if (getCurrencyGroupInfoForIntent(intent)) {
      byId[key] = 0;
      continue;
    }
    if (tilePlanIntentIds.has(key)) {
      byId[key] = 0;
      continue;
    }
    if (hubPlanIntentIds.has(key)) {
      byId[key] = 0;
      continue;
    }
    byId[key] = cost;
    total += cost;
  }

  for (const group of currencyGroups.values()) {
    if (!group || !group.net) continue;
    const firstId = group.intentIds[0] ?? null;
    const baseIntent = group.firstIntent ?? null;
    if (!firstId || !baseIntent) continue;
    const cost = estimateIntentApCost(baseIntent, ctx);
    byId[firstId] = cost;
    total += cost;
  }

  const tilePlanCost = getTilePlanAnchorCost();
  if (tilePlanCost > 0) {
    for (const group of tilePlanGroups.values()) {
      if (!group || !group.intentIds?.length) continue;
      const anchorId = group.anchorId ?? group.intentIds[0] ?? null;
      if (!anchorId) continue;
      byId[anchorId] = tilePlanCost;
      total += tilePlanCost;
    }
  }

  const hubPlanCost = getHubPlanAnchorCost();
  if (hubPlanCost > 0) {
    for (const group of hubPlanGroups.values()) {
      if (!group || !group.intentIds?.length) continue;
      const anchorId = group.anchorId ?? group.intentIds[0] ?? null;
      if (!anchorId) continue;
      byId[anchorId] = hubPlanCost;
      total += hubPlanCost;
    }
  }

  return { total, byId };
}

