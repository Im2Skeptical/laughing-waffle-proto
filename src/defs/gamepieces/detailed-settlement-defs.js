// Declarative content for the map-driven detailed-settlement prototype.

export const DETAILED_PRACTICE_SLOT_COUNT = 5;
export const POPULATION_CLASS_ORDER = Object.freeze(["villager", "stranger"]);

const workerMultiplier = () => Object.freeze({
  base: 1,
  perEffectiveWorker: 1,
});

const adjacentPlayerDetailedScope = Object.freeze({
  kind: "adjacent",
  includeHost: false,
  regionFilters: Object.freeze({
    controller: "player",
    detailedSettlement: true,
  }),
});

const connectedPlayerDetailedScope = Object.freeze({
  kind: "connectedComponent",
  includeHost: false,
  traversalFilters: Object.freeze({ controller: "player" }),
  regionFilters: Object.freeze({
    controller: "player",
    detailedSettlement: true,
  }),
});

const administrationReachScope = Object.freeze({
  kind: "conditionalHostPractice",
  practiceId: "preserve",
  requiredDefinitionPath: Object.freeze(["connectedAdministrationReach"]),
  whenPresent: connectedPlayerDetailedScope,
  otherwise: adjacentPlayerDetailedScope,
});

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
    workerCapacity: 3,
    activation: Object.freeze({
      type: "season",
      seasonKeys: Object.freeze(["summer"]),
    }),
    ui: Object.freeze({
      rule: "Gain food for every player-controlled region in this settlement's connected same-colour chain.",
    }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({
        op: "addLocalFood",
        scaledValue: Object.freeze({
          baseAmount: 40,
          evaluator: Object.freeze({
            kind: "countRegions",
            label: "same-colour connected regions",
            scope: Object.freeze({
              kind: "connectedComponent",
              includeHost: true,
              traversalFilters: Object.freeze({
                controller: "player",
                colour: "host",
              }),
              regionFilters: Object.freeze({
                controller: "player",
                colour: "host",
              }),
            }),
          }),
          workerMultiplier: workerMultiplier(),
        }),
      }),
    ]),
  }),
  administrate: Object.freeze({
    id: "administrate",
    label: "Administration",
    workerCapacity: 2,
    activation: Object.freeze({ type: "food", chargePeriodMoons: 1 }),
    ui: Object.freeze({
      rule: "Move meal-safe surplus to resolve meal shortages. Preservation expands reach across player-controlled paths.",
    }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({
        op: "routeLocalFood",
        scaledValue: Object.freeze({
          baseAmount: 50,
          evaluator: Object.freeze({
            kind: "countRegions",
            label: "Administration regions in reach",
            includeHost: true,
            scope: administrationReachScope,
            regionFilters: Object.freeze({ practiceId: "administrate" }),
          }),
          workerMultiplier: workerMultiplier(),
        }),
        targetScope: administrationReachScope,
      }),
    ]),
  }),
  preserve: Object.freeze({
    id: "preserve",
    label: "Preservation",
    workerCapacity: 2,
    connectedAdministrationReach: true,
    editor: Object.freeze({
      fields: Object.freeze([
        Object.freeze({
          path: Object.freeze(["connectedAdministrationReach"]),
          type: "boolean",
          label: "Connected Administration Reach",
        }),
      ]),
    }),
    activation: Object.freeze({ type: "passive" }),
    ui: Object.freeze({
      rule: "Reduce stored-food rot. Local Administration treats player-connected settlements as adjacent.",
    }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({
        op: "reduceFoodDecay",
        foodKind: "stored",
        scaledValue: Object.freeze({
          baseAmount: 20,
          evaluator: Object.freeze({
            kind: "constant",
            score: 1,
            label: "base preservation",
          }),
          workerMultiplier: workerMultiplier(),
        }),
      }),
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
    activation: Object.freeze({ type: "birth", chargePeriodMoons: 1 }),
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
    activation: Object.freeze({ type: "birth", chargePeriodMoons: 1 }),
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
  "reduceFoodDecay",
  "advanceWork",
  "createLocalStructureAtWork",
]);
