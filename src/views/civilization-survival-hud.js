import { SEASON_DISPLAY } from "../defs/gamesettings/gamerules-defs.js";
import { getCurrentSeasonKey } from "../model/state.js";
import { createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

function positiveYear(value) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null;
}

export function getCivilizationSurvivalViewModel(
  state,
  civilizationLossInfo = null
) {
  const seasonKey = getCurrentSeasonKey(state);
  const year = positiveYear(state?.year) ?? 1;
  const runComplete = state?.runStatus?.complete === true;
  const actualLossYear = runComplete
    ? positiveYear(state?.runStatus?.year) ?? year
    : null;
  const projectedLossYear =
    actualLossYear ??
    positiveYear(civilizationLossInfo?.finalLossYear) ??
    positiveYear(civilizationLossInfo?.lossYear);
  const rememberedBest = positiveYear(
    state?.persistentKnowledge?.maxObservedCivilizationSurvivalYear
  );
  const reportedBest = positiveYear(civilizationLossInfo?.maxLossYear);
  const bestSurvivalYear =
    [rememberedBest, reportedBest, actualLossYear]
      .filter((value) => value != null)
      .reduce((best, value) => Math.max(best, value), 0) || null;
  const forecastLabel = runComplete
    ? `Civilization lasted to Year ${actualLossYear}`
    : projectedLossYear != null
      ? `Projected survival: Year ${projectedLossYear}`
      : "Projected survival: Forecasting…";
  const bestLabel =
    bestSurvivalYear != null
      ? `Best seen: Year ${bestSurvivalYear}`
      : "Best seen: —";
  const calendarLabel = `${
    SEASON_DISPLAY[seasonKey] ?? seasonKey
  } · Civilization Year ${year}`;

  return {
    seasonKey,
    year,
    runComplete,
    actualLossYear,
    projectedLossYear,
    bestSurvivalYear,
    calendarLabel,
    forecastLabel,
    bestLabel,
    label: `${calendarLabel}   ${forecastLabel}   ${bestLabel}`,
  };
}

export function addCivilizationSurvivalStrip(
  parent,
  {
    state,
    civilizationLossInfo = null,
    rect = { x: 570, y: 10, width: 1260, height: 52 },
  } = {}
) {
  const viewModel = getCivilizationSurvivalViewModel(
    state,
    civilizationLossInfo
  );
  const background = new PIXI.Graphics();
  roundedRect(
    background,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    8,
    PALETTE.panel,
    PALETTE.stroke,
    2
  );
  parent.addChild(
    background,
    createText(
      viewModel.label,
      { ...TEXT_STYLES.title, fontSize: 18 },
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      0.5,
      0.5
    )
  );
  return viewModel;
}
