import {
  MOON_PHASE_COUNT,
  MOON_PHASE_DEFS,
} from "../defs/gamesettings/moon-phase-defs.js";
import { getGameSetting } from "./game-config.js";

export function getMoonPhaseDurationSec(state = null) {
  return Math.max(1, Math.floor(getGameSetting(state, "phaseDurationSec") ?? 1));
}

export function getMoonCycleDurationSec(state = null) {
  return getMoonPhaseDurationSec(state) * MOON_PHASE_COUNT;
}

export function getMoonPhaseAtSecond(state, tSec = state?.tSec ?? 0) {
  const sec = Math.max(0, Math.floor(tSec ?? 0));
  const phaseDurationSec = getMoonPhaseDurationSec(state);
  const elapsed = Math.max(0, sec - 1);
  const phaseIndex = sec <= 0
    ? 0
    : Math.floor(elapsed / phaseDurationSec) % MOON_PHASE_COUNT;
  const moonIndex = sec <= 0
    ? 0
    : Math.floor(elapsed / getMoonCycleDurationSec(state));
  return {
    ...MOON_PHASE_DEFS[phaseIndex],
    phaseIndex,
    moonIndex,
    boundary: sec > 0 && elapsed % phaseDurationSec === 0,
    tSec: sec,
  };
}

export function getNextMoonPhaseBoundarySec(state, fromSec, phaseIndex) {
  const safeFrom = Math.max(0, Math.floor(fromSec ?? 0));
  const desired = Math.max(0, Math.min(
    MOON_PHASE_COUNT - 1,
    Math.floor(phaseIndex ?? 0)
  ));
  const phaseDurationSec = getMoonPhaseDurationSec(state);
  const cycleSec = getMoonCycleDurationSec(state);
  const firstBoundary = 1 + desired * phaseDurationSec;
  if (safeFrom <= firstBoundary) return firstBoundary;
  return firstBoundary + Math.ceil((safeFrom - firstBoundary) / cycleSec) * cycleSec;
}
