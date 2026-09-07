// Use Chromium's explicit software GL driver for trusted local test pages.
// Automatic headless WebGL fallback can fail shader compilation with empty logs.
// This changes only the probes; the shipped game uses the browser's normal GPU.
export const BROWSER_PROBE_LAUNCH_OPTIONS = Object.freeze({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
