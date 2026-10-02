// variant-flags-defs.js
// Scenario-level gameplay/UI variant switches.

export const DEFAULT_VARIANT_FLAGS = Object.freeze({
  actionPointCostsEnabled: false,
  actionLogEnabled: false,
  inventoryTransferPlannerEnabled: false,
  inventoryTransferGhostPreviewEnabled: false,
  showApHud: false,
  settlementPrototypeEnabled: false,
});

export function normalizeVariantFlags(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    actionPointCostsEnabled: raw.actionPointCostsEnabled === true,
    actionLogEnabled: raw.actionLogEnabled === true,
    inventoryTransferPlannerEnabled: raw.inventoryTransferPlannerEnabled === true,
    inventoryTransferGhostPreviewEnabled:
      raw.inventoryTransferGhostPreviewEnabled === true,
    showApHud: raw.showApHud === true,
    settlementPrototypeEnabled: raw.settlementPrototypeEnabled === true,
  };
}
