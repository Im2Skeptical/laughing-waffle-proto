import {
  HEIRLOOM_CARRY_SLOTS,
  HEIRLOOM_EQUIPPED_SLOTS,
  HEIRLOOM_VAULT_SLOTS,
  VASSAL_HEIRLOOM_DEFS,
  VASSAL_HEIRLOOM_DEFINITION_IDS,
  VASSAL_HEIRLOOM_INHERITANCE_STATES,
  VASSAL_HEIRLOOM_QUALITIES,
  VASSAL_HEIRLOOM_TUNING,
  getHeirloomDefinition,
  getHeirloomInheritanceLabel,
  getHeirloomQualityLabel,
} from "../../defs/gamepieces/vassal-heirloom-defs.js";
import { VASSAL_LIFE_TUNING } from "../../defs/gamepieces/vassal-life-map-defs.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createEmptyHeirloomSlots(count) {
  return Array.from({ length: Math.max(0, Math.floor(count ?? 0)) }, () => null);
}

export function createEmptyHeirloomInventory() {
  return {
    equipped: createEmptyHeirloomSlots(HEIRLOOM_EQUIPPED_SLOTS),
    carry: createEmptyHeirloomSlots(HEIRLOOM_CARRY_SLOTS),
  };
}

export function createEmptyHeirloomVault() {
  return createEmptyHeirloomSlots(HEIRLOOM_VAULT_SLOTS);
}

export function listHeirloomSlots(slots = []) {
  return (Array.isArray(slots) ? slots : []).map((item) => item ?? null);
}

function occupiedItems(slots = []) {
  return listHeirloomSlots(slots).filter(Boolean);
}

export function getHeirloomVault(state) {
  return listHeirloomSlots(state?.civilization?.heirloomVault);
}

export function getVassalHeirloomInventory(vassal) {
  return {
    equipped: listHeirloomSlots(vassal?.heirlooms?.equipped).slice(0, HEIRLOOM_EQUIPPED_SLOTS),
    carry: listHeirloomSlots(vassal?.heirlooms?.carry).slice(0, HEIRLOOM_CARRY_SLOTS),
  };
}

function lineageOf(state) {
  return state?.civilization?.vassalLineage ?? null;
}

function nextInstanceId(state) {
  const lineage = lineageOf(state);
  const idNumber = Math.max(1, Math.floor(lineage?.nextHeirloomInstanceId ?? 1));
  if (lineage) lineage.nextHeirloomInstanceId = idNumber + 1;
  return `heirloom-${idNumber}`;
}

export function createHeirloomInstance(state, definitionId, inheritanceState = "sanctified") {
  const def = getHeirloomDefinition(definitionId);
  if (!def) return null;
  const stateId = VASSAL_HEIRLOOM_INHERITANCE_STATES.includes(inheritanceState)
    ? inheritanceState : "sanctified";
  return {
    instanceId: nextInstanceId(state),
    definitionId: def.id,
    inheritanceState: stateId,
    protectionSpent: false,
  };
}

export function presentHeirloom(item) {
  if (!item) return null;
  const def = getHeirloomDefinition(item.definitionId);
  if (!def) return null;
  return {
    instanceId: item.instanceId,
    definitionId: def.id,
    label: def.label,
    quality: def.quality,
    qualityLabel: getHeirloomQualityLabel(def.quality),
    description: def.description,
    inheritanceState: item.inheritanceState ?? "unmarked",
    inheritanceLabel: getHeirloomInheritanceLabel(item.inheritanceState),
    protectionSpent: item.protectionSpent === true,
    effects: { ...def.effects },
  };
}

function collectOwnedItems(state, vassal = null) {
  const lineage = lineageOf(state);
  const inventory = getVassalHeirloomInventory(vassal);
  return [
    ...getHeirloomVault(state),
    ...inventory.equipped,
    ...inventory.carry,
    ...(lineage?.pendingVaultOverflow ?? []),
  ].filter(Boolean);
}

export function getOwnedHeirloomDefinitionIds(state, vassal = null) {
  return new Set(collectOwnedItems(state, vassal).map((item) => item.definitionId));
}

