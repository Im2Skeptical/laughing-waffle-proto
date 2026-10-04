// Exact worker-produced historical summaries, independent of plot grids,
// metrics and forecast-cache eviction. Runtime only; never part of a save.
export function createAuthoritativeHistorySummaries() {
  const summaries = new Map();
  let timeline = null;
  let base = null;
  let actions = [];
  let contentVersion = null;
  let historyEndSec = -1;

  function invalidateFrom(second) {
    for (const sec of summaries.keys()) if (sec >= second) summaries.delete(sec);
  }

  function sync(tl) {
    const nextActions = Array.isArray(tl?.actions) ? tl.actions : [];
    const nextVersion = tl?._actionContentVersion ?? 0;
    const nextEnd = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    const replaced = tl !== timeline || tl?.baseStateData !== base;
    const changed = replaced || nextVersion !== contentVersion || nextActions.length !== actions.length
      || nextActions.at(-1) !== actions.at(-1)?.ref;
    if (replaced) summaries.clear();
    else if (changed) {
      // Compare the whole action prefix so multiple edits between reads cannot
      // hide an earlier mutation behind _lastMutationSec. Entries are replaced
      // by timeline APIs; retain their original seconds separately as well.
      let cutoff = Infinity;
      for (let i = 0; i < Math.max(actions.length, nextActions.length); i++) {
        const previous = actions[i];
        const next = nextActions[i];
        if (previous?.ref === next && previous?.sec === next?.tSec) continue;
        cutoff = Math.min(cutoff, previous?.sec ?? Infinity, next?.tSec ?? Infinity);
      }
      // Defensive support for versioned in-place edits.
      if (!Number.isFinite(cutoff)) cutoff = tl?._lastMutationSec ?? 0;
      invalidateFrom(cutoff);
    }
    const rewound = nextEnd < historyEndSec;
    if (rewound) invalidateFrom(nextEnd + 1);
    timeline = tl;
    base = tl?.baseStateData;
    contentVersion = nextVersion;
    historyEndSec = nextEnd;
    if (changed) actions = nextActions.map(ref => ({ ref, sec: ref.tSec }));
    return changed || rewound;
  }

  function retain(tl, startSec, supplied) {
    sync(tl);
    invalidateFrom(startSec);
    for (const [sec, summary] of supplied ?? []) {
      if (Number.isInteger(sec) && sec >= startSec && sec <= historyEndSec && summary) summaries.set(sec, summary);
    }
  }

  return {
    sync, retain, get: sec => summaries.get(sec) ?? null,
    remember(sec, summary) {
      if (Number.isInteger(sec) && sec >= 0 && sec <= historyEndSec && summary) summaries.set(sec, summary);
    },
  };
}
