import { deserializeGameState } from '../model/state.js';
import { freezeForecastChunkConfigs } from '../model/timegraph/forecast-wire.js';

// Validate before touching a cache. Checkpoints are disposable derivatives,
// never an alternative save/replay format or a migration path.
export function validateOpeningCheckpoint(record, searchLimitSec) {
  const { stateData, forecast } = record;
  const state = deserializeGameState(stateData);
  const end = forecast?.endSec;
  if (typeof record.owner !== 'string' || state.tSec !== 0 || !Number.isInteger(end) || end < 0 || end > searchLimitSec
    || forecast.baseSec !== 0 || forecast.stepSec !== 1
    || !Array.isArray(forecast.stateDataBySecond) || !Array.isArray(forecast.summaryBySecond)) {
    throw new Error('invalidOpeningCheckpoint');
  }
  const summaries = new Map(forecast.summaryBySecond);
  for (let second = 1; second <= end; second++) {
    if (summaries.get(second)?.tSec !== second) throw new Error('incompleteOpeningCheckpoint');
  }
  const snapshots = [...forecast.stateDataBySecond, [end, forecast.lastStateData]];
  const configs = new Set([stateData.gameConfig]);
  const configJson = JSON.stringify(stateData.gameConfig);
  for (const [second, data] of snapshots) {
    if (!Number.isInteger(second) || second < 0 || second > end || data?.tSec !== second
      || data.gameStateSchemaVersion !== stateData.gameStateSchemaVersion) throw new Error('invalidOpeningAnchor');
    if (!configs.has(data.gameConfig)) {
      if (JSON.stringify(data.gameConfig) !== configJson) throw new Error('invalidOpeningConfig');
      configs.add(data.gameConfig);
    }
  }
  if (end > 0) deserializeGameState(forecast.lastStateData);
  freezeForecastChunkConfigs(forecast);
  return { state, forecast };
}
