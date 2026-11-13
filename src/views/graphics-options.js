// Device-local presentation experiments. Never passed to the model or saves.
export const GRAPHICS_OPTIONS_KEY = 'full-map.dev.graphics';
export const DEFAULT_GRAPHICS_OPTIONS = Object.freeze({
  fog: true, clouds: true, shadows: true, wisps: true, water: true,
});

function normalize(value) {
  return Object.freeze(Object.fromEntries(Object.entries(DEFAULT_GRAPHICS_OPTIONS)
    .map(([key, fallback]) => [key, typeof value?.[key] === 'boolean' ? value[key] : fallback])));
}

let options;
export function getGraphicsOptions() {
  if (!options) {
    try { options = normalize(JSON.parse(globalThis.localStorage?.getItem(GRAPHICS_OPTIONS_KEY) ?? 'null')); }
    catch { options = DEFAULT_GRAPHICS_OPTIONS; }
  }
  return options;
}

export function setGraphicsOptions(patch) {
  const next = normalize({ ...getGraphicsOptions(), ...patch });
  if (Object.keys(next).every(key => next[key] === options[key])) return options;
  options = next;
  try { globalThis.localStorage?.setItem(GRAPHICS_OPTIONS_KEY, JSON.stringify(options)); } catch {}
  return options;
}
