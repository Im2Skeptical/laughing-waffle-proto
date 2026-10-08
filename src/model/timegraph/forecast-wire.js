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
    // Projection snapshots already share one deep-frozen config, which
    // structured clone sends once per message. Only intern unshared copies.
    if (config && typeof config === "object" && !Object.isFrozen(config)) {
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

function chunkSnapshots(result) {
  const entries = result?.stateDataBySecond;
  const snapshots = entries instanceof Map ? [...entries.values()]
    : Array.isArray(entries) ? entries.map(([, snapshot]) => snapshot)
    : Object.values(entries ?? {});
  if (result?.lastStateData) snapshots.push(result.lastStateData);
  return snapshots.filter(snapshot => snapshot && typeof snapshot === "object");
}

// Worker side. When every snapshot in a chunk shares one deep-frozen config,
// send the snapshots with a null config placeholder (same key position) and
// the config itself only the first time this worker sends it. The receiving
// service must intern each id before it drops or merges any message.
export function createForecastChunkConfigSender() {
  const idsByConfig = new WeakMap();
  let nextId = 1;
  return function encodeForecastChunkMessage(result) {
    const encoded = encodeForecastChunk(result);
    if (!encoded?.ok) return encoded;
    const snapshots = chunkSnapshots(encoded);
    const config = snapshots[0]?.gameConfig;
    if (!config || typeof config !== "object" || !Object.isFrozen(config)
        || snapshots.some(snapshot => snapshot.gameConfig !== config)) {
      return encoded;
    }
    let id = idsByConfig.get(config);
    const firstUse = id == null;
    if (firstUse) {
      id = nextId++;
      idsByConfig.set(config, id);
    }
    const stripped = new Map();
    const strip = snapshot => {
      if (!snapshot || typeof snapshot !== "object") return snapshot;
      if (!stripped.has(snapshot)) stripped.set(snapshot, { ...snapshot, gameConfig: null });
      return stripped.get(snapshot);
    };
    return {
      ...encoded,
      stateDataBySecond: encoded.stateDataBySecond.map(([sec, snapshot]) => [sec, strip(snapshot)]),
      lastStateData: strip(encoded.lastStateData),
      sharedConfig: { id, config: firstUse ? config : null },
    };
  };
}

// Main-thread side, per worker instance. Interns each worker config id once
// (identical configs across ids/restarts share one frozen value), then
// reattaches it to every snapshot. Returns false if a chunk names an id that
// was never received, so the caller can reject it instead of merging.
export function createForecastChunkConfigReceiver() {
  const configsById = new Map();
  let lastKey = null;
  let lastConfig = null;
  function intern(config) {
    const key = JSON.stringify(config);
    if (key === lastKey) return lastConfig;
    lastKey = key;
    lastConfig = freezeTree(config);
    return lastConfig;
  }
  return {
    restore(result) {
      const shared = result?.sharedConfig;
      if (!shared) {
        freezeForecastChunkConfigs(result);
        return true;
      }
      if (shared.config && typeof shared.config === "object") {
        configsById.set(shared.id, intern(shared.config));
      }
      const config = configsById.get(shared.id);
      delete result.sharedConfig;
      if (!config) return false;
      for (const snapshot of chunkSnapshots(result)) {
        if (snapshot.gameConfig === null) snapshot.gameConfig = config;
      }
      return true;
    },
    // A replacement worker numbers its configs from 1 again.
    resetWorker() { configsById.clear(); },
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
