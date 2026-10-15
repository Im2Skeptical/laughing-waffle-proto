// Broad offshore colour movement, independent of the surface palette cycles.
// Absolute sampled time keeps reverse playback and arbitrary seeks reproducible.
const TAU = Math.PI * 2;
export function waterDriftPhase(seconds) {
  return [TAU * (seconds / 83 + .18 * Math.sin(seconds / 317)),
    TAU * (seconds / 137 + .25 * Math.sin(seconds / 941))];
}
export const waterDriftOffset = seed => (seed % 997) * .713;
export function waterDriftMask(body, distance) {
  if (body !== 1) return 0; // Marine only; never recolour lakes, peat or rivers.
  const t = Math.max(0, Math.min(1, (distance - 14) / 58));
  return t * t * (3 - 2 * t);
}
export function sampleWaterDrift(x, y, seconds) {
  const [p, q] = waterDriftPhase(seconds);
  const a = Math.sin(x / 91 + y / 137 + p + .65 * Math.sin(y / 173 - q));
  const b = Math.sin(x / 173 - y / 83 - q + .5 * Math.sin(x / 151 + p * .7));
  return [3 * a - 2 * b, 6 * a + 2 * b, -3 * a + 4 * b];
}
// Same field as the CPU/graph sampler; output is in 8-bit channel units.
export const WATER_DRIFT_GLSL = `
vec3 waterDrift(vec2 w, vec2 phase) {
  float a=sin(w.x/91.0+w.y/137.0+phase.x+0.65*sin(w.y/173.0-phase.y));
  float b=sin(w.x/173.0-w.y/83.0-phase.y+0.5*sin(w.x/151.0+phase.x*0.7));
  return vec3(3.0*a-2.0*b,6.0*a+2.0*b,-3.0*a+4.0*b)/255.0;
}`;
