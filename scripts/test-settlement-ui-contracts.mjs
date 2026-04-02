import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const entrySource = await readFile("src/views/ui-root-pixi.js", "utf8");
const rootSource = await readFile("src/views/ui-root-settlement-pixi.js", "utf8");
const graphMetricsSource = await readFile("src/model/graph-metrics.js", "utf8");
const prototypeViewSource = await readFile("src/views/settlement-prototype-view.js", "utf8");
const diskViewSource = await readFile("src/views/sunandmoon-disks-pixi.js", "utf8");

assert.match(
  entrySource,
  /import\s+["']\.\/ui-root-settlement-pixi\.js["'];?/,
  "[test] ui root entry should delegate to the settlement prototype boot"
);

for (const forbiddenImport of [
  "inventory-pixi",
  "pawns-pixi",
  "board-pixi",
  "process-widget-pixi",
  "skill-tree-pixi",
  "action-log-pixi",
  "event-log-pixi",
  "env-event-deck-pixi",
]) {
  assert.ok(
    !rootSource.includes(forbiddenImport),
    `[test] settlement root should not boot ${forbiddenImport}`
  );
}

assert.match(
  rootSource,
  /function\s+shouldInvalidateSettlementTimelineForecast\(reason\)/,
  "[test] settlement root should define a dedicated timeline-forecast invalidation filter"
);
assert.match(
  rootSource,
  /if\s*\(shouldInvalidateSettlementTimelineForecast\(reason\)\)\s*\{\s*forecastWorkerService\.handleTimelineInvalidation\?\.\(reason\);\s*settlementGraphController\?\.handleInvalidate\?\.\(reason\);/s,
  "[test] settlement root should only reset forecast/controller state for real timeline mutations"
);
assert.match(
  rootSource,
  /reason === "actionDispatched"[\s\S]*reason === "actionDispatchedCurrentSec"[\s\S]*reason === "plannerClear"[\s\S]*reason\.startsWith\("plannerCommit:"\)/,
  "[test] settlement root invalidation filter should allow actual timeline mutation reasons"
);
assert.ok(
  !/reason === "scrubBrowse"|reason === "scrubCommit"|reason === "plannerCommitBlocked"|reason === "plannerCommitFailed"/.test(rootSource),
  "[test] settlement root invalidation filter should not treat browse-only reasons as timeline mutations"
);
assert.match(
  rootSource,
  /showClose:\s*false/,
  "[test] settlement graph should remain pinned open"
);
assert.match(
  rootSource,
  /draggable:\s*false/,
  "[test] settlement graph should be fixed in the prototype layout"
);
assert.match(
  rootSource,
  /metric:\s*GRAPH_METRICS\.settlement/,
  "[test] settlement root should use the settlement timegraph metric"
);
assert.match(
  rootSource,
  /createTooltipView/,
  "[test] settlement root should boot a tooltip view for graph hover UI"
);
assert.match(
  rootSource,
  /app\.stage\.eventMode\s*=\s*"static"/,
  "[test] settlement root should enable stage-wide pointer capture like the legacy root"
);
assert.match(
  rootSource,
  /app\.stage\.hitArea\s*=\s*app\.screen/,
  "[test] settlement root should set a full-screen stage hit area for drag interactions"
);
assert.match(
  rootSource,
  /createTimegraphForecastWorkerService/,
  "[test] settlement root should boot the timegraph forecast worker service"
);
assert.match(
  rootSource,
  /forecastWorkerService\.handleTimelineInvalidation/,
  "[test] settlement root should forward timeline invalidation to forecast coverage state"
);
assert.match(
  rootSource,
  /forecastWorkerService,\s*\n\s*forecastStepSec:/,
  "[test] settlement graph controller should receive the forecast worker service"
);
assert.match(
  rootSource,
  /previewCursorSecond:\s*\(tSec\)\s*=>\s*\{/,
  "[test] settlement root should wire disk future drag into graph-backed preview states"
);
assert.match(
  rootSource,
  /commitPreviewToLive:\s*\(\)\s*=>\s*runner\.commitPreviewToLive\?\.\(\)/,
  "[test] settlement root should allow disk forecast drags to commit on release"
);
assert.match(
  rootSource,
  /let\s+selectedPracticeClassId\s*=\s*"villager"/,
  "[test] settlement root should default the selected class to villagers"
);
assert.match(
  rootSource,
  /setSubject\?\.\(\{\s*classId:\s*selectedPracticeClassId\s*\}/,
  "[test] settlement graph should follow the selected class subject"
);
assert.match(
  rootSource,
  /SETTLEMENT_GRAPH_WINDOW_YEARS\s*=\s*40/,
  "[test] settlement root should define a 40-year settlement graph window"
);
assert.match(
  rootSource,
  /MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES\s*=\s*5/,
  "[test] settlement root should cap the visible settlement graph series count"
);
assert.match(
  rootSource,
  /horizonSec:\s*SETTLEMENT_GRAPH_WINDOW_SEC/,
  "[test] settlement graph controller should use the settlement graph window constant"
);
assert.match(
  rootSource,
  /getSystemTargetModeLabel:\s*\(\)\s*=>\s*getSettlementGraphSeriesButtonLabel\(\)/,
  "[test] settlement graph should expose a series picker button in the header"
);
assert.match(
  rootSource,
  /onToggleSystemTargetMode:\s*\(\)\s*=>\s*toggleSettlementGraphSeriesMenu\(\)/,
  "[test] settlement graph header button should toggle the settlement series menu"
);
assert.match(
  rootSource,
  /function\s+renderSettlementGraphSeriesMenu\(/,
  "[test] settlement root should render a settlement graph series menu"
);

for (const label of ["Order", "Practice", "Structures"]) {
  if (label === "Practice") {
    assert.match(
      prototypeViewSource,
      /Practice - \$\{capitalizeLabel\(selectedClassId\)\}/,
      "[test] prototype playfield should render the selected class in the practice zone label"
    );
    continue;
  }
  assert.ok(
    prototypeViewSource.includes(`"${label}"`),
    `[test] prototype playfield should render the ${label} zone label`
  );
}

assert.match(
  prototypeViewSource,
  /drawClassSummaryCard/,
  "[test] prototype playfield should render dedicated per-class summary cards"
);
assert.match(
  prototypeViewSource,
  /createClassTab/,
  "[test] prototype playfield should render tabs for switching the visible class practice board"
);
assert.match(
  prototypeViewSource,
  /setSelectedPracticeClassId\?\.\(classId\)/,
  "[test] prototype playfield should allow class tab interaction to switch boards"
);
assert.match(
  prototypeViewSource,
  /const classTabsRect = \{ x: 430, y: 344, width: 850, height: 34 \}/,
  "[test] prototype layout should reserve a dedicated class-tab row between the class summaries and practice panel"
);
assert.match(
  prototypeViewSource,
  /y:\s*classTabsRect\.y/,
  "[test] class tabs should be positioned from the dedicated class-tab row instead of overlapping summary cards"
);
assert.match(
  prototypeViewSource,
  /Adults \$\{Math\.floor\(population\?\.adults \?\? 0\)\}  Youth \$\{Math\.floor\(population\?\.youth \?\? 0\)\}/,
  "[test] class summary cards should show adults and youth separately"
);
assert.match(
  prototypeViewSource,
  /Faith \$\{capitalizeTier/,
  "[test] class summary cards should show class faith state"
);
assert.match(
  prototypeViewSource,
  /Mood \$\{capitalizeLabel\(happiness\?\.status\)\}/,
  "[test] class summary cards should show class happiness state"
);
assert.match(
  prototypeViewSource,
  /fullFeedStreak.*missedFeedStreak/s,
  "[test] class summary cards should show full and missed feed progress"
);
assert.match(
  prototypeViewSource,
  /Partial \$\{formatPartialFeedMemory\(happiness\?\.partialFeedRatios\)\}/,
  "[test] class summary cards should show partial-feed memory"
);
assert.match(
  prototypeViewSource,
  /getSettlementPracticeSlotsByClass\(state,\s*selectedClassId\)/,
  "[test] prototype playfield should render the selected class practice tableau"
);
assert.match(
  graphMetricsSource,
  /id:\s*"totalPopulation"/,
  "[test] settlement graph should include total population"
);
assert.match(
  graphMetricsSource,
  /id:\s*"faith"/,
  "[test] settlement graph should include faith"
);
assert.match(
  graphMetricsSource,
  /id:\s*"happiness"/,
  "[test] settlement graph should include happiness"
);
assert.match(
  graphMetricsSource,
  /subject\?\.classId/,
  "[test] settlement graph should read the selected class subject for class-specific series"
);
assert.match(
  graphMetricsSource,
  /getLegendTooltipSpec:/,
  "[test] settlement graph series should define legend tooltip specs"
);
assert.ok(
  prototypeViewSource.includes("Stored Green:"),
  "[test] floodplain cards should show stored green amounts"
);
assert.match(
  graphMetricsSource,
  /Each season change consumes up to .* adults \+ .* youth at 0\.5/,
  "[test] food tooltip text should describe weighted seasonal upkeep"
);
assert.match(
  graphMetricsSource,
  /Adults: \$\{population\.adults\}/,
  "[test] population tooltip should show adults separately"
);
assert.match(
  graphMetricsSource,
  /Youth: \$\{population\.youth\}/,
  "[test] population tooltip should show youth separately"
);
assert.match(
  graphMetricsSource,
  /Full-feed streak: .*Missed-feed streak: .*Partial memory:/s,
  "[test] happiness tooltip should show full-feed progress, missed-feed progress, and partial memory"
);
assert.match(
  graphMetricsSource,
  /Three full seasons set happiness to positive\. Three consecutive misses trigger starvation, and further misses keep triggering it until the class gets at least a 50% feed\./,
  "[test] happiness tooltip should describe the new feed-memory and starvation rules"
);
assert.match(
  prototypeViewSource,
  /drawPracticeCard/,
  "[test] practice cards should use a dedicated renderer for the active drain fill"
);
assert.match(
  prototypeViewSource,
  /practiceMode === "passive"/,
  "[test] prototype view should distinguish passive practice cards from actives"
);
assert.match(
  prototypeViewSource,
  /cardHeight = isPassivePractice \? practiceCardWidth/,
  "[test] passive practice cards should render as square cards"
);
assert.match(
  prototypeViewSource,
  /passiveBorder/,
  "[test] passive practice cards should use a distinct border treatment"
);
assert.match(
  prototypeViewSource,
  /activeReservation === true \|\| runtime\.activeProgressKind === "cadence"/,
  "[test] practice card rendering should use the drain fill for reservation or cadence progress"
);
assert.match(
  prototypeViewSource,
  /Next trigger: \$\{Math\.max\(0, Math\.floor\(runtime\.activeRemainingSec \?\? 0\)\)\}s/,
  "[test] practice cards should show a cadence countdown when an active practice is waiting for its next trigger"
);
assert.match(
  diskViewSource,
  /globalpointermove/,
  "[test] sun\/moon disks should listen to global pointer movement while dragging"
);
assert.match(
  diskViewSource,
  /previewCursorSecond,\s*\n\s*clearPreviewState,\s*\n\s*commitPreviewToLive,/,
  "[test] sun\/moon disks should accept preview callbacks for forward drag forecasting"
);
assert.match(
  diskViewSource,
  /if\s*\(typeof previewCursorSecond === "function"\)\s*\{\s*queuePreviewSecond\(dragSec\);/s,
  "[test] sun\/moon disks should preview future drag instead of committing immediately"
);

console.log("[test] settlement ui contracts passed");
