import { envTileDefs } from "../defs/gamepieces/env-tiles-defs.js";
import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import {
  getSettlementTileBlueResource,
  getSettlementTileFood,
} from "../model/settlement-state.js";
import {
  capitalizeTier,
  formatPracticeBlockedReason,
} from "./settlement-formatters.js";

export function buildPracticeLines(card) {
  const def = settlementPracticeDefs[card?.defId];
  const practiceMode = def?.practiceMode === "passive" ? "passive" : "active";
  const runtime =
    card?.props?.settlement && typeof card.props.settlement === "object"
      ? card.props.settlement
      : {};
  const lines = Array.isArray(def?.ui?.lines) ? [...def.ui.lines] : [];
  if (runtime.mirroredPracticeTitle) {
    lines.push(`Mirroring: ${runtime.mirroredPracticeTitle}`);
  }
  if (practiceMode === "passive") {
    if (runtime.lastAmount > 0 && Number.isFinite(runtime.lastRunSec)) {
      lines.push(`Last pulse: ${Math.floor(runtime.lastAmount)} at ${Math.floor(runtime.lastRunSec)}s`);
    }
    if (runtime.blockedReason) {
      lines.push(`Dormant: ${formatPracticeBlockedReason(runtime.blockedReason)}`);
    }
    return lines;
  }
  if (runtime.activeReservation) {
    lines.push(
      `Active: ${Math.floor(runtime.activeAmount ?? runtime.pendingPopulation ?? 0)} pop, ${Math.max(0, Math.floor(runtime.activeRemainingSec ?? 0))}s left`
    );
  }
  if (
    runtime.activeReservation !== true &&
    runtime.activeProgressKind === "cadence" &&
    Number.isFinite(runtime.activeRemainingSec)
  ) {
    lines.push(`Next trigger: ${Math.max(0, Math.floor(runtime.activeRemainingSec ?? 0))}s`);
  }
  if (!runtime.activeReservation && runtime.lastAmount > 0 && Number.isFinite(runtime.lastRunSec)) {
    lines.push(`Last run: ${Math.floor(runtime.lastAmount)} at ${Math.floor(runtime.lastRunSec)}s`);
  }
  if (runtime.upgradeTargetStructureDefId) {
    if (runtime.upgradeTargetStructurePresent) {
      lines.push(
        `Target: ${capitalizeTier(runtime.upgradeTargetTier)} -> ${capitalizeTier(runtime.upgradeTargetNextTier)}`
      );
      if (runtime.upgradeTargetNextTier) {
        lines.push(
          `Progress: ${Math.floor(runtime.upgradeTargetProgressCompleted ?? 0)}/${Math.floor(runtime.upgradeTargetProgressRequired ?? 0)}`
        );
      }
    } else {
      lines.push(`Target: ${runtime.upgradeTargetStructureDefId} missing`);
    }
  }
  if (!runtime.activeReservation && runtime.available) {
    lines.push(`Ready: ${Math.floor(runtime.previewAmount ?? 0)} population available`);
  } else if (!runtime.activeReservation && runtime.blockedReason) {
    lines.push(`Waiting: ${formatPracticeBlockedReason(runtime.blockedReason)}`);
  }
  return lines;
}

export function buildStructureLines(structure) {
  const def = hubStructureDefs[structure?.defId];
  const runtime =
    structure?.props?.settlement && typeof structure.props.settlement === "object"
      ? structure.props.settlement
      : {};
  const lines = Array.isArray(def?.ui?.lines) ? [...def.ui.lines] : [];
  if (runtime.staffingRequired > 0) {
    lines.push(
      runtime.active
        ? `Staffed: ${Math.floor(runtime.reservedPopulation ?? 0)} population`
        : `Needs ${Math.floor(runtime.staffingRequired)} population`
    );
  } else {
    lines.push("Passive structure");
  }
  if (runtime.upgradeTier) {
    lines.push(`Tier: ${capitalizeTier(runtime.upgradeTier)}`);
    if (runtime.nextUpgradeTier) {
      lines.push(
        `Upgrade: ${Math.floor(runtime.upgradeProgressCompleted ?? 0)}/${Math.floor(runtime.upgradeProgressRequired ?? 0)} to ${capitalizeTier(runtime.nextUpgradeTier)}`
      );
    } else {
      lines.push("Upgrade: Max tier");
    }
  }
  return lines;
}

export function buildTileLines(tile) {
  const def = envTileDefs[tile?.defId];
  if (tile?.defId === "tile_floodplains") {
    return [
      "Every winter flood,",
      "every spring deposit",
      "100 field food.",
      "Summer decays 20% per moon.",
      `Stored Field Food: ${getSettlementTileFood(tile)}`,
    ];
  }
  if (tile?.defId === "tile_hinterland") {
    return [
      "Every season change,",
      "store 1 blueResource",
      "until the global cap.",
      `Stored Blue: ${getSettlementTileBlueResource(tile)}`,
    ];
  }
  const description = def?.ui?.description;
  if (typeof description === "string" && description.length > 0) {
    return [description];
  }
  return [];
}
