export function createScaleHighWaterState() {
  return {
    timeline: null,
    maxByGroupId: new Map(),
  };
}

export function syncScaleHighWaterTimeline(state, timeline) {
  if (state.timeline === timeline) return;
  state.timeline = timeline ?? null;
  state.maxByGroupId.clear();
}

export function applyRunScaleHighWaterRanges(
  state,
  nextRanges,
  seriesList = [],
  subjectKey = null
) {
  if (!(nextRanges instanceof Map)) return nextRanges;
  const merged = new Map(nextRanges);
  for (const seriesDef of Array.isArray(seriesList) ? seriesList : []) {
    const seriesId = String(seriesDef?.id ?? "");
    const range = merged.get(seriesId);
    if (!seriesId || !range || range.scaleMode === "fixed") continue;
    const groupId = `${String(subjectKey ?? "__global__")}:${String(
      range.groupId ?? seriesId
    )}`;
    const maxValue = Number.isFinite(range.maxValue) ? range.maxValue : null;
    const seenMax = state.maxByGroupId.get(groupId);
    const highWater = Number.isFinite(seenMax)
      ? Number.isFinite(maxValue) ? Math.max(seenMax, maxValue) : seenMax
      : maxValue;
    if (!Number.isFinite(highWater)) continue;
    state.maxByGroupId.set(groupId, highWater);
    merged.set(seriesId, { ...range, maxValue: highWater });
  }
  return merged;
}
