import { seedNeutralSettlements, seedOpeningMonster } from "./detailed-settlements/external-world.js";
import { createInitialState } from "./init.js";
import { createStarterBootProfile } from "./starter-boot-profile.js";
import { setupDefs } from "../defs/gamesettings/scenarios-defs.js";

export function createNewGameState(seed, {gamepieces} = {}) {
  const profile = createStarterBootProfile();
  if (gamepieces) profile.gamepieces = gamepieces;
  return createConfiguredNewGameState(seed, profile);
}

// Both player New Game and the Gym workshop use this initialization path.
// Profiles are launch recipes; the resulting state captures all runtime data.
export function createConfiguredNewGameState(seed, profile) {
  const state = createInitialState({
    ...setupDefs.devPlaytesting01,
    civilization: {},
    worldDraft: {
      ...profile.mapLab,
      ...(profile.launch.startMode === "randomRoad"
        ? { starterRandomization: { kind: "twoRegionStarter" } } : {}),
    },
    gameConfig: {
      settings: profile.gameSettings,
      gamepieces: profile.gamepieces,
      lifeMapGenerator: profile.lifeMapLab.generatorConfig,
    },
  }, seed);
  if (profile.launch.neutralSettlements) seedNeutralSettlements(state);
  seedOpeningMonster(state);
  return state;
}
