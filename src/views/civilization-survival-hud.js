import { SEASON_DISPLAY } from "../defs/gamesettings/gamerules-defs.js";
import { getCurrentSeasonKey } from "../model/state.js";
import { createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

function positiveYear(value) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null;
}

function addEndDetailsChip(parent, { rect, info, onOpen } = {}) {
  const container = new PIXI.Container();
  container.position.set(rect.x, rect.y);
  container.eventMode = "static";
  container.cursor = onOpen ? "pointer" : "default";
  container.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  const accent = info.projected ? PALETTE.accent : 0xe0a094;
  const bg = new PIXI.Graphics();
  roundedRect(
    bg,
    0,
    0,
    rect.width,
    rect.height,
    8,
    info.projected ? 0x493d26 : 0x512b2b,
    accent,
    2
  );
  const title = createText(
    info.title,
    { ...TEXT_STYLES.title, fontSize: 22, fill: accent },
    rect.width / 2,
    4,
    0.5,
    0
  );
  if (title.width > rect.width - 16) title.scale.set((rect.width - 16) / title.width);
  container.addChild(
    bg,
    title,
    createText(
      `Year ${info.year}  ·  View details`,
      { ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.text },
      rect.width / 2,
      28,
      0.5,
      0
    )
  );
  if (onOpen) {
    container.on("pointerdown", (event) => event.stopPropagation());
    container.on("pointertap", (event) => {
      event.stopPropagation();
      onOpen();
    });
  }
  parent.addChild(container);
  return container;
}

export function getSurvivalEndDetailsClickPoint(target, visible = true) {
  if (visible === false || !target?.hitArea) return null;
  const point = target.toGlobal?.(
    new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2)
  );
  return point ? { x: point.x, y: point.y } : null;
}

export function getCivilizationSurvivalViewModel(
  state,
  civilizationLossInfo = null
) {
  const seasonKey = getCurrentSeasonKey(state);
  const year = positiveYear(state?.year) ?? 1;
  const observedEnd = civilizationLossInfo?.observedEnd;
  const runComplete = observedEnd
    ? observedEnd.projected === false
    : state?.runStatus?.complete === true;
  const actualLossYear = runComplete
    ? positiveYear(observedEnd?.projected === false ? observedEnd.year : state?.runStatus?.year) ?? year
    : null;
  const projectedLossYear =
    actualLossYear ??
    positiveYear(observedEnd?.year) ??
    positiveYear(civilizationLossInfo?.finalLossYear) ??
    (civilizationLossInfo?.resolved === true
      ? positiveYear(civilizationLossInfo?.lossYear)
      : null);
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
    endDetails: observedEnd
      ? {
          title: observedEnd.title,
          year: positiveYear(observedEnd.year) ?? year,
          projected: observedEnd.projected === true,
        }
      : null,
  };
}

export function addCivilizationSurvivalStrip(
  parent,
  {
    state,
    civilizationLossInfo = null,
    rect = { x: 570, y: 10, width: 1260, height: 52 },
    onOpenEndDetails = null,
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
  parent.addChild(background);
  const columnWidth = rect.width / 3;
  const columns = [
    [`YEAR ${viewModel.year}`, SEASON_DISPLAY[viewModel.seasonKey] ?? viewModel.seasonKey],
    viewModel.endDetails
      ? null
      : [
          viewModel.projectedLossYear ? `YEAR ${viewModel.projectedLossYear}` : "Unfolding…",
          viewModel.runComplete ? "Civilization ended" : "Foreseen survival",
        ],
    [viewModel.bestSurvivalYear ? `YEAR ${viewModel.bestSurvivalYear}` : "—", "Best remembered"],
  ];
  let detailsTarget = null;
  columns.forEach((column, i) => {
    if (i === 1 && viewModel.endDetails) {
      detailsTarget = addEndDetailsChip(parent, {
        rect: {
          x: rect.x + columnWidth + 4,
          y: rect.y + 3,
          width: columnWidth - 8,
          height: rect.height - 6,
        },
        info: viewModel.endDetails,
        onOpen: onOpenEndDetails,
      });
      return;
    }
    if (!column) return;
    const x = rect.x + (i + 0.5) * columnWidth;
    parent.addChild(
      createText(
        column[0],
        { ...TEXT_STYLES.title, fontSize: 22, fill: i === 0 ? PALETTE.text : PALETTE.accent },
        x,
        rect.y + 7,
        0.5,
        0
      ),
      createText(
        column[1],
        { ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted },
        x,
        rect.y + 32,
        0.5,
        0
      )
    );
  });
  return { viewModel, detailsTarget };
}
