import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  clampDiskHistoryBrowseTargetSec,
  clampDiskForecastPreviewTargetSec,
} from "../src/views/sunandmoon-disks-pixi.js";
import {
  clampForecastScrubTargetSec,
  computeGraphSeriesScaleRanges,
} from "../src/views/timegraphs-pixi.js";
import {
  computeSettlementGraphWindowSpec,
  computeSettlementProjectionCacheConfig,
} from "../src/views/ui-root/settlement-timegraph-window.js";

const entrySource = await readFile("src/views/ui-root-pixi.js", "utf8");
const rootSource = await readFile("src/views/ui-root-settlement-pixi.js", "utf8");
const graphMetricsSource = await readFile("src/model/graph-metrics.js", "utf8");
const prototypeViewSource = await readFile("src/views/settlement-prototype-view.js", "utf8");
const diskViewSource = await readFile("src/views/sunandmoon-disks-pixi.js", "utf8");
const timegraphViewSource = await readFile("src/views/timegraphs-pixi.js", "utf8");
const vassalChooserSource = await readFile("src/views/settlement-vassal-chooser-pixi.js", "utf8");

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
  /getForecastPreviewCapSec:\s*\(\)\s*=>/,
  "[test] settlement root should pass the graph reveal cap to disk preview controls"
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
assert.ok(
  !/setSubject\?\.\(\{\s*classId:\s*selectedPracticeClassId\s*\}/.test(rootSource),
  "[test] settlement graph should not couple graph series to the selected practice tab"
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
  /projectionCache:\s*settlementProjectionCache/,
  "[test] settlement graph controller should use a dedicated projection cache sized for the settlement forecast"
);
assert.match(
  rootSource,
  /computeSettlementGraphWindowSpec/,
  "[test] settlement root should use a settlement-specific graph window policy"
);
assert.match(
  rootSource,
  /createSettlementVassalChooserView/,
  "[test] settlement root should boot the blocking vassal chooser overlay"
);
assert.match(
  rootSource,
  /createSettlementVassalChooserView\([\s\S]*tooltipView/s,
  "[test] settlement root should provide tooltip support to the vassal chooser"
);
assert.match(
  rootSource,
  /createSettlementVassalControlsView/,
  "[test] settlement root should boot dedicated vassal controls"
);
assert.match(
  rootSource,
  /setHorizonSecOverride\?\.\(/,
  "[test] settlement root should override graph horizon when the current lineage extends past the base window"
);
assert.match(
  rootSource,
  /ActionKinds\.SETTLEMENT_SELECT_VASSAL_CANDIDATE/,
  "[test] settlement root should dispatch the vassal selection action from the chooser"
);
assert.match(
  rootSource,
  /ActionKinds\.SETTLEMENT_BEGIN_NEXT_VASSAL_SELECTION/,
  "[test] settlement root should dispatch the next-vassal selection action from the control button"
);
assert.match(
  rootSource,
  /getVisibleVassalTimeSec:/,
  "[test] settlement prototype view should receive a reveal-aware vassal visibility callback"
);
assert.match(
  rootSource,
  /getForecastScrubCapSec\?\.\(\)/,
  "[test] settlement root should use the graph reveal cap for vassal skip gating and panel visibility"
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
assert.match(
  rootSource,
  /function\s+partitionSettlementGraphMenuSeries\(allSeries\)/,
  "[test] settlement root should partition the series picker into grouped menu data"
);
assert.match(
  rootSource,
  /function\s+buildSettlementGraphSeriesMenuLayout\(allSeries\)/,
  "[test] settlement root should build a grouped layout for the series picker"
);
assert.match(
  rootSource,
  /function\s+getSettlementGraphSeriesMenuRect\(allSeries\)/,
  "[test] settlement root should compute the series menu rect dynamically"
);
assert.match(
  rootSource,
  /graphRect\.y - height - 8/,
  "[test] settlement graph series menu should anchor above the graph when opened"
);
assert.match(
  rootSource,
  /VIEWPORT_DESIGN_HEIGHT - height - SETTLEMENT_GRAPH_MENU_MARGIN/,
  "[test] settlement graph series menu should clamp inside the viewport height"
);
assert.match(
  rootSource,
  /"Toggle any mix of globals and class metrics"/,
  "[test] settlement graph series menu should explain mixed global and class metric toggles"
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
assert.ok(
  !prototypeViewSource.includes("buildOrderLines"),
  "[test] prototype playfield should not rely on the old single-text order summary helper"
);
assert.match(
  prototypeViewSource,
  /function\s+getOrderRuntime\(card\)/,
  "[test] prototype playfield should normalize order runtime through a dedicated helper"
);
assert.match(
  prototypeViewSource,
  /function\s+getSortedOrderMembers\(card\)/,
  "[test] prototype playfield should sort elders through a dedicated order member helper"
);
assert.match(
  prototypeViewSource,
  /function\s+getSelectedAgendaForMember\(member,\s*selectedClassId\)/,
  "[test] elder roster should resolve preview agendas from the selected class"
);
assert.match(
  prototypeViewSource,
  /function\s+buildElderDetailTooltipSpec\(orderDef,\s*member\)/,
  "[test] elder roster should build structured elder detail tooltips"
);
assert.match(
  prototypeViewSource,
  /function\s+drawElderRoster\(/,
  "[test] order panel should render a dedicated elder roster"
);
assert.match(
  prototypeViewSource,
  /function\s+drawElderLozenge\(/,
  "[test] elder roster should render per-elder lozenges"
);
assert.match(
  prototypeViewSource,
  /sourceVassalId/,
  "[test] elder roster should recognize vassal-backed council members"
);
assert.match(
  prototypeViewSource,
  /"Vassal"/,
  "[test] elder roster should visibly badge vassal-backed council members"
);
assert.match(
  prototypeViewSource,
  /function\s+drawOrderGlobalSummary\(/,
  "[test] order panel should render a dedicated global summary section"
);
assert.match(
  prototypeViewSource,
  /function\s+drawOrderPanel\(/,
  "[test] prototype playfield should split the order panel through a dedicated renderer"
);
assert.match(
  prototypeViewSource,
  /const\s+selectedAgenda\s*=\s*getSelectedAgendaForMember\(member,\s*selectedClassId\)/,
  "[test] elder lozenges should preview the agenda for the selected class"
);
assert.match(
  prototypeViewSource,
  /drawOrderGlobalSummary\(container,\s*rightRect,\s*card\)/,
  "[test] order panel right side should render only the compact global summary"
);
assert.ok(
  !/drawResolvedBoardStrip|getResolvedBoardsByClass/.test(prototypeViewSource),
  "[test] order panel right side should no longer render resolved board strips"
);
assert.match(
  prototypeViewSource,
  /function\s+renderAgendaFlyout\(state\)/,
  "[test] elder agenda hover should render a dedicated flyout"
);
assert.match(
  prototypeViewSource,
  /function\s+showAgendaFlyout\(spec\)/,
  "[test] elder agenda hover should expose a flyout show helper"
);
assert.match(
  prototypeViewSource,
  /"Full Agenda"/,
  "[test] elder agenda flyout should label the expanded agenda view"
);
assert.match(
  prototypeViewSource,
  /showAgendaFlyout\?\.\(\{\s*member,\s*anchorDisplayObject:\s*agendaHit,/s,
  "[test] elder lozenges should hook agenda hover into the flyout controller"
);
assert.match(
  prototypeViewSource,
  /drawOrderPanel\(\s*contentLayer,\s*orderRect,\s*state,\s*selectedClassId,\s*orderCard,/s,
  "[test] prototype playfield should render the split order panel instead of a text card"
);
assert.match(
  graphMetricsSource,
  /id:\s*`\$\{metricId\}:\$\{safeClassId\}`/,
  "[test] settlement graph should include class-qualified graph series ids"
);
assert.match(
  graphMetricsSource,
  /getSettlementClassIds/,
  "[test] settlement graph should derive class-qualified series from the settlement class list"
);
assert.match(
  graphMetricsSource,
  /id:\s*"totalPopulation"/,
  "[test] settlement graph should include a settlement-wide total population series"
);
assert.match(
  graphMetricsSource,
  /pickerGroup:\s*"classMetric"/,
  "[test] settlement graph should tag class metric series for picker grouping"
);
assert.match(
  graphMetricsSource,
  /pickerMetricId:\s*metricId/,
  "[test] settlement graph should expose metric ids for grouped class toggles"
);
assert.ok(
  !/subject\?\.classId/.test(graphMetricsSource),
  "[test] settlement graph should not depend on the selected class subject for class-specific toggles"
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
  /Each season change consumes up to .* food \(\$\{population\.adults\} adults \+ \$\{population\.youth\} youth, with 1 food per \$\{youthPerFood\} youth and odd youth rounded up\)\./,
  "[test] food tooltip text should describe rounded youth seasonal upkeep"
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
  vassalChooserSource,
  /villager:\s*"Villager"/,
  "[test] vassal chooser cards should render a villager agenda subsection"
);
assert.match(
  vassalChooserSource,
  /stranger:\s*"Stranger"/,
  "[test] vassal chooser cards should render a stranger agenda subsection"
);
assert.match(
  vassalChooserSource,
  /createMiniPracticeCard/,
  "[test] vassal chooser cards should render board-style mini practice cards for agendas"
);
assert.match(
  prototypeViewSource,
  /getVisibleVassalTimeSec/,
  "[test] prototype vassal panel should accept a reveal-aware visible time callback"
);
assert.match(
  prototypeViewSource,
  /visibleVassalThroughSec/,
  "[test] prototype vassal panel should compute event visibility from the reveal-aware time"
);
assert.match(
  prototypeViewSource,
  /Died of \$\{formatVassalDeathCause/,
  "[test] vassal event log should show explicit death causes"
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
  /if\s*\(typeof previewCursorSecond === "function"\)\s*\{\s*queuePreviewSecond\(clampedFutureSec\);/s,
  "[test] sun\/moon disks should preview future drag instead of committing immediately"
);
assert.match(
  timegraphViewSource,
  /statusNote = "Forecast revealing"/,
  "[test] metric graph should block previewing beyond the current forecast reveal boundary"
);
assert.match(
  timegraphViewSource,
  /FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC\s*=\s*480/,
  "[test] metric graph should reveal forecast coverage at the faster prototype pacing"
);
assert.match(
  timegraphViewSource,
  /FORECAST_REVEAL_TARGET_DURATION_SEC\s*=\s*0\.6/,
  "[test] metric graph should scale reveal speed to the visible forecast span"
);
assert.equal(
  clampDiskHistoryBrowseTargetSec(42, 120),
  42,
  "[test] history disk drag should preserve historical browse targets inside realized history"
);
assert.equal(
  clampDiskHistoryBrowseTargetSec(140, 120),
  120,
  "[test] history disk drag should clamp to the realized frontier when overshooting"
);
assert.equal(
  clampDiskForecastPreviewTargetSec(240, 120, 180),
  180,
  "[test] disk future preview should clamp to the animated forecast reveal cap"
);
assert.equal(
  clampForecastScrubTargetSec(240, 120, 180, { minSec: 0, maxSec: 500 }),
  180,
  "[test] graph forecast scrub should clamp to the animated forecast reveal cap"
);
const mixedScaleRanges = computeGraphSeriesScaleRanges(
  [
    { id: "population:villager", scaleGroupId: "population", scaleMode: "dynamic", scaleMin: 0 },
    { id: "faith:villager", scaleGroupId: "faith", scaleMode: "fixed", scaleMin: 0, scaleMax: 100 },
    { id: "faith:stranger", scaleGroupId: "faith", scaleMode: "fixed", scaleMin: 0, scaleMax: 100 },
  ],
  new Map([
    ["population:villager", [10, 20, 35]],
    ["faith:villager", [25, 50, 75]],
    ["faith:stranger", [0, 25, 100]],
  ])
);
assert.deepEqual(
  mixedScaleRanges.get("population:villager"),
  {
    groupId: "population",
    scaleMode: "dynamic",
    minValue: 0,
    maxValue: 35,
  },
  "[test] dynamic graph series should normalize to their own observed maximum"
);
assert.deepEqual(
  mixedScaleRanges.get("faith:villager"),
  {
    groupId: "faith",
    scaleMode: "fixed",
    minValue: 0,
    maxValue: 100,
  },
  "[test] fixed graph series should preserve their configured full-range bounds"
);
assert.deepEqual(
  mixedScaleRanges.get("faith:stranger"),
  {
    groupId: "faith",
    scaleMode: "fixed",
    minValue: 0,
    maxValue: 100,
  },
  "[test] class variants of a fixed graph metric should share the same full-range bounds"
);
assert.deepEqual(
  computeSettlementGraphWindowSpec({
    historyEndSec: 32,
    cursorSec: 32,
    horizonSec: 5120,
  }),
  {
    minSec: 0,
    maxSec: 32 + 5120,
    scrubSec: 32,
  },
  "[test] settlement graph default window should keep the full forecast horizon visible"
);
assert.deepEqual(
  computeSettlementGraphWindowSpec({
    historyEndSec: 128,
    cursorSec: 96,
    forecastPreviewSec: 180,
    horizonSec: 5120,
  }),
  {
    minSec: 0,
    maxSec: 128 + 5120,
    scrubSec: 180,
  },
  "[test] settlement graph window should keep the full forecast horizon while allowing preview scrub focus"
);
assert.deepEqual(
  computeSettlementGraphWindowSpec({
    historyEndSec: 640,
    cursorSec: 672,
    forecastPreviewSec: 900,
    horizonSec: 5120,
    lineageStartSec: 128,
    currentVassalStartSec: 384,
    latestDeathSec: 960,
  }),
  {
    minSec: 128,
    maxSec: 960,
    scrubSec: 900,
  },
  "[test] settlement graph default lineage window should start at the first selected vassal and end at the latest death"
);
assert.deepEqual(
  computeSettlementGraphWindowSpec({
    historyEndSec: 640,
    cursorSec: 672,
    horizonSec: 5120,
    zoomed: true,
    lineageStartSec: 128,
    currentVassalStartSec: 384,
    latestDeathSec: 960,
  }),
  {
    minSec: 384,
    maxSec: 960,
    scrubSec: 672,
  },
  "[test] settlement graph focus mode should start at the current vassal while remaining pinned to the latest lineage death"
);
const projectionCacheConfig = computeSettlementProjectionCacheConfig({
  horizonSec: 5120,
  stepSec: 1,
});
assert.ok(
  projectionCacheConfig.maxEntries > 5120,
  "[test] settlement projection cache should hold more than one full 40-year 1s forecast window"
);
assert.ok(
  projectionCacheConfig.maxBytes > 48 * 1024 * 1024,
  "[test] settlement projection cache should exceed the shared default byte budget for long-horizon forecasts"
);

console.log("[test] settlement ui contracts passed");
