import { SEASON_DURATION_SEC } from "../../defs/gamesettings/gamerules-defs.js";
import { runLiveSecondStages } from "../live-second-stage-scheduler.js";
import {
  getApCapForSecond,
  getApIncomePerSecond,
  normalizeApState,
} from "./ap-helpers.js";

const TICKS_PER_SEC = 60;

export function cmdTickSimulation(state) {
  if (state.paused || state.runStatus?.complete) return { ok: false };

  state.simStepIndex = (state.simStepIndex || 0) + 1;

  const prevTSec = state.tSec || 0;
  const newTSec = Math.floor(state.simStepIndex / TICKS_PER_SEC);

  const didAdvanceSecond = newTSec > prevTSec;
  if (didAdvanceSecond) {
    state.tSec = newTSec;

    normalizeApState(state);
    state.actionPointCap = getApCapForSecond(state, state.tSec);

    state.actionPoints += getApIncomePerSecond(state, state.tSec);
    state.actionPoints = Math.min(state.actionPoints, state.actionPointCap);
  }

  const durationSec =
    Number.isInteger(state.seasonDurationSec) && state.seasonDurationSec > 0
      ? state.seasonDurationSec
      : SEASON_DURATION_SEC;
  const seasonTicks = durationSec * TICKS_PER_SEC;
  const tickInSeason = state.simStepIndex % seasonTicks;
  state.simTime = state.simStepIndex / TICKS_PER_SEC;
  state.seasonClockSec = tickInSeason / TICKS_PER_SEC;
  state.seasonTimeRemaining = (seasonTicks - tickInSeason) / TICKS_PER_SEC;

  let seasonChanged = false;
  if (didAdvanceSecond) {
    const seasonCount = state.seasons?.length ?? 0;
    seasonChanged = tickInSeason === 0 && seasonCount > 0;
    if (seasonChanged) {
      const elapsedSeasons = state.simStepIndex / seasonTicks;
      state.currentSeasonIndex = elapsedSeasons % seasonCount;
      state.year = 1 + Math.floor(elapsedSeasons / seasonCount);
    }
    runLiveSecondStages(state, state.tSec, { seasonChanged });
  }

  return {
    ok: true,
    advancedSeason: seasonChanged,
    advancedSeasonCount: seasonChanged ? 1 : 0,
  };
}

export function cmdSetPaused(state, paused) {
  if (typeof paused !== "boolean") return { ok: false, reason: "badPaused" };
  if (state.runStatus?.complete && !paused) return { ok: false, reason: "runComplete" };
  state.paused = paused;
  return { ok: true, paused };
}
