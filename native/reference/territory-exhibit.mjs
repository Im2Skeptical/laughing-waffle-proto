import { writePopulationBins, populationBins } from "../../src/model/detailed-settlements/population-ledger.js";
import { changeController } from "../../src/model/detailed-settlements/territory.js";
import { selectLifeMapVassal } from "../../src/model/vassal-life-map.js";

// Seed 1 supplies two player holdings and authored storefronts. Keep the
// ordinary tick runner and change only inputs needed to exercise this cut.
export function prepareTerritoryExhibit(state) {
  const region = id => state.world.regions.find(r => r.id === id);
  const town = id => state.world.sites.find(s => s.regionId === id);
  const chaos = state.civilization.chaos;
  const { values } = state.gameConfig.settings;
  chaos.monsterPressure = values.monsterExpansionThreshold - 1;
  chaos.chaosPower = 1000;
  values.monsterProgressPerChaosRatio = .25;

  const claimant = town("R02").detailedState;
  writePopulationBins(claimant, populationBins(claimant).map(bin => ({ ...bin, allegiance: "player" })));
  claimant.control.claimant = "player";
  claimant.control.claimChecks = 1;

  // Place the current Vassal at the holding that will be ruined.
  changeController(state, "R08", "player");
  const threatened = town("R08").detailedState;
  writePopulationBins(threatened, populationBins(threatened).map(bin => ({ ...bin, allegiance: "player" })));
  const candidate = state.civilization.vassalLineage.pendingCandidates[0];
  const selected = selectLifeMapVassal(state, 0, null, { ...candidate, locationRegionId: "R08" });
  if (!selected.ok) throw new Error("Cannot prepare territory Vassal: " + selected.reason);

  for (const row of state.world.regions) delete row.monster;
  region("R08").monster = { defense: 20 };
  region("R09").monster = { defense: 1 };
  chaos.monsterCount = 2;
  const guard = town("R16").detailedState;
  writePopulationBins(guard, populationBins(guard).map(bin => bin.allegiance === "player" && bin.kind === "adults"
    ? { ...bin, specialty: "warrior" }
    : bin));
  guard.structureSlots[3] = {
    structureId: "fm_frontierWatch", placementId: "R16:territory-support", origin: 3, width: 1,
  };
  guard.garrison.supportTargetRegionId = "R09";

  const definitions = state.gameConfig.gamepieces.practices;
  definitions.fm_woodlotRights.effects.push({ op: "triggerMonsterSpawn", amount: 1 });
  definitions.fm_woodlotRights.activation.seasonKeys = ["summer"];
  definitions.smelting.charge.trigger = { any: [{ kind: "monsterSpawn", scope: "civilization" }] };
  definitions.smelting.charge.threshold = 1;
  definitions.monsterHunting.activation = { type: "season", seasonKeys: ["autumn"] };
  definitions.monsterHunting.consume = [];
  guard.unlockedPracticeSlots = 5;
  guard.practiceSlots[3] = {
    practiceId: "smelting", tier: "silver", stock: 0, charge: 0, work: 0,
    instanceId: `institution:${state.civilization.nextPracticeInstanceId++}`,
  };
  guard.practiceSlots[4] = {
    practiceId: "monsterHunting", tier: "silver", stock: 0, charge: 0, work: 0,
    instanceId: `institution:${state.civilization.nextPracticeInstanceId++}`,
  };
  return state;
}
