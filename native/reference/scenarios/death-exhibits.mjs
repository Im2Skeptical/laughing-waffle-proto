import { getMoonPhaseAtSecond } from "../../../src/model/moon-phases.js";
import { compositionFromBins } from "../../../src/model/detailed-settlements/helpers.js";
import { runDeathPhase } from "../../../src/model/detailed-settlements/phases/death.js";
import { runMigrationPhase } from "../../../src/model/detailed-settlements/phases/migration.js";
import { resetEmptyStrangerCohort } from "../../../src/model/detailed-settlements/phases/shared.js";
import { getDetailedSettlementSites, refreshGreenAscendancy } from "../../../src/model/detailed-settlements/queries.js";
import { stockTraits } from "../../../src/model/detailed-settlements/stock.js";
import { stepUnrest } from "../../../src/model/detailed-settlements/territory.js";

const moon = state => state.civilization.currentMoonTurn;
const phase = state => getMoonPhaseAtSecond(state, state.tSec);

function prepareArrival(state) {
  // This v53 anchor no longer has a large live arrival. Seed the already
  // debited reservation to isolate how the Death phase handles its meals.
  const composition = compositionFromBins([{
    classId: "villager", allegiance: "player", specialty: "ordinary", kind: "adults", age: null, count: 32,
  }]);
  moon(state).movements = [{
    transferId: `migration:${state.tSec - 1}:overHousing:0`,
    reason: "overHousing", sourceRegionId: "R18", destinationRegionId: "R14",
    sourceClassId: "villager", amount: 32, survivors: 32, arrivalDeaths: 0,
    composition, survivorComposition: null,
  }];
  moon(state).unresolved = [];
}

function destination(state) {
  const movement = moon(state).movements[0];
  return state.world.sites.find(site => site.regionId === movement.destinationRegionId).detailedState;
}

function feedWith(state, amount) {
  for (const slot of destination(state).practiceSlots) {
    if (!stockTraits(state, slot).includes("Edible")) continue;
    slot.stock = amount;
    amount = 0;
  }
}

function arrivalDeaths(state, run, requireThat, amount, survivors) {
  feedWith(state, amount);
  run("death", () => runDeathPhase(state, phase(state)));
  const move = moon(state).movements[0];
  requireThat(move.survivors === survivors && move.arrivalDeaths === move.amount - survivors,
    "Arrival shortage exhibit did not exercise the expected loss");
}

export const deathExhibits = [
  {
    id: "death-partial-arrivals", source: "seed-123-migration", second: 2034, from: "death",
    execute(state, run, requireThat) {
      prepareArrival(state);
      arrivalDeaths(state, run, requireThat, 1, 30);
    },
  },
  {
    id: "death-lost-arrivals", source: "seed-123-migration", second: 2034, from: "death",
    execute(state, run, requireThat) {
      prepareArrival(state);
      arrivalDeaths(state, run, requireThat, 0, 0);
    },
  },
  {
    id: "death-legacy-mitigation", source: "seed-123-migration", second: 2034, from: "death",
    execute(state, run, requireThat) {
      delete state.rulesetId;
      prepareArrival(state);
      const defs = state.gameConfig.gamepieces.structures;
      const slot = destination(state).structureSlots.find(slot => slot && !slot.construction &&
        slot.upkeepActive !== false && !defs[slot.structureId].specialistGate);
      requireThat(slot, "Expected an active Structure for the legacy loss modifier");
      defs[slot.structureId].modifiers.push({ kind: "lossResistance", amount: 1 });
      const pending = state.civilization.chaos.pendingLosses;
      const previous = pending.prematureDeathMitigation ?? 0;
      arrivalDeaths(state, run, requireThat, 1, 30);
      const expected = previous + 2 * .75 * state.gameConfig.settings.values.prematureDeathChaosWeight;
      requireThat(pending.prematureDeathMitigation === expected, "Expected the capped legacy loss modifier");
    },
  },
  {
    id: "death-legacy-emigration", source: "seed-1-migration", second: 1715, from: "migration",
    execute(state, run, requireThat, advanceClock) {
      delete state.rulesetId;
      for (const intent of moon(state).migrationIntents) intent.sourceClassId ??= "villager";
      run("migration", () => runMigrationPhase(state, phase(state)));
      const booked = state.civilization.chaos.pendingLosses.externalEmigrants;
      const bookedMoves = moon(state).movements.filter(move => move.external);
      requireThat(booked > 0 && booked === bookedMoves.reduce((sum, move) => sum + move.amount, 0),
        `Legacy exhibit did not book external emigration (booked ${booked})`);
      advanceClock(state);
      run("death", () => runDeathPhase(state, phase(state)));
      requireThat(state.civilization.chaos.pendingLosses.externalEmigrants === booked,
        "Death changed the booked external loss");
    },
  },
  {
    id: "death-committed-arrivals", source: "seed-123-migration", second: 2034, from: "death",
    execute(state, run, requireThat, advanceClock) {
      prepareArrival(state);
      arrivalDeaths(state, run, requireThat, 1, 30);
      const turn = moon(state);
      const move = turn.movements[0];
      requireThat(move.survivors > 0, "Expected arrivals to commit before expiry");
      advanceClock(state);
      const { detailedState } = state.world.sites.find(site => site.regionId === move.destinationRegionId);
      detailedState.control = {
        unrest: { startedSec: state.tSec - 1, untilSec: state.tSec, previousController: "external-a" },
        claimant: null, claimChecks: 0,
      };
      // The browser prelude, so expiry cancels the bookings and restores the storefront.
      run("prelude", () => {
        stepUnrest(state);
        refreshGreenAscendancy(state);
        for (const site of getDetailedSettlementSites(state)) resetEmptyStrangerCohort(site.detailedState);
      });
      requireThat(turn.movements[0] === move, "Expiry removed a committed transfer");
    },
  },
];
