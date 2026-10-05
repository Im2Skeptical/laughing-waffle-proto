// Import a completed opening forecast without monopolising the loading UI.
// All summaries and independent state anchors retain their existing format.
export async function mergePreparedForecast({ cache, timeline, forecast,
  isCurrent = () => true, sliceSec = 64,
  yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)),
}) {
  const states = [...forecast.stateDataBySecond].sort((a, b) => a[0] - b[0]);
  const summaries = [...forecast.summaryBySecond].sort((a, b) => a[0] - b[0]);
  const token = cache.getTimelineToken(timeline);
  const span = Number.isFinite(sliceSec) ? Math.max(1, Math.floor(sliceSec)) : 64;
  let baseSec = forecast.baseSec;
  let stateIndex = 0;
  let summaryIndex = 0;
  do {
    if (!isCurrent()) return { ok: false, reason: 'cancelled' };
    const endSec = Math.min(forecast.endSec, baseSec + span);
    const stateStart = stateIndex, summaryStart = summaryIndex;
    while (stateIndex < states.length && states[stateIndex][0] <= endSec) stateIndex++;
    while (summaryIndex < summaries.length && summaries[summaryIndex][0] <= endSec) summaryIndex++;
    const result = cache.mergeForecastChunk(timeline, {
      ...forecast, timelineToken: token, historyEndSec: timeline.historyEndSec,
      baseSec, endSec,
      stateDataBySecond: states.slice(stateStart, stateIndex),
      summaryBySecond: summaries.slice(summaryStart, summaryIndex),
      lastStateData: endSec === forecast.endSec ? forecast.lastStateData : null,
    });
    if (!result.ok) return result;
    baseSec = endSec;
    if (baseSec < forecast.endSec) await yieldTask();
  } while (baseSec < forecast.endSec);
  return { ok: true };
}
