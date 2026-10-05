import { rebuildStateAtSecond, getActionSecondsInRange } from '../model/timeline/index.js';
import { serializeGameState } from '../model/state.js';
import { createProjectionChunkSession } from '../model/projection-chunk.js';
import { normalizeSavedTimeline, serializeTimelineForSave } from './sim-runner/save-slots.js';

// Run in the save loader, before transferring the result to the UI. Reconstruct
// history once with the official tick/action order rather than replaying a cold
// snapshot for each plotted point. Summaries are runtime data, never a save.
export async function prepareSaveHistorySummaries(timeline, {
  onProgress = () => {},
  yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)),
} = {}) {
  // Replay populates timeline memo/index caches. Keep those private to this job
  // so preparation cannot alter the timeline installed by the authoritative loader.
  timeline = normalizeSavedTimeline(serializeTimelineForSave(timeline), timeline.baseStateData);
  const baseSec = Math.max(0, Math.floor(timeline.baseStateData.tSec ?? 0));
  const endSec = Math.max(baseSec, Math.floor(timeline.historyEndSec ?? baseSec));
  const base = rebuildStateAtSecond(timeline, baseSec);
  if (!base.ok) throw new Error(base.reason);
  const actionsBySecond = getActionSecondsInRange(timeline, baseSec + 1, endSec)
    .map(tSec => ({ tSec, actions: timeline.actionsBySec.get(tSec) }));
  const session = createProjectionChunkSession(serializeGameState(base.state), baseSec, endSec, {
    stepSec: 1,
    // History needs every summary; the save already retains its own anchors.
    stateAnchorStrideSec: Math.max(1, endSec - baseSec),
    actionsBySecond,
  });
  if (!session.ok) throw new Error(session.reason);
  const summaries = new Map();
  let cursor = baseSec;
  do {
    const result = session.next(Math.min(endSec, cursor + 128));
    if (!result.ok) throw new Error(result.reason);
    for (const [sec, summary] of result.summaryBySecond) summaries.set(sec, summary);
    cursor = result.endSec;
    onProgress(cursor);
    if (result.terminal || cursor >= endSec) break;
    await yieldTask();
  } while (cursor < endSec);
  return Array.from(summaries);
}
