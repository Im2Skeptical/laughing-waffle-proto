// scenarios-defs.js - human-authored start scenarios (pure data)
import { INITIAL_POPULATION_DEFAULT } from "./gamerules-defs.js";
import { DEFAULT_VARIANT_FLAGS } from "./variant-flags-defs.js";

export const setupDefs = {
  devPlaytesting01: {
    variantFlags: {
      ...DEFAULT_VARIANT_FLAGS,
      settlementPrototypeEnabled: true,
    },

    rngSeed: 12345,

    resources: { gold: 0, grain: 0, food: 0, population: 0 },

    locationNames: {
      hub: "Hub",
      region: "Region",
    },

    discovery: {
      envCols: [
        { exposed: true, revealed: true },
        { exposed: true, revealed: true },
        { exposed: true, revealed: true },
        { exposed: true, revealed: true },
        { exposed: true, revealed: true },
      ],
      hubVisible: true,
      hubRenameUnlocked: true,
    },

    board: {
      cols: 5,
      tiles: [
        "tile_hinterland",
        "tile_levee",
        "tile_floodplains",
        "tile_floodplains",
        "tile_river",
      ],
      envStructures: [],
    },

    hub: {
      cols: 6,
      classOrder: ["villager", "stranger"],
      core: {
        systemState: {
          stockpiles: {
            food: 20,
            redResource: 0,
            greenResource: 0,
            blueResource: 0,
            blackResource: 0,
          },
          chaosGods: {
            redGod: {
              enabled: true,
            },
          },
          populationClasses: {
            villager: {
              adults: 24,
              youth: 10,
              commitments: [],
              faith: {
                tier: "gold",
              },
              happiness: {
                status: "neutral",
                fullFeedStreak: 0,
                missedFeedStreak: 0,
                partialFeedRatios: [],
              },
            },
            stranger: {
              adults: 0,
              youth: 0,
              commitments: [],
              faith: {
                tier: "gold",
              },
              happiness: {
                status: "neutral",
                fullFeedStreak: 0,
                missedFeedStreak: 0,
                partialFeedRatios: [],
              },
            },
          },
        },
      },
      zones: {
        order: {
          slots: [{ defId: "elderCouncil" }],
        },
        practiceByClass: {
          villager: {
            slots: [null, null, null, null, null],
          },
          stranger: {
            slots: [null, null, null, null, null],
          },
        },
        structures: {
          slots: [
            null,
            { defId: "granary" },
            { defId: "mudHouses", span: 1 },
            { defId: "riverTemple" },
            null,
            null,
          ],
        },
      },
    },
  },
};
