// Declarative content for the map-driven detailed-settlement prototype.

export const DETAILED_PRACTICE_SLOT_COUNT = 5;
export const POPULATION_CLASS_ORDER = Object.freeze(["villager", "stranger"]);

export const settlementStructureDefs = Object.freeze({
  granary: Object.freeze({
    id: "granary",
    label: "Granary",
    capacityKind: "storedFood",
    capacityPerCountSquared: 100,
  }),
  mudHouses: Object.freeze({
    id: "mudHouses",
    label: "Mud Houses",
    capacityKind: "housing",
    capacityPerCountSquared: 20,
  }),
});

export const detailedSettlementPracticeDefs = Object.freeze({
  cultivate: Object.freeze({
    id: "cultivate",
    label: "Cultivate",
    workerCapacity: 2,
    activation: Object.freeze({ type: "season" }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({
        op: "addLocalFood",
        amountPerEffectiveWorker: 10,
        multiplier: Object.freeze({ evaluator: "adjacentPlayerSameColour" }),
      }),
    ]),
  }),
  administrate: Object.freeze({
    id: "administrate",
    label: "Administrate",
    workerCapacity: 2,
    activation: Object.freeze({ type: "newMoon", chargePeriodMoons: 1 }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({ op: "routeLocalFood", packetPerEffectiveWorker: 10 }),
    ]),
  }),
  preserve: Object.freeze({
    id: "preserve",
    label: "Preserve",
    workerCapacity: 2,
    activation: Object.freeze({ type: "passive" }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({ op: "modifyStoredFoodDecay", additivePercentPerEffectiveWorker: -2 }),
    ]),
  }),
  vassalDummyPractice01: Object.freeze({
    id: "vassalDummyPractice01",
    label: "Vassal Dummy Practice 01",
    workerCapacity: 0,
    activation: Object.freeze({ type: "passive" }),
    costs: Object.freeze([]),
    effects: Object.freeze([]),
  }),
  vassalDummyPractice02: Object.freeze({
    id: "vassalDummyPractice02",
    label: "Vassal Dummy Practice 02",
    workerCapacity: 0,
    activation: Object.freeze({ type: "passive" }),
    costs: Object.freeze([]),
    effects: Object.freeze([]),
  }),
  vassalDummyPractice03: Object.freeze({
    id: "vassalDummyPractice03",
    label: "Vassal Dummy Practice 03",
    workerCapacity: 0,
    activation: Object.freeze({ type: "passive" }),
    costs: Object.freeze([]),
    effects: Object.freeze([]),
  }),
  buildGranary: Object.freeze({
    id: "buildGranary",
    label: "Build Granary",
    workerCapacity: 1,
    activation: Object.freeze({ type: "newMoon", chargePeriodMoons: 1 }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({ op: "advanceWork", amountPerEffectiveWorker: 1 }),
      Object.freeze({ op: "createLocalStructureAtWork", structureDefId: "granary", requiredWork: 1 }),
    ]),
  }),
  buildMudHouses: Object.freeze({
    id: "buildMudHouses",
    label: "Build Mud Houses",
    workerCapacity: 1,
    activation: Object.freeze({ type: "newMoon", chargePeriodMoons: 1 }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({ op: "advanceWork", amountPerEffectiveWorker: 1 }),
      Object.freeze({ op: "createLocalStructureAtWork", structureDefId: "mudHouses", requiredWork: 1 }),
    ]),
  }),
});

export const VASSAL_INTERVENTION_PRACTICE_IDS = Object.freeze([
  "vassalDummyPractice01",
  "vassalDummyPractice02",
  "vassalDummyPractice03",
  "buildGranary",
  "buildMudHouses",
]);

export const detailedSettlementEffectOps = Object.freeze([
  "addLocalFood",
  "routeLocalFood",
  "modifyStoredFoodDecay",
  "advanceWork",
  "createLocalStructureAtWork",
]);
