import { getSettlementFirstSelectedVassal } from "../../model/settlement-state.js";
import { getCurrentLifeMapVassal } from "../../model/vassal-life-map.js";
import { getRegionReference } from "../../model/world-state.js";
import { getNavigationVassalPortrait } from "../settlement-navigation-pixi.js";

export function getLatestRunCompleteEntry(state = null) {
  const feed = Array.isArray(state?.gameEventFeed) ? state.gameEventFeed : [];
  for (let index = feed.length - 1; index >= 0; index -= 1) {
    const entry = feed[index];
    if (entry?.type === "runComplete") return entry;
  }
  if (state?.runStatus?.complete === true) {
    const runYear = Number.isFinite(state?.runStatus?.year)
      ? Math.max(1, Math.floor(state.runStatus.year))
      : Number.isFinite(state?.year)
        ? Math.max(1, Math.floor(state.year))
        : 1;
    const runSec = Number.isFinite(state?.runStatus?.tSec)
      ? Math.max(0, Math.floor(state.runStatus.tSec))
      : Math.max(0, Math.floor(state?.tSec ?? 0));
    const runReason =
      typeof state?.runStatus?.reason === "string" && state.runStatus.reason.length > 0
        ? state.runStatus.reason
        : "unknown";
    return {
      id: null,
      type: "runComplete",
      tSec: runSec,
      text: `Civilization lasted until Year ${runYear}.`,
      data: {
        runComplete: true,
        year: runYear,
        reason: runReason,
      },
    };
  }
  return null;
}

export function getSettlementNavigationState({
  frontierState,
  viewedState,
  frontierSec,
  viewedSec,
  presentation,
  worldViewMode,
  pendingVassalSelection,
  selectedVassalCandidateIndex,
  selectedWorldRegionId,
  worldMapRegionSelectionActive,
} = {}) {
  const timeMode = viewedSec < frontierSec ? "history" : viewedSec > frontierSec ? "projection" : "present";
  const currentVassal = getCurrentLifeMapVassal(frontierState);
  // Screen destinations can retain an ended historical life for inspection.
  const profile = timeMode === "history" ? presentation.profileVassal : currentVassal;
  const viewedPortrait = getNavigationVassalPortrait(viewedState);
  const locationRegionId = profile?.locationRegionId ?? null;
  const hasSettlement = (regionId) => !!regionId && !!viewedState?.world?.sites?.some(
    (site) => site.regionId === regionId && site.detailedState
  );
  const location = locationRegionId ? {
    regionId: locationRegionId,
    locationLabel: getRegionReference(viewedState, locationRegionId) ?? locationRegionId,
    hasSettlement: hasSettlement(locationRegionId),
  } : null;
  const destinations = [];
  if (worldViewMode !== "map") destinations.push({ id: "map", label: "Map", hint: ["Regional Map"] });
  if (pendingVassalSelection) {
    const selected = Number.isInteger(selectedVassalCandidateIndex);
    destinations.push({ id: "vassal", label: selected ? "Confirm" : "Choose Vassal",
      icon: selected ? "confirm" : "vassal",
      hint: [selected ? "Confirm this Vassal and begin their life." : "Select a candidate above."], enabled: selected });
  } else {
    if (profile && worldViewMode !== "vassalLife") {
      destinations.push({ id: "life", label: "Life Map",
        hint: [timeMode === "history" ? "Inspect this Vassal's life." : "Open this Vassal's Life Map."] });
    } else if (!currentVassal && timeMode !== "history") {
      const complete = frontierState?.runStatus?.complete === true;
      destinations.push({ id: "vassal", label: complete ? "Game over"
        : getSettlementFirstSelectedVassal(frontierState) ? "Next Vassal" : "Choose Vassal",
      icon: complete ? "chronicle" : "vassal",
      hint: [complete ? "View the chronicle." : "Choose the next Vassal."],
      enabled: !complete || !!getLatestRunCompleteEntry(frontierState) });
    }
    // Life Map always leads to its vassal's location. The Regional Map prefers
    // an explicitly selected detailed region, then the vassal, then the last site.
    const settlementRegionId = worldViewMode === "vassalLife" ? locationRegionId
      : worldMapRegionSelectionActive && hasSettlement(selectedWorldRegionId) ? selectedWorldRegionId
        : location?.hasSettlement ? locationRegionId : selectedWorldRegionId;
    if (worldViewMode !== "settlement" && hasSettlement(settlementRegionId)) {
      const isVassalLocation = settlementRegionId === locationRegionId;
      const reference = getRegionReference(viewedState, settlementRegionId) ?? settlementRegionId;
      destinations.push({ id: "settlement", label: "Settlement", regionId: settlementRegionId,
        hint: [`${reference}${isVassalLocation ? " · Vassal's location" : " · Selected settlement"}`] });
    }
  }
  return {
    mode: worldViewMode,
    time: { mode: timeMode, viewedSec, frontierSec },
    destinations,
    location: viewedPortrait ?? location,
    portrait: worldViewMode !== "vassalLife" && !pendingVassalSelection
      ? viewedPortrait : null,
  };
}
