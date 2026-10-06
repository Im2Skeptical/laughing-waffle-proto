// Run against the source dev server (after PIXI has loaded):
// await (await import('/scripts/timegraph-projection-browser-check.mjs')).checkProjectionLifecycle()
import { createMetricGraphView } from '../src/views/timegraphs-pixi.js';
import { createSettlementGraphSession } from '../src/views/ui-root/settlement-graph-session.js';

export function checkProjectionLifecycle() {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const app = new PIXI.Application({ width: 1200, height: 300 });
  app.stop();
  let timeline = { historyEndSec: 0, cursorSec: 0 };
  const data = { subjectKey: 'civilization', forecastCoverageEndSec: 100, series: [] };
  const controller = {
    getData: () => data,
    setSubject: (_, key) => { data.subjectKey = key; },
    getSamplesForWindow: () => ({ points: [{ tSec: 0 }, { tSec: 100 }] }),
    ensureCache() {},
  };
  const graph = createMetricGraphView({
    app, layer: app.stage, controller, getTimeline: () => timeline,
    getCursorState: () => ({ tSec: 0 }),
    getWindowSpec: () => ({ minSec: 0, maxSec: 100 }),
  });
  const session = createSettlementGraphSession({
    getGraphController: () => controller, getGraphView: () => graph,
  });
  const overlay = () => graph.getDebugState().projectionReplacement;
  const stage = (maxSecFloor = 100) => {
    check(graph.stageProjectionReplacementTransition({ truncationStartSec: 0, maxSecFloor }),
      'the real graph must capture its projection');
    graph.restartForecastRevealFrom(0, {
      activateProjectionReplacementTransition: true, revealTargetEndSec: 0,
    });
  };
  try {
    graph.open();
    stage();
    check(overlay()?.hasSnapshot, 'the faded graph starts visible');
    session.setSettlementGraphContext('settlement', 'river-crown');
    check(overlay() === null, 'the civilization overlay is hidden in a settlement');
    session.setSettlementGraphContext('civilization');
    check(overlay()?.hasSnapshot, 'returning to Lifegraph preserves the faded graph');
    graph.close();
    graph.open();
    check(overlay()?.hasSnapshot, 'closing and reopening preserves the faded graph');
    stage(120);
    check(overlay()?.maxSecFloor === 120, 'a new projection replaces the old one');
    timeline = { historyEndSec: 0, cursorSec: 0 };
    graph.render();
    check(overlay() === null, 'a new run clears the faded graph');
    return { ok: true, checks: ['scope round trip', 'close/open', 'replacement', 'new run'] };
  } finally {
    graph.destroy();
    app.destroy(true, { children: true });
  }
}
