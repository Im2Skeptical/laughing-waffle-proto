// View-only switch: never captured in saves or passed to simulation.
export let minimalGraphics = new URLSearchParams(globalThis.location?.search ?? '').get('dev') === '1';

export function getProgressiveArtworkPreference() {
  const params=new URLSearchParams(globalThis.location?.search ?? '');
  if(params.has('art'))return params.get('art')!=='0';
  try{return globalThis.localStorage?.getItem('dev.progressiveArtwork')!=='off';}catch{return true;}
}
export let progressiveGraphics = new URLSearchParams(globalThis.location?.search ?? '').get('perf') === '1' && getProgressiveArtworkPreference();

// Live bindings let a menu gesture switch presentation without navigation.
export function enablePerformanceGraphics({ progressiveArtwork = true } = {}) {
  minimalGraphics = true;
  progressiveGraphics = progressiveArtwork;
}
