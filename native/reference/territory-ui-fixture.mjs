import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { serializeGameState } from "../../src/model/state.js";
import { rebuildStateAtSecond } from "../../src/model/timeline/index.js";
import { assignGarrisonSupport } from "../../src/model/detailed-settlements/territory.js";
import { populationBins, writePopulationBins } from "../../src/model/detailed-settlements/population-ledger.js";
import { createStart, groupReplayActions, loadScenario } from "./trace.mjs";

const output = process.argv[2];
if (!output) throw new Error("Usage: node native/reference/territory-ui-fixture.mjs <save.json>");

const { scenario, startSec, endSec } = loadScenario("action-campaign-nest-mid-moon");
const base = createStart(scenario, startSec);
const site = (state, id) => state.world.sites.find(row => row.regionId === id);
const guard = site(base, "R16").detailedState;
writePopulationBins(guard, populationBins(guard).map(bin => bin.allegiance === "player" && bin.kind === "adults"
  ? { ...bin, specialty: "warrior" }
  : bin));
guard.structureSlots[3] = { structureId: "fm_frontierWatch", placementId: "R16:territory-ui", origin: 3, width: 1 };

const { timeline } = groupReplayActions(base, scenario);
const restored = rebuildStateAtSecond(timeline, endSec);
assert.equal(restored.ok, true);
assert.equal(site(base, "R12").simulationMode, "ruin");
assert.equal(site(restored.state, "R12").simulationMode, "detailed");
assert.equal(assignGarrisonSupport(restored.state, { regionId: "R16", targetRegionId: "R09" }).ok, true);
assert.equal(assignGarrisonSupport(restored.state, { regionId: "R16", targetRegionId: null }).ok, true);

writeFileSync(output, JSON.stringify({
  meta: { schemaVersion: 33 },
  timeline: { baseStateData: serializeGameState(base), actions: timeline.actions, historyEndSec: endSec, cursorSec: endSec },
}));
