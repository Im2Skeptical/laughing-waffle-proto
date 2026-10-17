// Long CPU jobs are written as generators that `yield` at safe checkpoints. The
// synchronous driver runs them straight through (identical to a plain function);
// the cooperative driver hands the main thread back whenever a slice has used its
// budget, so loading screens keep painting and input keeps working. A job can be
// abandoned at a checkpoint with `isCancelled`: the generator is closed, so its
// `finally` blocks release whatever it had already created.
export function runSync(steps) {
  for (let step = steps.next(); ; step = steps.next()) if (step.done) return step.value;
}

const macrotask = () => new Promise(resolve => setTimeout(resolve, 0));

// `stats`, when given, receives steps, yields, longestStepMs (the longest stretch
// of main-thread work between two checkpoints) and slowSteps ([step, ms] over
// 100 ms) for diagnostics.
export async function runCooperative(steps, { sliceMs = 250, stats = null, isCancelled = null } = {}) {
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
      if (isCancelled?.()) { steps.return(); return undefined; }
      if (stats) stats.yields = (stats.yields ?? 0) + 1;
      sliceStart = stepStart = performance.now();
    } else stepStart = now;
  }
}