export function getEquippedHeirloomModifiers(vassal) {
  const mods = {
    patronageNodePrestige: 0,
    travelCostMultiplier: 1,
    nodeDevelopment: 0,
    firstInterventionDiscount: 0,
    bonusCunning: 0,
    bonusIntelligence: 0,
    patronageOptionMultiplier: 1,
    travelNodeDevelopment: 0,
    extraShopOffers: 0,
    hourglassFirstActionMultiplier: 1,
    wisdomDevelopmentMultiplier: 1,
    allTimeCostMultiplier: 1,
    hasMandate: false,
    mandateSpent: false,
  };
  for (const item of getVassalHeirloomInventory(vassal).equipped) {
    const def = getHeirloomDefinition(item?.definitionId);
    const effects = def?.effects ?? {};
    mods.patronageNodePrestige += Math.max(0, Math.floor(effects.patronageNodePrestige ?? 0));
    mods.nodeDevelopment += Math.max(0, Math.floor(effects.nodeDevelopment ?? 0));
    mods.travelNodeDevelopment += Math.max(0, Math.floor(effects.travelNodeDevelopment ?? 0));
    mods.bonusCunning += Math.max(0, Math.floor(effects.bonusCunning ?? 0));
    mods.bonusIntelligence += Math.max(0, Math.floor(effects.bonusIntelligence ?? 0));
    mods.extraShopOffers += Math.max(0, Math.floor(effects.extraShopOffers ?? 0));
    if (Number.isFinite(effects.travelCostMultiplier)) {
      mods.travelCostMultiplier = Math.min(mods.travelCostMultiplier, effects.travelCostMultiplier);
    }
    if (Number.isFinite(effects.firstInterventionDiscount)) {
      mods.firstInterventionDiscount = Math.max(
        mods.firstInterventionDiscount, effects.firstInterventionDiscount
      );
    }
    if (Number.isFinite(effects.patronageOptionMultiplier)) {
      mods.patronageOptionMultiplier = Math.max(
        mods.patronageOptionMultiplier, effects.patronageOptionMultiplier
      );
    }
    if (Number.isFinite(effects.hourglassFirstActionMultiplier)) {
      mods.hourglassFirstActionMultiplier = Math.min(
        mods.hourglassFirstActionMultiplier, effects.hourglassFirstActionMultiplier
      );
    }
    if (Number.isFinite(effects.wisdomDevelopmentMultiplier)) {
      mods.wisdomDevelopmentMultiplier = Math.max(
        mods.wisdomDevelopmentMultiplier, effects.wisdomDevelopmentMultiplier
      );
    }
    if (Number.isFinite(effects.allTimeCostMultiplier)) {
      mods.allTimeCostMultiplier = Math.min(
        mods.allTimeCostMultiplier, effects.allTimeCostMultiplier
      );
    }
    if (effects.mandateOfHeaven === true) {
      mods.hasMandate = true;
      if (item.protectionSpent === true) mods.mandateSpent = true;
    }
  }
  return mods;
}

export function getMandateHeirloom(vassal) {
  return getVassalHeirloomInventory(vassal).equipped.find((item) =>
    getHeirloomDefinition(item?.definitionId)?.effects?.mandateOfHeaven === true
  ) ?? null;
}

export function spendMandateProtection(vassal) {
  const item = getMandateHeirloom(vassal);
  if (!item || item.protectionSpent === true) return false;
  item.protectionSpent = true;
  return true;
}

function firstEmptyIndex(slots) {
  return slots.findIndex((item) => !item);
}

function rollHeirloomQuality(state, eligible) {
  const present = new Set(eligible.map((def) => def.quality));
  const weights = VASSAL_HEIRLOOM_QUALITIES.map((quality) =>
    present.has(quality) ? Math.max(0, VASSAL_HEIRLOOM_TUNING.rarityWeights[quality] ?? 0) : 0
  );
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return eligible[0]?.quality ?? "bronze";
  let roll = state.rngNextVassalFloat() * total;
  for (let index = 0; index < VASSAL_HEIRLOOM_QUALITIES.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return VASSAL_HEIRLOOM_QUALITIES[index];
  }
  return VASSAL_HEIRLOOM_QUALITIES.at(-1);
}

function pickHeirloomDefinition(state, excludedIds) {
  const eligible = VASSAL_HEIRLOOM_DEFINITION_IDS
    .map((id) => VASSAL_HEIRLOOM_DEFS[id])
    .filter((def) => def && !excludedIds.has(def.id));
  if (!eligible.length) return null;
  const quality = rollHeirloomQuality(state, eligible);
  const pool = eligible.filter((def) => def.quality === quality);
  const pickFrom = pool.length ? pool : eligible;
  return pickFrom[state.rngNextVassalInt(0, pickFrom.length - 1)] ?? null;
}

