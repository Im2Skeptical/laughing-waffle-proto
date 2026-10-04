// Structured clone preserves references, but not frozen descriptors. Only
// configs may be shared; snapshot bodies keep their existing ownership.
function freezeTree(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeTree(child);
  return Object.freeze(value);
}

export function encodeForecastChunk(result) {
  if (!result?.ok) return result;
  const configs = new Map();
  const snapshots = new Map();
  function encode(stateData) {
    if (!stateData || typeof stateData !== "object") return stateData;
    if (snapshots.has(stateData)) return snapshots.get(stateData);
    let config = stateData.gameConfig;
    if (config && typeof config === "object") {
      const key = JSON.stringify(config);
      if (!configs.has(key)) configs.set(key, freezeTree(JSON.parse(key)));
      config = configs.get(key);
    }
    const snapshot = { ...stateData, gameConfig: config };
    snapshots.set(stateData, snapshot);
    return snapshot;
  }
  return {
    ...result,
    stateDataBySecond: Array.from(result.stateDataBySecond, ([sec, data]) => [sec, encode(data)]),
    summaryBySecond: Array.from(result.summaryBySecond),
    lastStateData: encode(result.lastStateData),
  };
}

export function freezeForecastChunkConfigs(result) {
  const entries = result?.stateDataBySecond;
  const snapshots = entries instanceof Map ? entries.values()
    : Array.isArray(entries) ? entries.map(([, snapshot]) => snapshot)
    : Object.values(entries ?? {});
  for (const snapshot of snapshots) freezeTree(snapshot?.gameConfig);
  freezeTree(result?.lastStateData?.gameConfig);
  return result;
}
