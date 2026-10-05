// Wall-clock entry diagnostics are runtime-only, never simulation or save data.
export function createLoadingDiagnostics({ now = () => performance.now() } = {}) {
  let job = null;
  return {
    begin(operation) {
      const current = { operation, phase: 'loading', startedAt: now(), endedAt: null,
        stages: [], reason: null };
      job = current;
      return {
        report({ stage, label, detail = '', completed = null, total = null }) {
          if (job !== current || current.phase !== 'loading') return;
          const time = now();
          let entry = current.stages.at(-1);
          if (entry?.stage !== stage) {
            if (entry) entry.endedAt = time;
            entry = { stage, label, startedAt: time, endedAt: null, updatedAt: time };
            current.stages.push(entry);
          }
          if (entry.detail !== detail || entry.completed !== completed) entry.updatedAt = time;
          Object.assign(entry, { detail, completed, total });
        },
        finish(result) {
          if (job !== current || current.phase !== 'loading') return;
          current.phase = result.ok ? 'ready' : result.reason === 'cancelled' ? 'cancelled' : 'failed';
          current.reason = result.reason ?? null;
          current.endedAt = now();
          const entry = current.stages.at(-1);
          if (entry) entry.endedAt = current.endedAt;
        },
      };
    },
    snapshot() {
      if (!job) return null;
      const time = job.endedAt ?? now();
      return { operation: job.operation, phase: job.phase, reason: job.reason,
        elapsedMs: Math.max(0, time - job.startedAt),
        stages: job.stages.map(entry => ({ stage: entry.stage, label: entry.label,
          detail: entry.detail, completed: entry.completed, total: entry.total,
          elapsedMs: Math.max(0, (entry.endedAt ?? time) - entry.startedAt),
          sinceProgressMs: Math.max(0, time - entry.updatedAt),
          active: entry.endedAt === null })),
      };
    },
  };
}
