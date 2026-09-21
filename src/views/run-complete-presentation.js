// Loss copy and UI memory are separate from simulation state and the playhead.
export function getRunCompleteInfo(state, { projected = false } = {}) {
  if (state?.runStatus?.complete !== true) return null;
  const status = state.runStatus;
  const year = Math.max(1, Math.floor(status.year ?? state.year ?? 1));
  const tSec = Math.max(0, Math.floor(status.tSec ?? state.tSec ?? 0));
  const reason = status.reason ?? "unknown";
  let cause = "Civilization lost";
  let explanation = "Your civilization reached a loss condition.";
  if (reason === "redGodMonsterOverrun") {
    const threshold = state.civilization?.chaos?.monsterLossThreshold;
    cause = "Overrun by monsters";
    explanation = Number.isFinite(threshold)
      ? `The monster count reached the loss limit of ${Math.floor(threshold)}. The monsters overwhelmed your civilization.`
      : "The monster count reached the loss limit and overwhelmed your civilization.";
    explanation += " Chaos creates monsters over time; reducing its pressure can delay this outcome.";
  } else if (reason === "faithCollapsedAtBronze") {
    cause = "Faith collapsed";
    explanation = "Faith collapsed at the lowest tier, ending your civilization.";
  } else if (reason === "leaderFaithCollapsedAtBronze") {
    cause = "All leaders were lost";
    explanation = "Starvation caused faith to collapse, and your civilization lost its remaining leaders.";
  }
  return {
    year, tSec, reason, projected, cause, explanation,
    monsterCount: state.civilization?.chaos?.monsterCount ?? null,
    title: projected ? "FORESEEN EXTINCTION" : "GAME OVER",
    guidance: projected
      ? "This is a possible future. Return to the present and choose a vassal or a different turning point to change it."
      : "This run has ended. You can still browse its history and inspect what happened.",
  };
}

export function createRunCompletePresentation() {
  let info = null;
  let open = false;
  let revision = null;
  let timeline = null;
  function reset() { info = null; open = false; revision = null; timeline = null; }
  return {
    sync({ frontierState, viewedState, timeline: nextTimeline, revision: nextRevision } = {}) {
      if (nextTimeline !== timeline || (nextRevision !== revision && frontierState?.runStatus?.complete !== true)) {
        info = null;
        open = false;
      }
      timeline = nextTimeline;
      revision = nextRevision;
      const next = getRunCompleteInfo(frontierState)
        ?? getRunCompleteInfo(viewedState, { projected: true });
      const changed = next && (!info || ["tSec", "reason", "projected"].some(key => next[key] !== info[key]));
      if (changed) { info = next; open = true; }
      return { opened: !!changed, info, open };
    },
    minimize: () => { open = false; },
    reopen: () => { if (info) open = true; },
    reset,
    getSnapshot: () => ({ info, open, indicatorVisible: info != null }),
  };
}