export function generateRelicOffers(state, vassal) {
  const excluded = getOwnedHeirloomDefinitionIds(state, vassal);
  const phaseCost = VASSAL_LIFE_TUNING.relicChoicePhaseCost;
  const offers = [];
  for (let index = 0; index < VASSAL_HEIRLOOM_TUNING.offerCount; index += 1) {
    const def = pickHeirloomDefinition(state, excluded);
    if (!def) break;
    excluded.add(def.id);
    offers.push({
      id: `relic:${def.id}`,
      definitionId: def.id,
      label: def.label,
      quality: def.quality,
      description: def.description,
      inheritanceState: "sanctified",
      prestigeCost: 0,
      phaseCost,
    });
  }
  if (!offers.length) {
    offers.push({
      id: "relic-empty",
      emptyRelic: true,
      label: "The site holds nothing",
      description: "No eligible Heirloom remains to be found.",
      prestigeCost: 0,
      phaseCost,
    });
  }
  return offers;
}

export function getShopOfferCount(vassal, family) {
  const extra = ["practiceReform", "publicWorks"].includes(family)
    ? Math.max(0, Math.floor(getEquippedHeirloomModifiers(vassal).extraShopOffers ?? 0))
    : 0;
  return 3 + extra;
}

function validSlotIndex(index, count) {
  return Number.isInteger(index) && index >= 0 && index < count;
}

export function acquireHeirloom(state, vassal, definitionId, acquire = {}) {
  const destination = acquire?.destination;
  if (destination === "decline") return { ok: true, declined: true };
  const def = getHeirloomDefinition(definitionId);
  if (!def) return { ok: false, reason: "invalidHeirloom" };
  if (getOwnedHeirloomDefinitionIds(state, vassal).has(def.id)) {
    return { ok: false, reason: "duplicateHeirloom" };
  }
  const inventory = vassal.heirlooms ?? (vassal.heirlooms = createEmptyHeirloomInventory());
  inventory.equipped = listHeirloomSlots(inventory.equipped);
  inventory.carry = listHeirloomSlots(inventory.carry);
  while (inventory.equipped.length < HEIRLOOM_EQUIPPED_SLOTS) inventory.equipped.push(null);
  while (inventory.carry.length < HEIRLOOM_CARRY_SLOTS) inventory.carry.push(null);
  const item = createHeirloomInstance(state, def.id, "sanctified");
  if (destination === "equip") {
    const empty = firstEmptyIndex(inventory.equipped);
    if (empty >= 0) {
      inventory.equipped[empty] = item;
      return { ok: true, item, destination: "equip", slotIndex: empty };
    }
    const replaceIndex = Math.floor(acquire.replaceEquippedIndex);
    if (!validSlotIndex(replaceIndex, HEIRLOOM_EQUIPPED_SLOTS)) {
      return { ok: false, reason: "equipSlotRequired" };
    }
    const displaced = inventory.equipped[replaceIndex];
    const carryEmpty = firstEmptyIndex(inventory.carry);
    if (carryEmpty >= 0) {
      inventory.carry[carryEmpty] = displaced;
      inventory.equipped[replaceIndex] = item;
      return {
        ok: true, item, destination: "equip", slotIndex: replaceIndex,
        displacedToCarryIndex: carryEmpty,
      };
    }
    const discard = acquire.discard ?? null;
    if (discard?.location === "equipped" && discard.index === replaceIndex) {
      inventory.equipped[replaceIndex] = item;
      return { ok: true, item, destination: "equip", slotIndex: replaceIndex, discarded: displaced };
    }
    if (discard?.location === "carry" && validSlotIndex(discard.index, HEIRLOOM_CARRY_SLOTS)) {
      const discarded = inventory.carry[discard.index];
      inventory.carry[discard.index] = displaced;
      inventory.equipped[replaceIndex] = item;
      return {
        ok: true, item, destination: "equip", slotIndex: replaceIndex,
        displacedToCarryIndex: discard.index, discarded,
      };
    }
    return { ok: false, reason: "discardRequired" };
  }
  if (destination === "carry") {
    const empty = firstEmptyIndex(inventory.carry);
    if (empty >= 0) {
      inventory.carry[empty] = item;
      return { ok: true, item, destination: "carry", slotIndex: empty };
    }
    const replaceIndex = Math.floor(acquire.replaceCarryIndex ?? acquire.discard?.index);
    if (!validSlotIndex(replaceIndex, HEIRLOOM_CARRY_SLOTS)) {
      return { ok: false, reason: "carrySlotRequired" };
    }
    const discarded = inventory.carry[replaceIndex];
    inventory.carry[replaceIndex] = item;
    return { ok: true, item, destination: "carry", slotIndex: replaceIndex, discarded };
  }
  return { ok: false, reason: "acquireRequired" };
}

