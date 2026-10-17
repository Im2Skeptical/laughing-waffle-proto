// Long CPU jobs are written as generators that `yield` at safe checkpoints. The
// synchronous driver runs them straight through (identical to a plain function);
// the cooperative driver hands the main thread back whenever a slice has used its
// budget, so loading screens keep painting and input keeps working. Jobs always
// run to completion: the caller discards a stale result with its own cleanup,
// which avoids leaking the textures a half-finished job has already created.
export function runSync(steps) {
  for (let step = steps.next(); ; step = steps.next()) if (step.done) return step.value;
}

const macrotask = () => new Promise(resolve => setTimeout(resolve, 0));

// `stats`, when given, receives steps, yields, longestStepMs (the longest stretch
// of main-thread work between two checkpoints) and slowSteps ([step, ms] over
// 100 ms) for diagnostics.
export async function runCooperative(steps, { sliceMs = 50, stats = null } = {}) {
  let sliceStart = performance.now(), stepStart = sliceStart;
  for (;;) {
    const step = steps.next();
    const now = performance.now();
    if (stats) {
      stats.steps = (stats.steps ?? 0) + 1; stats.longestStepMs = Math.max(stats.longestStepMs ?? 0, now - stepStart);
      if (now - stepStart > 100) (stats.slowSteps ??= []).push([stats.steps, Math.round(now - stepStart)]);
    }
    if (step.done) return step.value;
    if (now - sliceStart >= sliceMs) {
      await macrotask();
      if (stats) stats.yields = (stats.yields ?? 0) + 1;
      sliceStart = stepStart = performance.now();
    } else stepStart = now;
  }
}
