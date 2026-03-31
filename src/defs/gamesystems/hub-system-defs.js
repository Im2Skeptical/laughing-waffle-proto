// hub-system-defs.js
// Hub system registry (data only).

import { ensureTooltipCardUi } from "../tooltip-ui-utils.js";

export const hubSystemDefs = {
  residents: {
    id: "residents",
    kind: "hubSystem",
    ui: { name: "Residents", description: "Resident population in this hub." },
    defaultTier: "bronze",
    stateDefaults: {
      processes: [],
    },
  },
  faith: {
    id: "faith",
    kind: "hubSystem",
    ui: { name: "Faith", description: "Civilization faith stability tier." },
    defaultTier: "gold",
    stateDefaults: {},
  },
  deposit: {
    id: "deposit",
    kind: "hubSystem",
    ui: { name: "Deposit", description: "Deposit processes for storage pools." },
    defaultTier: "bronze",
    stateDefaults: {
      processes: [],
    },
  },
  storage: {
    id: "storage",
    kind: "hubSystem",
    ui: { name: "Storage", description: "Stored item pools." },
    defaultTier: "bronze",
    stateDefaults: {},
  },
  build: {
    id: "build",
    kind: "hubSystem",
    ui: { name: "Build", description: "Construction progress." },
    defaultTier: "bronze",
    stateDefaults: {
      processes: [],
    },
  },
  distribution: {
    id: "distribution",
    kind: "hubSystem",
    ui: {
      name: "Distribution",
      description: "Routing range for distributor structures.",
    },
    defaultTier: "bronze",
    rangeByTier: {
      bronze: 1,
      silver: 2,
      gold: 3,
      diamond: "global",
    },
  },
  granaryStore: {
    id: "granaryStore",
    kind: "hubSystem",
    ui: { name: "Granary Store", description: "Stored grain by type and tier." },
    defaultTier: "bronze",
    stateDefaults: {
      byKindTier: {},
      rotByKindTier: {},
      totalByTier: {},
      processes: [],
    },
  },
  storehouseStore: {
    id: "storehouseStore",
    kind: "hubSystem",
    ui: {
      name: "Storehouse Store",
      description: "Stored items by type and tier.",
    },
    defaultTier: "bronze",
    stateDefaults: {
      byKindTier: {},
      rotByKindTier: {},
      totalByTier: {},
      processes: [],
    },
  },
  cook: {
    id: "cook",
    kind: "hubSystem",
    ui: { name: "Cook", description: "Cooking work queue." },
    defaultTier: "bronze",
    stateDefaults: {
      selectedRecipeId: null,
      recipePriority: { ordered: [], enabled: {} },
      processes: [], // same queueKey pattern as crops
    },
  },
  craft: {
    id: "craft",
    kind: "hubSystem",
    ui: { name: "Craft", description: "Crafting work queue." },
    defaultTier: "bronze",
    stateDefaults: {
      selectedRecipeId: null,
      recipePriority: { ordered: [], enabled: {} },
      processes: [], // same queueKey pattern as crops
    },
  },
  stockpiles: {
    id: "stockpiles",
    kind: "hubSystem",
    ui: {
      name: "Stockpiles",
      description: "Global settlement stockpiles stored on the hub core.",
    },
    defaultTier: "bronze",
    stateDefaults: {
      food: 0,
      redResource: 0,
      greenResource: 0,
      blueResource: 0,
      blackResource: 0,
    },
  },
  population: {
    id: "population",
    kind: "hubSystem",
    ui: {
      name: "Population",
      description: "Per-class settlement demographics, commitments, and yearly trackers.",
    },
    defaultTier: "bronze",
    stateDefaults: {
      populationClasses: {
        villager: {
          total: 0,
          commitments: [],
          yearly: {
            year: 1,
            mealAttempts: 0,
            mealSuccesses: 0,
            attractionProgress: 0,
            lastMealAttempts: 0,
            lastMealSuccesses: 0,
            lastOutcomeKind: null,
          },
          faith: {
            tier: "gold",
          },
          happiness: {
            status: "neutral",
            positiveFeedStreak: 0,
            negativeFeedStreak: 0,
          },
        },
        stranger: {
          total: 0,
          commitments: [],
          yearly: {
            year: 1,
            mealAttempts: 0,
            mealSuccesses: 0,
            attractionProgress: 0,
            lastMealAttempts: 0,
            lastMealSuccesses: 0,
            lastOutcomeKind: null,
          },
          faith: {
            tier: "gold",
          },
          happiness: {
            status: "neutral",
            positiveFeedStreak: 0,
            negativeFeedStreak: 0,
          },
        },
      },
    },
  },
};

ensureTooltipCardUi(hubSystemDefs, {
  getTitle: (def) => def?.ui?.name || def?.name || def?.id,
});
