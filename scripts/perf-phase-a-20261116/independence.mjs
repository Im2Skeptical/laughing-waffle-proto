// B05: Node forecast populations are sequential calls inside ONE process
// (shared JIT, heap and GC state). They are not independent launches, so they
// share one launch identity; statistics.mjs then treats them as a single
// cluster and tail inference is INCONCLUSIVE by construction.
export const SEQUENTIAL_IN_PROCESS = 'sequential-in-process';

export function processLaunchId(idPrefix, pid = process.pid) {
  return `${idPrefix}-process-${pid}`;
}

export function labelSequentialInProcess(row, { idPrefix, index, pid = process.pid }) {
  return {
    ...row,
    launchId: processLaunchId(idPrefix, pid),
    observationId: `${idPrefix}-call-${index}`,
    independence: SEQUENTIAL_IN_PROCESS,
    tailInference: 'INCONCLUSIVE',
  };
}