function inheritanceOutcome(state, item) {
  const fromState = item.inheritanceState ?? "unmarked";
  if (fromState === "sanctified") {
    return { outcome: "survived", toState: "sanctified" };
  }
  if (fromState === "unmarked") {
    return { outcome: "survived", toState: "fragile" };
  }
  const broke = state.rngNextVassalFloat() < VASSAL_HEIRLOOM_TUNING.fragileBreakChance;
  return broke
    ? { outcome: "broke", toState: null }
    : { outcome: "survived", toState: "fragile" };
}

export function resolveHeirloomInheritance(state, vassal) {
  const lineage = lineageOf(state);
  const inventory = getVassalHeirloomInventory(vassal);
  const collected = [...inventory.equipped, ...inventory.carry].filter(Boolean);
  const entries = [];
  const survivors = [];
  for (const item of collected) {
    const result = inheritanceOutcome(state, item);
    const presented = presentHeirloom(item);
    entries.push({
      instanceId: item.instanceId,
      definitionId: item.definitionId,
      label: presented?.label ?? item.definitionId,
      quality: presented?.quality ?? "bronze",
      fromState: item.inheritanceState ?? "unmarked",
      outcome: result.outcome,
      toState: result.toState,
    });
    if (result.outcome === "survived" && result.toState) {
      survivors.push({
        ...clone(item),
        inheritanceState: result.toState,
        protectionSpent: false,
      });
    }
  }
  if (vassal?.heirlooms) {
    vassal.heirlooms.equipped = createEmptyHeirloomSlots(HEIRLOOM_EQUIPPED_SLOTS);
    vassal.heirlooms.carry = createEmptyHeirloomSlots(HEIRLOOM_CARRY_SLOTS);
  }
  const vaultItems = occupiedItems(getHeirloomVault(state));
  const combined = [...vaultItems, ...survivors];
  const overflowRequired = combined.length > HEIRLOOM_VAULT_SLOTS;
  if (overflowRequired) {
    state.civilization.heirloomVault = createEmptyHeirloomVault();
    lineage.pendingVaultOverflow = combined;
  } else {
    const vault = createEmptyHeirloomVault();
    combined.forEach((item, index) => { vault[index] = item; });
    state.civilization.heirloomVault = vault;
    lineage.pendingVaultOverflow = null;
  }
  lineage.lastInheritanceReport = {
    vassalId: vassal?.vassalId ?? null,
    endedReason: vassal?.endedReason ?? null,
    entries,
    overflowRequired,
  };
  return lineage.lastInheritanceReport;
}

export function resolveVaultOverflow(state, keepInstanceIds = []) {
  const lineage = lineageOf(state);
  const pending = Array.isArray(lineage?.pendingVaultOverflow)
    ? lineage.pendingVaultOverflow.filter(Boolean) : [];
  if (!pending.length) return { ok: false, reason: "overflowUnavailable" };
  const wanted = [...new Set((keepInstanceIds ?? []).filter(Boolean))];
  if (wanted.length !== HEIRLOOM_VAULT_SLOTS) {
    return { ok: false, reason: "vaultSelectionRequired" };
  }
  const byId = new Map(pending.map((item) => [item.instanceId, item]));
  if (wanted.some((id) => !byId.has(id))) return { ok: false, reason: "invalidVaultSelection" };
  const vault = createEmptyHeirloomVault();
  wanted.forEach((id, index) => { vault[index] = clone(byId.get(id)); });
  state.civilization.heirloomVault = vault;
  lineage.pendingVaultOverflow = null;
  if (lineage.lastInheritanceReport) {
    lineage.lastInheritanceReport.overflowRequired = false;
  }
  return { ok: true, vault: clone(vault) };
}

