import { controlSummary } from '../detailed-settlements/territory.js';
import {
  getDetailedCivilizationSummary,
  getPopulationSummary,
  assignDetailedSettlementWorkers,
} from "../detailed-settlements.js";

// A context belongs to one synchronous read, never to a mutable state's lifetime.
export function createGraphMetricReadContext(state) {
  const populations = new Map();
  const workers = new Map();
  const territories = new Map();
  let civilization;
  return {
    territory: regionId => {if(!territories.has(regionId))territories.set(regionId,controlSummary(state,regionId));return territories.get(regionId);},
    civilization: () => civilization ??= getDetailedCivilizationSummary(state),
    population: (regionId) => {
      if (!populations.has(regionId)) {
        populations.set(regionId, getPopulationSummary(state, regionId));
      }
      return populations.get(regionId);
    },
    workers: (regionId) => {
      if (!workers.has(regionId)) {
        workers.set(regionId, assignDetailedSettlementWorkers(state, regionId));
      }
      return workers.get(regionId);
    },
  };
}
