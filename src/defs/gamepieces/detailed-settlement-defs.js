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

const commercialAdjacentScope = Object.freeze({
  kind: "commercialAdjacent",
  includeHost: false,
});

export const settlementStructureDefs = Object.freeze({
  granary: Object.freeze({
    id: "granary",
    label: "Granary",
    vassalPrestigeCost: 18,
    vassalYearCost: 4,
    capacityKind: "storedFood",
    capacityPerCountSquared: 180,
  }),
  mudHouses: Object.freeze({
    id: "mudHouses",
    label: "Mud Houses",
    vassalPrestigeCost: 14,
    vassalYearCost: 3,
    capacityKind: "housing",
    capacityPerCountSquared: 35,
  }),
});

export const detailedSettlementPracticeDefs = Object.freeze({
  cultivate: Object.freeze({
    id: "cultivate",
    label: "Cultivate",
    vassalPrestigeCost: 18,
    vassalYearCost: 4,
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
          baseAmount: 120,
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
    vassalPrestigeCost: 20,
    vassalYearCost: 4,
    workerCapacity: 2,
    activation: Object.freeze({ type: "food", chargePeriodMoons: 1 }),
    ui: Object.freeze({
      rule: "Move meal-safe surplus to resolve meal shortages in adjacent settlements.",
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
    vassalPrestigeCost: 22,
    vassalYearCost: 4,
    workerCapacity: 2,
    connectedAdministrationReach: false,
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
      rule: "Reduce stored-food rot.",
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
  forage: Object.freeze({
    id: "forage",
    label: "Forage",
    vassalPrestigeCost: 10,
    vassalYearCost: 2,
    workerCapacity: 1,
    activation: Object.freeze({ type: "food", stage: "preRouting" }),
    ui: Object.freeze({
      rule: "Gather Food before Administration routes this phase's supplies.",
    }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({
        op: "addLocalFood",
        scaledValue: Object.freeze({
          baseAmount: 5,
          evaluator: Object.freeze({
            kind: "constant",
            score: 1,
            label: "local forage",
          }),
          workerMultiplier: workerMultiplier(),
        }),
      }),
    ]),
  }),
  exchange: Object.freeze({
    id: "exchange",
    label: "Exchange",
    vassalPrestigeCost: 16,
    vassalYearCost: 3,
    workerCapacity: 2,
    activation: Object.freeze({ type: "season" }),
    ui: Object.freeze({
      rule: "Each Season, gain Currency for commercially adjacent regions of a different colour.",
    }),
    costs: Object.freeze([]),
    effects: Object.freeze([
      Object.freeze({
        op: "addLocalCurrency",
        scaledValue: Object.freeze({
          baseAmount: 1,
          evaluator: Object.freeze({
            kind: "countRegions",
            label: "different-colour commercial regions",
            scope: commercialAdjacentScope,
            regionFilters: Object.freeze({ colour: "differentFromHost" }),
          }),
          workerMultiplier: workerMultiplier(),
        }),
      }),
    ]),
  }),
  import: Object.freeze({
    id: "import",
    label: "Import",
    vassalPrestigeCost: 18,
    vassalYearCost: 3,
    workerCapacity: 0,
    activation: Object.freeze({ type: "food", chargePeriodMoons: 1 }),
    ui: Object.freeze({
      rule: "During Food, spend Currency to cover missing Food.",
    }),
    costs: Object.freeze([]),
    effects: Object.freeze([Object.freeze({ op: "importMissingFood" })]),
  }),
  caravanRoutes: Object.freeze({
    id: "caravanRoutes",
    label: "Caravan Routes",
    vassalPrestigeCost: 20,
    vassalYearCost: 4,
    workerCapacity: 0,
    activation: Object.freeze({ type: "passive" }),
    ui: Object.freeze({
      rule: "Caravan-connected allied settlements are commercially adjacent.",
    }),
    costs: Object.freeze([]),
    effects: Object.freeze([]),
  }),
  clearingHouse: Object.freeze({
    id: "clearingHouse",
    label: "Clearing House",
    vassalPrestigeCost: 20,
    vassalYearCost: 4,
    workerCapacity: 0,
    activation: Object.freeze({ type: "passive" }),
    ui: Object.freeze({
      rule: "Import may spend Currency from commercially adjacent allied settlements.",
    }),
    costs: Object.freeze([]),
    effects: Object.freeze([]),
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
  "cultivate",
  "forage",
  "administrate",
  "preserve",
  "exchange",
  "import",
  "caravanRoutes",
  "clearingHouse",
]);

export const detailedSettlementEffectOps = Object.freeze([
  "addLocalFood",
  "addLocalCurrency",
  "routeLocalFood",
  "importMissingFood",
  "reduceFoodDecay",
  "advanceWork",
  "createLocalStructureAtWork",
]);