export function confirmHeirloomLoadout(state, equippedInstanceIds = []) {
  const lineage = lineageOf(state);
  const vassal = lineage?.currentVassalId
    ? lineage.vassalsById?.[lineage.currentVassalId] ?? null : null;
  if (!vassal) return { ok: false, reason: "noCurrentVassal" };
  if (lineage.pendingVaultOverflow?.length) {
    return { ok: false, reason: "heirloomOverflowPending" };
  }
  const selected = [...new Set((equippedInstanceIds ?? []).filter(Boolean))];
  if (selected.length > HEIRLOOM_EQUIPPED_SLOTS) {
    return { ok: false, reason: "tooManyEquippedHeirlooms" };
  }
  const vault = occupiedItems(getHeirloomVault(state));
  const byId = new Map(vault.map((item) => [item.instanceId, item]));
  if (selected.some((id) => !byId.has(id))) return { ok: false, reason: "invalidLoadout" };
  const equipped = createEmptyHeirloomSlots(HEIRLOOM_EQUIPPED_SLOTS);
  selected.forEach((id, index) => {
    const item = clone(byId.get(id));
    if (item.inheritanceState === "sanctified") item.inheritanceState = "unmarked";
    item.protectionSpent = false;
    equipped[index] = item;
  });
  const remaining = vault.filter((item) => !selected.includes(item.instanceId));
  const nextVault = createEmptyHeirloomVault();
  remaining.forEach((item, index) => { nextVault[index] = clone(item); });
  state.civilization.heirloomVault = nextVault;
  vassal.heirlooms = {
    equipped,
    carry: createEmptyHeirloomSlots(HEIRLOOM_CARRY_SLOTS),
  };
  lineage.pendingHeirloomLoadout = false;
  return { ok: true, equipped: clone(equipped) };
}

export function hasPendingHeirloomOverflow(state) {
  return (lineageOf(state)?.pendingVaultOverflow ?? []).length > 0;
}

export function hasPendingHeirloomLoadout(state) {
  return lineageOf(state)?.pendingHeirloomLoadout === true;
}

export function isValidHeirloomItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  if (typeof item.instanceId !== "string" || !item.instanceId) return false;
  if (!getHeirloomDefinition(item.definitionId)) return false;
  if (!VASSAL_HEIRLOOM_INHERITANCE_STATES.includes(item.inheritanceState)) return false;
  if (item.protectionSpent != null && typeof item.protectionSpent !== "boolean") return false;
  return true;
}

function isValidSlotArray(slots, count, allowEmpty = true) {
  if (!Array.isArray(slots) || slots.length !== count) return false;
  const seen = new Set();
  for (const item of slots) {
    if (item == null) {
      if (!allowEmpty) return false;
      continue;
    }
    if (!isValidHeirloomItem(item) || seen.has(item.instanceId) || seen.has(item.definitionId)) {
      return false;
    }
    seen.add(item.instanceId);
    seen.add(item.definitionId);
  }
  return true;
}

export function validateHeirloomState(state) {
  const errors = [];
  const vault = state?.civilization?.heirloomVault;
  if (!isValidSlotArray(vault, HEIRLOOM_VAULT_SLOTS)) {
    errors.push("civilization.heirloomVault: expected six Heirloom slots");
  }
  const lineage = lineageOf(state);
  if (lineage) {
    if (!Number.isInteger(lineage.nextHeirloomInstanceId) || lineage.nextHeirloomInstanceId < 1) {
      errors.push("vassalLineage.nextHeirloomInstanceId: expected a positive integer");
    }
    if (lineage.pendingHeirloomLoadout != null
        && typeof lineage.pendingHeirloomLoadout !== "boolean") {
      errors.push("vassalLineage.pendingHeirloomLoadout: expected a boolean");
    }
    const overflow = lineage.pendingVaultOverflow;
    if (overflow != null) {
      if (!Array.isArray(overflow) || overflow.length === 0
          || overflow.some((item) => !isValidHeirloomItem(item))) {
        errors.push("vassalLineage.pendingVaultOverflow: expected Heirloom items");
      }
    }
  }
  const seen = new Set();
  const noteDuplicate = (item, path) => {
    if (!item) return;
    if (seen.has(item.instanceId) || seen.has(item.definitionId)) {
      errors.push(`${path}: duplicate Heirloom`);
    }
    seen.add(item.instanceId);
    seen.add(item.definitionId);
  };
  for (const item of getHeirloomVault(state)) noteDuplicate(item, "heirloomVault");
  for (const item of lineage?.pendingVaultOverflow ?? []) {
    noteDuplicate(item, "pendingVaultOverflow");
  }
  for (const [vassalId, vassal] of Object.entries(lineage?.vassalsById ?? {})) {
    const inventory = vassal?.heirlooms;
    if (!inventory || !isValidSlotArray(inventory.equipped, HEIRLOOM_EQUIPPED_SLOTS)
        || !isValidSlotArray(inventory.carry, HEIRLOOM_CARRY_SLOTS)) {
      errors.push(`${vassalId}.heirlooms: expected equipped and carry slots`);
      continue;
    }
    for (const item of inventory.equipped) noteDuplicate(item, `${vassalId}.equipped`);
    for (const item of inventory.carry) noteDuplicate(item, `${vassalId}.carry`);
  }
  return { ok: errors.length === 0, errors };
}
