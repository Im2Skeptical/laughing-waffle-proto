// Birth moon phase: aging, births, and child/adult/elder transitions.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import { clone } from "../helpers.js";
import { runPracticeActivation } from "../practices.js";
import { getDetailedSettlementSites } from "../queries.js";
import { beginMoonTurn } from "./moon-turn.js";
import { resolveProbability, rollCount } from "./shared.js";

export function runBirthPhase(state, phase) {
  const turn = beginMoonTurn(state, phase);
  runPracticeActivation(state, "birth");
  const lastAgedYear = Math.max(1, Math.floor(
    state.civilization.lastPopulationAgingYear ?? 1
  ));
  const ageAdvance = Math.max(0, Math.floor(state.year ?? 1) - lastAgedYear);
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const result = { tSec: state.tSec, year: state.year, byClass: {} };
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      const snapshot = clone(classState);
      if (ageAdvance > 0) {
        snapshot.eldersByAge = snapshot.eldersByAge.map((cohort) => ({
          ...cohort,
          age: cohort.age + ageAdvance,
        }));
      }
      const faithLabel = String(snapshot.faith.tier ?? "gold")
        .replace(/^./, (letter) => letter.toUpperCase());
      const birthRate = resolveProbability(getGameSetting(state, `birthRate${faithLabel}`));
      const childToAdultRate = getGameSetting(state, "childToAdultRate");
      const adultToElderRate = getGameSetting(state, "adultToElderRate");
      const births = rollCount(state, snapshot.adults, birthRate);
      const matured = rollCount(state, snapshot.children, childToAdultRate);
      const newElders = rollCount(state, snapshot.adults, adultToElderRate);
      const nextElders = snapshot.eldersByAge.map((cohort) => ({ ...cohort }));
      if (newElders > 0) {
        const newElderAge = getGameSetting(state, "newElderAge");
        const existing = nextElders.find((cohort) => cohort.age === newElderAge);
        if (existing) existing.count += newElders;
        else nextElders.push({ age: newElderAge, count: newElders });
      }
      classState.children = snapshot.children - matured + births;
      classState.adults = snapshot.adults + matured - newElders;
      classState.eldersByAge = nextElders.sort((a, b) => a.age - b.age);
      result.byClass[classId] = {
        births,
        matured,
        newElders,
        ageAdvance,
        birthRate,
        childToAdultRate,
        adultToElderRate,
      };
    }
    turn.regions[site.regionId].birth = result;
  }
  state.civilization.lastPopulationAgingYear = Math.max(
    lastAgedYear,
    Math.floor(state.year ?? 1)
  );
}
