import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  allegianceSummary, allocatePopulation, populationBins, removePeople, selectPeople, writePopulationBins,
} from "../../../src/model/detailed-settlements/population-ledger.js";
import { combineSpecialistCohorts, splitSpecialistCohorts } from "../../../src/model/detailed-settlements/cohorts.js";

const [binary, opening, output] = process.argv.slice(2);
const state = JSON.parse(readFileSync(opening, "utf8"));
const initial = state.world.sites[0].detailedState.populationByClass;
const bin = (allegiance, classId, specialty, kind, age, count) => ({ allegiance, classId, specialty, kind, age, count });
const inputs = [
  [],
  [
    bin("player", "stranger", "scholar", "elder", 99, 2),
    bin("player", "stranger", "scholar", "elder", 100, 5),
    bin("external-a", "stranger", "scholar", "elder", 105, 1),
    bin("player", "stranger", "scholar", "elder", 99, 3),
    bin("neutral", "stranger", "warrior", "elder", 57, 3),
    bin("neutral", "villager", "ordinary", "children", null, 8),
    bin("neutral", "villager", "warrior", "adults", null, 1),
    bin("player", "villager", "ordinary", "adults", null, 0),
  ],
  [
    bin("player", "villager", "ordinary", "elder", 99, 1),
    bin("player", "villager", "ordinary", "elder", 100, 1),
    bin("player", "stranger", "ordinary", "elder", 100, 1),
    bin("neutral", "stranger", "scholar", "adults", null, 1),
    bin("external-a", "villager", "warrior", "children", null, 1),
  ],
  [
    bin("player", "villager", "ordinary", "adults", null, 3),
    bin("player", "villager", "ordinary", "adults", null, 1),
  ],
  [
    bin("player", "villager", "ordinary", "adults", null, 2 ** 53),
    bin("player", "villager", "ordinary", "children", null, 1),
    bin("player", "stranger", "ordinary", "adults", null, 1),
  ],
];
for (let sample = 0; sample < 12; ++sample) {
  const factions = ["player", "external-a", "neutral"];
  const specialties = ["ordinary", "warrior", "scholar"];
  const stages = ["children", "adults", "elder"];
  inputs.push(Array.from({ length: sample * 3 + 5 }, (_, i) => {
    const n = (i * 37 + i * i + sample * 17) % 147;
    const kind = stages[Math.floor(n / 3) % 3];
    return bin(factions[n % 3], i % 2 ? "stranger" : "villager",
      specialties[Math.floor(n / 5) % 3], kind, kind === "elder" ? 45 + n % 64 : null,
      (i * 53 + sample * 11) % 17);
  }));
}

const vectors = inputs.map(bins => {
  const settlement = { populationByClass: structuredClone(initial) };
  writePopulationBins(settlement, bins);
  const written = structuredClone(settlement.populationByClass);
  const byFaction = Object.entries(allegianceSummary(settlement));
  const cohorts = Object.fromEntries(Object.entries(written).map(([classId, cohort]) => {
    const parts = splitSpecialistCohorts(cohort);
    const combined = {};
    combineSpecialistCohorts(combined, parts);
    return [classId, { parts, combined }];
  }));
  const filter = { kind: "adults", opposing: true };
  const selected = selectPeople(settlement, 12, filter, "player");
  const removed = removePeople(settlement, selected);
  return {
    bins, written, byFaction, cohorts, selected, removed, remaining: settlement.populationByClass,
    ordered: populationBins({ populationByClass: written }),
    allocations: [-1, 0, 1, 2, 3.9, 7, 13, 2000].map(requested => ({
      requested, bins: allocatePopulation(bins, requested),
    })),
  };
});

writeFileSync(output, JSON.stringify(vectors));
const result = spawnSync(binary, [opening, output], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
