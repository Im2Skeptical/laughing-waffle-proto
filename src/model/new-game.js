import { createInitialState } from "./init.js";
import { createStarterBootProfile } from "./starter-boot-profile.js";
import { setupDefs } from "../defs/gamesettings/scenarios-defs.js";

export function createNewGameState(seed) {
  const profile = createStarterBootProfile();
  return createInitialState({
    ...setupDefs.devPlaytesting01,
    civilization: {},
    worldDraft: {
      ...profile.mapLab,
      starterRandomization: { kind: "twoRegionStarter" },
    },
    gameConfig: {
      settings: profile.gameSettings,
      gamepieces: profile.gamepieces,
      lifeMapGenerator: profile.lifeMapLab.generatorConfig,
    },
  }, seed);
}
