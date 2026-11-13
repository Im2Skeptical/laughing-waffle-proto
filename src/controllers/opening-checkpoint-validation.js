import { createProjectionAnchorReader } from '../model/state.js';
import { freezeForecastChunkConfigs } from '../model/timegraph/forecast-wire.js';

// Validate before touching a cache. Checkpoints are disposable derivatives,
// never an alternative save/replay format or a migration path.
export function validateOpeningCheckpoint(record, searchLimitSec) {
  const { stateData, forecast } = record;
  const reader = createProjectionAnchorReader();
  const state = reader.read(stateData);
  const end = forecast?.endSec;
  if (typeof record.owner !== 'string' || state.tSec !== 0 || !Number.isInteger(end) || end < 0 || end > searchLimitSec
    || forecast.baseSec !== 0 || forecast.stepSec !== 1
    || !Array.isArray(forecast.stateDataBySecond) || !Array.isArray(forecast.summaryBySecond)) {
    throw new Error('invalidOpeningCheckpoint');
  }
  const summaries = new Map(forecast.summaryBySecond);
  for (const [second, summary] of forecast.summaryBySecond) {
    if (!Number.isInteger(second) || second < 0 || second > end || summary?.tSec !== second
      || !validSummary(summary, state) || (summary.runComplete && second !== end)) {
      throw new Error('invalidOpeningSummary');
    }
  }
  for (let second = 1; second <= end; second++) {
    if (!summaries.has(second)) throw new Error('incompleteOpeningCheckpoint');
  }
  const snapshots = [...forecast.stateDataBySecond, [end, forecast.lastStateData]];
  const configs = new Set([stateData.gameConfig]);
  const configJson = JSON.stringify(stateData.gameConfig);
  freezeForecastChunkConfigs(forecast);
  for (const [second, data] of snapshots) {
    if (!Number.isInteger(second) || second < 0 || second > end || data?.tSec !== second
      || data.gameStateSchemaVersion !== stateData.gameStateSchemaVersion) throw new Error('invalidOpeningAnchor');
    if (!configs.has(data.gameConfig)) {
      if (JSON.stringify(data.gameConfig) !== configJson) throw new Error('invalidOpeningConfig');
      configs.add(data.gameConfig);
    }
    // Validate every mutable body, sharing only the validated frozen config.
    // A valid tail cannot make a damaged earlier scrub anchor safe.
    const anchor = reader.read(data);
    const summary = summaries.get(second);
    if (second > 0 && (summary.runComplete !== (anchor.runStatus?.complete === true)
      || (summary.runComplete && (summary.runLossSec !== anchor.runStatus.tSec
        || summary.runLossYear !== anchor.runStatus.year)))) throw new Error('invalidOpeningSummary');
  }
  return { state, forecast };
}

function validSummary(summary, state) {
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const numbers = value => record(value) && Object.values(value).every(Number.isFinite);
  const optionalSecond = value => value === null || (Number.isInteger(value) && value >= 0);
  return Number.isInteger(summary.year) && summary.year >= 1 && typeof summary.runComplete === 'boolean'
    && (summary.runComplete
      ? Number.isInteger(summary.runLossSec) && summary.runLossSec === summary.tSec
        && Number.isInteger(summary.runLossYear) && summary.runLossYear >= 1
      : summary.runLossSec === null && summary.runLossYear === null)
    && numbers(summary.graphValues?.civilization) && record(summary.graphValues?.settlementByRegion)
    && state.world.sites.every(site => numbers(summary.graphValues.settlementByRegion[site.regionId]))
    && record(summary.settlement)
    && (summary.settlement.currentVassalId === null || typeof summary.settlement.currentVassalId === 'string')
    && optionalSecond(summary.settlement.currentVassalResolutionSec)
    && optionalSecond(summary.settlement.latestSelectedVassalEndSec);
}
